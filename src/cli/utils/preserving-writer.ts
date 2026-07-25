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
  private readonly pendingWrites = new Map<InstallTarget, Map<string, { prior: Buffer | null; next: Buffer | null }>>();
  private readonly committedTargets = new Set<InstallTarget>();
  private readonly preservedModifiedFiles = new Map<InstallTarget, Set<string>>();
  private backupStamp?: string;

  constructor(private readonly projectRoot: string) {}

  beginTarget(
    target: InstallTarget,
    profile: InstallProfile,
    components: readonly ComponentType[],
    refreshGenerated = false,
  ): void {
    this.generated.set(target, new Map());
    this.preservedModifiedFiles.set(target, new Set());
    this.committedTargets.delete(target);
    this.runtimeResults.delete(target);
    this.profiles.set(target, profile);
    this.selectedComponents.set(target, new Set<ComponentType | 'root'>([...components, 'root']));
    if (refreshGenerated) this.refreshTargets.add(target);
    else this.refreshTargets.delete(target);
  }

  async withInstallLock<T>(action: () => Promise<T>): Promise<T> {
    if (this.activeLeaseAssert) return action();
    const lockPath = path.join(this.projectRoot, '.sdd-mcp', 'install.lock');
    this.validateDestination(lockPath);
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    this.validateDestination(lockPath);
    const committedBefore = new Set(this.committedTargets);
    let completed = false;
    let value: T | undefined;
    try {
      return await withFilesystemLock(lockPath, async lease => {
        this.activeLeaseAssert = lease.assertHeld;
        try {
          value = await action();
          completed = true;
          return value;
        } finally {
          this.activeLeaseAssert = undefined;
        }
      });
    } catch (error) {
      const committedDuringAction = [...this.committedTargets]
        .filter((target) => !committedBefore.has(target));
      if (!completed || committedDuringAction.length === 0) throw error;
      const warning = `Installation committed, but install lock release reported an error: ${error instanceof Error ? error.message : String(error)}`;
      for (const target of committedDuringAction) {
        const result = this.runtimeResults.get(target);
        if (result && !result.warnings.includes(warning)) result.warnings.push(warning);
      }
      if (value && typeof value === 'object' && 'warnings' in value) {
        const warnings = value.warnings;
        if (Array.isArray(warnings) && !warnings.includes(warning)) warnings.push(warning);
      }
      return value as T;
    }
  }

  requireRuntimeRegistration(target: InstallTarget, paths: ResolvedInstallPaths): void {
    this.runtimePaths.set(target, paths);
  }
  takeRuntimeResult(target: InstallTarget): { installed: string[]; skipped: string[]; warnings: string[] } {
    return this.runtimeResults.get(target) ?? { installed: [], skipped: [], warnings: [] };
  }


  async rollbackUncommitted(
    target: InstallTarget,
    assertHeld: (() => Promise<void>) | undefined = this.activeLeaseAssert,
  ): Promise<void> {
    const writes = this.pendingWrites.get(target);
    if (!writes) return;
    const leaseAssert = assertHeld ?? (async () => undefined);
    for (const [filePath, snapshot] of [...writes].reverse()) {
      if (snapshot.prior === null) {
        if (snapshot.next !== null) {
          await this.removeBytesCas(filePath, snapshot.next, leaseAssert);
        }
      } else {
        await this.replaceBytesCas(filePath, snapshot.next, snapshot.prior, leaseAssert);
      }
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
        await this.replaceManagedBytesCas(filePath, null, Buffer.from(content));
        this.pendingShared.set(relative, { sha256: desiredHash, component: 'steering', mutable: true });
        return { outcome: 'installed' };
      }
      const existingHash = sha256(await fs.promises.readFile(filePath));
      this.pendingShared.set(relative, { sha256: existingHash, component: 'steering', mutable: true });
      return { outcome: 'skipped' };
    }
    const generated = this.generatedFor(target);
    const prior = manifest.targets[target]?.files[relative];

    if (!exists) {
      generated.set(relative, { sha256: desiredHash, component });
      this.trackPendingWrite(target, filePath, null, Buffer.from(content));
      await this.replaceManagedBytesCas(filePath, null, Buffer.from(content));
      return { outcome: 'installed' };
    }

    const existing = await fs.promises.readFile(filePath, 'utf8');
    const existingHash = sha256(existing);
    if (existingHash === desiredHash) {
      generated.set(relative, { sha256: desiredHash, component });
      return { outcome: 'skipped' };
    }

    if (this.refreshTargets.has(target)) {
      generated.set(relative, { sha256: desiredHash, component });
      this.trackPendingWrite(target, filePath, Buffer.from(existing), Buffer.from(content));
      await this.activeLeaseAssert?.();
      await this.backup(target, relative, filePath);
      await this.replaceManagedBytesCas(filePath, Buffer.from(existing), Buffer.from(content));
      return { outcome: 'installed' };
    }

    if (prior && existingHash === prior.sha256) {
      generated.set(relative, { sha256: desiredHash, component });
      this.trackPendingWrite(target, filePath, Buffer.from(existing), Buffer.from(content));
      await this.replaceManagedBytesCas(filePath, Buffer.from(existing), Buffer.from(content));
      return { outcome: 'installed' };
    }

    if (prior) {
      generated.set(relative, prior);
      this.preservedModifiedFiles.get(target)?.add(relative);
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
    return this.withInstallLock(async () => {
      const assertHeld = this.requireActiveLease();
      const manifestSnapshot = await this.readManifestSnapshot();
      const manifest = manifestSnapshot.manifest;
      const previous = manifest.targets[target];
      const runtime = await registerRuntimeLocked(
        this.projectRoot,
        target,
        paths,
        previous?.registrations[0],
        assertHeld,
      );
      const latest = manifest;
      latest.targets[target] = {
        profile: previous?.profile ?? 'lean',
        packageVersion: PACKAGE_VERSION,
        rendererVersion: INSTALL_RENDERER_VERSION,
        files: previous?.files ?? {},
        registrations: [runtime.registration],
      };
      const priorManifestBytes = manifestSnapshot.bytes;
      const nextManifestBytes = Buffer.from(`${JSON.stringify(latest, null, 2)}\n`);
      try {
        await runtime.verify();
        await this.replaceBytesCas(this.manifestPath, priorManifestBytes, nextManifestBytes, assertHeld);
      } catch (error) {
        const currentManifestBytes = await readOptionalBytes(this.manifestPath);
        if (buffersEqual(currentManifestBytes, nextManifestBytes)) {
          this.markTargetCommitted(target);
          return {
            installed: runtime.installed,
            skipped: runtime.skipped,
            warnings: [`Runtime registration committed, but manifest write reported an error: ${error instanceof Error ? error.message : String(error)}`],
          };
        }
        if (buffersEqual(currentManifestBytes, priorManifestBytes)) {
          await runtime.rollback();
          throw error;
        }
        throw new Error('Install manifest changed to unknown bytes; runtime partials were preserved');
      }
      this.markTargetCommitted(target);
      return { installed: runtime.installed, skipped: runtime.skipped, warnings: [] };
    });
  }

  async finalizeTarget(target: InstallTarget): Promise<InstallConflict[]> {
    this.validateDestination(this.manifestPath);
    return this.withInstallLock(
      async () => this.finalizeTargetLocked(target, this.requireActiveLease()),
    );
  }

  async finalizeTargetLocked(target: InstallTarget, assertHeld: () => Promise<void>): Promise<InstallConflict[]> {
    try {
      return await this.commitTargetLocked(target, assertHeld);
    } catch (error) {
      await this.rollbackUncommitted(target, assertHeld);
      throw error;
    }
  }

  private async commitTargetLocked(target: InstallTarget, assertHeld: () => Promise<void>): Promise<InstallConflict[]> {
    const conflicts: InstallConflict[] = [];
    const manifestSnapshot = await this.readManifestSnapshot();
    const manifest = manifestSnapshot.manifest;
    const previousTarget = manifest.targets[target];
    const previous = previousTarget?.files ?? {};
    const generated = this.generatedFor(target);
    const selected = this.selectedComponents.get(target) ?? new Set<ComponentType | 'root'>();

    for (const [relative, record] of Object.entries(previous)) {
      if (generated.has(relative) || !selected.has(record.component)) continue;
      const destination = path.join(this.projectRoot, relative);
      if (!await pathExists(destination)) continue;
      this.validateDestination(destination);
      const currentBytes = await fs.promises.readFile(destination);
      const currentHash = sha256(currentBytes);
      if (currentHash !== record.sha256 && !this.refreshTargets.has(target)) {
        conflicts.push({
          component: record.component,
          name: path.basename(relative),
          path: destination,
          reason: 'obsolete-modified',
        });
        continue;
      }
      this.trackPendingWrite(target, destination, currentBytes, null);
      await assertHeld();
      await this.backup(target, relative, destination);
      await this.removeBytesCas(destination, currentBytes, assertHeld);
    }

    if (this.refreshTargets.has(target)) {
      for (const relative of LEGACY_V351_TOMBSTONES[target]) {
        if (generated.has(relative)) continue;
        const destination = path.join(this.projectRoot, relative);
        if (!await pathExists(destination)) continue;
        this.validateDestination(destination);
        const currentBytes = await fs.promises.readFile(destination);
        this.trackPendingWrite(target, destination, currentBytes, null);
        await assertHeld();
        await this.backup(target, relative, destination);
        await this.removeBytesCas(destination, currentBytes, assertHeld);
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
    const retainedUnselected = Object.fromEntries(
      Object.entries(previous).filter(([, record]) => !selected.has(record.component)),
    );
    const latest = manifest;
    latest.targets[target] = {
      profile: this.profiles.get(target) ?? 'lean',
      packageVersion: PACKAGE_VERSION,
      rendererVersion: INSTALL_RENDERER_VERSION,
      files: { ...retainedUnselected, ...Object.fromEntries(generated) },
      registrations: [runtime.registration],
    };
    Object.assign(latest.shared, Object.fromEntries(this.pendingShared));
    const priorManifestBytes = manifestSnapshot.bytes;
    const nextManifestBytes = Buffer.from(`${JSON.stringify(latest, null, 2)}\n`);
    try {
      await this.verifyPendingOwnership(target, generated, assertHeld);
      await runtime.verify();
      await this.replaceBytesCas(this.manifestPath, priorManifestBytes, nextManifestBytes, assertHeld);
    } catch (error) {
      const currentManifestBytes = await readOptionalBytes(this.manifestPath);
      if (buffersEqual(currentManifestBytes, nextManifestBytes)) {
        this.runtimeResults.set(target, {
          installed: runtime.installed,
          skipped: runtime.skipped,
          warnings: [`Installation committed, but manifest write reported an error: ${error instanceof Error ? error.message : String(error)}`],
        });
        this.markTargetCommitted(target);
        return conflicts;
      }
      if (buffersEqual(currentManifestBytes, priorManifestBytes)) {
        await runtime.rollback();
        throw error;
      }
      this.pendingWrites.delete(target);
      throw new Error('Install manifest changed to unknown bytes; installer partials were preserved');
    }
    this.runtimeResults.set(target, {
      installed: runtime.installed,
      skipped: runtime.skipped,
      warnings: [],
    });
    this.markTargetCommitted(target);
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
    await this.withInstallLock(async () => {
      const assertHeld = this.requireActiveLease();
      const snapshot = await this.readManifestSnapshot();
      const content = await readOptionalBytes(filePath);
      if (content === null) return;
      const record = { sha256: sha256(content), component, mutable };
      snapshot.manifest.shared[relative] = record;
      const next = Buffer.from(`${JSON.stringify(snapshot.manifest, null, 2)}\n`);
      await this.verifyOwnedFile(relative, record.sha256);
      await this.replaceBytesCas(this.manifestPath, snapshot.bytes, next, assertHeld);
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

  private async verifyPendingOwnership(
    target: InstallTarget,
    generated: ReadonlyMap<string, ManifestFile>,
    assertHeld: () => Promise<void>,
  ): Promise<void> {
    const preservedModified = this.preservedModifiedFiles.get(target);
    for (const [relative, record] of generated) {
      if (preservedModified?.has(relative)) continue;
      await this.verifyOwnedFile(relative, record.sha256);
    }
    for (const [relative, record] of this.pendingShared) {
      await this.verifyOwnedFile(relative, record.sha256);
    }
    await assertHeld();
  }

  private async verifyOwnedFile(relative: string, expectedSha256: string): Promise<void> {
    const destination = path.resolve(this.projectRoot, relative);
    this.validateDestination(destination);
    const current = await readOptionalBytes(destination);
    if (current === null || sha256(current) !== expectedSha256) {
      throw new Error(`Managed file changed before manifest commit: ${relative}`);
    }
  }

  private get manifestPath(): string {
    return path.join(this.projectRoot, '.sdd-mcp', 'install-manifest.json');
  }

  private async readManifest(): Promise<InstallManifest> {
    return (await this.readManifestSnapshot()).manifest;
  }

  private async readManifestSnapshot(): Promise<{ bytes: Buffer | null; manifest: InstallManifest }> {
    this.validateDestination(this.manifestPath);
    const bytes = await readOptionalBytes(this.manifestPath);
    return {
      bytes,
      manifest: bytes === null
        ? { schemaVersion: INSTALL_MANIFEST_SCHEMA_VERSION, targets: {}, shared: {} }
        : this.parseManifest(bytes),
    };
  }

  private parseManifest(bytes: Buffer): InstallManifest {
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    const parsed = this.requireManifestRecord(value, 'Unsupported install manifest schema');
    if (!hasOnlyKeys(parsed, ['schemaVersion', 'targets', 'shared']) || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== INSTALL_MANIFEST_SCHEMA_VERSION)) throw new Error('Unsupported install manifest schema');
    const targetsRaw = this.requireManifestRecord(parsed.targets, 'Unsupported install manifest schema');
    const sharedRaw = this.requireManifestRecord(parsed.shared, 'Unsupported install manifest schema');
    const targets: InstallManifest['targets'] = Object.create(null) as InstallManifest['targets'];
    for (const [targetName, targetValue] of Object.entries(targetsRaw)) {
      if (!isInstallTarget(targetName)) throw new Error('Invalid install manifest target');
      const target = this.requireManifestRecord(targetValue, 'Invalid install manifest ownership entry');
      if (!hasOnlyKeys(target, ['profile', 'packageVersion', 'rendererVersion', 'files', 'registrations'])) {
        throw new Error('Invalid install manifest target metadata');
      }
      if (
        (target.profile !== 'lean' && target.profile !== 'full')
        || typeof target.packageVersion !== 'string'
        || target.packageVersion.length === 0
        || !Number.isInteger(target.rendererVersion)
        || (target.rendererVersion as number) < 1
      ) {
        throw new Error('Invalid install manifest target metadata');
      }
      const filesRaw = this.requireManifestRecord(target.files, 'Invalid install manifest ownership entry');
      const files = Object.create(null) as Record<string, ManifestFile>;
      for (const [relativePath, fileValue] of Object.entries(filesRaw)) {
        this.validateManifestRelativePath(relativePath);
        const record = this.requireManifestRecord(fileValue, 'Invalid install manifest ownership entry');
        if (!hasOnlyKeys(record, ['sha256', 'component']) || !isSha256(record.sha256) || !isManifestComponent(record.component)) {
          throw new Error('Invalid install manifest ownership entry');
        }
        files[relativePath] = { sha256: record.sha256, component: record.component };
      }
      if (parsed.schemaVersion === 1 && target.registrations !== undefined) {
        throw new Error('Invalid install manifest registration entry');
      }

      let registrations: RuntimeRegistrationRecord[] = [];
      if (parsed.schemaVersion !== 1) {
        if (!Array.isArray(target.registrations) || target.registrations.length > 1) {
          throw new Error('Invalid install manifest registration entry');
        }
        registrations = target.registrations.map((registrationValue) => {
          const registration = this.requireManifestRecord(
            registrationValue,
            'Invalid install manifest registration entry',
          );
          if (!hasOnlyKeys(registration, [
            'path',
            'serverName',
            'entrySemanticSha256',
            'managedRegionSha256',
            'permissionPath',
            'permissionSemanticSha256',
          ])) {
            throw new Error('Invalid install manifest registration entry');
          }
          if (
            registration.serverName !== 'sdd-mcp'
            || !isSha256(registration.entrySemanticSha256)
            || (registration.managedRegionSha256 !== undefined
              && !isSha256(registration.managedRegionSha256))
            || (registration.permissionSemanticSha256 !== undefined
              && !isSha256(registration.permissionSemanticSha256))
          ) {
            throw new Error('Invalid install manifest registration entry');
          }
          const registrationPath = this.requireManifestRelativePath(registration.path);
          const permissionPath = registration.permissionPath === undefined
            ? undefined
            : this.requireManifestRelativePath(registration.permissionPath);
          if (registration.permissionSemanticSha256 !== undefined && permissionPath === undefined) {
            throw new Error('Invalid install manifest registration entry');
          }
          return {
            path: registrationPath,
            serverName: 'sdd-mcp',
            entrySemanticSha256: registration.entrySemanticSha256,
            managedRegionSha256: typeof registration.managedRegionSha256 === 'string'
              ? registration.managedRegionSha256
              : undefined,
            permissionPath,
            permissionSemanticSha256: typeof registration.permissionSemanticSha256 === 'string'
              ? registration.permissionSemanticSha256
              : undefined,
          };
        });
      }
      targets[targetName] = {
        profile: target.profile,
        packageVersion: target.packageVersion,
        rendererVersion: target.rendererVersion as number,
        files,
        registrations,
      };
    }

    const shared = Object.create(null) as InstallManifest['shared'];
    for (const [relativePath, sharedValue] of Object.entries(sharedRaw)) {
      this.validateManifestRelativePath(relativePath);
      const record = this.requireManifestRecord(sharedValue, 'Invalid install manifest ownership entry');
      if (
        !hasOnlyKeys(record, ['sha256', 'component', 'mutable'])
        || !isSha256(record.sha256)
        || (record.component !== 'steering' && record.component !== 'gitignore')
        || typeof record.mutable !== 'boolean'
      ) {
        throw new Error('Invalid install manifest ownership entry');
      }
      shared[relativePath] = {
        sha256: record.sha256,
        component: record.component,
        mutable: record.mutable,
      };
    }
    return {
      schemaVersion: INSTALL_MANIFEST_SCHEMA_VERSION,
      targets,
      shared,
    };
  }

  private requireManifestRecord(value: unknown, message: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
    return value as Record<string, unknown>;
  }

  private requireManifestRelativePath(value: unknown): string {
    if (typeof value !== 'string') throw new Error('Invalid install manifest path');
    this.validateManifestRelativePath(value);
    return value;
  }

  private validateManifestRelativePath(value: string): void {
    if (!value || value.includes('\\') || value.includes('\0')) {
      throw new Error('Invalid install manifest path');
    }
    const destination = path.resolve(this.projectRoot, value);
    this.validateDestination(destination);
    if (this.relative(destination) !== value) throw new Error('Invalid install manifest path');
  }

  private async replaceManagedBytesCas(
    filePath: string,
    expected: Buffer | null,
    desired: Buffer,
  ): Promise<void> {
    await this.replaceBytesCas(
      filePath,
      expected,
      desired,
      this.activeLeaseAssert ?? (async () => undefined),
    );
  }

  private async replaceBytesCas(
    filePath: string,
    expected: Buffer | null,
    desired: Buffer,
    assertHeld: () => Promise<void>,
  ): Promise<void> {
    await assertHeld();
    const current = await readOptionalBytes(filePath);
    if (!buffersEqual(current, expected)) {
      if (buffersEqual(current, desired)) {
        await assertHeld();
        return;
      }
      throw new Error(`Concurrent installer state change at ${this.relative(filePath)}`);
    }
    await atomicWriteFile(filePath, desired.toString('utf8'));
    if (!buffersEqual(await readOptionalBytes(filePath), desired)) {
      throw new Error(`Installer write verification failed at ${this.relative(filePath)}`);
    }
    await assertHeld();
  }

  private async removeBytesCas(
    filePath: string,
    expected: Buffer,
    assertHeld: () => Promise<void>,
  ): Promise<void> {
    await assertHeld();
    if (!buffersEqual(await readOptionalBytes(filePath), expected)) {
      throw new Error(`Concurrent installer state change at ${this.relative(filePath)}`);
    }
    await fs.promises.rm(filePath, { force: true });
    if (await readOptionalBytes(filePath) !== null) {
      throw new Error(`Installer delete verification failed at ${this.relative(filePath)}`);
    }
    await assertHeld();
  }

  private relative(filePath: string): string {
    return path.relative(this.projectRoot, filePath).split(path.sep).join('/');
  }

  private trackPendingWrite(target: InstallTarget, filePath: string, prior: Buffer | null, next: Buffer | null): void {
    let writes = this.pendingWrites.get(target);
    if (!writes) {
      writes = new Map();
      this.pendingWrites.set(target, writes);
    }
    if (!writes.has(filePath)) writes.set(filePath, { prior, next });
    else writes.get(filePath)!.next = next;
  }

  private markTargetCommitted(target: InstallTarget): void {
    this.pendingWrites.delete(target);
    this.committedTargets.add(target);
  }

  private requireActiveLease(): () => Promise<void> {
    if (!this.activeLeaseAssert) throw new Error('Installer lock lease is not active');
    return this.activeLeaseAssert;
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

function buffersEqual(left: Buffer | null, right: Buffer | null): boolean {
  return left === null || right === null ? left === right : left.equals(right);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isInstallTarget(value: string): value is InstallTarget {
  return value === 'claude-code' || value === 'codex' || value === 'omp';
}

function isManifestComponent(value: unknown): value is ManifestFile['component'] {
  return value === 'root'
    || value === 'skills'
    || value === 'steering'
    || value === 'rules'
    || value === 'contexts'
    || value === 'agents'
    || value === 'hooks';
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
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
