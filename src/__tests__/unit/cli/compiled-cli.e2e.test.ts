import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repositoryRoot = process.cwd();
const entrypoint = path.join(repositoryRoot, 'sdd-entry.js');

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

describe('compiled target-aware CLI journeys', () => {
  let preloadRoot: string;
  let ttyPreload: string;

  beforeAll(() => {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    preloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-cli-tty-'));
    ttyPreload = path.join(preloadRoot, 'tty-preload.cjs');
    fs.writeFileSync(ttyPreload, [
      'for (const stream of [process.stdin, process.stdout]) {',
      "  try { Object.defineProperty(stream, 'isTTY', { value: true, configurable: true }); }",
      "  catch { stream.isTTY = true; }",
      '}',
    ].join('\n'));
  });

  afterAll(() => fs.rmSync(preloadRoot, { recursive: true, force: true }));

  it.each([
    ['codex', '.codex/agents/planner.toml', 'CLAUDE.md'],
    ['claude-code', '.claude/agents/planner.md', 'AGENTS.md'],
  ])('runs an explicit %s full install', (target, agentPath, forbiddenGuidance) => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-cli-explicit-'));
    try {
      const result = runCli(outputRoot, ['install', '--profile', 'full', '--target', target]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`Target: ${target} (explicit)`);
      expect(fs.existsSync(path.join(outputRoot, agentPath))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, forbiddenGuidance))).toBe(false);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ['codex', '1'],
    ['claude-code', '2'],
  ])('supports interactive %s selection', (target, choice) => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-cli-interactive-'));
    try {
      const result = runCli(outputRoot, ['install', '--profile', 'full'], `${choice}\n`, true);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`Target: ${target} (interactive)`);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it('maps interactive cancellation to exit code 130 without writes', () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-cli-cancel-'));
    try {
      const result = runCli(outputRoot, ['install', '--profile', 'full'], '\u0003', true);

      expect(result.status).toBe(130);
      expect(fs.readdirSync(outputRoot)).toEqual([]);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it('uses the non-interactive compatibility fallback and migration notice', () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-cli-fallback-'));
    try {
      const result = runCli(outputRoot, ['install', '--profile', 'full']);

      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain('using claude-code');
      expect(result.stdout + result.stderr).toContain('--target codex or --target claude-code');
      expect(fs.existsSync(path.join(outputRoot, 'CLAUDE.md'))).toBe(true);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it.each([
    [['install', '--target', 'unknown-agent'], 'invalid target'],
    [['install', '--target', 'claude-code', '--codex'], 'conflicting target options'],
  ])('rejects %s before writing files', (args, _description) => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-cli-invalid-'));
    try {
      const result = runCli(outputRoot, args);

      expect(result.status).toBe(1);
      expect(fs.readdirSync(outputRoot)).toEqual([]);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  function runCli(
    cwd: string,
    args: string[],
    input?: string,
    interactive = false,
  ): CliResult {
    const nodeArgs = interactive
      ? ['-r', ttyPreload, entrypoint, ...args]
      : [entrypoint, ...args];
    const result = spawnSync(process.execPath, nodeArgs, {
      cwd,
      input,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
});
