import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { setTimeout as delay } from 'timers/promises';
import type { InstallResult } from '../../shared/BaseManager.js';
import { atomicWriteFile } from '../../utils/atomicWrite.js';
import type {
  ComponentType,
  InstallConflict,
  InstallProfile,
  InstallTarget,
} from '../install-target.js';

export type WriteOutcome = 'installed' | 'skipped';

export interface ManagedWriteResult {
  outcome: WriteOutcome;
  conflict?: InstallConflict;
}

interface ManifestFile {
  sha256: string;
  component: ComponentType | 'root';
}

interface InstallManifest {
  schemaVersion: number;
  targets: Partial<Record<InstallTarget, {
    profile: InstallProfile;
    packageVersion: string;
    rendererVersion: number;
    files: Record<string, ManifestFile>;
  }>>;
  shared: Record<string, {
    sha256: string;
    component: 'steering' | 'gitignore';
    mutable: boolean;
  }>;
}

const MANIFEST_SCHEMA_VERSION = 1;
const RENDERER_VERSION = 4;
const PACKAGE_VERSION = '4.0.0';

/** Explicit v3.5.1 package-owned files which v4 no longer renders. */
export const LEGACY_V351_TOMBSTONES: Readonly<Record<InstallTarget, readonly string[]>> = {
  'claude-code': ['.claude/rules/git-workflow.md', '.claude/rules/sdd-workflow.md'],
  codex: ['.codex/guidance/rules/git-workflow.md', '.codex/guidance/rules/sdd-workflow.md'],
  omp: [],
};

export function validateChildName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error(`Unsafe generated child name: ${name}`);
  }
}

export function validateDestinationPath(projectRoot: string, destination: string): void {
  const root = path.resolve(projectRoot);
  const resolvedDestination = path.resolve(destination);
  const relative = path.relative(root, resolvedDestination);
  if (relative === '') return;
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Unsafe destination outside project root: ${destination}`);
  }

  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Unsafe destination traverses symlink: ${current}`);
    }
  }
}

export class PreservingWriter {
  private readonly generated = new Map<InstallTarget, Map<string, ManifestFile>>();
  private readonly profiles = new Map<InstallTarget, InstallProfile>();
  private readonly selectedComponents = new Map<InstallTarget, Set<ComponentType | 'root'>>();
  private readonly refreshTargets = new Set<InstallTarget>();
  private readonly pendingShared = new Map<string, InstallManifest['shared'][string]>();
  private backupStamp?: string;

  constructor(private readonly projectRoot: string) {}

  beginTarget(
    target: InstallTarget,
    profile: InstallProfile,
    components: readonly ComponentType[],
    refreshGenerated = false,
  ): void {
    this.generated.set(target, new Map());
    this.profiles.set(target, profile);
    this.selectedComponents.set(target, new Set<ComponentType | 'root'>([...components, 'root']));
    if (refreshGenerated) this.refreshTargets.add(target);
  }

  async writeManaged(
    target: InstallTarget,
    component: ComponentType | 'root',
    name: string,
    filePath: string,
    content: string,
  ): Promise<ManagedWriteResult> {
    this.validateDestination(filePath);
    const relative = this.relative(filePath);
    const desiredHash = sha256(content);
    const manifest = await this.readManifest();
    const exists = await pathExists(filePath);
    if (component === 'steering') {
      if (!exists) {
        await atomicWriteFile(filePath, content);
        this.pendingShared.set(relative, { sha256: desiredHash, component: 'steering', mutable: true });
        return { outcome: 'installed' };
      }
      const existingHash = sha256(await fs.promises.readFile(filePath));
      this.pendingShared.set(relative, { sha256: existingHash, component: 'steering', mutable: true });
      return { outcome: 'skipped' };
    }
    this.generatedFor(target).set(relative, { sha256: desiredHash, component });
    const prior = manifest.targets[target]?.files[relative];

    if (!exists) {
      await atomicWriteFile(filePath, content);
      return { outcome: 'installed' };
    }

    const existing = await fs.promises.readFile(filePath, 'utf8');
    const existingHash = sha256(existing);
    if (existingHash === desiredHash) return { outcome: 'skipped' };

    if (this.refreshTargets.has(target)) {
      await this.backup(target, relative, filePath);
      await atomicWriteFile(filePath, content);
      return { outcome: 'installed' };
    }

    if (prior && existingHash === prior.sha256) {
      await atomicWriteFile(filePath, content);
      return { outcome: 'installed' };
    }

    return {
      outcome: 'skipped',
      conflict: {
        component,
        name,
        path: filePath,
        reason: prior ? 'modified' : 'legacy-unmanaged',
      },
    };
  }

