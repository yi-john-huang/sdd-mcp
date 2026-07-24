import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { hostname as localHostname } from 'node:os';
import { basename, dirname, join } from 'node:path';

interface LockOwner {
  token: string;
  pid: number;
  hostname: string;
}

interface LockSnapshot {
  owner?: LockOwner;
  identity: { dev: bigint; ino: bigint };
}

export interface FilesystemLockLease {
  assertHeld(): Promise<void>;
}

export interface FilesystemLockOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
}

export class FilesystemLockTimeoutError extends Error {
  readonly code = 'LockTimeout';

  constructor(readonly lockPath: string) {
    super(`Timed out acquiring filesystem lock: ${lockPath}`);
    this.name = 'FilesystemLockTimeoutError';
  }
}

export class FilesystemLockCompromisedError extends Error {
  readonly code = 'LockCompromised';

  constructor(readonly lockPath: string) {
    super(`Filesystem lock ownership was lost: ${lockPath}`);
    this.name = 'FilesystemLockCompromisedError';
  }
}

function parseOwner(bytes: string): LockOwner | undefined {
  try {
    const value = JSON.parse(bytes) as Partial<LockOwner>;
    if (
      typeof value.token !== 'string' || value.token.length === 0
      || !Number.isSafeInteger(value.pid) || value.pid <= 0
      || typeof value.hostname !== 'string' || value.hostname.length === 0
    ) return undefined;
    return value as LockOwner;
  } catch {
    return undefined;
  }
}

async function readSnapshot(lockPath: string): Promise<LockSnapshot | undefined> {
  let handle;
  try {
    handle = await open(lockPath, 'r');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const stat = await handle.stat({ bigint: true });
    const bytes = stat.size <= 4_096n ? await handle.readFile('utf8') : undefined;
    const canonical = await lstat(lockPath, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!canonical || canonical.dev !== stat.dev || canonical.ino !== stat.ino) return undefined;
    return {
      owner: bytes === undefined ? undefined : parseOwner(bytes),
      identity: { dev: stat.dev, ino: stat.ino },
    };
  } finally {
    await handle.close();
  }
}

function sameIdentity(
  left: LockSnapshot['identity'],
  right: LockSnapshot['identity'],
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function ownerIsProvenDead(owner: LockOwner, hostname: string): boolean {
  if (owner.hostname !== hostname) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function writeDurableOwner(path: string, owner: LockOwner): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(owner), 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function tryEvictDeadOwner(
  lockPath: string,
  observed: LockSnapshot,
  hostname: string,
): Promise<boolean> {
  if (!observed.owner || !ownerIsProvenDead(observed.owner, hostname)) return false;
  const current = await readSnapshot(lockPath);
  if (
    !current?.owner
    || current.owner.token !== observed.owner.token
    || !sameIdentity(current.identity, observed.identity)
    || !ownerIsProvenDead(current.owner, hostname)
  ) return false;
  const quarantine = join(dirname(lockPath), `.${basename(lockPath)}.${randomUUID()}.quarantine`);
  try {
    await rename(lockPath, quarantine);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
  const moved = await readSnapshot(quarantine);
  if (
    !moved?.owner
    || moved.owner.token !== observed.owner.token
    || moved.owner.pid !== observed.owner.pid
    || moved.owner.hostname !== observed.owner.hostname
    || !sameIdentity(moved.identity, observed.identity)
  ) {
    try {
      await link(quarantine, lockPath);
    } catch {
      // Preserve whichever owner currently occupies the canonical path.
    }
    await removeIfPresent(quarantine);
    return false;
  }
  await removeIfPresent(quarantine);
  return true;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Runs an action while holding a token-fenced, cross-process filesystem lease.
 * Call assertHeld immediately after every durable write made by the action.
 */
export async function withFilesystemLock<T>(
  lockPath: string,
  action: (lease: FilesystemLockLease) => Promise<T>,
  options: FilesystemLockOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const retryDelayMs = options.retryDelayMs ?? 25;
  const deadline = Date.now() + timeoutMs;
  await mkdir(dirname(lockPath), { recursive: true });
  const owner: LockOwner = { token: randomUUID(), pid: process.pid, hostname: localHostname() };
  const tempPath = join(dirname(lockPath), `.${basename(lockPath)}.${owner.token}.tmp`);
  await writeDurableOwner(tempPath, owner);

  let acquired = false;
  try {
    while (!acquired) {
      try {
        await link(tempPath, lockPath);
        acquired = true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw error;
        const observed = await readSnapshot(lockPath);
        if (observed) await tryEvictDeadOwner(lockPath, observed, owner.hostname);
        if (Date.now() >= deadline) throw new FilesystemLockTimeoutError(lockPath);
        await delay(retryDelayMs);
      }
    }
  } finally {
    await removeIfPresent(tempPath);
  }
  const acquiredSnapshot = await readSnapshot(lockPath);
  if (!acquiredSnapshot?.owner || acquiredSnapshot.owner.token !== owner.token) {
    throw new FilesystemLockCompromisedError(lockPath);
  }

  const assertHeld = async (): Promise<void> => {
    const current = await readSnapshot(lockPath);
    if (
      !current?.owner
      || current.owner.token !== owner.token
      || !sameIdentity(current.identity, acquiredSnapshot.identity)
    ) throw new FilesystemLockCompromisedError(lockPath);
  };

  let actionError: unknown;
  let value: T | undefined;
  try {
    await assertHeld();
    value = await action({ assertHeld });
  } catch (error) {
    actionError = error;
  }

  try {
    await assertHeld();
    const releasePath = join(dirname(lockPath), `.${basename(lockPath)}.${owner.token}.release`);
    await rename(lockPath, releasePath);
    const released = await readSnapshot(releasePath);
    if (
      !released?.owner
      || released.owner.token !== owner.token
      || !sameIdentity(released.identity, acquiredSnapshot.identity)
    ) {
      try {
        await link(releasePath, lockPath);
      } catch {
        // Preserve whichever owner currently occupies the canonical path.
      }
      throw new FilesystemLockCompromisedError(lockPath);
    }
    await removeIfPresent(releasePath);
  } catch (releaseError) {
    if (
      actionError === undefined
      || releaseError instanceof FilesystemLockCompromisedError
    ) actionError = releaseError;
  }

  if (actionError !== undefined) throw actionError;
  return value as T;
}
