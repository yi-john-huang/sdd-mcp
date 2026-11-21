import os from 'node:os';
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

  describe('windowsKillArgv', () => {
    it('should build a taskkill command that ends the whole tree forcefully', () => {
      expect(windowsKillArgv(4242)).toEqual(['taskkill', '/pid', '4242', '/T', '/F']);
    });
  });
});
