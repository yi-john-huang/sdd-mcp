import type { spawn, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import type { ProcessRunRequest, ProcessRunResult } from '../../../domain/ports';
import { NodeProcessAdapter, windowsKillArgv } from '../../../infrastructure/adapters/NodeProcessAdapter';

const MIB = 1024 * 1024;
const adapter = new NodeProcessAdapter();

const request = (overrides: Partial<ProcessRunRequest> = {}): ProcessRunRequest => ({
  argv: [process.execPath, '-e', 'process.exit(0)'],
  cwd: os.tmpdir(),
  env: { PATH: process.env.PATH ?? '' },
  timeoutMs: 10_000,
  maxOutputBytes: MIB,
  ...overrides,
});

const nodeScript = (script: string, overrides: Partial<ProcessRunRequest> = {}): ProcessRunRequest =>
  request({ argv: [process.execPath, '-e', script], ...overrides });

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

const waitUntilGone = async (pid: number, withinMs: number): Promise<boolean> => {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return !isAlive(pid);
};

const expectDuration = (result: ProcessRunResult): void => {
  expect(Number.isInteger(result.durationMs)).toBe(true);
  expect(result.durationMs).toBeGreaterThanOrEqual(0);
};

describe('NodeProcessAdapter', () => {
  describe('run', () => {
    it('should report exit code 0 for a program that exits cleanly', async () => {
      const result = await adapter.run(nodeScript('process.exit(0)'));
      expect(result).toMatchObject({ kind: 'exited', exitCode: 0, truncated: false });
      expectDuration(result);
    });

    it('should report the real exit code when the program exits 3', async () => {
      const result = await adapter.run(nodeScript('process.exit(3)'));
      expect(result).toMatchObject({ kind: 'exited', exitCode: 3 });
      expectDuration(result);
    });

    it('should interleave stdout and stderr in arrival order', async () => {
      const script = "process.stdout.write('out\\n'); setTimeout(() => process.stderr.write('err'), 100);";
      const result = await adapter.run(nodeScript(script));
      expect(result.kind).toBe('exited');
      expect(result.output.toString('utf8')).toBe('out\nerr');
    });

    it('should stop capturing at maxOutputBytes and mark the result truncated', async () => {
      const script = `process.stdout.write(Buffer.alloc(${2 * MIB}, 97));`;
      const result = await adapter.run(nodeScript(script, { maxOutputBytes: MIB }));
      expect(result).toMatchObject({ kind: 'exited', exitCode: 0, truncated: true, totalOutputBytes: 2 * MIB });
      expect(result.output.length).toBe(MIB);
    });

    it('should time out a hanging program, kill it, and keep the partial output', async () => {
      const script = 'process.stdout.write(String(process.pid)); setTimeout(() => {}, 60000);';
      const started = Date.now();
      const result = await adapter.run(nodeScript(script, { timeoutMs: 1000 }));
      expect(Date.now() - started).toBeLessThan(4000);
      expect(result.kind).toBe('timed-out');
      const pid = Number(result.output.toString('utf8'));
      expect(pid).toBeGreaterThan(0);
      await expect(waitUntilGone(pid, 1000)).resolves.toBe(true);
      expectDuration(result);
    });

    it('should kill the whole process tree on timeout', async () => {
      const script = [
        "const { spawn } = require('node:child_process');",
        "const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });",
        'process.stdout.write(String(child.pid));',
        'setTimeout(() => {}, 60000);',
      ].join(' ');
      const result = await adapter.run(nodeScript(script, { timeoutMs: 1000 }));
      expect(result.kind).toBe('timed-out');
      const grandchild = Number(result.output.toString('utf8'));
      expect(grandchild).toBeGreaterThan(0);
      await expect(waitUntilGone(grandchild, 1000)).resolves.toBe(true);
    });

    (process.platform === 'win32' ? it.skip : it)('should kill a group member that ignores SIGTERM after the program exits on timeout', async () => {
      const script = [
        "const { spawn } = require('node:child_process');",
        "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000)\"], { stdio: 'ignore' });",
        'process.stdout.write(String(child.pid));',
        'setTimeout(() => {}, 60000);',
      ].join(' ');
      const result = await adapter.run(nodeScript(script, { timeoutMs: 1000 }));
      expect(result.kind).toBe('timed-out');
      const stubborn = Number(result.output.toString('utf8'));
      await expect(waitUntilGone(stubborn, 1000)).resolves.toBe(true);
    });

    describe('when a descendant escapes the process group and keeps stdout open', () => {
      const escapee = (thenScript: string): string => [
        "const { spawn } = require('node:child_process');",
        "const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] });",
        'process.stdout.write(String(g.pid)); g.unref();',
        thenScript,
      ].join(' ');
      const posixIt = process.platform === 'win32' ? it.skip : it;
      const escaped: number[] = [];
      afterEach(() => {
        for (const pid of escaped.splice(0)) {
          try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
        }
      });

      posixIt('should still report the exit code soon after the program exits', async () => {
        const started = Date.now();
        const result = await adapter.run(nodeScript(escapee('setTimeout(() => process.exit(3), 50);'), { timeoutMs: 30_000 }));
        escaped.push(Number(result.output.toString('utf8')));
        expect(result).toMatchObject({ kind: 'exited', exitCode: 3 });
        expect(Date.now() - started).toBeLessThan(5_000);
      });

      posixIt('should report a clean exit just before the timeout as exited, not timed-out', async () => {
        const result = await adapter.run(nodeScript(escapee('setTimeout(() => process.exit(0), 600);'), { timeoutMs: 1_000 }));
        escaped.push(Number(result.output.toString('utf8')));
        expect(result).toMatchObject({ kind: 'exited', exitCode: 0 });
      });

      posixIt('should still settle as timed-out after the program is killed', async () => {
        const started = Date.now();
        const result = await adapter.run(nodeScript(escapee('setTimeout(() => {}, 60000);'), { timeoutMs: 1_000 }));
        escaped.push(Number(result.output.toString('utf8')));
        expect(result.kind).toBe('timed-out');
        expect(Date.now() - started).toBeLessThan(6_000);
      });
    });

    it('should report spawn-failed not-found for a missing program', async () => {
      const result = await adapter.run(request({ argv: ['definitely-not-a-program-xyz', '--version'] }));
      expect(result).toMatchObject({ kind: 'spawn-failed', reason: 'not-found' });
      expectDuration(result);
    });

    it('should report spawn-failed instead of rejecting when cwd is missing', async () => {
      const result = await adapter.run(request({ cwd: path.join(os.tmpdir(), 'no-such-dir-' + process.pid) }));
      expect(result.kind).toBe('spawn-failed');
      expectDuration(result);
    });

    it('should pass the environment to the child unchanged', async () => {
      const result = await adapter.run(nodeScript("process.stdout.write(process.env.PROBE ?? 'missing')", {
        env: { PATH: process.env.PATH ?? '', PROBE: 'present' },
      }));
      expect(result.output.toString('utf8')).toBe('present');
    });
  });

  describe('on Windows', () => {
    const fakeSpawn = () => {
      const calls: Array<{ file: string; args: readonly string[]; options: SpawnOptions }> = [];
      const spawnProcess = ((file: string, args: readonly string[], options: SpawnOptions) => {
        calls.push({ file, args, options });
        const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: undefined });
        setImmediate(() => { child.emit('exit', 0, null); child.emit('close', 0, null); });
        return child;
      }) as unknown as typeof spawn;
      return { calls, spawnProcess };
    };

    it('should start a .cmd shim through cmd.exe with verbatim, escaped arguments and no process group', async () => {
      const { calls, spawnProcess } = fakeSpawn();
      const windows = new NodeProcessAdapter({ platform: 'win32', spawnProcess, isFile: (file) => file === 'C:\\n\\npm.cmd' });
      const result = await windows.run(request({ argv: ['npm', 'test', 'a&b'], env: { PATH: 'C:\\n' } }));
      expect(result).toMatchObject({ kind: 'exited', exitCode: 0 });
      expect(calls).toHaveLength(1);
      expect(calls[0].file).toBe('cmd.exe');
      expect(calls[0].args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
      expect(calls[0].args[3]).toBe('"npm ^"test^" ^"a^&b^""');
      expect(calls[0].options).toMatchObject({ shell: false, windowsVerbatimArguments: true, detached: false });
    });

    it('should resolve a relative program against the request cwd', async () => {
      const { calls, spawnProcess } = fakeSpawn();
      const seen: string[] = [];
      const windows = new NodeProcessAdapter({ platform: 'win32', spawnProcess, isFile: (file) => { seen.push(file); return file === 'C:\\proj\\bin\\tool.exe'; } });
      await windows.run(request({ argv: ['bin\\tool.exe'], cwd: 'C:\\proj', env: { PATH: 'C:\\n' } }));
      expect(seen).toEqual(['C:\\proj\\bin\\tool.exe']);
      expect(calls[0].file).toBe('C:\\proj\\bin\\tool.exe');
    });

    it('should start an .exe directly with its resolved path', async () => {
      const { calls, spawnProcess } = fakeSpawn();
      const windows = new NodeProcessAdapter({ platform: 'win32', spawnProcess, isFile: (file) => file === 'C:\\n\\node.exe' });
      await windows.run(request({ argv: ['node', '-v'], env: { PATH: 'C:\\n' } }));
      expect(calls[0]).toMatchObject({ file: 'C:\\n\\node.exe', args: ['-v'], options: { windowsVerbatimArguments: false } });
    });
  });

  describe('settling once', () => {
    it('should signal the group with SIGKILL once when close arrives after the drain already settled a timeout', async () => {
      const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
      try {
        const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 4242 });
        const spawnProcess = (() => child) as unknown as typeof spawn;
        const posix = new NodeProcessAdapter({ platform: 'darwin', spawnProcess });
        const pending = posix.run(request({ argv: ['node'], timeoutMs: 20 }));
        await new Promise((resolve) => setTimeout(resolve, 60));
        child.emit('exit', null, 'SIGTERM');
        await expect(pending).resolves.toMatchObject({ kind: 'timed-out' });
        child.emit('close', null, 'SIGTERM');
        await new Promise((resolve) => setImmediate(resolve));
        const sigkills = kill.mock.calls.filter(([pid, signal]) => pid === -4242 && signal === 'SIGKILL');
        expect(sigkills).toHaveLength(1);
      } finally {
        kill.mockRestore();
      }
    });
  });

  describe('windowsKillArgv', () => {
    it('should build a taskkill command that ends the whole tree forcefully', () => {
      expect(windowsKillArgv(4242)).toEqual(['taskkill', '/pid', '4242', '/T', '/F']);
    });
  });
});
