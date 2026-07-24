import { randomUUID } from 'node:crypto';
import { open, link, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { hostname as localHostname } from 'node:os';
import { basename, dirname, join } from 'node:path';

interface LockOwner {
  token: string;
  pid: number;
  hostname: string;
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

async function readOwner(lockPath: string): Promise<LockOwner | undefined> {
  try {
    return parseOwner(await readFile(lockPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
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

async function tryEvictDeadOwner(lockPath: string, observed: LockOwner, hostname: string): Promise<boolean> {
  if (!ownerIsProvenDead(observed, hostname)) return false;
  const current = await readOwner(lockPath);
  if (!current || current.token !== observed.token || !ownerIsProvenDead(current, hostname)) return false;
  const quarantine = join(dirname(lockPath), `.${basename(lockPath)}.${randomUUID()}.quarantine`);
  try {
    await rename(lockPath, quarantine);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
  const moved = await readOwner(quarantine);
  if (!moved || moved.token !== observed.token) {
    try {
      await link(quarantine, lockPath);
    } catch {
      // A new owner already occupies the canonical path; never overwrite it.
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
        const observed = await readOwner(lockPath);
        if (observed) await tryEvictDeadOwner(lockPath, observed, owner.hostname);
        if (Date.now() >= deadline) throw new FilesystemLockTimeoutError(lockPath);
        await delay(retryDelayMs);
      }
    }
  } finally {
    await removeIfPresent(tempPath);
  }

  const assertHeld = async (): Promise<void> => {
    const current = await readOwner(lockPath);
    if (!current || current.token !== owner.token) throw new FilesystemLockCompromisedError(lockPath);
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
    const released = await readOwner(releasePath);
    if (!released || released.token !== owner.token) {
      try {
        await link(releasePath, lockPath);
      } catch {
        // Preserve whichever owner currently occupies the canonical path.
      }
      throw new FilesystemLockCompromisedError(lockPath);
    }
    await removeIfPresent(releasePath);
  } catch (releaseError) {
    if (actionError === undefined) actionError = releaseError;
  }

  if (actionError !== undefined) throw actionError;
  return value as T;
}
