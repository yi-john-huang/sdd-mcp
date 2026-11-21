import { createHash } from 'node:crypto';
import type { ProcessPort, ProcessRunRequest, ProcessRunResult } from '../../../domain/ports';
import {
  EXCERPT_BYTES,
  EvidenceRunner,
  childEnv,
  programName,
  type EvidenceRunRequest,
} from '../../../application/services/EvidenceRunner';
import { resolveEvidenceSettings } from '../../../application/services/EvidenceSettings';
import { GovernanceError } from '../../../application/services/WorkflowErrors';

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

class FakeProcessPort implements ProcessPort {
  readonly requests: ProcessRunRequest[] = [];
  constructor(private readonly result: ProcessRunResult) {}
  async run(request: ProcessRunRequest): Promise<ProcessRunResult> {
    this.requests.push(request);
    return this.result;
  }
}

const exited = (output: string | Buffer, exitCode = 1, truncated = false, totalOutputBytes?: number): ProcessRunResult => {
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output, 'utf8');
  return { kind: 'exited', exitCode, output: bytes, truncated, totalOutputBytes: totalOutputBytes ?? bytes.length, durationMs: 12 };
};

const settings = (config?: Record<string, unknown>) => resolveEvidenceSettings({}, config);

const request = (overrides: Partial<EvidenceRunRequest> = {}): EvidenceRunRequest => ({
  argv: ['npm', 'test'],
  projectRoot: '/project',
  settings: settings(),
  serverEnv: { PATH: '/usr/bin' },
  ...overrides,
});

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof GovernanceError ? error.code : `unexpected:${String(error)}`;
  }
};

describe('programName', () => {
  it.each([
    ['npm', 'npm'],
    ['/usr/local/bin/npm', 'npm'],
    ['npm.cmd', 'npm'],
    ['C:\\tools\\npm.cmd', 'npm'],
    ['./node_modules/.bin/jest', 'jest'],
    ['python3.exe', 'python3'],
    ['my-runner.sh', 'my-runner.sh'],
  ])('should resolve %s to %s', (argv0, expected) => {
    expect(programName(argv0, 'linux')).toBe(expected);
  });

  it('should lowercase only on Windows', () => {
    expect(programName('NPM.CMD', 'win32')).toBe('npm');
    expect(programName('NPM.CMD', 'linux')).toBe('NPM');
  });

  it.each([
    ['a parent segment', '../npm'],
    ['a parent segment in the middle', 'tools/../npm'],
    ['a Windows parent segment', 'tools\\..\\npm'],
    ['a NUL byte', 'npm\u0000'],
    ['an empty name', ''],
    ['a bare directory', '/usr/bin/'],
  ])('should reject %s before any lookup', (_name, argv0) => {
    expect(() => programName(argv0, 'linux')).toThrow(GovernanceError);
  });
});

describe('childEnv', () => {
  const serverEnv = {
    PATH: '/usr/bin', HOME: '/home/u', TMPDIR: '/tmp', NODE_OPTIONS: '--x', LANG: 'C',
    KEYBOARD: 'us', TOKENIZER: 'bpe',
    SDD_JEV_API_KEY: 'sk-live', MY_SECRET: 's', API_TOKEN: 't', DB_PASSWORD: 'p', AWS_SECRET_ACCESS_KEY: 'a', MY_TEST_TOKEN: 'keep-me',
    UNSET: undefined,
  };

  it('should drop secret-looking variables and keep ordinary ones', () => {
    const env = childEnv(serverEnv, settings());
    expect(Object.keys(env).sort()).toEqual(['CI', 'HOME', 'KEYBOARD', 'LANG', 'NODE_OPTIONS', 'PATH', 'TMPDIR', 'TOKENIZER']);
    expect(env.CI).toBe('1');
  });

  it('should re-add passEnv names and leave CI alone when it is already set', () => {
    const env = childEnv({ ...serverEnv, CI: 'true' }, settings({ evidence: { passEnv: ['MY_TEST_TOKEN'] } }));
    expect(env.MY_TEST_TOKEN).toBe('keep-me');
    expect(env.API_TOKEN).toBeUndefined();
    expect(env.CI).toBe('true');
  });
});

