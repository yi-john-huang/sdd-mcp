import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FilesystemLockCompromisedError,
  FilesystemLockTimeoutError,
  withFilesystemLock,
} from '../../../utils/withFilesystemLock';

describe('withFilesystemLock', () => {
  let directory: string;
  let lockPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'owner-fenced-lock-'));
    lockPath = join(directory, 'workflow.lock');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('holds an owner token during the action and releases afterward', async () => {
    await withFilesystemLock(lockPath, async (lease) => {
      const owner = JSON.parse(await readFile(lockPath, 'utf8'));
      expect(owner.pid).toBe(process.pid);
      expect(owner.hostname).toBe(hostname());
      await expect(lease.assertHeld()).resolves.toBeUndefined();
    });
    await expect(readFile(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('creates a missing lock directory', async () => {
    const nestedLock = join(directory, '.sdd-mcp', 'install.lock');
    await withFilesystemLock(nestedLock, async (lease) => lease.assertHeld());
    await expect(readFile(nestedLock)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never evicts a live local owner', async () => {
    const owner = { token: 'live-owner', pid: process.pid, hostname: hostname() };
    await writeFile(lockPath, JSON.stringify(owner));
    await expect(withFilesystemLock(lockPath, async () => undefined, {
      timeoutMs: 30,
      retryDelayMs: 5,
    })).rejects.toBeInstanceOf(FilesystemLockTimeoutError);
    expect(JSON.parse(await readFile(lockPath, 'utf8'))).toEqual(owner);
  });

  it.each([
    ['different host', { token: 'remote', pid: 999999, hostname: 'other.example' }],
    ['malformed owner', { nope: true }],
  ])('never evicts a %s lock', async (_name, owner) => {
    await writeFile(lockPath, JSON.stringify(owner));
    await expect(withFilesystemLock(lockPath, async () => undefined, {
      timeoutMs: 30,
      retryDelayMs: 5,
    })).rejects.toMatchObject({ code: 'LockTimeout' });
    expect(JSON.parse(await readFile(lockPath, 'utf8'))).toEqual(owner);
  });

  it('takes over a proven-dead local owner', async () => {
    await writeFile(lockPath, JSON.stringify({
      token: 'dead-owner',
      pid: 2_147_483_647,
      hostname: hostname(),
    }));
    let entered = false;
    await withFilesystemLock(lockPath, async (lease) => {
      entered = true;
      await lease.assertHeld();
    }, { timeoutMs: 200, retryDelayMs: 5 });
    expect(entered).toBe(true);
  });

  it('treats EPERM owner probes as live', async () => {
    await writeFile(lockPath, JSON.stringify({ token: 'protected', pid: 424242, hostname: hostname() }));
    jest.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('not permitted') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      throw error;
    });
    await expect(withFilesystemLock(lockPath, async () => undefined, {
      timeoutMs: 30,
      retryDelayMs: 5,
    })).rejects.toHaveProperty('code', 'LockTimeout');
  });

  it('detects a replaced lease token and preserves the replacement', async () => {
    const replacement = { token: 'replacement', pid: process.pid, hostname: hostname() };
    await expect(withFilesystemLock(lockPath, async (lease) => {
      await writeFile(lockPath, JSON.stringify(replacement));
      await lease.assertHeld();
    })).rejects.toBeInstanceOf(FilesystemLockCompromisedError);
    expect(JSON.parse(await readFile(lockPath, 'utf8'))).toEqual(replacement);
  });
});
