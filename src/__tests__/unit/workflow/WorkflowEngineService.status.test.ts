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

describe('WorkflowEngineService post-verification drift', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;
  const gitIn = (...args: string[]) =>
    execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  const write = async (file: string, content: string) => {
    await mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
    await writeFile(path.join(projectRoot, file), content);
  };

  beforeEach(async () => {
    projectRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sdd-drift-')));
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

  /** Runs task 1.1 to completion in verified mode with real git bindings. */
  async function completeTask(options: Partial<EngineOptions> = {}): Promise<WorkflowEngineService> {
    const workflow = createEngine(fileSystem, { git: new NodeGitAdapter(), port: new ScriptedProcessPort([exited(ASSERTION_OUTPUT, 1), exited('PASS\n', 0), exited('PASS\n', 0)]), ...options });
    const base = { projectRoot, featureName: FEATURE, taskNumber: '1.1' };
    let revision = (await workflow.recordTaskProgress({ ...base, action: 'start', expectedRevision: 0 })).revision;
    await write('src/order.test.ts', 'test\n');
    revision = (await workflow.recordTaskProgress({ ...base, action: 'record-red', expectedRevision: revision, run: RUN })).revision;
    await write('src/order.ts', 'export const order = 2;\n');
    revision = (await workflow.recordTaskProgress({ ...base, action: 'record-green', expectedRevision: revision, run: RUN })).revision;
    await workflow.recordTaskProgress({ ...base, action: 'complete', expectedRevision: revision, run: RUN, affectedArtifacts: ['src/order.ts'] });
    return workflow;
  }

  it('should report drift naming the task and the edited file after completion', async () => {
    const workflow = await completeTask();
    await write('src/order.ts', 'export const order = 3;\n');
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(status.verificationDrift).toEqual({ taskNumber: '1.1', changedPaths: ['src/order.ts'], pathsTruncated: false });
  });

  it('should report no drift when the verified content is committed unchanged', async () => {
    const workflow = await completeTask();
    gitIn('add', '-A');
    gitIn('commit', '-q', '-m', 'verified work');
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(status.verificationDrift).toBeUndefined();
    expect(status.verificationBinding).toBeUndefined();
  });

  it('should never write spec.json and should skip drift when listing all features', async () => {
    const workflow = await completeTask();
    await write('src/order.ts', 'export const order = 3;\n');
    const before = await specBytes(projectRoot, FEATURE);
    await workflow.getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(await specBytes(projectRoot, FEATURE)).toBe(before);
    const listed = await workflow.listFeatureStatuses({ projectRoot });
    expect(listed.find(({ featureName }) => featureName === FEATURE)?.verificationDrift).toBeUndefined();
  });

  it('should report an unavailable binding, never silence, when git cannot observe the tree', async () => {
    await completeTask();
    const failing = createEngine(fileSystem, { git: { run: async () => ({ ok: false as const }) } });
    const status = await failing.getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(status.verificationDrift).toBeUndefined();
    expect(status.verificationBinding).toBe('unavailable');
  });

  it('should list at most 50 changed paths and mark the list truncated', async () => {
    const workflow = await completeTask();
    for (let index = 0; index < 60; index += 1) await write(`src/extra-${String(index).padStart(2, '0')}.ts`, `export const x = ${index};\n`);
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: FEATURE });
    expect(status.verificationDrift?.changedPaths).toHaveLength(50);
    expect(status.verificationDrift?.pathsTruncated).toBe(true);
  });
});
