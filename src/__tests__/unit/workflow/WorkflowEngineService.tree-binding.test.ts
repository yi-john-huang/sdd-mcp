import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import { ScriptedProcessPort, createEngine, exited, prepareImplementation, specPathOf, type EngineOptions } from './evidence-harness';

const FEATURE = 'payments';
const SELF_REPORTED = { SDD_EVIDENCE_MODE: 'self-reported' };
const SHA = 'a'.repeat(64);
const HEAD = 'b'.repeat(40);
const BLOB = 'c'.repeat(40);

const START_TREE = {
  status: 'bound',
  sha256: SHA,
  head: HEAD,
  prefix: '',
  dirty: [{ path: 'src/order.ts', token: BLOB }, { path: 'src/gone.ts', token: 'deleted' }],
  dirty_truncated: false,
};
const RED_TREE = { status: 'bound', sha256: SHA, head: null, prefix: 'packages/app/' };
const UNAVAILABLE = { status: 'unavailable', reason: 'timeout' };

describe('WorkflowEngineService tree-binding persistence', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;

  const engine = (): WorkflowEngineService => createEngine(fileSystem, { env: SELF_REPORTED });
  const act = (workflow: WorkflowEngineService, action: 'start' | 'record-red' | 'record-green', expectedRevision: number, extra: object = {}) =>
    workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action, expectedRevision, ...extra });
  const readSpec = async () => JSON.parse(await readFile(specPathOf(projectRoot, FEATURE), 'utf8'));
  const writeSpec = async (spec: unknown) => writeFile(specPathOf(projectRoot, FEATURE), `${JSON.stringify(spec, null, 2)}\n`);

  /** Starts 1.1, records a self-reported RED, then edits the bindings into spec.json by hand. */
  async function redWithBindings(start: unknown, red: unknown): Promise<number> {
    const workflow = engine();
    const started = await act(workflow, 'start', 0);
    const recorded = await act(workflow, 'record-red', started.revision, { evidence: { command: 'jest', exitCode: 1, summary: 'Expected: 1 Received: 2' } });
    const spec = await readSpec();
    spec.implementation.tasks['1.1'].start_tree = start;
    spec.implementation.tasks['1.1'].evidence.red.working_tree = red;
    await writeSpec(spec);
    return recorded.revision;
  }

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-tree-binding-'));
    fileSystem = new NodeFileSystemAdapter();
    await prepareImplementation(engine(), projectRoot, FEATURE);
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  it('should keep start_tree and working_tree unchanged through a later write', async () => {
    const revision = await redWithBindings(START_TREE, RED_TREE);
    await act(engine(), 'record-green', revision, { evidence: { command: 'jest', exitCode: 0, summary: 'pass' } });
    const task = (await readSpec()).implementation.tasks['1.1'];
    expect(JSON.stringify(task.start_tree)).toBe(JSON.stringify(START_TREE));
    expect(JSON.stringify(task.evidence.red.working_tree)).toBe(JSON.stringify(RED_TREE));
  });

  it('should keep an unavailable binding with its reason', async () => {
    const revision = await redWithBindings(UNAVAILABLE, UNAVAILABLE);
    await act(engine(), 'record-green', revision, { evidence: { command: 'jest', exitCode: 0, summary: 'pass' } });
    const task = (await readSpec()).implementation.tasks['1.1'];
    expect(task.start_tree).toEqual(UNAVAILABLE);
    expect(task.evidence.red.working_tree).toEqual(UNAVAILABLE);
  });

  it.each<[string, unknown]>([
    ['an unknown status', { status: 'maybe', sha256: SHA, head: HEAD, prefix: '' }],
    ['a non-hex sha256', { status: 'bound', sha256: 'z'.repeat(64), head: HEAD, prefix: '' }],
    ['a non-hex head', { status: 'bound', sha256: SHA, head: 'HEAD', prefix: '' }],
    ['an absolute dirty path', { ...START_TREE, dirty: [{ path: '/etc/passwd', token: BLOB }] }],
    ['a parent-segment dirty path', { ...START_TREE, dirty: [{ path: '../x', token: BLOB }] }],
    ['a bad dirty token', { ...START_TREE, dirty: [{ path: 'src/a.ts', token: 'nope' }] }],
    ['an escaping prefix', { status: 'bound', sha256: SHA, head: HEAD, prefix: '../' }],
    ['an unknown unavailable reason', { status: 'unavailable', reason: 'because' }],
  ])('should raise StateInvariantViolation for %s', async (...[, binding]) => {
    await redWithBindings(binding, RED_TREE);
    await expect(engine().getFeatureStatus({ projectRoot, featureName: FEATURE })).rejects.toMatchObject({ code: 'StateInvariantViolation' });
  });

  it('should reject a malformed evidence working_tree the same way', async () => {
    await redWithBindings(START_TREE, { status: 'bound', sha256: 'short', head: HEAD, prefix: '' });
    await expect(engine().getFeatureStatus({ projectRoot, featureName: FEATURE })).rejects.toMatchObject({ code: 'StateInvariantViolation' });
  });

  it('should load every schema-v5 feature in this repository and leave every spec byte-identical', async () => {
    const specsRoot = path.resolve('.spec/specs');
    const features = (await readdir(specsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect(features.length).toBeGreaterThan(0);
    const copyRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-existing-specs-'));
    try {
      await cp(specsRoot, path.join(copyRoot, '.spec', 'specs'), { recursive: true });
      for (const featureName of features) {
        const specPath = path.join(copyRoot, '.spec', 'specs', featureName, 'spec.json');
        const before = await readFile(specPath, 'utf8').catch(() => undefined);
        if (before === undefined) continue;
        const status = createEngine(fileSystem).getFeatureStatus({ projectRoot: copyRoot, featureName });
        if (JSON.parse(before).schema_version === 5) {
          await expect(status).resolves.toMatchObject({ featureName });
        } else {
          // A pre-v5 legacy spec either reads through the legacy importer or fails with a governed error, never a crash.
          const failure = await status.then(() => undefined, (error: unknown) => error);
          if (failure !== undefined) expect(failure).toHaveProperty('name', 'GovernanceError');
        }
        expect(await readFile(specPath, 'utf8')).toBe(before);
      }
    } finally {
      await rm(copyRoot, { recursive: true, force: true });
    }
  });
});

