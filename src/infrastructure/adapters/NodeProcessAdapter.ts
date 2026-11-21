import { execFile, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { injectable } from 'inversify';
import type { ProcessPort, ProcessRunRequest, ProcessRunResult } from '../../domain/ports.js';

const TERM_GRACE_MS = 2000;
const IS_WINDOWS = process.platform === 'win32';

/** The Windows process-tree termination command for a pid. */
export function windowsKillArgv(pid: number): readonly string[] {
  return ['taskkill', '/pid', String(pid), '/T', '/F'];
}

function spawnFailureReason(error: NodeJS.ErrnoException): 'not-found' | 'permission' | 'other' {
  if (error.code === 'ENOENT') return 'not-found';
  if (error.code === 'EACCES' || error.code === 'EPERM') return 'permission';
  return 'other';
}

function signalExitCode(signal: NodeJS.Signals | null): number {
  const number = signal ? os.constants.signals[signal] : undefined;
  return 128 + (number ?? 0);
}

/** Collects interleaved output up to a byte cap; later bytes are dropped and counted as truncation. */
class BoundedOutput {
  private readonly chunks: Buffer[] = [];
  private captured = 0;
  total = 0;
  truncated = false;

  constructor(private readonly limit: number) {}

  append(chunk: Buffer): void {
    this.total += chunk.length;
    const room = this.limit - this.captured;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    if (chunk.length > room) {
      this.chunks.push(chunk.subarray(0, room));
      this.captured += room;
      this.truncated = true;
      return;
    }
    this.chunks.push(chunk);
    this.captured += chunk.length;
  }

  bytes(): Buffer {
    return Buffer.concat(this.chunks, this.captured);
  }
}

function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (IS_WINDOWS) {
      const [program, ...args] = windowsKillArgv(child.pid);
      execFile(program, args, { windowsHide: true }, () => undefined);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    // The group may already be gone; the close event settles the result either way.
  }
}

/** Runs one program without a shell; every failure becomes a result variant. */
@injectable()
export class NodeProcessAdapter implements ProcessPort {
  run(request: ProcessRunRequest): Promise<ProcessRunResult> {
    const started = Date.now();
    const output = new BoundedOutput(request.maxOutputBytes);
    const elapsed = (): number => Date.now() - started;

    return new Promise<ProcessRunResult>((resolve) => {
      let settled = false;
      let timedOut = false;
      const settle = (result: ProcessRunResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let child: ChildProcess;
      try {
        child = spawn(request.argv[0], request.argv.slice(1), {
          cwd: request.cwd,
          env: { ...request.env },
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: !IS_WINDOWS,
        });
      } catch (error) {
        settle({ kind: 'spawn-failed', reason: spawnFailureReason(error as NodeJS.ErrnoException), output: output.bytes(), durationMs: elapsed() });
        return;
      }

      child.stdout?.on('data', (chunk: Buffer) => output.append(chunk));
      child.stderr?.on('data', (chunk: Buffer) => output.append(chunk));

      const termTimer = setTimeout(() => {
        timedOut = true;
        killTree(child, 'SIGTERM');
      }, request.timeoutMs);
      const killTimer = setTimeout(() => killTree(child, 'SIGKILL'), request.timeoutMs + TERM_GRACE_MS);
      const clearTimers = (): void => {
        clearTimeout(termTimer);
        clearTimeout(killTimer);
      };

      child.on('error', (error: NodeJS.ErrnoException) => {
        clearTimers();
        settle({ kind: 'spawn-failed', reason: spawnFailureReason(error), output: output.bytes(), durationMs: elapsed() });
      });

      child.on('close', (code, signal) => {
        clearTimers();
        const bytes = output.bytes();
        if (timedOut) {
          settle({ kind: 'timed-out', output: bytes, truncated: output.truncated, totalOutputBytes: output.total, durationMs: elapsed() });
          return;
        }
        settle({ kind: 'exited', exitCode: code ?? signalExitCode(signal), output: bytes, truncated: output.truncated, totalOutputBytes: output.total, durationMs: elapsed() });
      });
    });
  }
}
