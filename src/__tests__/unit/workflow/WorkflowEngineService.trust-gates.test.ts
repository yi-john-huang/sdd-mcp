import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import {
  ScriptedProcessPort,
  createEngine,
  exited,
  prepareImplementation,
  specBytes,
  type EngineOptions,
} from './evidence-harness';

const FEATURE = 'payments';
const RUN = { argv: ['npm', 'test'] };
const ASSERTION_OUTPUT = 'FAIL src/order.test.ts\nExpected: 1\nReceived: 2\n';
const SETUP_OUTPUT = "Error: Cannot find module './order'\n";
const AMBIGUOUS_OUTPUT = 'Something failed\n';
const PASS_OUTPUT = 'PASS src/order.test.ts\n';
const SELF_REPORTED = { SDD_EVIDENCE_MODE: 'self-reported' };

describe('WorkflowEngineService trust gates', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;

  const engine = (options: EngineOptions = {}): WorkflowEngineService => createEngine(fileSystem, options);
  const act = (workflow: WorkflowEngineService, action: 'start' | 'record-red' | 'record-green' | 'complete', expectedRevision: number, extra: object = {}) =>
    workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action, expectedRevision, ...extra });

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-trust-gates-'));
    fileSystem = new NodeFileSystemAdapter();
    await prepareImplementation(engine(), projectRoot, FEATURE);
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  describe('setup-classified RED', () => {
    it('should reject GREEN after a setup RED before running anything and leave spec.json unchanged', async () => {
      const port = new ScriptedProcessPort([exited(SETUP_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
      const workflow = engine({ port });
      const started = await act(workflow, 'start', 0);
      const red = await act(workflow, 'record-red', started.revision, { run: RUN });
      expect(red.observed?.classification).toBe('setup');
      const before = await specBytes(projectRoot, FEATURE);

      await expect(act(workflow, 'record-green', red.revision, { run: RUN })).rejects.toMatchObject({ code: 'RedSetupFailure' });
      expect(port.requests).toHaveLength(1);
      expect(await specBytes(projectRoot, FEATURE)).toBe(before);
    });

    it('should allow GREEN once RED is recorded again with an assertion failure', async () => {
      const port = new ScriptedProcessPort([exited(SETUP_OUTPUT, 1), exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
      const workflow = engine({ port });
      const started = await act(workflow, 'start', 0);
      const setup = await act(workflow, 'record-red', started.revision, { run: RUN });
      const assertion = await act(workflow, 'record-red', setup.revision, { run: RUN });
      expect(assertion.observed?.classification).toBe('assertion');
      await expect(act(workflow, 'record-green', assertion.revision, { run: RUN })).resolves.toMatchObject({ taskState: 'green-observed' });
    });

    it('should allow GREEN after an ambiguous engine RED', async () => {
      const port = new ScriptedProcessPort([exited(AMBIGUOUS_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
      const workflow = engine({ port });
      const started = await act(workflow, 'start', 0);
      const red = await act(workflow, 'record-red', started.revision, { run: RUN });
      expect(red.observed?.classification).toBe('ambiguous');
      await expect(act(workflow, 'record-green', red.revision, { run: RUN })).resolves.toMatchObject({ taskState: 'green-observed' });
    });

    it('should not check self-reported RED evidence', async () => {
      const workflow = engine({ env: SELF_REPORTED });
      const started = await act(workflow, 'start', 0);
      const red = await act(workflow, 'record-red', started.revision, { evidence: { command: 'jest', exitCode: 1, summary: SETUP_OUTPUT } });
      await expect(act(workflow, 'record-green', red.revision, { evidence: { command: 'jest', exitCode: 0, summary: 'pass' } }))
        .resolves.toMatchObject({ taskState: 'green-observed' });
    });

    it('should let self-reported mode record GREEN over an engine setup RED, as a rollback', async () => {
      const port = new ScriptedProcessPort([exited(SETUP_OUTPUT, 1)]);
      const started = await act(engine({ port }), 'start', 0);
      const red = await act(engine({ port }), 'record-red', started.revision, { run: RUN });
      expect(red.observed?.classification).toBe('setup');
      await expect(act(engine({ env: SELF_REPORTED }), 'record-green', red.revision, { evidence: { command: 'jest', exitCode: 0, summary: 'pass' } }))
        .resolves.toMatchObject({ taskState: 'green-observed' });
    });
  });
});

describe('WorkflowEngineService RED-to-GREEN continuity', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;
  const gitIn = (...args: string[]) =>
    execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  const write = async (file: string, content: string) => {
    await mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
    await writeFile(path.join(projectRoot, file), content);
  };
  const act = (workflow: WorkflowEngineService, action: 'start' | 'record-red' | 'record-green', expectedRevision: number, extra: object = {}) =>
    workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action, expectedRevision, ...extra });

  beforeEach(async () => {
    projectRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sdd-continuity-')));
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

  async function redObserved(options: EngineOptions) {
    const workflow = createEngine(fileSystem, options);
    const started = await act(workflow, 'start', 0);
    const red = await act(workflow, 'record-red', started.revision, { run: RUN });
    return { workflow, red };
  }

  it('should reject GREEN with a different argv before running and name the expected argv', async () => {
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
    const { workflow, red } = await redObserved({ port, git: new NodeGitAdapter() });
    await write('src/order.ts', 'export const order = 2;\n');
    const before = await specBytes(projectRoot, FEATURE);
    const error = await act(workflow, 'record-green', red.revision, { run: { argv: ['npm', 'run', 'test:other'] } }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'EvidenceContinuityViolation', details: { reason: 'argv-mismatch', expectedArgv: ['npm', 'test'] } });
    expect(port.requests).toHaveLength(1);
    expect(await specBytes(projectRoot, FEATURE)).toBe(before);
  });

  it('should reject GREEN on the same working tree RED observed and leave spec.json unchanged', async () => {
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
    const { workflow, red } = await redObserved({ port, git: new NodeGitAdapter() });
    const before = await specBytes(projectRoot, FEATURE);
    const error = await act(workflow, 'record-green', red.revision, { run: RUN }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'EvidenceContinuityViolation', details: { reason: 'unchanged-tree' } });
    expect(port.requests).toHaveLength(1);
    expect(await specBytes(projectRoot, FEATURE)).toBe(before);
  });

  it('should accept GREEN after the implementation changed', async () => {
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
    const { workflow, red } = await redObserved({ port, git: new NodeGitAdapter() });
    await write('src/order.ts', 'export const order = 2;\n');
    await expect(act(workflow, 'record-green', red.revision, { run: RUN })).resolves.toMatchObject({ taskState: 'green-observed' });
  });

  it('should skip only the tree check when RED has no bound tree', async () => {
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
    const { workflow, red } = await redObserved({ port });
    await expect(act(workflow, 'record-green', red.revision, { run: RUN })).resolves.toMatchObject({ taskState: 'green-observed' });
  });

  it('should still reject a different argv when RED has no bound tree', async () => {
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
    const { workflow, red } = await redObserved({ port });
    await expect(act(workflow, 'record-green', red.revision, { run: { argv: ['npm', 'run', 'x'] } }))
      .rejects.toMatchObject({ code: 'EvidenceContinuityViolation', details: { reason: 'argv-mismatch' } });
  });

  it('should skip both checks in self-reported mode', async () => {
    const workflow = createEngine(fileSystem, { env: SELF_REPORTED, git: new NodeGitAdapter() });
    const started = await act(workflow, 'start', 0);
    const red = await act(workflow, 'record-red', started.revision, { evidence: { command: 'jest', exitCode: 1, summary: ASSERTION_OUTPUT } });
    await expect(act(workflow, 'record-green', red.revision, { evidence: { command: 'other', exitCode: 0, summary: 'pass' } }))
      .resolves.toMatchObject({ taskState: 'green-observed' });
  });
});

describe('WorkflowEngineService project verify command', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;
  const VERIFY = ['npm', 'run', 'verify'];
  const act = (workflow: WorkflowEngineService, action: 'start' | 'record-red' | 'record-green' | 'complete', expectedRevision: number, extra: object = {}) =>
    workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action, expectedRevision, ...extra });
  const configure = (evidence: object) => writeFile(path.join(projectRoot, '.spec', 'sdd-config.json'), JSON.stringify({ evidence }));

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-verify-command-'));
    fileSystem = new NodeFileSystemAdapter();
    await prepareImplementation(createEngine(fileSystem), projectRoot, FEATURE);
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  async function greenObserved(port: ScriptedProcessPort) {
    const workflow = createEngine(fileSystem, { port });
    const started = await act(workflow, 'start', 0);
    const red = await act(workflow, 'record-red', started.revision, { run: RUN });
    const green = await act(workflow, 'record-green', red.revision, { run: RUN });
    return { workflow, green };
  }

  it('should run the configured command when complete omits run and record its exit code', async () => {
    await configure({ verifyCommand: VERIFY });
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0), exited('all green\n', 0)]);
    const { workflow, green } = await greenObserved(port);
    const completed = await act(workflow, 'complete', green.revision, { affectedArtifacts: ['src/order.ts'] });
    expect(completed).toMatchObject({ taskState: 'completed', observed: { exitCode: 0 } });
    expect(port.requests[2]?.argv).toEqual(VERIFY);
  });

  it('should reject a different run for completion before running it', async () => {
    await configure({ verifyCommand: VERIFY });
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0), exited('ok\n', 0)]);
    const { workflow, green } = await greenObserved(port);
    const before = await specBytes(projectRoot, FEATURE);
    const error = await act(workflow, 'complete', green.revision, { run: { argv: ['npm', 'test'] }, affectedArtifacts: ['src/order.ts'] }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'VerifyCommandMismatch', details: { verifyCommand: VERIFY } });
    expect(port.requests).toHaveLength(2);
    expect(await specBytes(projectRoot, FEATURE)).toBe(before);
  });

  it('should still require run or evidence when no verify command is configured', async () => {
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
    const { workflow, green } = await greenObserved(port);
    await expect(act(workflow, 'complete', green.revision, { affectedArtifacts: ['src/order.ts'] })).rejects.toMatchObject({ code: 'SelfReportedEvidenceRejected' });
  });

  it('should show the verify command in status and in the implementation handoff', async () => {
    await configure({ verifyCommand: VERIFY });
    const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0)]);
    const { workflow } = await greenObserved(port);
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(status.verifyCommand).toEqual(VERIFY);
    const handoff = await readFile(path.join(projectRoot, '.spec', 'specs', FEATURE, 'context', 'handoff.md'), 'utf8');
    expect(handoff).toContain('- Verify command: npm run verify');
  });

  it('should reject at commit time when the configured command changed while the command ran', async () => {
    await configure({ verifyCommand: VERIFY });
    const swapping = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(PASS_OUTPUT, 0), exited('ok\n', 0)]);
    const { workflow, green } = await greenObserved(swapping);
    const original = swapping.run.bind(swapping);
    swapping.run = async (request) => {
      await configure({ verifyCommand: ['npm', 'run', 'other'] });
      return original(request);
    };
    await expect(act(workflow, 'complete', green.revision, { affectedArtifacts: ['src/order.ts'] })).rejects.toMatchObject({ code: 'VerifyCommandMismatch' });
  });
});