  async finalizeTarget(target: InstallTarget): Promise<InstallConflict[]> {
    this.validateDestination(this.manifestPath);
    return withManifestLock(this.projectRoot, async () => {
      const conflicts: InstallConflict[] = [];
    const manifest = await this.readManifest();
    const previous = manifest.targets[target]?.files ?? {};
    const generated = this.generatedFor(target);
    const selected = this.selectedComponents.get(target) ?? new Set<ComponentType | 'root'>();

    for (const [relative, record] of Object.entries(previous)) {
      if (generated.has(relative) || !selected.has(record.component)) continue;
      const destination = path.join(this.projectRoot, relative);
      if (!await pathExists(destination)) continue;
      this.validateDestination(destination);
      const currentHash = sha256(await fs.promises.readFile(destination));
      if (currentHash !== record.sha256 && !this.refreshTargets.has(target)) {
        conflicts.push({
          component: record.component,
          name: path.basename(relative),
          path: destination,
          reason: 'obsolete-modified',
        });
        continue;
      }
      await this.backup(target, relative, destination);
      await fs.promises.rm(destination, { force: true });
    }

    if (this.refreshTargets.has(target)) {
      for (const relative of LEGACY_V351_TOMBSTONES[target]) {
        if (generated.has(relative)) continue;
        const destination = path.join(this.projectRoot, relative);
        if (!await pathExists(destination)) continue;
        this.validateDestination(destination);
        await this.backup(target, relative, destination);
        await fs.promises.rm(destination, { force: true });
      }
    }

    const latest = await this.readManifest();
    latest.targets[target] = {
      profile: this.profiles.get(target) ?? 'lean',
      packageVersion: PACKAGE_VERSION,
      rendererVersion: RENDERER_VERSION,
      files: Object.fromEntries(generated),
    };
    Object.assign(latest.shared, Object.fromEntries(this.pendingShared));
      await atomicWriteFile(this.manifestPath, `${JSON.stringify(latest, null, 2)}\n`);
      return conflicts;
    });
  }

  async recordShared(
    filePath: string,
    component: 'steering' | 'gitignore',
    mutable: boolean,
  ): Promise<void> {
    this.validateDestination(filePath);
    if (!await pathExists(filePath)) return;
    const relative = this.relative(filePath);
    const digest = sha256(await fs.promises.readFile(filePath));
    await withManifestLock(this.projectRoot, async () => {
      const manifest = await this.readManifest();
      manifest.shared[relative] = { sha256: digest, component, mutable };
      await atomicWriteFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    });
  }

  async writeIfAbsent(filePath: string, content: string): Promise<WriteOutcome> {
    this.validateDestination(filePath);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.promises.writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
      return 'installed';
    } catch (error) {
      if (isAlreadyExists(error)) return 'skipped';
      throw error;
    }
  }

  async copyIfAbsent(source: string, destination: string): Promise<WriteOutcome> {
    return this.writeIfAbsent(destination, await fs.promises.readFile(source, 'utf8'));
  }

  async copyTreePreserving(source: string, destination: string): Promise<InstallResult> {
    const result: InstallResult = { installed: [], skipped: [], failed: [] };
    await this.copyTree(source, destination, '', result);
    return result;
  }

  private async copyTree(source: string, destination: string, relative: string, result: InstallResult): Promise<void> {
    this.validateDestination(destination);
    await fs.promises.mkdir(destination, { recursive: true });
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      validateChildName(entry.name);
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);
      const resultName = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await this.copyTree(sourcePath, destinationPath, resultName, result);
        continue;
      }
      try {
        const outcome = await this.copyIfAbsent(sourcePath, destinationPath);
        (outcome === 'installed' ? result.installed : result.skipped ??= []).push(resultName);
      } catch (error) {
        result.failed.push({
          name: resultName,
          path: destinationPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private generatedFor(target: InstallTarget): Map<string, ManifestFile> {
    let files = this.generated.get(target);
    if (!files) {
      files = new Map();
      this.generated.set(target, files);
    }
    return files;
  }

  private async backup(target: InstallTarget, relative: string, source: string): Promise<void> {
    this.backupStamp ??= new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(this.projectRoot, '.sdd-mcp', 'backups', this.backupStamp, target, relative);
    this.validateDestination(destination);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.copyFile(source, destination);
  }

  private get manifestPath(): string {
    return path.join(this.projectRoot, '.sdd-mcp', 'install-manifest.json');
  }

  private async readManifest(): Promise<InstallManifest> {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.manifestPath, 'utf8')) as InstallManifest;
      if (parsed.schemaVersion !== MANIFEST_SCHEMA_VERSION || !parsed.targets || !parsed.shared) {
        throw new Error('Unsupported install manifest schema');
      }
      return parsed;
    } catch (error) {
      if (!isMissing(error)) throw error;
      return { schemaVersion: MANIFEST_SCHEMA_VERSION, targets: {}, shared: {} };
    }
  }

  private relative(filePath: string): string {
    return path.relative(this.projectRoot, filePath).split(path.sep).join('/');
  }

  private validateDestination(destination: string): void {
    validateDestinationPath(this.projectRoot, destination);
  }
}

const MANIFEST_LOCKS = new Map<string, Promise<void>>();

async function withManifestLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const key = path.resolve(root);
  const previous = MANIFEST_LOCKS.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const releaseFilesystemLock = await acquireFilesystemLock(root);
    try {
      return await action();
    } finally {
      await releaseFilesystemLock();
    }
  });
  const settled = run.then(() => undefined, () => undefined);
  MANIFEST_LOCKS.set(key, settled);
  try {
    return await run;
  } finally {
    if (MANIFEST_LOCKS.get(key) === settled) MANIFEST_LOCKS.delete(key);
  }
}

async function acquireFilesystemLock(root: string): Promise<() => Promise<void>> {
  const lockPath = path.join(root, '.sdd-mcp', 'install-manifest.lock');
  validateDestinationPath(root, lockPath);
  await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await fs.promises.open(lockPath, 'wx');
      await handle.writeFile(`${process.pid}\n`);
      await handle.close();
      return async () => {
        await fs.promises.rm(lockPath, { force: true });
      };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const stats = await fs.promises.stat(lockPath).catch(() => undefined);
      if (stats && Date.now() - stats.mtimeMs > 30_000) {
        await fs.promises.rm(lockPath, { force: true });
        continue;
      }
      await delay(20);
    }
  }
  throw new Error(`Timed out acquiring install manifest lock: ${lockPath}`);
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
