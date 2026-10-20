import { execFile } from 'node:child_process';
import { injectable } from 'inversify';
import type { GitPort, GitResult } from '../../domain/ports.js';

const GIT_TIMEOUT_MS = 3000;
const GIT_MAX_BUFFER = 4 * 1024 * 1024;

/** Runs read-only git commands without a shell; any failure becomes `{ ok: false }`. */
@injectable()
export class NodeGitAdapter implements GitPort {
  run(args: readonly string[], cwd: string, input?: Buffer): Promise<GitResult> {
    return new Promise((resolve) => {
      try {
        const child = execFile(
          'git',
          ['--no-optional-locks', '-c', 'core.quotepath=off', ...args],
          { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER, encoding: 'buffer', windowsHide: true },
          (error, stdout) => resolve(error ? { ok: false } : { ok: true, stdout }),
        );
        // Always close stdin so a command never waits on it; a broken pipe surfaces as a failed exit.
        child.stdin?.on('error', () => undefined);
        child.stdin?.end(input);
      } catch {
        resolve({ ok: false });
      }
    });
  }
}
