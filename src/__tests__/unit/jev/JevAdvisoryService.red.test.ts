import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JevAdvisoryService, type JevEnvironment } from '../../../application/services/JevAdvisoryService';
import type { JevCheckRequest, JevEvidenceInput } from '../../../application/services/JevCheckTypes';
import {
  FIXTURE_DESIGN, FIXTURE_REQUIREMENTS, FIXTURE_TASKS, FakeGitPort, FakeJevHttpPort, TEST_KEY, benignAnswers,
  createEngineProject, silentLogger, snapshotTree, type EngineProject,
} from './helpers';

const ACTIVE: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY };
const TS_ERROR: JevEvidenceInput = { command: 'npx jest order.test.ts', exitCode: 1, summary: "error TS2304: Cannot find name 'createOrder'" };
const ASSERTION: JevEvidenceInput = { command: 'npx jest order.test.ts', exitCode: 1, summary: 'AssertionError: expected undefined to equal { id: 1 }' };
const AMBIGUOUS: JevEvidenceInput = { command: 'npx jest order.test.ts', exitCode: 1, summary: '1 test failed in 0.4s' };

async function startTask(project: EngineProject, task = '1.1'): Promise<void> {
  await project.approve('requirements', await project.submit('requirements', FIXTURE_REQUIREMENTS));
  await project.approve('design', await project.submit('design', FIXTURE_DESIGN));
  await project.approve('tasks', await project.submit('tasks', FIXTURE_TASKS));
  const begun = await project.engine.beginImplementation({ projectRoot: project.root, featureName: project.feature });
  await project.engine.recordTaskProgress({
    projectRoot: project.root, featureName: project.feature, taskNumber: task, action: 'start', expectedRevision: begun.revision,
  });
}

