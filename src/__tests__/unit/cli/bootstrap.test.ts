import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repositoryRoot = process.cwd();
const bootstrap = path.join(repositoryRoot, 'bootstrap.sh');
const describePosix = process.platform === 'win32' ? describe.skip : describe;

interface BootstrapResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

describePosix('POSIX bootstrap wrapper', () => {
  let fixtureRoot: string;
  let binDirectory: string;
  let capturePath: string;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-bootstrap-'));
    binDirectory = path.join(fixtureRoot, 'bin');
    capturePath = path.join(fixtureRoot, 'npx-argv');
    fs.mkdirSync(binDirectory);
  });

  afterEach(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  it('delegates the default package and preserves original argument boundaries', () => {
    installRecordingNpx();
    const originalArgs = [
      '--target',
      'claude-code',
      'value with spaces',
      'semi;colon',
      '$(must-not-run)',
    ];

    const result = runBootstrap(originalArgs);

    expect(result).toMatchObject({ status: 0, stdout: '', stderr: '' });
    expect(readCapturedArgs()).toEqual([
      '-y',
      'sdd-mcp-server@latest',
      'setup-global',
      ...originalArgs,
    ]);
  });

  it('passes SDD_MCP_PACKAGE as one argument without shell reinterpretation', () => {
    installRecordingNpx();
    const packageOverride = path.join(fixtureRoot, 'package archive;$(ignored).tgz');

    const result = runBootstrap(['--target', 'omp'], {
      SDD_MCP_PACKAGE: packageOverride,
    });

    expect(result.status).toBe(0);
    expect(readCapturedArgs()).toEqual([
      '-y',
      packageOverride,
      'setup-global',
      '--target',
      'omp',
    ]);
  });

  it('preserves the delegated npx exit status', () => {
    installRecordingNpx();

    const result = runBootstrap([], { NPX_EXIT_STATUS: '37' });

    expect(result.status).toBe(37);
    expect(readCapturedArgs()).toEqual([
      '-y',
      'sdd-mcp-server@latest',
      'setup-global',
    ]);
  });

  it('fails clearly when npx is unavailable', () => {
    const result = runBootstrap([]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires npx');
    expect(fs.existsSync(capturePath)).toBe(false);
  });

  function installRecordingNpx(): void {
    const fakeNpx = path.join(binDirectory, 'npx');
    fs.writeFileSync(fakeNpx, [
      '#!/bin/sh',
      'printf \'%s\\0\' "$@" > "$NPX_CAPTURE"',
      'exit "${NPX_EXIT_STATUS:-0}"',
      '',
    ].join('\n'), { mode: 0o755 });
  }

  function runBootstrap(
    args: string[],
    envOverrides: NodeJS.ProcessEnv = {},
  ): BootstrapResult {
    const result = spawnSync(bootstrap, args, {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: {
        PATH: binDirectory,
        NPX_CAPTURE: capturePath,
        ...envOverrides,
      },
    });

    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error,
    };
  }

  function readCapturedArgs(): string[] {
    const captured = fs.readFileSync(capturePath);
    expect(captured[captured.length - 1]).toBe(0);
    return captured.subarray(0, -1).toString('utf8').split('\0');
  }
});
