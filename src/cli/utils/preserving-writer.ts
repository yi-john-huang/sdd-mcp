import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { InstallResult } from '../../shared/BaseManager.js';
import { INSTALL_MANIFEST_SCHEMA_VERSION, INSTALL_RENDERER_VERSION, PACKAGE_VERSION } from '../../shared/version.js';
import { atomicWriteFile } from '../../utils/atomicWrite.js';
import { withFilesystemLock } from '../../utils/withFilesystemLock.js';
import {
  getTargetPolicy,
  type ComponentType,
  type InstallConflict,
  type InstallProfile,
  type InstallTarget,
  type ResolvedInstallPaths,
} from '../install-target.js';
import {
  registerRuntimeLocked,
  type RuntimeRegistrationRecord,
} from '../tool-support/mcp-registration.js';

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
    registrations: RuntimeRegistrationRecord[];
  }>>;
  shared: Record<string, {
    sha256: string;
    component: 'steering' | 'gitignore';
    mutable: boolean;
  }>;
}


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
  private readonly runtimePaths = new Map<InstallTarget, ResolvedInstallPaths>();
  private readonly runtimeResults = new Map<InstallTarget, {
    installed: string[];
    skipped: string[];
    warnings: string[];
  }>();
  private activeLeaseAssert?: () => Promise<void>;
  private readonly pendingWrites = new Map<InstallTarget, Map<string, { prior: Buffer | null; next: Buffer }>>();
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

  async withInstallLock<T>(action: () => Promise<T>): Promise<T> {
    if (this.activeLeaseAssert) return action();
    const lockPath = path.join(this.projectRoot, '.sdd-mcp', 'install.lock');
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    return withFilesystemLock(lockPath, async lease => {
      this.activeLeaseAssert = lease.assertHeld;
      try {
        return await action();
      } finally {
        this.activeLeaseAssert = undefined;
      }
    });
  }

  requireRuntimeRegistration(target: InstallTarget, paths: ResolvedInstallPaths): void {
    this.runtimePaths.set(target, paths);
  }
  takeRuntimeResult(target: InstallTarget): { installed: string[]; skipped: string[]; warnings: string[] } {
    return this.runtimeResults.get(target) ?? { installed: [], skipped: [], warnings: [] };
  }


  async rollbackUncommitted(target: InstallTarget): Promise<void> {
    const writes = this.pendingWrites.get(target);
    if (!writes) return;
    for (const [filePath, snapshot] of [...writes].reverse()) {
      const current = await readOptionalBytes(filePath);
      if (!current?.equals(snapshot.next)) continue;
      if (snapshot.prior === null) await fs.promises.rm(filePath, { force: true });
      else await atomicWriteFile(filePath, snapshot.prior.toString('utf8'));
    }
    this.pendingWrites.delete(target);
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
        this.trackPendingWrite(target, filePath, null, Buffer.from(content));
        await atomicWriteFile(filePath, content);
        await this.activeLeaseAssert?.();
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
      this.trackPendingWrite(target, filePath, null, Buffer.from(content));
      await atomicWriteFile(filePath, content);
      await this.activeLeaseAssert?.();
      return { outcome: 'installed' };
    }

    const existing = await fs.promises.readFile(filePath, 'utf8');
    const existingHash = sha256(existing);
    if (existingHash === desiredHash) return { outcome: 'skipped' };

    if (this.refreshTargets.has(target)) {
      this.trackPendingWrite(target, filePath, Buffer.from(existing), Buffer.from(content));
      await this.backup(target, relative, filePath);
      await atomicWriteFile(filePath, content);
      await this.activeLeaseAssert?.();
      return { outcome: 'installed' };
    }

    if (prior && existingHash === prior.sha256) {
      this.trackPendingWrite(target, filePath, Buffer.from(existing), Buffer.from(content));
      await atomicWriteFile(filePath, content);
      await this.activeLeaseAssert?.();
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

  async installRuntimeRegistration(
    target: InstallTarget,
    paths: ResolvedInstallPaths = getTargetPolicy(target).defaultPaths,
  ): Promise<{ installed: string[]; skipped: string[]; warnings: string[] }> {
    const lockPath = path.join(this.projectRoot, '.sdd-mcp', 'install.lock');
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    return withFilesystemLock(lockPath, async lease => {
      const manifest = await this.readManifest();
      const previous = manifest.targets[target];
      const runtime = await registerRuntimeLocked(
        this.projectRoot,
        target,
        paths,
        previous?.registrations[0],
        lease.assertHeld,
      );
      const latest = await this.readManifest();
      latest.targets[target] = {
        profile: previous?.profile ?? 'lean',
        packageVersion: PACKAGE_VERSION,
        rendererVersion: INSTALL_RENDERER_VERSION,
        files: previous?.files ?? {},
        registrations: [runtime.registration],
      };
      const priorManifestBytes = await readOptionalBytes(this.manifestPath);
      const nextManifestBytes = Buffer.from(`${JSON.stringify(latest, null, 2)}\n`);
      try {
        await atomicWriteFile(this.manifestPath, nextManifestBytes.toString('utf8'));
      } catch (error) {
        const currentManifestBytes = await readOptionalBytes(this.manifestPath);
        if (currentManifestBytes?.equals(nextManifestBytes)) {
          return {
            installed: runtime.installed,
            skipped: runtime.skipped,
            warnings: [`Runtime registration committed, but manifest write reported an error: ${error instanceof Error ? error.message : String(error)}`],
          };
        }
        if ((priorManifestBytes === null && currentManifestBytes === null)
          || (priorManifestBytes !== null && currentManifestBytes?.equals(priorManifestBytes))) {
          await runtime.rollback();
        }
        throw error;
      }
      await lease.assertHeld();
      return { installed: runtime.installed, skipped: runtime.skipped, warnings: [] };
    });
  }

  async finalizeTarget(target: InstallTarget): Promise<InstallConflict[]> {
    this.validateDestination(this.manifestPath);
    if (this.activeLeaseAssert) return this.finalizeTargetLocked(target, this.activeLeaseAssert);
    const lockPath = path.join(this.projectRoot, '.sdd-mcp', 'install.lock');
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    return withFilesystemLock(lockPath, async lease => this.finalizeTargetLocked(target, lease.assertHeld));
  }

  async finalizeTargetLocked(target: InstallTarget, assertHeld: () => Promise<void>): Promise<InstallConflict[]> {
    const conflicts: InstallConflict[] = [];
    const manifest = await this.readManifest();
    const previousTarget = manifest.targets[target];
    const previous = previousTarget?.files ?? {};
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

    const runtimePaths = this.runtimePaths.get(target) ?? getTargetPolicy(target).defaultPaths;
    const runtime = await registerRuntimeLocked(
      this.projectRoot,
      target,
      runtimePaths,
      previousTarget?.registrations[0],
      assertHeld,
    );
    await assertHeld();
    const latest = await this.readManifest();
    latest.targets[target] = {
      profile: this.profiles.get(target) ?? 'lean',
      packageVersion: PACKAGE_VERSION,
      rendererVersion: INSTALL_RENDERER_VERSION,
      files: Object.fromEntries(generated),
      registrations: [runtime.registration],
    };
    Object.assign(latest.shared, Object.fromEntries(this.pendingShared));
    const priorManifestBytes = await readOptionalBytes(this.manifestPath);
    const nextManifestBytes = Buffer.from(`${JSON.stringify(latest, null, 2)}\n`);
    try {
      await atomicWriteFile(this.manifestPath, nextManifestBytes.toString('utf8'));
    } catch (error) {
      const currentManifestBytes = await readOptionalBytes(this.manifestPath);
      if (currentManifestBytes?.equals(nextManifestBytes)) {
        this.runtimeResults.set(target, {
          installed: runtime.installed,
          skipped: runtime.skipped,
          warnings: [`Installation committed, but manifest write reported an error: ${error instanceof Error ? error.message : String(error)}`],
        });
        return conflicts;
      }
      if ((priorManifestBytes === null && currentManifestBytes === null)
        || (priorManifestBytes !== null && currentManifestBytes?.equals(priorManifestBytes))) {
        await runtime.rollback();
      }
      throw error;
    }
    await assertHeld();
    this.runtimeResults.set(target, {
      installed: runtime.installed,
      skipped: runtime.skipped,
      warnings: [],
    });
    this.pendingWrites.delete(target);
    return conflicts;
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
    const lockPath = path.join(this.projectRoot, '.sdd-mcp', 'install.lock');
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    await withFilesystemLock(lockPath, async lease => {
      const manifest = await this.readManifest();
      manifest.shared[relative] = { sha256: digest, component, mutable };
      await atomicWriteFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await lease.assertHeld();
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
      if (!parsed.targets || !parsed.shared || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== INSTALL_MANIFEST_SCHEMA_VERSION)) {
        throw new Error('Unsupported install manifest schema');
      }
      for (const target of Object.values(parsed.targets)) {
        if (!target || typeof target.files !== 'object') throw new Error('Invalid install manifest ownership entry');
        for (const record of Object.values(target.files)) {
          if (!record || typeof record.sha256 !== 'string' || typeof record.component !== 'string') {
            throw new Error('Invalid install manifest ownership entry');
          }
        }
        if (parsed.schemaVersion === 1) {
          target.registrations = [];
        } else {
          if (!Array.isArray(target.registrations)) throw new Error('Invalid install manifest registration entry');
          for (const registration of target.registrations) {
            if (!registration
              || registration.serverName !== 'sdd-mcp'
              || typeof registration.path !== 'string'
              || !/^[a-f0-9]{64}$/.test(registration.entrySemanticSha256)
              || (registration.managedRegionSha256 !== undefined && !/^[a-f0-9]{64}$/.test(registration.managedRegionSha256))
              || (registration.permissionSemanticSha256 !== undefined && !/^[a-f0-9]{64}$/.test(registration.permissionSemanticSha256))) {
              throw new Error('Invalid install manifest registration entry');
            }
          }
        }
      }
      for (const record of Object.values(parsed.shared)) {
        if (!record
          || typeof record.sha256 !== 'string'
          || (record.component !== 'steering' && record.component !== 'gitignore')
          || typeof record.mutable !== 'boolean') {
          throw new Error('Invalid install manifest ownership entry');
        }
      }
      parsed.schemaVersion = INSTALL_MANIFEST_SCHEMA_VERSION;
      return parsed;
    } catch (error) {
      if (!isMissing(error)) throw error;
      return { schemaVersion: INSTALL_MANIFEST_SCHEMA_VERSION, targets: {}, shared: {} };
    }
  }

  private relative(filePath: string): string {
    return path.relative(this.projectRoot, filePath).split(path.sep).join('/');
  }

  private trackPendingWrite(target: InstallTarget, filePath: string, prior: Buffer | null, next: Buffer): void {
    let writes = this.pendingWrites.get(target);
    if (!writes) {
      writes = new Map();
      this.pendingWrites.set(target, writes);
    }
    if (!writes.has(filePath)) writes.set(filePath, { prior, next });
    else writes.get(filePath)!.next = next;
  }

  private validateDestination(destination: string): void {
    validateDestinationPath(this.projectRoot, destination);
  }
}


async function readOptionalBytes(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.promises.readFile(filePath);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
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