describe('JevAdvisoryService RED validity check', () => {
  let project: EngineProject;
  let http: FakeJevHttpPort;

  beforeEach(async () => {
    project = await createEngineProject();
    http = new FakeJevHttpPort();
    http.respond = async (request) => ({ status: 200, body: benignAnswers(request.body) });
  });
  afterEach(async () => {
    await project.cleanup();
  });

  const service = (env: JevEnvironment = ACTIVE): JevAdvisoryService =>
    new JevAdvisoryService(http, new FakeGitPort(), project.engine, project.fileSystem, silentLogger(), env);
  const request = (evidence: JevEvidenceInput | undefined = AMBIGUOUS, overrides: Partial<JevCheckRequest> = {}): JevCheckRequest => ({
    check: 'red', projectRoot: project.root, featureName: project.feature, taskNumber: '1.1', testName: 'creates an order', evidence, ...overrides,
  });
  const reviewDir = (): string => path.join(project.root, '.spec', 'specs', project.feature, 'review');
  const sidecarFiles = async (): Promise<string[]> => readdir(reviewDir()).catch(() => []);

  describe('local classification first', () => {
    beforeEach(async () => {
      await startTask(project);
    });

    it('flags a TypeScript setup error locally with no request and a local sidecar', async () => {
      const result = await service().check(request(TS_ERROR));
      expect(result).toMatchObject({
        status: 'answered', classification: 'setup', matchedPattern: 'typescript', flagged: ['1.1'], line: 'JEV: 1 flagged (1.1)', persisted: true,
      });
      expect(http.calls).toHaveLength(0);
      const [file] = await sidecarFiles();
      expect(file).toMatch(/^jev-red-1\.1-[a-f0-9]{12}\.json$/);
      const stored = JSON.parse(await readFile(path.join(reviewDir(), file!), 'utf8'));
      expect(stored).toMatchObject({ kind: 'red', status: 'answered', source: 'local' });
      expect(stored.meta).toMatchObject({ classification: 'setup', matchedPattern: 'typescript' });
    });

    it('treats an assertion failure as valid with no flags and no request', async () => {
      const result = await service().check(request(ASSERTION));
      expect(result).toMatchObject({ status: 'answered', classification: 'assertion', flagged: [], line: 'JEV: no flags' });
      expect(http.calls).toHaveLength(0);
    });

    it('prefers setup when evidence matches both kinds', async () => {
      const mixed = { ...ASSERTION, summary: `Cannot find module './order'\n${ASSERTION.summary}` };
      expect((await service().check(request(mixed))).classification).toBe('setup');
      expect(http.calls).toHaveLength(0);
    });
  });

  describe('ambiguous evidence', () => {
    let sourceMarker: string;

    beforeEach(async () => {
      await startTask(project);
      sourceMarker = 'const SOURCE_MARKER_DO_NOT_SEND = 42;';
      await mkdir(path.join(project.root, 'src'), { recursive: true });
      await writeFile(path.join(project.root, 'src', 'order.ts'), sourceMarker);
    });

    it('sends exactly one request with evidence, test name, and acceptance criteria but no source', async () => {
      const result = await service().check(request(AMBIGUOUS));
      expect(result).toMatchObject({ status: 'answered', flagged: [], line: 'JEV: no flags' });
      expect(http.calls).toHaveLength(1);
      const body = http.calls[0]!.body;
      const { state, questions } = JSON.parse(body);
      expect(state.kind).toBe('red');
      const item = state.items[0];
      expect(item).toMatchObject({ id: 'red', taskNumber: '1.1', testName: 'creates an order', command: AMBIGUOUS.command, summary: AMBIGUOUS.summary });
      expect(item.acceptance).toContain('The transaction is atomic');
      expect(Object.keys(questions).sort()).toEqual(['red.cause', 'red.setup']);
      expect(body).not.toContain('SOURCE_MARKER_DO_NOT_SEND');
    });

    it('flags the task when JEV reports a setup error', async () => {
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { 'red.cause': { choice: 'setup-error' } }) });
      expect(await service().check(request(AMBIGUOUS))).toMatchObject({ flagged: ['1.1'], line: 'JEV: 1 flagged (1.1)' });
    });

    it('flags the task when the setup probability is at least 0.5', async () => {
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { 'red.setup': { noul: 0.5 } }) });
      expect((await service().check(request(AMBIGUOUS))).flagged).toEqual(['1.1']);
    });

    it('redacts secrets in the evidence before sending', async () => {
      const secret = `ghp_${'a1B2'.repeat(9)}`;
      await service().check(request({ ...AMBIGUOUS, summary: `1 test failed using ${secret}` }));
      expect(http.calls[0]!.body).not.toContain(secret);
      expect(http.calls[0]!.body).toContain('[REDACTED]');
    });

    it('reports unavailable and persists the reason when the request fails', async () => {
      http.respond = async () => ({ status: 503, body: '' });
      const result = await service().check(request(AMBIGUOUS));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'http-503', line: 'JEV: unavailable (http-503)' });
      expect(http.calls).toHaveLength(1);
    });

    it('reuses the sidecar for identical evidence and asks again for different evidence', async () => {
      await service().check(request(AMBIGUOUS));
      await service().check(request(AMBIGUOUS));
      expect(http.calls).toHaveLength(1);
      await service().check(request({ ...AMBIGUOUS, summary: '2 tests failed' }));
      expect(http.calls).toHaveLength(2);
    });
  });

  describe('gates and readiness', () => {
    it('reports no-key for setup evidence and writes nothing', async () => {
      await startTask(project);
      const before = await snapshotTree(project.root);
      const result = await service({ SDD_JEV_ENABLED: '1' }).check(request(TS_ERROR));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'no-key' });
      expect(await snapshotTree(project.root)).toEqual(before);
    });

    it('skips a task that is not in progress', async () => {
      await project.approve('requirements', await project.submit('requirements', FIXTURE_REQUIREMENTS));
      await project.approve('design', await project.submit('design', FIXTURE_DESIGN));
      await project.approve('tasks', await project.submit('tasks', FIXTURE_TASKS));
      await project.engine.beginImplementation({ projectRoot: project.root, featureName: project.feature });
      expect(await service().check(request(TS_ERROR))).toMatchObject({ status: 'skipped', skipReason: 'not-ready' });
    });

    it('skips a task that is not TDD-required', async () => {
      await startTask(project, '1.1');
      expect(await service().check(request(TS_ERROR, { taskNumber: '1.2' }))).toMatchObject({ status: 'skipped', skipReason: 'not-ready' });
    });

    it('skips incomplete input and evidence with a zero exit code', async () => {
      await startTask(project);
      expect(await service().check({ ...request(AMBIGUOUS), evidence: undefined })).toMatchObject({ status: 'skipped', skipReason: 'not-ready' });
      expect(await service().check(request(TS_ERROR, { testName: undefined }))).toMatchObject({ status: 'skipped', skipReason: 'not-ready' });
      expect(await service().check(request({ ...TS_ERROR, exitCode: 0 }))).toMatchObject({ status: 'skipped', skipReason: 'not-ready' });
      expect(http.calls).toHaveLength(0);
    });
  });

  describe('record-red is unaffected', () => {
    const scenarios: Array<[string, JevEvidenceInput, (h: FakeJevHttpPort) => void]> = [
      ['a local setup result', TS_ERROR, () => undefined],
      ['a JEV missing-behavior result', AMBIGUOUS, () => undefined],
      ['an unavailable result', AMBIGUOUS, (h) => { h.respond = async () => ({ status: 503, body: '' }); }],
    ];

    it('records identical RED state whatever the advisory result was', async () => {
      const recorded: unknown[] = [];
      for (const [, evidence, arrange] of scenarios) {
        const isolated = await createEngineProject();
        try {
          await startTask(isolated);
          const scenarioHttp = new FakeJevHttpPort();
          scenarioHttp.respond = async (req) => ({ status: 200, body: benignAnswers(req.body) });
          arrange(scenarioHttp);
          const advisory = new JevAdvisoryService(scenarioHttp, new FakeGitPort(), isolated.engine, isolated.fileSystem, silentLogger(), ACTIVE);
          await advisory.check({ check: 'red', projectRoot: isolated.root, featureName: isolated.feature, taskNumber: '1.1', testName: 't', evidence });
          const snapshot = await isolated.engine.readAdvisorySnapshot({ projectRoot: isolated.root, featureName: isolated.feature, phase: 'tasks' });
          const progress = await isolated.engine.recordTaskProgress({
            projectRoot: isolated.root, featureName: isolated.feature, taskNumber: '1.1', action: 'record-red',
            expectedRevision: snapshot.implementation!.revision, evidence,
          });
          const spec = JSON.parse(await readFile(path.join(isolated.root, '.spec', 'specs', isolated.feature, 'spec.json'), 'utf8'));
          const red = spec.implementation.tasks['1.1'].evidence.red;
          recorded.push({ state: progress.taskState, command: red.command, exitCode: red.exitCode ?? red.exit_code, summary: red.summary, revision: progress.revision });
        } finally {
          await isolated.cleanup();
        }
      }
      expect(recorded.map((entry) => (entry as { state: string }).state)).toEqual(['red-observed', 'red-observed', 'red-observed']);
      expect(recorded[0]).toMatchObject({ command: TS_ERROR.command, exitCode: 1, summary: TS_ERROR.summary });
      expect(recorded[1]).toMatchObject({ command: AMBIGUOUS.command, exitCode: 1, summary: AMBIGUOUS.summary });
      expect((recorded[1] as { revision: number }).revision).toBe((recorded[0] as { revision: number }).revision);
      expect((recorded[2] as { revision: number }).revision).toBe((recorded[0] as { revision: number }).revision);
    });
  });
});
