import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import { ScriptedProcessPort, createEngine, exited, prepareImplementation, specBytes, type EngineOptions } from './evidence-harness';

const FEATURE = 'payments';
const RUN = { argv: ['npm', 'test'] };
const ASSERTION = 'FAIL\nExpected: 1\nReceived: 2\n';

describe('WorkflowEngineService observed artifacts match git changes', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;
  let port: ScriptedProcessPort;
  const gitIn = (...args: string[]) =>
    execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  const write = async (file: string, content: string) => {
    await mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
    await writeFile(path.join(projectRoot, file), content);
  };
  const act = (workflow: WorkflowEngineService, action: 'start' | 'record-red' | 'record-green' | 'complete', expectedRevision: number, extra: object = {}) =>
    workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action, expectedRevision, ...extra });

  beforeEach(async () => {
    projectRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sdd-artifacts-')));
    fileSystem = new NodeFileSystemAdapter();
    port = new ScriptedProcessPort([exited(ASSERTION, 1), exited('PASS\n', 0), exited('PASS\n', 0)]);
    gitIn('init', '-q');
    gitIn('config', 'user.email', 't@example.com');
    gitIn('config', 'user.name', 'T');
    gitIn('config', 'commit.gpgsign', 'false');
    await write('src/order.ts', 'export const order = 1;\n');
    await write('src/untouched.ts', 'export const untouched = 1;\n');
    gitIn('add', '-A');
    gitIn('commit', '-q', '-m', 'base');
    await prepareImplementation(createEngine(fileSystem), projectRoot, FEATURE);
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  /** Start, write a failing test, record RED, change the source, record GREEN. */
  async function greenObserved(options: Partial<EngineOptions> = {}) {
    const workflow = createEngine(fileSystem, { port, git: new NodeGitAdapter(), ...options });
    const started = await act(workflow, 'start', 0);
    await write('src/order.test.ts', 'test\n');
    const red = await act(workflow, 'record-red', started.revision, { run: RUN });
    await write('src/order.ts', 'export const order = 2;\n');
    const green = await act(workflow, 'record-green', red.revision, { run: RUN });
    return { workflow, revision: green.revision };
  }

  it('should reject a completion naming an unchanged path before running the verification', async () => {
    const { workflow, revision } = await greenObserved();
    const before = await specBytes(projectRoot, FEATURE);
    const error = await act(workflow, 'complete', revision, { run: RUN, affectedArtifacts: ['src/order.ts', 'src/untouched.ts'] }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'ObservedArtifactMismatch', details: { unmatched: ['src/untouched.ts'] } });
    expect(port.requests).toHaveLength(2);
    expect(await specBytes(projectRoot, FEATURE)).toBe(before);
  });

  it('should list at most 20 unmatched paths', async () => {
    const { workflow, revision } = await greenObserved();
    const unchanged = Array.from({ length: 25 }, (_, index) => `docs/never-${index}.md`);
    const error = await act(workflow, 'complete', revision, { run: RUN, affectedArtifacts: unchanged }).catch((caught: unknown) => caught);
    expect((error as { details: { unmatched: string[] } }).details.unmatched).toHaveLength(20);
  });

  it('should accept changed files and their parent directories', async () => {
    const { workflow, revision } = await greenObserved();
    await expect(act(workflow, 'complete', revision, { run: RUN, affectedArtifacts: ['src/order.ts', 'src/order.test.ts', 'src'] }))
      .resolves.toMatchObject({ taskState: 'completed' });
  });

  it('should accept a change committed after the task started', async () => {
    const { workflow, revision } = await greenObserved();
    gitIn('add', '-A');
    gitIn('commit', '-q', '-m', 'mid-task');
    await expect(act(workflow, 'complete', revision, { run: RUN, affectedArtifacts: ['src/order.ts'] }))
      .resolves.toMatchObject({ taskState: 'completed' });
  });

  it('should accept an existing .spec/specs path and reject a missing one', async () => {
    const { workflow, revision } = await greenObserved();
    await expect(act(workflow, 'complete', revision, { run: RUN, affectedArtifacts: ['src/order.ts', '.spec/specs/payments/missing.md'] }))
      .rejects.toMatchObject({ code: 'ObservedArtifactMismatch', details: { unmatched: ['.spec/specs/payments/missing.md'] } });
    await expect(act(workflow, 'complete', revision, { run: RUN, affectedArtifacts: ['src/order.ts', '.spec/specs/payments/tasks.md'] }))
      .resolves.toMatchObject({ taskState: 'completed' });
  });

  it('should normalize Windows-style backslash paths before matching', async () => {
    const { workflow, revision } = await greenObserved();
    await expect(act(workflow, 'complete', revision, { run: RUN, affectedArtifacts: ['src\\order.ts'] }))
      .resolves.toMatchObject({ taskState: 'completed' });
  });

  it('should follow the 6.0.0 rule for a task without a bound start_tree', async () => {
    const workflow = createEngine(fileSystem, { port });
    const started = await act(workflow, 'start', 0);
    await write('src/order.test.ts', 'test\n');
    const red = await act(workflow, 'record-red', started.revision, { run: RUN });
    const green = await act(workflow, 'record-green', red.revision, { run: RUN });
    await expect(act(workflow, 'complete', green.revision, { run: RUN, affectedArtifacts: ['src/untouched.ts'] }))
      .resolves.toMatchObject({ taskState: 'completed' });
  });
});