describe('EvidenceRunner', () => {
  describe('argv validation', () => {
    it.each([
      ['sh -c', ['sh', '-c', 'exit 1'], 'EvidenceCommandNotAllowed'],
      ['bash', ['bash', 'run.sh'], 'EvidenceCommandNotAllowed'],
      ['a program outside a project list', ['node', '-v'], 'EvidenceCommandNotAllowed'],
      ['a parent segment', ['../npm', 'test'], 'InvalidParams'],
      ['a NUL byte in the program', ['npm\u0000', 'test'], 'InvalidParams'],
      ['a NUL byte in an argument', ['npm', 'te\u0000st'], 'InvalidParams'],
      ['65 elements', ['npm', ...new Array(64).fill('x')], 'InvalidParams'],
      ['a 4097-byte element', ['npm', 'x'.repeat(4097)], 'InvalidParams'],
      ['an empty element', ['npm', ''], 'InvalidParams'],
      ['empty argv', [], 'InvalidParams'],
    ])('should reject %s with %s and never spawn', async (_name, argv, code) => {
      const port = new FakeProcessPort(exited('ran'));
      const projectList = argv[0] === 'node' ? settings({ evidence: { allowedCommands: ['npm'] } }) : settings();
      const runner = new EvidenceRunner(port);
      await expect(codeOf(runner.run(request({ argv, settings: projectList })))).resolves.toBe(code);
      expect(port.requests).toHaveLength(0);
    });

    it('should accept an allowed program given by path or Windows suffix', async () => {
      for (const argv0 of ['/usr/local/bin/npm', 'npm.cmd']) {
        const port = new FakeProcessPort(exited('ok', 0));
        await new EvidenceRunner(port).run(request({ argv: [argv0, 'test'] }));
        expect(port.requests).toHaveLength(1);
        expect(port.requests[0].argv).toEqual([argv0, 'test']);
      }
    });
  });

  describe('the process request', () => {
    it('should run in the project root with the scrubbed env, the settings timeout, and the 1 MiB cap', async () => {
      const port = new FakeProcessPort(exited('ok', 0));
      const custom = resolveEvidenceSettings({ SDD_EVIDENCE_TIMEOUT_MS: '30000' }, undefined);
      await new EvidenceRunner(port).run(request({ settings: custom, serverEnv: { PATH: '/p', API_TOKEN: 'x' } }));
      expect(port.requests[0]).toEqual({
        argv: ['npm', 'test'], cwd: '/project', env: { PATH: '/p', CI: '1' }, timeoutMs: 30000, maxOutputBytes: 1024 * 1024,
      });
    });
  });

  describe('observed evidence', () => {
    it('should hash the raw output, keep the tail as the excerpt, and classify an assertion failure', async () => {
      const filler = 'line of test output that is not interesting\n'.repeat(250);
      const raw = Buffer.from(`${filler}Expected: 2\nReceived: 3\n`, 'utf8');
      expect(raw.length).toBeGreaterThan(EXCERPT_BYTES);
      const port = new FakeProcessPort(exited(raw, 1));
      const outcome = await new EvidenceRunner(port).run(request());
      expect(outcome.kind).toBe('exited');
      if (outcome.kind !== 'exited') return;
      expect(outcome.exitCode).toBe(1);
      expect(outcome.command).toBe('npm test');
      expect(outcome.argv).toEqual(['npm', 'test']);
      expect(outcome.outputSha256).toBe(sha256(raw));
      expect(Buffer.byteLength(outcome.outputExcerpt, 'utf8')).toBeLessThanOrEqual(EXCERPT_BYTES);
      expect(outcome.outputExcerpt.endsWith('Expected: 2\nReceived: 3\n')).toBe(true);
      expect(outcome.truncated).toBe(false);
      expect(outcome.redactions).toBe(0);
      expect(outcome.durationMs).toBe(12);
      expect(outcome.redClassification).toEqual({ classification: 'assertion', matchedPattern: 'expected-received' });
    });

    it('should not start the excerpt inside a multi-byte character', async () => {
      const raw = Buffer.from('€'.repeat(4000), 'utf8');
      expect(raw.length % EXCERPT_BYTES).not.toBe(0);
      const outcome = await new EvidenceRunner(new FakeProcessPort(exited(raw, 1))).run(request());
      if (outcome.kind !== 'exited') throw new Error(outcome.kind);
      expect(outcome.outputExcerpt.includes('\uFFFD')).toBe(false);
      expect(outcome.outputExcerpt.startsWith('€')).toBe(true);
      expect(Buffer.byteLength(outcome.outputExcerpt, 'utf8')).toBeLessThanOrEqual(EXCERPT_BYTES);
    });

    it('should classify a module-not-found failure as setup', async () => {
      const outcome = await new EvidenceRunner(new FakeProcessPort(exited("Error: Cannot find module 'x'\n", 1))).run(request());
      if (outcome.kind !== 'exited') throw new Error(outcome.kind);
      expect(outcome.redClassification).toEqual({ classification: 'setup', matchedPattern: 'module-not-found' });
    });

    it('should redact secrets in the excerpt while hashing the raw bytes', async () => {
      const raw = Buffer.from('starting\nAPI_KEY=sk-live-abc123\ndone\n', 'utf8');
      const outcome = await new EvidenceRunner(new FakeProcessPort(exited(raw, 0))).run(request());
      if (outcome.kind !== 'exited') throw new Error(outcome.kind);
      expect(outcome.outputExcerpt).not.toContain('sk-live-abc123');
      expect(outcome.outputExcerpt).toContain('API_KEY=[REDACTED]');
      expect(outcome.redactions).toBe(1);
      expect(outcome.outputSha256).toBe(sha256(raw));
    });

    it('should describe empty output with an empty excerpt and the hash of zero bytes', async () => {
      const outcome = await new EvidenceRunner(new FakeProcessPort(exited('', 0))).run(request());
      if (outcome.kind !== 'exited') throw new Error(outcome.kind);
      expect(outcome.outputExcerpt).toBe('');
      expect(outcome.outputSha256).toBe(sha256(Buffer.alloc(0)));
      expect(outcome.redClassification.classification).toBe('ambiguous');
    });

    it('should echo truncation from the port and open the excerpt with a marker', async () => {
      const captured = Buffer.alloc(9000, 0x78);
      const outcome = await new EvidenceRunner(new FakeProcessPort(exited(captured, 0, true, 2_000_000))).run(request());
      if (outcome.kind !== 'exited') throw new Error(outcome.kind);
      expect(outcome.truncated).toBe(true);
      expect(outcome.outputExcerpt.startsWith('[output truncated: 9000 of 2000000 bytes captured]\n')).toBe(true);
      expect(Buffer.byteLength(outcome.outputExcerpt, 'utf8')).toBeLessThanOrEqual(EXCERPT_BYTES);
      const untruncated = await new EvidenceRunner(new FakeProcessPort(exited('a', 0))).run(request());
      if (untruncated.kind !== 'exited') throw new Error(untruncated.kind);
      expect(untruncated.outputExcerpt).toBe('a');
    });
  });

  describe('port failures', () => {
    it('should map a timed-out result without throwing', async () => {
      const port = new FakeProcessPort({ kind: 'timed-out', output: Buffer.from('partial PASSWORD=hunter2'), truncated: false, totalOutputBytes: 24, durationMs: 5000 });
      const outcome = await new EvidenceRunner(port).run(request());
      expect(outcome).toEqual({ kind: 'timed-out', outputExcerpt: 'partial PASSWORD=[REDACTED]', truncated: false, redactions: 1, durationMs: 5000 });
    });

    it('should map a spawn failure without throwing', async () => {
      const port = new FakeProcessPort({ kind: 'spawn-failed', reason: 'not-found', output: Buffer.alloc(0), durationMs: 3 });
      const outcome = await new EvidenceRunner(port).run(request());
      expect(outcome).toEqual({ kind: 'spawn-failed', reason: 'not-found', outputExcerpt: '', durationMs: 3 });
    });
  });
});
