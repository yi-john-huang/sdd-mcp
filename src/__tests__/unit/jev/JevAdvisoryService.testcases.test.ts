import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { JevAdvisoryService, type JevEnvironment } from '../../../application/services/JevAdvisoryService';
import type { JevCase, JevCheckRequest } from '../../../application/services/JevCheckTypes';
import {
  FIXTURE_DESIGN, FIXTURE_REQUIREMENTS, FIXTURE_TASKS, FakeGitPort, FakeJevHttpPort, TEST_KEY, benignAnswers,
  createEngineProject, silentLogger, type EngineProject,
} from './helpers';

const ACTIVE: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY };
const CASES: JevCase[] = [
  { taskId: '1.1', kind: 'behavior', given: 'a valid cart', when: 'checkout runs', then: 'an order is persisted atomically', covers: 'The transaction is atomic' },
  { taskId: '1.1', kind: 'error', given: 'the store fails', when: 'checkout runs', then: 'the order rolls back', covers: 'The transaction is atomic' },
];

describe('JevAdvisoryService test-case adequacy check', () => {
  let project: EngineProject;
  let http: FakeJevHttpPort;

  beforeEach(async () => {
    project = await createEngineProject();
    http = new FakeJevHttpPort();
    http.respond = async (request) => ({ status: 200, body: benignAnswers(request.body) });
    await project.approve('requirements', await project.submit('requirements', FIXTURE_REQUIREMENTS));
    await project.approve('design', await project.submit('design', FIXTURE_DESIGN));
  });
  afterEach(async () => {
    await project.cleanup();
  });

  const service = (env: JevEnvironment = ACTIVE): JevAdvisoryService =>
    new JevAdvisoryService(http, new FakeGitPort(), project.engine, project.fileSystem, silentLogger(), env);
  const request = (cases?: readonly JevCase[]): JevCheckRequest =>
    ({ check: 'testcases', projectRoot: project.root, featureName: project.feature, cases });
  const featureDir = (): string => path.join(project.root, '.spec', 'specs', project.feature);
  const reviewDir = (): string => path.join(featureDir(), 'review');
  const storedSidecar = async (): Promise<{ binding: Record<string, unknown> }> => {
    const [file] = await readdir(reviewDir());
    return JSON.parse(await readFile(path.join(reviewDir(), file!), 'utf8'));
  };
  const posted = (index = 0): { state: { items: Array<Record<string, unknown>> }; questions: Record<string, unknown> } =>
    JSON.parse(http.calls[index]!.body);

  describe('handshake', () => {
    it('asks for a case list without sending anything', async () => {
      await project.submit('tasks', FIXTURE_TASKS);
      for (const cases of [undefined, []]) {
        const result = await service().check(request(cases));
        expect(result).toMatchObject({ status: 'skipped', skipReason: 'cases-required', line: null });
      }
      expect(http.calls).toHaveLength(0);
      await expect(readdir(reviewDir())).rejects.toThrow();
    });

    it('asks for cases again when no case belongs to a TDD-required task', async () => {
      await project.submit('tasks', FIXTURE_TASKS);
      const unmatched: JevCase[] = [
        { taskId: '9.9', kind: 'error', given: 'g', when: 'w', then: 't', covers: 'c' },
        { taskId: '1.2', kind: 'behavior', given: 'g', when: 'w', then: 't', covers: 'c' },
      ];
      const result = await service().check(request(unmatched));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'cases-required', line: null });
      expect(http.calls).toHaveLength(0);
      await expect(readdir(reviewDir())).rejects.toThrow();
    });

    it('judges not-applicable reasons without cases when no task is TDD-required', async () => {
      await project.submit('tasks', FIXTURE_TASKS.replace('**TDD:** required', '**TDD:** not-applicable — configuration-only task'));
      const result = await service().check(request(undefined));
      expect(result).toMatchObject({ status: 'answered', line: 'JEV: no flags' });
      expect(http.calls).toHaveLength(1);
      expect(Object.keys(posted().questions).sort()).toEqual(['1.1.tddReason', '1.2.tddReason']);

      const unmatched = await service().check(request([{ taskId: '9.9', kind: 'error', given: 'g', when: 'w', then: 't', covers: 'c' }]));
      expect(unmatched).toMatchObject({ status: 'answered', unknownTasks: ['9.9'] });
      expect(http.calls).toHaveLength(2);
      expect(http.calls[1]!.body).not.toContain('"9.9"');
    });

    it('skips when the tasks failed validation', async () => {
      await project.submit('tasks', '# nothing here');
      const result = await service().check(request(CASES));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'not-ready' });
      expect(http.calls).toHaveLength(0);
    });
  });

  describe('request and interpretation', () => {
    beforeEach(async () => {
      await project.submit('tasks', FIXTURE_TASKS);
    });

    it('sends task context, covered requirement text, cases, and not-applicable reasons', async () => {
      const result = await service().check(request(CASES));
      expect(result).toMatchObject({ status: 'answered', flagged: [], line: 'JEV: no flags', persisted: true });
      expect(http.calls).toHaveLength(1);
      const { state, questions } = posted();
      const tdd = state.items.find((item) => item.id === '1.1')!;
      const serialized = JSON.stringify(tdd);
      expect(serialized).toContain('The transaction is atomic');
      expect(serialized).toContain('create an order');
      expect(serialized).toContain('the order rolls back');
      const skipped = state.items.find((item) => item.id === '1.2')!;
      expect(JSON.stringify(skipped)).toContain('measurement-only task');
      expect(Object.keys(questions).sort()).toEqual(
        ['1.1.coverage', '1.1.missing', '1.1.noRed', '1.1.observability', '1.1.proportion', '1.2.tddReason'],
      );
    });

    it('lists flagged tasks first in details', async () => {
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { '1.2.tddReason': { choice: 'not-justified' } }) });
      const result = await service().check(request(CASES));
      expect(result).toMatchObject({ flagged: ['1.2'], line: 'JEV: 1 flagged (1.2)' });
      expect(result.details.map((detail) => detail.id)).toEqual(['1.2', '1.1']);
      expect(result.details.map((detail) => detail.flagged)).toEqual([true, false]);
    });

    it('flags a task whose planned cases leave a gap', async () => {
      http.respond = async (req) => ({
        status: 200,
        body: benignAnswers(req.body, { '1.1.missing': { choice: 'boundary' }, '1.1.noRed': { noul: 0.7 } }),
      });
      expect((await service().check(request(CASES))).flagged).toEqual(['1.1']);
    });

    it('reports cases for unknown or not-applicable tasks and does not send them', async () => {
      const extra: JevCase[] = [
        ...CASES,
        { taskId: '9.9', kind: 'error', given: 'ghost-given', when: 'ghost-when', then: 'ghost-then', covers: 'none' },
        { taskId: '1.2', kind: 'behavior', given: 'skipped-given', when: 'w', then: 't', covers: 'c' },
      ];
      const result = await service().check(request(extra));
      expect(result.unknownTasks).toEqual(['1.2', '9.9']);
      expect(http.calls[0]!.body).not.toContain('ghost-given');
      expect(http.calls[0]!.body).not.toContain('skipped-given');
    });
  });

  describe('case-list binding', () => {
    beforeEach(async () => {
      await project.submit('tasks', FIXTURE_TASKS);
    });

    it('reuses the sidecar for the same list and ignores it for a reordered or edited list', async () => {
      await service().check(request(CASES));
      const first = (await storedSidecar()).binding.caseListSha256 as string;
      expect(first).toMatch(/^[a-f0-9]{64}$/);

      await service().check(request(CASES.map((testCase) => ({ ...testCase }))));
      expect(http.calls).toHaveLength(1);

      await service().check(request([...CASES].reverse()));
      expect(http.calls).toHaveLength(2);
      const reordered = (await storedSidecar()).binding.caseListSha256 as string;
      expect(reordered).toMatch(/^[a-f0-9]{64}$/);
      expect(reordered).not.toBe(first);

      await service().check(request([{ ...CASES[0]!, then: 'a different outcome' }, CASES[1]!]));
      expect(http.calls).toHaveLength(3);
      expect((await storedSidecar()).binding.caseListSha256).not.toBe(reordered);
    });

    it('ignores the sidecar when the tasks artifact changes', async () => {
      await service().check(request(CASES));
      const tasks = await project.engine.readAdvisorySnapshot({ projectRoot: project.root, featureName: project.feature, phase: 'tasks' });
      await project.submit('tasks', `${FIXTURE_TASKS}\n`.replace('Run the benchmark.', 'Run the benchmark twice.'), tasks.revision, tasks.recordedSha256);
      await service().check(request(CASES));
      expect(http.calls).toHaveLength(2);
    });

    it('truncates by whole tasks beyond the state cap and records the omitted tasks', async () => {
      const task = (n: number): string => [
        `### 1.${n} Task ${n}`,
        '**Covers:** FR-1, NFR-1, D-1',
        '**Dependencies:** none',
        '**TDD:** required',
        '**Affected artifacts:** none',
        `**Acceptance criteria:** 1. ${'a'.repeat(1400)}`,
        `**Verification:** ${'v'.repeat(100)}`,
      ].join('\n');
      const big = ['# Tasks', ...Array.from({ length: 40 }, (_, i) => task(i + 1))].join('\n');
      const current = await project.engine.readAdvisorySnapshot({ projectRoot: project.root, featureName: project.feature, phase: 'tasks' });
      await project.submit('tasks', big, current.revision, current.recordedSha256);
      const cases = Array.from({ length: 40 }, (_, i): JevCase => ({ taskId: `1.${i + 1}`, kind: 'behavior', given: 'g', when: 'w', then: 't', covers: 'c' }));
      const result = await service().check(request(cases));
      expect(result.truncated).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(posted().state), 'utf8')).toBeLessThanOrEqual(32768);
      const stored = await storedSidecar() as unknown as { omittedIds: string[] };
      expect(stored.omittedIds.length).toBeGreaterThan(0);
      expect(stored.omittedIds).toContain('1.40');
      expect(result.truncatedTasks).toContain('1.40');
      expect(result.unknownTasks).toBeUndefined();
    });
  });

  describe('checkpoint independence', () => {
    it('leaves spec.json byte-identical and reviewTestCases unaffected when review is off', async () => {
      await project.submit('tasks', FIXTURE_TASKS);
      const specPath = path.join(featureDir(), 'spec.json');
      const before = await readFile(specPath, 'utf8');
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { '1.1.missing': { choice: 'error' } }) });
      const result = await service().check(request(CASES));
      expect(result.flagged).toEqual(['1.1']);
      expect(await readFile(specPath, 'utf8')).toBe(before);
      const tasks = await project.engine.readAdvisorySnapshot({ projectRoot: project.root, featureName: project.feature, phase: 'tasks' });
      await expect(project.engine.reviewTestCases({
        projectRoot: project.root, featureName: project.feature, expectedTasksRevision: tasks.revision, expectedArtifactSha256: tasks.recordedSha256!,
      })).rejects.toThrow(/not required/);
    });

    it('does not record the checkpoint when review is required; only the explicit call does', async () => {
      const submitted = await project.engine.submitPhaseArtifact({
        projectRoot: project.root, featureName: project.feature, phase: 'tasks', content: FIXTURE_TASKS,
        expectedRevision: 0, expectedArtifactSha256: null, reviewTestCases: true,
      });
      const specPath = path.join(featureDir(), 'spec.json');
      const before = await readFile(specPath, 'utf8');
      await service().check(request(CASES));
      expect(await readFile(specPath, 'utf8')).toBe(before);
      const status = await project.engine.getFeatureStatus({ projectRoot: project.root, featureName: project.feature });
      expect(status.checkpoint).toMatchObject({ required: true, reviewed: false });
      expect(status.nextAction).toMatchObject({ kind: 'review-test-cases' });
      const reviewed = await project.engine.reviewTestCases({
        projectRoot: project.root, featureName: project.feature, expectedTasksRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256,
      });
      expect(reviewed.reviewed).toBe(true);
    });
  });
});