describe('WorkflowEngineService binds task actions to the working tree', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;
  const RUN = { argv: ['npm', 'test'] };
  const ASSERTION = 'FAIL\nExpected: 1\nReceived: 2\n';
  const gitIn = (...args: string[]) =>
    execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  const write = async (file: string, content: string) => {
    await mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
    await writeFile(path.join(projectRoot, file), content);
  };
  const task = async () => JSON.parse(await readFile(specPathOf(projectRoot, FEATURE), 'utf8')).implementation.tasks['1.1'];
  const act = (workflow: WorkflowEngineService, action: 'start' | 'record-red' | 'record-green' | 'complete' | 'block', expectedRevision: number, extra: object = {}) =>
    workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action, expectedRevision, ...extra });
  const verified = (options: Partial<EngineOptions> = {}) =>
    createEngine(fileSystem, { git: new NodeGitAdapter(), port: new ScriptedProcessPort([exited(ASSERTION, 1), exited('PASS\n', 0), exited('PASS\n', 0)]), ...options });

  beforeEach(async () => {
    projectRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sdd-tree-actions-')));
    fileSystem = new NodeFileSystemAdapter();
    gitIn('init', '-q');
    gitIn('config', 'user.email', 't@example.com');
    gitIn('config', 'user.name', 'T');
    gitIn('config', 'commit.gpgsign', 'false');
    await write('src/order.ts', 'export const order = 1;\n');
    gitIn('add', '-A');
    gitIn('commit', '-q', '-m', 'base');
    await prepareImplementation(createEngine(fileSystem), projectRoot, FEATURE);
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  it('should store start_tree and each evidence working_tree, with dirty entries only on start and verification', async () => {
    const workflow = verified();
    const started = await act(workflow, 'start', 0);
    const startTree = (await task()).start_tree;
    expect(startTree).toMatchObject({ status: 'bound', sha256: expect.stringMatching(/^[a-f0-9]{64}$/), prefix: '', dirty: [], dirty_truncated: false });

    await write('src/order.test.ts', 'test\n');
    const red = await act(workflow, 'record-red', started.revision, { run: RUN });
    await write('src/order.ts', 'export const order = 2;\n');
    const green = await act(workflow, 'record-green', red.revision, { run: RUN });
    await act(workflow, 'complete', green.revision, { run: RUN, affectedArtifacts: ['src/order.ts'] });

    const evidence = (await task()).evidence;
    expect(Object.keys(evidence.red.working_tree)).toEqual(['status', 'sha256', 'head', 'prefix']);
    expect(Object.keys(evidence.green.working_tree)).toEqual(['status', 'sha256', 'head', 'prefix']);
    expect(evidence.red.working_tree.sha256).not.toBe(evidence.green.working_tree.sha256);
    expect(evidence.verification.working_tree).toMatchObject({ status: 'bound', dirty: [{ path: 'src/order.test.ts' }, { path: 'src/order.ts' }], dirty_truncated: false });
    expect((await task()).start_tree).toEqual(startTree);
  });

  it('should keep the original start_tree when a blocked task resumes', async () => {
    const workflow = verified();
    const started = await act(workflow, 'start', 0);
    const original = (await task()).start_tree;
    const blocked = await act(workflow, 'block', started.revision, { blocker: 'waiting on a decision' });
    await write('src/other.ts', 'export const other = 1;\n');
    await act(workflow, 'start', blocked.revision);
    expect((await task()).start_tree).toEqual(original);
  });

  it('should record an unavailable binding and still succeed when git never answers', async () => {
    const hanging = { run: () => new Promise<never>(() => undefined) };
    const workflow = verified({ git: hanging, treeDeadlineMs: 50 });
    const started = await act(workflow, 'start', 0);
    expect(started.taskState).toBe('in-progress');
    expect((await task()).start_tree).toEqual({ status: 'unavailable', reason: 'timeout' });
  });

  it('should record git-unavailable without a git port and otherwise behave as before', async () => {
    const workflow = createEngine(fileSystem, { port: new ScriptedProcessPort([exited(ASSERTION, 1)]) });
    const started = await act(workflow, 'start', 0);
    const red = await act(workflow, 'record-red', started.revision, { run: RUN });
    expect(red.taskState).toBe('red-observed');
    const stored = await task();
    expect(stored.start_tree).toEqual({ status: 'unavailable', reason: 'git-unavailable' });
    expect(stored.evidence.red.working_tree).toEqual({ status: 'unavailable', reason: 'git-unavailable' });
  });

  it('should report binding bound or unbound per task in status', async () => {
    const workflow = verified();
    await act(workflow, 'start', 0);
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(status.implementation?.tasks?.['1.1']).toMatchObject({ binding: 'bound' });
    expect(status.implementation?.tasks?.['1.2']).toMatchObject({ binding: 'unbound' });
  });
});
