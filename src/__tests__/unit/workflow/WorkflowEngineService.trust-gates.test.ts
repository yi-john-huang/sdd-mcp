import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
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
  });
});
