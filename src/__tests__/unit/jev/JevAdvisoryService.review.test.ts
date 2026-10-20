import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JevAdvisoryService, type AdvisoryEngine, type JevEnvironment } from '../../../application/services/JevAdvisoryService';
import type { JevCheckRequest, JevFindingInput, JevUnitInput } from '../../../application/services/JevCheckTypes';
import {
  FakeGitPort, FakeJevHttpPort, SpyFileSystem, TEST_KEY, benignAnswers, createTempProject, readAllFiles, scriptOneChangedFile,
  silentLogger, snapshotTree, type TempProject,
} from './helpers';

const CODE_ACTIVE: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY, SDD_JEV_ALLOW_CODE: '1' };
const SECRET = 'sk_live_123456789';
const BLOB = 'a'.repeat(40);
const HEAD = 'c'.repeat(40);

const finding = (overrides: Partial<JevFindingInput> = {}): JevFindingInput => ({
  id: 'F1', path: 'src/a.ts', line: 100, title: 'SQL built from input', severity: 'important',
  description: 'User input reaches the query', preconditions: 'authenticated user', remediation: 'use parameters', ...overrides,
});
const unit = (overrides: Partial<JevUnitInput> = {}): JevUnitInput => ({ id: 'U1', path: 'src/a.ts', line: 100, summary: 'order handler', ...overrides });

