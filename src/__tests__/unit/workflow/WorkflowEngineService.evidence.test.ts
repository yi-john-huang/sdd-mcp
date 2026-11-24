import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import {
  ScriptedProcessPort,
  createEngine,
  exited,
  independentTasks,
  prepareImplementation,
  specBytes,
  type EngineOptions,
} from './evidence-harness';

const FEATURE = 'payments';
const RUN = { argv: ['npm', 'test'] };
const CALLER = { command: 'jest order', exitCode: 1, summary: 'fails' };
const ASSERTION_OUTPUT = 'FAIL src/order.test.ts\nExpected: 1\nReceived: 2\n';
const SETUP_OUTPUT = "Error: Cannot find module './order'\n";

const failing = (code: string) => expect.objectContaining({ code });

describe('WorkflowEngineService evidence gate', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;

  const engine = (options: EngineOptions = {}): WorkflowEngineService => createEngine(fileSystem, options);
  const progress = (workflow: WorkflowEngineService, taskNumber: string, expectedRevision: number) => ({
    start: () => workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber, action: 'start', expectedRevision }),
    red: (extra: object = {}) => workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber, action: 'record-red', expectedRevision, ...extra }),
    green: (extra: object = {}) => workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber, action: 'record-green', expectedRevision, ...extra }),
    complete: (extra: object = {}) => workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber, action: 'complete', expectedRevision, affectedArtifacts: ['src/order.ts'], ...extra }),
  });
  const taskEntry = async (taskNumber: string, slot: 'red' | 'green' | 'verification') =>
    JSON.parse(await specBytes(projectRoot, FEATURE)).implementation.tasks[taskNumber].evidence[slot];

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-evidence-gate-'));
    fileSystem = new NodeFileSystemAdapter();
    await prepareImplementation(engine(), projectRoot, FEATURE);
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  describe('verified mode (the default)', () => {
    it('should reject caller-supplied evidence without a run, spawn nothing, and leave spec.json unchanged', async () => {
      const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1)]);
      const workflow = engine({ port });
      const started = await progress(workflow, '1.1', 0).start();
      const before = await specBytes(projectRoot, FEATURE);
      await expect(progress(workflow, '1.1', started.revision).red({ evidence: CALLER })).rejects.toEqual(failing('SelfReportedEvidenceRejected'));
      await expect(progress(workflow, '1.1', started.revision).red({ evidence: CALLER })).rejects.toThrow(/run\.argv/);
      expect(port.requests).toHaveLength(0);
      expect(await specBytes(projectRoot, FEATURE)).toBe(before);
    });

    it('should persist an engine-sourced RED from the observed exit code and return the observation', async () => {
      const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1)]);
      const workflow = engine({ port });
      const started = await progress(workflow, '1.1', 0).start();
      const red = await progress(workflow, '1.1', started.revision).red({ run: RUN });
      expect(red.taskState).toBe('red-observed');
      expect(red.revision).toBe(started.revision + 1);
      expect(red.evidenceMode).toBe('verified');
      expect(red.observed).toMatchObject({ exitCode: 1, classification: 'assertion', outputExcerpt: ASSERTION_OUTPUT, durationMs: 7 });
      expect(red.observed?.outputSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(port.requests[0]).toMatchObject({ argv: ['npm', 'test'], cwd: await realpath(projectRoot), timeoutMs: 120_000 });
      await expect(taskEntry('1.1', 'red')).resolves.toMatchObject({
        source: 'engine', exit_code: 1, argv: ['npm', 'test'], command: 'npm test', red_classification: 'assertion', duration_ms: 7, truncated: false, redactions: 0,
      });
    });

    it('should reject a RED whose run exits 0 and show the observation in the error', async () => {
      const workflow = engine({ port: new ScriptedProcessPort([exited('PASS\n', 0)]) });
      const started = await progress(workflow, '1.1', 0).start();
      const before = await specBytes(projectRoot, FEATURE);
      const error = await progress(workflow, '1.1', started.revision).red({ run: RUN }).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: 'TaskTransitionInvalid', details: { observed: { exitCode: 0, outputExcerpt: 'PASS\n' } } });
      expect(await specBytes(projectRoot, FEATURE)).toBe(before);
    });

    it('should reject a GREEN whose run exits 1 without writing', async () => {
      const workflow = engine({ port: new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited(ASSERTION_OUTPUT, 1)]) });
      const started = await progress(workflow, '1.1', 0).start();
      const red = await progress(workflow, '1.1', started.revision).red({ run: RUN });
      const before = await specBytes(projectRoot, FEATURE);
      await expect(progress(workflow, '1.1', red.revision).green({ run: RUN })).rejects.toMatchObject({ code: 'TaskTransitionInvalid', details: { observed: { exitCode: 1 } } });
      expect(await specBytes(projectRoot, FEATURE)).toBe(before);
    });

    it('should complete a task with engine GREEN and verification entries, and gate not-applicable tasks too', async () => {
      const workflow = engine({ port: new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited('PASS\n', 0), exited('PASS\n', 0), exited('ok\n', 0)]) });
      const started = await progress(workflow, '1.1', 0).start();
      const red = await progress(workflow, '1.1', started.revision).red({ run: RUN });
      const green = await progress(workflow, '1.1', red.revision).green({ run: RUN });
      expect(green.taskState).toBe('green-observed');
      const completed = await progress(workflow, '1.1', green.revision).complete({ run: RUN });
      expect(completed.taskState).toBe('completed');
      await expect(taskEntry('1.1', 'green')).resolves.toMatchObject({ source: 'engine', exit_code: 0 });
      const verification = await taskEntry('1.1', 'verification');
      expect(verification).toMatchObject({ source: 'engine', exit_code: 0 });
      expect(verification.red_classification).toBeUndefined();

      const startedNa = await progress(workflow, '1.2', completed.revision).start();
      await expect(progress(workflow, '1.2', startedNa.revision).complete({ evidence: { ...CALLER, exitCode: 0 }, affectedArtifacts: [] }))
        .rejects.toEqual(failing('SelfReportedEvidenceRejected'));
      const done = await progress(workflow, '1.2', startedNa.revision).complete({ run: RUN, affectedArtifacts: [] });
      expect(done.nextAction).toEqual({ kind: 'complete' });
    });

    it('should report a timeout with the partial excerpt and write nothing', async () => {
      const port = new ScriptedProcessPort([{ kind: 'timed-out', output: Buffer.from('still running'), truncated: false, totalOutputBytes: 13, durationMs: 120_000 }]);
      const workflow = engine({ port });
      const started = await progress(workflow, '1.1', 0).start();
      const before = await specBytes(projectRoot, FEATURE);
      await expect(progress(workflow, '1.1', started.revision).red({ run: RUN }))
        .rejects.toMatchObject({ code: 'EvidenceRunTimedOut', details: { observed: { outputExcerpt: 'still running', durationMs: 120_000 } } });
      expect(await specBytes(projectRoot, FEATURE)).toBe(before);
    });

    it('should report a spawn failure as an invalid transition with the reason', async () => {
      const port = new ScriptedProcessPort([{ kind: 'spawn-failed', reason: 'not-found', output: Buffer.alloc(0), durationMs: 2 }]);
      const workflow = engine({ port });
      const started = await progress(workflow, '1.1', 0).start();
      const before = await specBytes(projectRoot, FEATURE);
      await expect(progress(workflow, '1.1', started.revision).red({ run: RUN }))
        .rejects.toMatchObject({ code: 'TaskTransitionInvalid', details: { observed: { spawnFailed: 'not-found' } } });
      expect(await specBytes(projectRoot, FEATURE)).toBe(before);
    });

    it('should refuse to run when no evidence runner is wired', async () => {
      const workflow = engine({ withoutRunner: true });
      const started = await progress(workflow, '1.1', 0).start();
      await expect(progress(workflow, '1.1', started.revision).red({ run: RUN })).rejects.toEqual(failing('EvidenceRunnerUnavailable'));
    });

    it('should reject a disallowed program before spawning', async () => {
      const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1)]);
      const workflow = engine({ port });
      const started = await progress(workflow, '1.1', 0).start();
      await expect(progress(workflow, '1.1', started.revision).red({ run: { argv: ['sh', '-c', 'exit 1'] } })).rejects.toEqual(failing('EvidenceCommandNotAllowed'));
      expect(port.requests).toHaveLength(0);
    });
  });

  describe('self-reported mode', () => {
    const env = { SDD_EVIDENCE_MODE: 'self-reported' };

    it('should accept the 5.5.0 evidence shape as a caller entry without spawning', async () => {
      const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1)]);
      const workflow = engine({ port, env });
      const started = await progress(workflow, '1.1', 0).start();
      const red = await progress(workflow, '1.1', started.revision).red({ evidence: CALLER });
      expect(red.evidenceMode).toBe('self-reported');
      expect(red.observed).toBeUndefined();
      expect(port.requests).toHaveLength(0);
      await expect(taskEntry('1.1', 'red')).resolves.toMatchObject({ source: 'caller', exit_code: 1, command: 'jest order' });
    });

    it('should still run the command when a run is supplied', async () => {
      const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1)]);
      const workflow = engine({ port, env });
      const started = await progress(workflow, '1.1', 0).start();
      await progress(workflow, '1.1', started.revision).red({ run: RUN });
      expect(port.requests).toHaveLength(1);
      await expect(taskEntry('1.1', 'red')).resolves.toMatchObject({ source: 'engine' });
    });

    it('should surface configuration warnings once in the result', async () => {
      const workflow = engine({ env: { SDD_EVIDENCE_MODE: 'bogus' } });
      const started = await progress(workflow, '1.1', 0).start();
      expect(started.evidenceMode).toBe('verified');
      expect(started.warnings).toEqual([expect.stringContaining('bogus')]);
    });
  });

  describe('re-recording RED', () => {
    it('should allow a second RED after a setup failure and seal it after an assertion failure', async () => {
      const port = new ScriptedProcessPort([exited(SETUP_OUTPUT, 1), exited(ASSERTION_OUTPUT, 1), exited(ASSERTION_OUTPUT, 1)]);
      const workflow = engine({ port });
      const started = await progress(workflow, '1.1', 0).start();
      const first = await progress(workflow, '1.1', started.revision).red({ run: RUN });
      expect(first.observed?.classification).toBe('setup');
      await expect(taskEntry('1.1', 'red')).resolves.toMatchObject({ red_classification: 'setup' });

      const second = await progress(workflow, '1.1', first.revision).red({ run: RUN });
      expect(second.taskState).toBe('red-observed');
      expect(second.revision).toBe(first.revision + 1);
      await expect(taskEntry('1.1', 'red')).resolves.toMatchObject({ red_classification: 'assertion', output_excerpt: ASSERTION_OUTPUT });

      await expect(progress(workflow, '1.1', second.revision).red({ run: RUN })).rejects.toEqual(failing('TaskTransitionInvalid'));
      expect(port.requests).toHaveLength(2);
    });

    it('should not allow a second RED over a caller-sourced entry', async () => {
      const workflow = engine({ env: { SDD_EVIDENCE_MODE: 'self-reported' } });
      const started = await progress(workflow, '1.1', 0).start();
      const red = await progress(workflow, '1.1', started.revision).red({ evidence: CALLER });
      await expect(progress(workflow, '1.1', red.revision).red({ evidence: CALLER })).rejects.toEqual(failing('TaskTransitionInvalid'));
    });
  });

  describe('concurrency', () => {
    it('should run once for two concurrent RED requests on one feature and not block another feature', async () => {
      const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1)], 200);
      const workflow = engine({ port });
      await prepareImplementation(workflow, projectRoot, 'billing');
      const started = await progress(workflow, '1.1', 0).start();

      const order: string[] = [];
      const first = progress(workflow, '1.1', started.revision).red({ run: RUN }).then((value) => { order.push('a'); return value; }, (error: unknown) => { order.push('a'); return error; });
      const second = progress(workflow, '1.1', started.revision).red({ run: RUN }).then((value) => { order.push('b'); return value; }, (error: unknown) => { order.push('b'); return error; });
      const other = workflow.recordTaskProgress({ projectRoot, featureName: 'billing', taskNumber: '1.1', action: 'start', expectedRevision: 0 }).then((value) => { order.push('other'); return value; });
      const [a, b] = await Promise.all([first, second, other]);

      expect(port.requests).toHaveLength(1);
      const outcomes = [a, b].map((value) => ((value as { code?: string }).code ?? 'ok'));
      expect(outcomes.filter((code) => code === 'ok')).toHaveLength(1);
      expect(outcomes.find((code) => code !== 'ok')).toMatch(/^(RevisionConflict|LockTimeout)$/);
      expect(order[0]).toBe('other');
    });

    it('should leave the feature readable while the command runs', async () => {
      let workflow: WorkflowEngineService;
      let statusDuringRun: unknown;
      const port = {
        run: async () => {
          statusDuringRun = await workflow.getFeatureStatus({ projectRoot, featureName: FEATURE })
            .then((status) => status.implementation?.tasks['1.1']?.status, (error: { code?: string }) => error.code);
          return exited(ASSERTION_OUTPUT, 1);
        },
      };
      workflow = engine({ port });
      const started = await progress(workflow, '1.1', 0).start();
      await expect(progress(workflow, '1.1', started.revision).red({ run: RUN })).resolves.toMatchObject({ taskState: 'red-observed' });
      expect(statusDuringRun).toBe('in-progress');
    });

    it('should still reject any other task action on the feature while a command runs, without running it', async () => {
      const port = new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1)], 3_000);
      const workflow = engine({ port });
      const first = await progress(workflow, '1.1', 0).start();
      const running = progress(workflow, '1.1', first.revision).red({ run: RUN });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await expect(workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action: 'block', blocker: 'x', expectedRevision: first.revision }))
        .rejects.toEqual(failing('LockTimeout'));
      await expect(running).resolves.toMatchObject({ taskState: 'red-observed' });
      expect(port.requests).toHaveLength(1);
    }, 15_000);
  });

  describe('overhead', () => {
    /** 20 transitions (start, RED, GREEN, complete on 5 tasks); `verified` uses an instant port, otherwise caller evidence. */
    async function timeTwentyTransitions(perfRoot: string, featureName: string, verified: boolean): Promise<number> {
      // RED and GREEN run the same command, as continuity requires; every third run (each task's RED) fails.
      let runs = 0;
      const workflow = verified
        ? engine({ port: { run: async () => (runs++ % 3 === 0 ? exited(ASSERTION_OUTPUT, 1) : exited('PASS\n', 0)) } })
        : engine({ env: { SDD_EVIDENCE_MODE: 'self-reported' } });
      await prepareImplementation(workflow, perfRoot, featureName, independentTasks(5));
      const proof = (step: 'red' | 'green' | 'verify') => (verified
        ? { run: { argv: ['npm', step === 'verify' ? 'run' : 'test', ...(step === 'verify' ? ['verify'] : [])] } }
        : { evidence: { command: `npm ${step}`, exitCode: step === 'red' ? 1 : 0, summary: step } });
      const startedAt = Date.now();
      let revision = 0;
      for (let index = 1; index <= 5; index += 1) {
        const base = { projectRoot: perfRoot, featureName, taskNumber: `1.${index}` };
        revision = (await workflow.recordTaskProgress({ ...base, action: 'start', expectedRevision: revision })).revision;
        revision = (await workflow.recordTaskProgress({ ...base, action: 'record-red', expectedRevision: revision, ...proof('red') })).revision;
        revision = (await workflow.recordTaskProgress({ ...base, action: 'record-green', expectedRevision: revision, ...proof('green') })).revision;
        revision = (await workflow.recordTaskProgress({ ...base, action: 'complete', expectedRevision: revision, ...proof('verify'), affectedArtifacts: [`src/slice-${index}.ts`] })).revision;
      }
      expect(revision).toBe(20);
      return Date.now() - startedAt;
    }

    it('should add under 100 ms per transition over caller-reported evidence with an instant port', async () => {
      const perfRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-evidence-perf-'));
      try {
        const baselineMs = await timeTwentyTransitions(perfRoot, 'baseline', false);
        const verifiedMs = await timeTwentyTransitions(perfRoot, 'verified', true);
        expect(verifiedMs - baselineMs).toBeLessThan(20 * 100);
      } finally {
        await rm(perfRoot, { recursive: true, force: true });
      }
    });
  });
});
