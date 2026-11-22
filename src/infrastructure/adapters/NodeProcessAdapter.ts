import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { statSync } from 'node:fs';
import os from 'node:os';
import { injectable } from 'inversify';
import type { ProcessPort, ProcessRunRequest, ProcessRunResult } from '../../domain/ports.js';
import { windowsSpawnPlan, type SpawnPlan } from './windowsSpawnPlan.js';

const TERM_GRACE_MS = 2000;
/** How long to wait for output after the program exits before a descendant holding stdio is cut off. */
const EXIT_DRAIN_MS = 1000;

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

function killTree(child: ChildProcess, signal: NodeJS.Signals, windows: boolean): void {
  if (child.pid === undefined) return;
  try {
    if (windows) {
      const [program, ...args] = windowsKillArgv(child.pid);
      execFile(program, args, { windowsHide: true }, () => undefined);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    // The group may already be gone; the close event settles the result either way.
  }
}

const isFile = (file: string): boolean => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

export interface NodeProcessAdapterOptions {
  readonly platform?: NodeJS.Platform;
  readonly spawnProcess?: typeof spawn;
  readonly isFile?: (file: string) => boolean;
}

/** Runs one program without a general shell; every failure becomes a result variant. */
@injectable()
export class NodeProcessAdapter implements ProcessPort {
  private readonly windows: boolean;
  private readonly spawnProcess: typeof spawn;
  private readonly isFile: (file: string) => boolean;

  constructor(options: NodeProcessAdapterOptions = {}) {
    this.windows = (options.platform ?? process.platform) === 'win32';
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.isFile = options.isFile ?? isFile;
  }

  /** Windows cannot spawn a .cmd or .bat file without cmd.exe, so those run through an escaped cmd.exe line. */
  private plan(request: ProcessRunRequest): SpawnPlan {
    if (this.windows) return windowsSpawnPlan(request.argv, request.env, request.cwd, this.isFile);
    return { file: request.argv[0], args: request.argv.slice(1), windowsVerbatimArguments: false };
  }

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
        const plan = this.plan(request);
        child = this.spawnProcess(plan.file, [...plan.args], {
          cwd: request.cwd,
          env: { ...request.env },
          shell: false,
          windowsHide: true,
          windowsVerbatimArguments: plan.windowsVerbatimArguments,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: !this.windows,
        });
      } catch (error) {
        settle({ kind: 'spawn-failed', reason: spawnFailureReason(error as NodeJS.ErrnoException), output: output.bytes(), durationMs: elapsed() });
        return;
      }

      child.stdout?.on('data', (chunk: Buffer) => output.append(chunk));
      child.stderr?.on('data', (chunk: Buffer) => output.append(chunk));

      const termTimer = setTimeout(() => {
        timedOut = true;
        killTree(child, 'SIGTERM', this.windows);
      }, request.timeoutMs);
      const killTimer = setTimeout(() => killTree(child, 'SIGKILL', this.windows), request.timeoutMs + TERM_GRACE_MS);
      let drainTimer: NodeJS.Timeout | undefined;
      const clearTimers = (): void => {
        clearTimeout(termTimer);
        clearTimeout(killTimer);
        clearTimeout(drainTimer);
      };
      const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
        // The drain timer and the close event can both arrive; only the first may signal the group.
        if (settled) return;
        clearTimers();
        const bytes = output.bytes();
        if (timedOut) {
          // The pending SIGKILL timer was just cleared; members that ignored SIGTERM must not outlive the run.
          killTree(child, 'SIGKILL', this.windows);
          settle({ kind: 'timed-out', output: bytes, truncated: output.truncated, totalOutputBytes: output.total, durationMs: elapsed() });
          return;
        }
        settle({ kind: 'exited', exitCode: code ?? signalExitCode(signal), output: bytes, truncated: output.truncated, totalOutputBytes: output.total, durationMs: elapsed() });
      };

      child.on('error', (error: NodeJS.ErrnoException) => {
        clearTimers();
        settle({ kind: 'spawn-failed', reason: spawnFailureReason(error), output: output.bytes(), durationMs: elapsed() });
      });

      // 'close' waits for every holder of the pipes. A descendant that left the process group can hold them
      // forever, so after the program itself exits, the result settles within EXIT_DRAIN_MS regardless.
      child.on('exit', (code, signal) => {
        // A program that exited before its deadline is not timed out, however long the pipes stay open.
        if (!timedOut) {
          clearTimeout(termTimer);
          clearTimeout(killTimer);
        }
        drainTimer = setTimeout(() => {
          child.stdout?.destroy();
          child.stderr?.destroy();
          finish(code, signal);
        }, EXIT_DRAIN_MS);
      });
      child.on('close', finish);
    });
  }
}