describe('JevAdvisoryService security triage and principle checks', () => {
  let project: TempProject;
  let http: FakeJevHttpPort;
  let git: FakeGitPort;

  beforeEach(async () => {
    project = await createTempProject();
    const lines = Array.from({ length: 300 }, (_, index) => (index === 99 ? `const apiKey = "${SECRET}"; // line 100` : `// line ${index + 1}`));
    await writeFile(path.join(project.root, 'src', 'a.ts'), lines.join('\n'));
    http = new FakeJevHttpPort();
    git = new FakeGitPort();
    scriptOneChangedFile(git, { blob: BLOB, head: HEAD });
    http.respond = async (request) => ({ status: 200, body: benignAnswers(request.body) });
  });
  afterEach(async () => {
    await project.cleanup();
  });

  const service = (env: JevEnvironment = CODE_ACTIVE): JevAdvisoryService =>
    new JevAdvisoryService(http, git, { readAdvisorySnapshot: jest.fn() } as unknown as AdvisoryEngine, new SpyFileSystem(), silentLogger(), env);
  const securityRequest = (findings: JevFindingInput[] = [finding()], overrides: Partial<JevCheckRequest> = {}): JevCheckRequest =>
    ({ check: 'security', projectRoot: project.root, featureName: 'demo', findings, ...overrides });
  const principlesRequest = (units: JevUnitInput[] = [unit()], overrides: Partial<JevCheckRequest> = {}): JevCheckRequest =>
    ({ check: 'principles', projectRoot: project.root, featureName: 'demo', units, ...overrides });
  const reviewDir = (): string => path.join(project.root, '.spec', 'specs', 'demo', 'review');
  const posted = (index = 0): { state: { items: Array<Record<string, any>> }; questions: Record<string, unknown> } => JSON.parse(http.calls[index]!.body);

  describe('security triage', () => {
    it('sends findings with a redacted ±15-line excerpt within the byte budget', async () => {
      const result = await service().check(securityRequest());
      expect(result.status).toBe('answered');
      expect(http.calls).toHaveLength(1);
      const item = posted().state.items[0]!;
      expect(item).toMatchObject({ id: 'F1', location: 'src/a.ts:100', title: 'SQL built from input', severity: 'important' });
      const excerpt = item.excerpt as string;
      expect(excerpt.startsWith('// line 85')).toBe(true);
      expect(excerpt.endsWith('// line 115')).toBe(true);
      expect(Buffer.byteLength(excerpt, 'utf8')).toBeLessThanOrEqual(8192);
      expect(Object.keys(posted().questions).sort()).toEqual(['F1.classification', 'F1.exploitability', 'F1.remediation', 'F1.severity']);
    });

    it('never sends a secret that appears on an excerpted line', async () => {
      await service().check(securityRequest());
      expect(http.calls[0]!.body).not.toContain(SECRET);
      expect(http.calls[0]!.body).toContain('[REDACTED]');
    });

    it('flags a severity disagreement and reports the unified severity', async () => {
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { 'F1.severity': { score: 1 } }) });
      const result = await service().check(securityRequest());
      expect(result).toMatchObject({ status: 'answered', flagged: ['F1'], line: 'JEV: 1 flagged (F1)' });
      expect(result.details[0]).toMatchObject({ id: 'F1', flagged: true, location: 'src/a.ts:100' });
      expect(result.details[0]!.note).toContain('important');
      expect(result.details[0]!.note).toContain('low');
    });

    it('accepts important vs medium and critical vs critical as agreement', async () => {
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { 'F1.severity': { score: 2 }, 'F2.severity': { score: 4 } }) });
      const result = await service().check(securityRequest([finding(), finding({ id: 'F2', severity: 'critical', line: 50 })]));
      expect(result.flagged).toEqual([]);
      expect(result.line).toBe('JEV: no flags');
    });

    it('flags false positives and incomplete remediations', async () => {
      http.respond = async (req) => ({
        status: 200,
        body: benignAnswers(req.body, { 'F1.classification': { choice: 'false-positive' }, 'F2.remediation': { choice: 'partly' } }),
      });
      const result = await service().check(securityRequest([finding(), finding({ id: 'F2', line: 50 })]));
      expect(result.flagged).toEqual(['F1', 'F2']);
    });

    it('sends a finding without code when its file is excluded', async () => {
      await writeFile(path.join(project.root, '.env'), `TOKEN=${SECRET}\n`);
      await service().check(securityRequest([finding({ path: '.env', line: 1 })]));
      expect(posted().state.items[0]!.excerpt).toBeNull();
      expect(http.calls[0]!.body).not.toContain(SECRET);
    });

    it('drops whole findings beyond the excerpt budget and reports them', async () => {
      const lines = Array.from({ length: 400 }, (_, index) => `// line ${index + 1} ${'x'.repeat(80)}`);
      await writeFile(path.join(project.root, 'src', 'big.ts'), lines.join('\n'));
      const findings = ['F1', 'F2', 'F3', 'F4'].map((id, index) => finding({ id, path: 'src/big.ts', line: 40 + index * 80 }));
      const result = await service().check(securityRequest(findings));
      expect(result.droppedFindingIds).toEqual(['F3', 'F4']);
      const items = posted().state.items;
      expect(items.map((item) => item.excerpt !== null)).toEqual([true, true, false, false]);
    });

    it('stores hashes and metadata but never excerpt text in the sidecar', async () => {
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { 'F1.severity': { score: 1 } }) });
      const result = await service().check(securityRequest());
      expect(result).toMatchObject({ persisted: true });
      const [file] = await readdir(reviewDir());
      expect(file).toMatch(/^jev-review-security-[a-f0-9]{12}\.json$/);
      expect(result.sidecar).toBe(`.spec/specs/demo/review/${file}`);
      const stored = JSON.parse(await readFile(path.join(reviewDir(), file!), 'utf8'));
      expect(stored).toMatchObject({ kind: 'security', status: 'answered', baseCommit: HEAD });
      expect(stored.binding.diffSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.binding.inputSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file).toContain(stored.binding.diffSha256.slice(0, 12));
      expect(stored.items[0]).toMatchObject({
        id: 'F1', location: 'src/a.ts:100', modelSeverity: 'important', jevSeverity: 'low', disagreement: true, classification: 'confirmed',
      });
      expect(stored.items[0].excerptSha256).toMatch(/^[a-f0-9]{64}$/);
      const text = await readAllFiles(reviewDir());
      expect(text).not.toContain('// line 90');
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(TEST_KEY);
    });

    it('returns answers without persisting when git cannot bind the change', async () => {
      git.handler = () => ({ ok: false });
      const before = await snapshotTree(project.root);
      const result = await service().check(securityRequest());
      expect(result).toMatchObject({ status: 'answered', persisted: false });
      expect(http.calls).toHaveLength(1);
      expect(await snapshotTree(project.root)).toEqual(before);
    });

    it('stores sidecars under .spec/reviews when no feature is in scope', async () => {
      const result = await service().check(securityRequest([finding()], { featureName: undefined }));
      expect(result.sidecar).toMatch(/^\.spec\/reviews\/jev-review-security-[a-f0-9]{12}\.json$/);
    });

    it('reuses the sidecar for the same change and findings, and asks again when either changes', async () => {
      await service().check(securityRequest());
      await service().check(securityRequest());
      expect(http.calls).toHaveLength(1);
      await service().check(securityRequest([finding({ title: 'a different finding' })]));
      expect(http.calls).toHaveLength(2);
      scriptOneChangedFile(git, { blob: 'b'.repeat(40), head: HEAD });
      await service().check(securityRequest());
      expect(http.calls).toHaveLength(3);
    });

    it('reports a request failure with the reason and persists it', async () => {
      http.respond = async () => ({ status: 503, body: '' });
      const result = await service().check(securityRequest());
      expect(result).toMatchObject({ status: 'unavailable', reason: 'http-503', line: 'JEV: unavailable (http-503)', persisted: true });
    });

    it('skips empty input and an unchanged tree', async () => {
      expect(await service().check(securityRequest([]))).toMatchObject({ status: 'skipped', skipReason: 'not-ready' });
      git.handler = () => ({ ok: true, stdout: Buffer.from('') });
      expect(await service().check(securityRequest())).toMatchObject({ status: 'skipped', skipReason: 'no-changes' });
      expect(http.calls).toHaveLength(0);
    });
  });

  describe('principle adherence', () => {
    it('reports only violated principles with their location and stores the rest', async () => {
      http.respond = async (req) => ({
        status: 200,
        body: benignAnswers(req.body, {
          'U1.srp': { choice: 'violated' }, 'U1.dry': { choice: 'partly' }, 'U2.swallowedErrors': { choice: 'violated' }, 'U2.dip': { choice: 'not-applicable' },
        }),
      });
      const result = await service().check(principlesRequest([unit(), unit({ id: 'U2', path: 'src/a.ts', line: 200 })]));
      expect(result).toMatchObject({ status: 'answered', flagged: ['U1', 'U2'], line: 'JEV: 2 flagged (U1, U2)' });
      expect(result.details).toEqual([
        { id: 'U1', flagged: true, principle: 'srp', location: 'src/a.ts:100' },
        { id: 'U2', flagged: true, principle: 'swallowedErrors', location: 'src/a.ts:200' },
      ]);
      const [file] = await readdir(reviewDir());
      expect(file).toMatch(/^jev-review-principles-/);
      const stored = JSON.parse(await readFile(path.join(reviewDir(), file!), 'utf8'));
      expect(stored.answers['U1.dry']).toEqual({ type: 'choice', choice: 'partly' });
      expect(stored.answers['U2.dip']).toEqual({ type: 'choice', choice: 'not-applicable' });
    });

    it('asks exactly the six principles and excludes mechanical checks', async () => {
      await service().check(principlesRequest());
      expect(Object.keys(posted().questions).sort()).toEqual(
        ['U1.dip', 'U1.dry', 'U1.kissYagni', 'U1.sensitiveLogging', 'U1.srp', 'U1.swallowedErrors'],
      );
      expect(JSON.stringify(posted().questions).toLowerCase()).not.toMatch(/liskov|segregation|open\/closed|parameter count|file length/);
    });

    it('reports no flags when every principle is followed', async () => {
      expect(await service().check(principlesRequest())).toMatchObject({ flagged: [], line: 'JEV: no flags', details: [] });
    });

    it('never sends a secret from the unit excerpt', async () => {
      await service().check(principlesRequest());
      expect(http.calls[0]!.body).not.toContain(SECRET);
    });
  });
});
