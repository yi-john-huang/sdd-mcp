import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JevAdvisoryService, type JevEnvironment } from '../../../application/services/JevAdvisoryService';
import type { JevCase, JevCheckResult } from '../../../application/services/JevCheckTypes';
import {
  FIXTURE_DESIGN, FIXTURE_REQUIREMENTS, FIXTURE_TASKS, FakeGitPort, FakeJevHttpPort, TEST_KEY, benignAnswers, createEngineProject,
  scriptOneChangedFile, silentLogger, snapshotTree, type EngineProject,
} from './helpers';

type Mode = 'none' | 'disabled' | 'active';
const ACTIVE: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY, SDD_JEV_ALLOW_CODE: '1' };
const EVIDENCE = { command: 'npx jest order.test.ts', exitCode: 1, summary: '1 test failed in 0.4s' };
const CASES: JevCase[] = [
  { taskId: '1.1', kind: 'behavior', given: 'a cart', when: 'checkout', then: 'an order exists', covers: 'The transaction is atomic' },
];

interface Run {
  project: EngineProject;
  responses: unknown[];
  jevResults: JevCheckResult[];
  http: FakeJevHttpPort;
  specJson: string;
  /** Checks after which spec.json bytes differed from just before the call. */
  specChanges: string[];
}

const feature = 'payments';
const normalize = (value: unknown, root: string): unknown =>
  JSON.parse(JSON.stringify(value).split(root).join('<root>').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<time>'));
const paths = (lines: string[]): string[] => lines.map((line) => line.split('|').slice(0, 2).join('|'));

/** Runs the whole governed workflow, calling every JEV check between steps when a mode asks for it. */
async function runWorkflow(mode: Mode): Promise<Run> {
  const project = await createEngineProject(feature);
  const http = new FakeJevHttpPort();
  http.respond = async (request) => ({ status: 200, body: benignAnswers(request.body, { 'F1.severity': { score: 1 }, 'red.setup': { noul: 0.9 } }) });
  const git = new FakeGitPort();
  scriptOneChangedFile(git);
  await mkdir(path.join(project.root, 'src'), { recursive: true });
  await writeFile(path.join(project.root, 'src', 'a.ts'), 'export const a = 1;\n');
  const service = new JevAdvisoryService(http, git, project.engine, project.fileSystem, silentLogger(), mode === 'active' ? ACTIVE : {});
  const jevResults: JevCheckResult[] = [];
  const base = { projectRoot: project.root, featureName: feature };
  const specPath = path.join(project.root, '.spec', 'specs', feature, 'spec.json');
  const specChanges: string[] = [];
  const jev = async (request: Record<string, unknown>): Promise<void> => {
    if (mode === 'none') return;
    // Later engine writes rebuild spec.json, so only a before/after read around each call can catch a leak.
    const before = await readFile(specPath, 'utf8');
    jevResults.push(await service.check({ ...base, ...request } as never));
    if ((await readFile(specPath, 'utf8')) !== before) specChanges.push(String(request.check));
  };
  const responses: unknown[] = [];
  const keep = async <T>(promise: Promise<T>): Promise<T> => {
    const value = await promise;
    responses.push(value);
    return value;
  };

  const requirements = await keep(project.submit('requirements', FIXTURE_REQUIREMENTS));
  await jev({ check: 'requirements' });
  await keep(project.approve('requirements', requirements));

  const design = await keep(project.submit('design', FIXTURE_DESIGN));
  await jev({ check: 'design' });
  await keep(project.approve('design', design));

  const tasks = await keep(project.engine.submitPhaseArtifact({
    projectRoot: project.root, featureName: feature, phase: 'tasks', content: FIXTURE_TASKS,
    expectedRevision: 0, expectedArtifactSha256: null, reviewTestCases: true,
  }));
  await jev({ check: 'testcases' });
  await jev({ check: 'testcases', cases: CASES });
  await keep(project.engine.reviewTestCases({
    projectRoot: project.root, featureName: feature, expectedTasksRevision: tasks.revision, expectedArtifactSha256: tasks.artifact.sha256,
  }));
  await keep(project.approve('tasks', tasks));

  const begun = await keep(project.engine.beginImplementation({ projectRoot: project.root, featureName: feature }));
  const started = await keep(project.engine.recordTaskProgress({
    projectRoot: project.root, featureName: feature, taskNumber: '1.1', action: 'start', expectedRevision: begun.revision,
  }));
  await jev({ check: 'red', taskNumber: '1.1', testName: 'creates an order', evidence: EVIDENCE });
  const red = await keep(project.engine.recordTaskProgress({
    projectRoot: project.root, featureName: feature, taskNumber: '1.1', action: 'record-red', expectedRevision: started.revision, evidence: EVIDENCE,
  }));
  await jev({ check: 'security', findings: [{ id: 'F1', path: 'src/a.ts', line: 1, title: 'finding', severity: 'important' }] });
  await jev({ check: 'principles', units: [{ id: 'U1', path: 'src/a.ts', line: 1, summary: 'unit' }] });
  await jev({ check: 'commit', projectRoot: project.root, featureName: undefined });
  const green = await keep(project.engine.recordTaskProgress({
    projectRoot: project.root, featureName: feature, taskNumber: '1.1', action: 'record-green', expectedRevision: red.revision,
    evidence: { command: 'npx jest order.test.ts', exitCode: 0, summary: '1 test passed' },
  }));
  await keep(project.engine.recordTaskProgress({
    projectRoot: project.root, featureName: feature, taskNumber: '1.1', action: 'complete', expectedRevision: green.revision,
    evidence: { command: 'npx jest order.test.ts', exitCode: 0, summary: 'verified' }, affectedArtifacts: ['src/order.ts', 'src/order.test.ts'],
  }));
  await keep(project.engine.getFeatureStatus({ projectRoot: project.root, featureName: feature }));
  const specJson = await readFile(path.join(project.root, '.spec', 'specs', feature, 'spec.json'), 'utf8');
  return { project, responses, jevResults, http, specJson, specChanges };
}

describe('workflow state isolation', () => {
  let none: Run;
  let disabled: Run;
  let active: Run;

  beforeAll(async () => {
    [none, disabled, active] = [await runWorkflow('none'), await runWorkflow('disabled'), await runWorkflow('active')];
  }, 60_000);
  afterAll(async () => {
    await Promise.all([none, disabled, active].map((run) => run?.project.cleanup()));
  });

  it('actually exercised every check with JEV active', () => {
    expect(active.http.calls.length).toBeGreaterThanOrEqual(5);
    const answered = active.jevResults.filter((result) => result.status === 'answered').map((result) => result.check);
    expect(answered).toEqual(expect.arrayContaining(['requirements', 'design', 'testcases', 'red', 'security', 'principles']));
    expect(active.jevResults.some((result) => result.flagged.length > 0)).toBe(true);
  });

  it('actually ran the disabled calls and found them disabled', () => {
    expect(disabled.jevResults.length).toBeGreaterThanOrEqual(8);
    expect(disabled.jevResults.every((result) => result.status === 'skipped' || result.reason === 'disabled')).toBe(true);
    expect(disabled.http.calls).toHaveLength(0);
  });

  it('never changes spec.json bytes during any JEV check, with JEV disabled or active', () => {
    expect(disabled.specChanges).toEqual([]);
    expect(active.specChanges).toEqual([]);
  });

  it('ends with spec.json identical across no-JEV, disabled, and active runs apart from timestamps', () => {
    const stripTime = (text: string): string => text.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<time>');
    expect(stripTime(disabled.specJson)).toBe(stripTime(none.specJson));
    expect(stripTime(active.specJson)).toBe(stripTime(none.specJson));
  });

  it('returns equal approvalRequired, nextAction, and validation in every workflow response', () => {
    const baseline = normalize(none.responses, none.project.root);
    expect(normalize(disabled.responses, disabled.project.root)).toEqual(baseline);
    expect(normalize(active.responses, active.project.root)).toEqual(baseline);
    const submissions = (baseline as Array<Record<string, unknown>>).filter((response) => 'approvalRequired' in response);
    expect(submissions).toHaveLength(3);
    expect(submissions.every((response) => response.approvalRequired === true)).toBe(true);
  });

  it('keeps JEV out of context loads and the published handoff', async () => {
    const { engine, root } = active.project;
    for (const mode of ['compact', 'standard', 'full'] as const) {
      const context = await engine.loadFeatureContext({ projectRoot: root, featureName: feature, mode });
      expect(JSON.stringify(context).toLowerCase()).not.toContain('jev');
    }
    const handoff = await readFile(path.join(root, '.spec', 'specs', feature, 'context', 'handoff.md'), 'utf8');
    expect(handoff.toLowerCase()).not.toContain('jev');
  });

  it('does not raise an artifact-drift blocker because sidecars exist after approval', async () => {
    const { engine, root } = active.project;
    const reviewDir = path.join(root, '.spec', 'specs', feature, 'review');
    const sidecars = (await snapshotTree(reviewDir)).map((line) => line.split('|')[0]);
    expect(sidecars.length).toBeGreaterThanOrEqual(5);
    const status = await engine.getFeatureStatus({ projectRoot: root, featureName: feature });
    expect(status.blockers).toEqual([]);
    expect(status.nextAction).not.toMatchObject({ kind: 'blocked' });
    await expect(engine.loadFeatureContext({ projectRoot: root, featureName: feature, mode: 'compact' })).resolves.toBeDefined();
    await expect(engine.getFeatureStatus({ projectRoot: root, featureName: feature })).resolves.toEqual(status);
  });

  it('leaves the disabled project tree identical in shape to a run that never called JEV', async () => {
    const noneTree = paths(await snapshotTree(none.project.root));
    const disabledTree = paths(await snapshotTree(disabled.project.root));
    expect(disabledTree).toEqual(noneTree);
    expect(noneTree.some((line) => line.includes('review'))).toBe(false);
  });

  it('differs for the active run only by JEV sidecars', async () => {
    const noneTree = new Set(paths(await snapshotTree(none.project.root)));
    const extra = paths(await snapshotTree(active.project.root)).filter((line) => !noneTree.has(line));
    expect(extra.length).toBeGreaterThan(0);
    expect(extra.every((line) => line.includes('review'))).toBe(true);
  });
});
