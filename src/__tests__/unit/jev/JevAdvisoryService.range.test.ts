import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GitPort } from '../../../domain/ports';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import { JevAdvisoryService, type AdvisoryEngine, type JevEnvironment } from '../../../application/services/JevAdvisoryService';
import type { JevCheckRequest, JevFindingInput, JevUnitInput } from '../../../application/services/JevCheckTypes';
import { QUESTION_SET_VERSION } from '../../../application/services/JevQuestionCatalog';
import { FakeJevHttpPort, TEST_KEY, benignAnswers, silentLogger } from './helpers';

const ACTIVE: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY, SDD_JEV_ALLOW_CODE: '1' };
const SECRET = 'sk_live_123456789';
const SPEC_JSON = '{"schema_version":5}\n';

const finding = (overrides: Partial<JevFindingInput> = {}): JevFindingInput => ({
  id: 'F1', path: 'src/a.ts', line: 20, title: 'SQL built from input', severity: 'important', ...overrides,
});
const unit = (overrides: Partial<JevUnitInput> = {}): JevUnitInput => ({ id: 'U1', path: 'src/a.ts', line: 20, summary: 'order handler', ...overrides });

describe('JevAdvisoryService committed-range review (baseRef)', () => {
  let repo: string;
  let http: FakeJevHttpPort;
  let gitCalls: string[][];
  let baseSha: string;

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim();
  const write = (file: string, content: string): void => {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), content);
  };
  const commitAll = (message: string): void => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
  };
  const lines = (marker: string): string =>
    Array.from({ length: 40 }, (_, index) => (index === 19 ? `const apiKey = "${SECRET}"; // ${marker}` : `// line ${index + 1}`)).join('\n');

  const recordingGit = (): GitPort => {
    const real = new NodeGitAdapter();
    return { run: (args, cwd, input) => { gitCalls.push([...args]); return real.run(args, cwd, input); } };
  };
  const service = (env: JevEnvironment = ACTIVE): JevAdvisoryService =>
    new JevAdvisoryService(http, recordingGit(), { readAdvisorySnapshot: jest.fn() } as unknown as AdvisoryEngine, new NodeFileSystemAdapter(), silentLogger(), env);
  const security = (overrides: Partial<JevCheckRequest> = {}, findings: JevFindingInput[] = [finding()]): JevCheckRequest =>
    ({ check: 'security', projectRoot: repo, featureName: 'demo', findings, baseRef: baseSha, ...overrides });
  const principles = (overrides: Partial<JevCheckRequest> = {}): JevCheckRequest =>
    ({ check: 'principles', projectRoot: repo, featureName: 'demo', units: [unit()], baseRef: baseSha, ...overrides });
  const reviewDir = (): string => path.join(repo, '.spec', 'specs', 'demo', 'review');
  const sidecarFiles = (): string[] => {
    try {
      return readdirSync(reviewDir()).sort();
    } catch {
      return [];
    }
  };
  const readSidecar = (name: string): Record<string, any> => JSON.parse(readFileSync(path.join(reviewDir(), name), 'utf8'));
  const posted = (index = 0): { state: { items: Array<Record<string, any>> } } => JSON.parse(http.calls[index]!.body);

  beforeEach(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), 'jev-range-'));
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'T');
    git('config', 'commit.gpgsign', 'false');
    write('.spec/specs/demo/spec.json', SPEC_JSON);
    write('src/a.ts', '// base\n');
    write('src/other.ts', 'export const other = 1;\n');
    commitAll('base');
    baseSha = git('rev-parse', 'HEAD');
    write('src/a.ts', lines('feature'));
    commitAll('feature work');
    http = new FakeJevHttpPort();
    gitCalls = [];
    http.respond = async (request) => ({ status: 200, body: benignAnswers(request.body) });
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  describe('a committed change with a clean working tree', () => {
    it('sends one request with a redacted excerpt read from the committed content', async () => {
      const result = await service().check(security());
      expect(result).toMatchObject({ check: 'security', status: 'answered', persisted: true });
      expect(http.calls).toHaveLength(1);
      const item = posted().state.items[0]!;
      expect(item).toMatchObject({ id: 'F1', location: 'src/a.ts:20' });
      expect(item.excerpt).toContain('// line 6');
      expect(item.excerpt).toContain('[REDACTED]');
      expect(http.calls[0]!.body).not.toContain(SECRET);
      expect(Buffer.byteLength(item.excerpt as string, 'utf8')).toBeLessThanOrEqual(8192);
    });

    it('reviews principles of committed units too', async () => {
      const result = await service().check(principles());
      expect(result).toMatchObject({ check: 'principles', status: 'answered', persisted: true });
      expect(result.sidecar).toMatch(/^\.spec\/specs\/demo\/review\/jev-review-principles-range-[a-f0-9]{12}\.json$/);
    });

    it('binds the sidecar to the version, inputs, diff hash, merge base, and HEAD', async () => {
      const result = await service().check(security());
      const headSha = git('rev-parse', 'HEAD');
      const [file] = sidecarFiles();
      expect(file).toMatch(/^jev-review-security-range-[a-f0-9]{12}\.json$/);
      expect(result.sidecar).toBe(`.spec/specs/demo/review/${file}`);
      const stored = readSidecar(file!);
      expect(stored.binding).toEqual({
        questionSetVersion: QUESTION_SET_VERSION,
        inputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        diffSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        rangeBaseCommit: baseSha,
        headCommit: headSha,
      });
      expect(file).toContain(stored.binding.diffSha256.slice(0, 12));
      expect(stored).toMatchObject({ kind: 'security', status: 'answered', baseCommit: headSha });
    });

    it('reuses the sidecar for the same range and findings without another request', async () => {
      await service().check(security());
      const again = await service().check(security());
      expect(again).toMatchObject({ status: 'answered', persisted: true });
      expect(http.calls).toHaveLength(1);
    });

    it('asks again when the findings change', async () => {
      await service().check(security());
      await service().check(security({}, [finding({ title: 'a different finding' })]));
      expect(http.calls).toHaveLength(2);
    });

    it('asks again when HEAD moves, even if the working tree matches', async () => {
      await service().check(security());
      git('commit', '-q', '--allow-empty', '-m', 'empty follow-up');
      await service().check(security());
      expect(http.calls).toHaveLength(2);
    });

    it('asks again when a working-tree edit changes the reviewed change set', async () => {
      await service().check(security());
      write('src/other.ts', 'export const other = 2;\n');
      await service().check(security());
      expect(http.calls).toHaveLength(2);
    });

    it('ignores a stored sidecar from another question-set version', async () => {
      await service().check(security());
      const [file] = sidecarFiles();
      const stored = readSidecar(file!);
      stored.binding.questionSetVersion = QUESTION_SET_VERSION - 1;
      writeFileSync(path.join(reviewDir(), file!), JSON.stringify(stored));
      await service().check(security());
      expect(http.calls).toHaveLength(2);
    });

    it('keeps an answered sidecar when a later run for the same range is unavailable', async () => {
      await service().check(security());
      const [file] = sidecarFiles();
      const answered = readFileSync(path.join(reviewDir(), file!), 'utf8');
      http.respond = async () => ({ status: 503, body: '' });
      const result = await service().check(security({}, [finding({ title: 'another finding' })]));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'http-503', persisted: false });
      expect(readFileSync(path.join(reviewDir(), file!), 'utf8')).toBe(answered);
    });
  });

  describe('guarantees that must survive baseRef mode', () => {
    it('sends no excerpt for an excluded file or a symlink that resolves to one', async () => {
      write('.env', `TOKEN=${SECRET}\n`);
      symlinkSync('../.env', path.join(repo, 'src', 'link.ts'));
      commitAll('env and link');
      await service().check(security({}, [finding({ path: '.env', line: 1 }), finding({ id: 'F2', path: 'src/link.ts', line: 1 })]));
      const items = posted().state.items;
      expect(items.map((item) => item.excerpt)).toEqual([null, null]);
      expect(http.calls[0]!.body).not.toContain(SECRET);
    });

    it('never writes spec.json or anything outside the review directory', async () => {
      await service().check(security());
      await service().check(principles());
      expect(readFileSync(path.join(repo, '.spec', 'specs', 'demo', 'spec.json'), 'utf8')).toBe(SPEC_JSON);
      expect(git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).every((line) => line.includes('/review/'))).toBe(true);
    });

    it('issues only read-only git commands', async () => {
      await service().check(security());
      const allowed = ['rev-parse', 'merge-base', 'diff', 'status', 'ls-files', 'ls-tree', 'hash-object'];
      expect(gitCalls.length).toBeGreaterThan(0);
      for (const call of gitCalls) {
        expect(allowed).toContain(call[0] === '-c' ? call[2] : call[0]);
        expect(call.join(' ')).not.toMatch(/--output|\s-w(\s|$)|--write/);
      }
    });

    it('passes the ref to git only after --end-of-options, as the resolved-commit expression', async () => {
      await service().check(security());
      const holding = gitCalls.filter((call) => call.some((arg) => arg.includes(baseSha)));
      expect(holding[0]).toEqual(['rev-parse', '--verify', '--quiet', '--end-of-options', `${baseSha}^{commit}`]);
      for (const call of holding.slice(1)) expect(call).not.toContain(`${baseSha}^{commit}`);
    });

    it('writes a code-disabled sidecar with the range binding and sends nothing', async () => {
      const result = await service({ SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY }).check(security());
      expect(result).toMatchObject({ status: 'unavailable', reason: 'code-disabled', persisted: true });
      expect(http.calls).toHaveLength(0);
      const [file] = sidecarFiles();
      expect(file).toMatch(/^jev-review-security-range-[a-f0-9]{12}\.json$/);
      expect(readSidecar(file!).binding).toMatchObject({ rangeBaseCommit: baseSha, headCommit: git('rev-parse', 'HEAD') });
    });
  });

  describe('refs that cannot be reviewed', () => {
    it('skips an unknown ref without a request or any file', async () => {
      const result = await service().check(security({ baseRef: 'origin/ghost' }));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'invalid-base-ref', line: null, persisted: false });
      expect(http.calls).toHaveLength(0);
      expect(sidecarFiles()).toEqual([]);
    });

    it('skips an option-looking ref before git runs', async () => {
      const result = await service().check(security({ baseRef: '--output=injected' }));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'invalid-base-ref' });
      expect(gitCalls).toEqual([]);
      expect(sidecarFiles()).toEqual([]);
    });

    it('reports no-changes when the base is HEAD and the tree is clean', async () => {
      const result = await service().check(security({ baseRef: 'HEAD' }));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'no-changes' });
      expect(http.calls).toHaveLength(0);
    });
  });

  describe('without a baseRef', () => {
    it('builds the working-tree manifest only and keeps the plain sidecar name', async () => {
      write('src/other.ts', 'export const other = 2;\n');
      const result = await service().check(security({ baseRef: undefined }, [finding({ path: 'src/other.ts', line: 1 })]));
      expect(result.status).toBe('answered');
      expect(gitCalls.flat().some((arg) => arg === 'merge-base' || arg === '--end-of-options')).toBe(false);
      const [file] = sidecarFiles();
      expect(file).toMatch(/^jev-review-security-[a-f0-9]{12}\.json$/);
      const stored = readSidecar(file!);
      expect(Object.keys(stored.binding).sort()).toEqual(['diffSha256', 'inputSha256', 'questionSetVersion']);
    });

    it('does not see the committed change at all', async () => {
      const result = await service().check(security({ baseRef: undefined }));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'no-changes' });
      expect(http.calls).toHaveLength(0);
    });
  });
});
