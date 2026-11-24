import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import { ScriptedProcessPort, createEngine, exited, prepareImplementation } from './evidence-harness';

const FEATURE = 'payments';
const RUN = { argv: ['npm', 'test'] };
const ASSERTION_OUTPUT = 'Expected: 1\nReceived: 2\n';

describe('WorkflowEngineService status evidence sources', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-status-evidence-'));
    fileSystem = new NodeFileSystemAdapter();
    await prepareImplementation(createEngine(fileSystem), projectRoot, FEATURE);
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  it('should report the evidence mode and an empty evidence map before any progress', async () => {
    const status = await createEngine(fileSystem).getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(status.evidenceMode).toBe('verified');
    expect(status.implementation?.tasks).toEqual({
      '1.1': { status: 'pending', evidence: {}, binding: 'unbound' },
      '1.2': { status: 'pending', evidence: {}, binding: 'unbound' },
    });
    const selfReported = await createEngine(fileSystem, { env: { SDD_EVIDENCE_MODE: 'self-reported' } }).getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(selfReported.evidenceMode).toBe('self-reported');
  });

  it('should label each recorded entry with its source and carry the RED classification', async () => {
    const verified = createEngine(fileSystem, { port: new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited('PASS\n', 0), exited('PASS\n', 0)]) });
    const base = { projectRoot, featureName: FEATURE, taskNumber: '1.1' };
    let revision = (await verified.recordTaskProgress({ ...base, action: 'start', expectedRevision: 0 })).revision;
    revision = (await verified.recordTaskProgress({ ...base, action: 'record-red', expectedRevision: revision, run: RUN })).revision;
    revision = (await verified.recordTaskProgress({ ...base, action: 'record-green', expectedRevision: revision, run: RUN })).revision;
    revision = (await verified.recordTaskProgress({ ...base, action: 'complete', expectedRevision: revision, run: RUN, affectedArtifacts: ['src/order.ts'] })).revision;

    const selfReported = createEngine(fileSystem, { env: { SDD_EVIDENCE_MODE: 'self-reported' } });
    const next = { projectRoot, featureName: FEATURE, taskNumber: '1.2' };
    revision = (await selfReported.recordTaskProgress({ ...next, action: 'start', expectedRevision: revision })).revision;
    await selfReported.recordTaskProgress({ ...next, action: 'complete', expectedRevision: revision, evidence: { command: 'npm run bench', exitCode: 0, summary: 'ok' }, affectedArtifacts: [] });

    const status = await verified.getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(status.evidenceMode).toBe('verified');
    expect(status.implementation).toMatchObject({ completed: 2, total: 2 });
    expect(status.implementation?.tasks['1.1']).toEqual({
      status: 'completed',
      evidence: { red: 'engine', green: 'engine', verification: 'engine' },
      redClassification: 'assertion',
      binding: 'unbound',
    });
    expect(status.implementation?.tasks['1.2']).toEqual({ status: 'completed', evidence: { verification: 'caller' }, binding: 'unbound' });
  });
});
