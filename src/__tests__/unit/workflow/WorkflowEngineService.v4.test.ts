import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { ProjectRepository, LoggerPort } from '../../../domain/ports';
import { Project, WorkflowPhase } from '../../../domain/types';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

const requirements = [
  '# Requirements',
  '### FR-1: Checkout',
  '**Objective:** Complete checkout',
  '**EARS Specification:** WHEN a cart is valid, THE system SHALL create an order.',
  '**Acceptance Criteria:** 1. A persisted order is returned.',
  '### NFR-1: Latency',
  '**Objective:** Respond quickly',
  '**EARS Specification:** THE system SHALL respond within two seconds.',
  '**Acceptance Criteria:** 1. The response is at most two seconds.',
].join('\n');
const design = [
  '# Design',
  '## Requirements Traceability', 'FR-1, NFR-1',
  '## Architecture and Data Flow', 'Request to service to store.',
  '## Components and Interfaces', 'Checkout service and order store.',
  '## Failure Handling', 'Failures do not leave partial writes.',
  '## Verification', 'Focused unit and integration checks.',
  '### D-1: Atomic order creation',
  '**Covers:** FR-1, NFR-1',
  '**Decision:** Commit the order atomically.',
  '**Failure behavior:** Roll back the transaction.',
  '**Verification:** Exercise successful and failed commits.',
].join('\n');
const tasks = [
  '# Tasks',
  '### 1.1 Create order transaction',
  '**Covers:** FR-1, D-1',
  '**Dependencies:** none',
  '**TDD:** required',
  '**Affected artifacts:** src/order.ts, src/order.test.ts',
  '**Acceptance criteria:** 1. The transaction is atomic.',
  '**Verification:** Run the focused order test.',
  '### 1.2 Verify latency',
  '**Covers:** NFR-1',
  '**Dependencies:** 1.1',
  '**TDD:** not-applicable — measurement-only task',
  '**Affected artifacts:** none',
  '**Acceptance criteria:** 1. Latency is recorded.',
  '**Verification:** Run the benchmark.',
].join('\n');

const logger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const hash = (content: string) => createHash('sha256').update(content).digest('hex');

function repository(): ProjectRepository {
  const projects: Project[] = [];
  return {
    async save(project) { const index = projects.findIndex(({ id }) => id === project.id); if (index < 0) projects.push(project); else projects[index] = project; },
    async findById(id) { return projects.find((project) => project.id === id) ?? null; },
    async findByPath(projectPath) { return projects.find((project) => project.path === projectPath) ?? null; },
    async list() { return [...projects]; },
    async delete(id) { const index = projects.findIndex((project) => project.id === id); if (index >= 0) projects.splice(index, 1); },
  };
}

async function submitRequirementsInChild(
  projectRoot: string,
  content: string,
): Promise<{ ok: boolean; code?: string }> {
  const script = `
    try {
      const [{ WorkflowEngineService }, { ContextCompactionService }, { NodeFileSystemAdapter }] = await Promise.all([
        import('./src/application/services/WorkflowEngineService.ts'),
        import('./src/application/services/ContextCompactionService.ts'),
        import('./src/infrastructure/adapters/NodeFileSystemAdapter.ts'),
      ]);
      const repository = {
        save: async () => undefined,
        findById: async () => null,
        findByPath: async () => null,
        list: async () => [],
        delete: async () => undefined,
      };
      const logger = { info() {}, warn() {}, error() {}, debug() {} };
      const fileSystem = new NodeFileSystemAdapter();
      const workflow = new WorkflowEngineService(
        repository,
        new ContextCompactionService(fileSystem, logger),
        logger,
        fileSystem,
      );
      await workflow.submitPhaseArtifact({
        projectRoot: process.env.SDD_TEST_ROOT,
        featureName: 'payments',
        phase: 'requirements',
        content: Buffer.from(process.env.SDD_TEST_CONTENT, 'base64').toString('utf8'),
        expectedRevision: 0,
        expectedArtifactSha256: null,
      });
      process.stdout.write(JSON.stringify({ ok: true }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, code: error && error.code }));
    }
  `;
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SDD_TEST_ROOT: projectRoot,
        SDD_TEST_CONTENT: Buffer.from(content).toString('base64'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const [exitCode] = await once(child, 'close');
  if (exitCode !== 0) throw new Error(`Submission child exited ${exitCode}: ${stderr}`);
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Submission child returned invalid output: ${stdout}\n${stderr}`);
  }
}

describe('WorkflowEngineService schema-v5 governance', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;
  let workflow: WorkflowEngineService;

  function createWorkflow(): WorkflowEngineService {
    return new WorkflowEngineService(
      repository(),
      new ContextCompactionService(fileSystem, logger),
      logger,
      fileSystem,
    );
  }

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-workflow-v5-'));
    fileSystem = new NodeFileSystemAdapter();
    workflow = createWorkflow();
    await workflow.initializeFeature({ projectRoot, featureName: 'payments', description: 'Govern checkout', language: 'en' });
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); jest.clearAllMocks(); });

  async function submitAndApproveRequirements(): Promise<void> {
    const submitted = await workflow.submitPhaseArtifact({
      projectRoot, featureName: 'payments', phase: 'requirements', content: requirements,
      expectedRevision: 0, expectedArtifactSha256: null,
    });
    await workflow.approve({ projectRoot, featureName: 'payments', phase: 'requirements', expectedRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256 });
  }

  async function submitAndApproveDesign(): Promise<void> {
    await submitAndApproveRequirements();
    const submitted = await workflow.submitPhaseArtifact({
      projectRoot, featureName: 'payments', phase: 'design', content: design,
      expectedRevision: 0, expectedArtifactSha256: null,
    });
    await workflow.approve({ projectRoot, featureName: 'payments', phase: 'design', expectedRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256 });
  }

  async function prepareImplementation(): Promise<void> {
    await submitAndApproveDesign();
    const submitted = await workflow.submitPhaseArtifact({
      projectRoot, featureName: 'payments', phase: 'tasks', content: tasks,
      expectedRevision: 0, expectedArtifactSha256: null, reviewTestCases: true,
    });
    await workflow.reviewTestCases({ projectRoot, featureName: 'payments', expectedTasksRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256 });
    await workflow.approve({ projectRoot, featureName: 'payments', phase: 'tasks', expectedRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256 });
    await workflow.beginImplementation({ projectRoot, featureName: 'payments' });
  }
  it('rejects a pre-existing metadata symlink before creating specifications outside the project', async () => {
    const isolatedRoot = path.join(projectRoot, 'isolated');
    const outside = path.join(projectRoot, 'outside-metadata');
    await Promise.all([
      mkdir(isolatedRoot, { recursive: true }),
      mkdir(outside, { recursive: true }),
    ]);
    await symlink(outside, path.join(isolatedRoot, '.spec'));

    await expect(workflow.initializeFeature({
      projectRoot: isolatedRoot,
      featureName: 'escaped',
      description: 'Must remain contained',
    })).rejects.toMatchObject({ code: 'SpecPathEscape' });
    await expect(readFile(path.join(outside, 'specs', 'escaped', 'spec.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });


  async function stageRequirementsJournal(): Promise<{
    featureRoot: string;
    specPath: string;
    artifactPath: string;
    journalPath: string;
    priorSpec: string;
    nextSpec: string;
  }> {
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const specPath = path.join(featureRoot, 'spec.json');
    const artifactPath = path.join(featureRoot, 'requirements.md');
    const journalPath = path.join(featureRoot, '.phase-submit.json');
    const priorSpec = await readFile(specPath, 'utf8');
    const next = JSON.parse(priorSpec);
    next.phase = 'requirements';
    next.updated_at = '2026-07-24T00:00:00.000Z';
    next.approvals.requirements = {
      generated: true,
      approved: false,
      revision: 1,
      artifact_sha256: hash(requirements),
      validation: {
        status: 'passed',
        checked_at: '2026-07-24T00:00:00.000Z',
        blockers: [],
      },
    };
    const nextSpec = `${JSON.stringify(next, null, 2)}\n`;
    const encode = (content: string) => ({
      base64: Buffer.from(content).toString('base64'),
      sha256: hash(content),
    });
    await writeFile(journalPath, `${JSON.stringify({
      schema_version: 1,
      spec: { prior: encode(priorSpec), next: encode(nextSpec) },
      artifact: { prior: null, next: encode(requirements) },
    })}\n`, 'utf8');
    return { featureRoot, specPath, artifactPath, journalPath, priorSpec, nextSpec };
  }

  it('ignores non-feature directories during durable status discovery', async () => {
    await mkdir(path.join(projectRoot, '.spec/specs/.scratch'), { recursive: true });

    await expect(workflow.listFeatureStatuses({ projectRoot })).resolves.toEqual([
      expect.objectContaining({ featureName: 'payments', phase: WorkflowPhase.INIT }),
    ]);
  });

  it('persists failed drafts and binds approval to exact revision and bytes', async () => {
    const invalid = requirements.replace(' SHALL ', ' will ');
    const failed = await workflow.submitPhaseArtifact({ projectRoot, featureName: 'payments', phase: 'requirements', content: invalid, expectedRevision: 0, expectedArtifactSha256: null });
    expect(failed).toMatchObject({ revision: 1, validation: { status: 'failed' }, approvalRequired: false });
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'requirements', expectedRevision: 1, expectedArtifactSha256: failed.artifact.sha256 }))
      .rejects.toMatchObject({ code: 'PhaseValidationFailed' });

    const passed = await workflow.submitPhaseArtifact({ projectRoot, featureName: 'payments', phase: 'requirements', content: requirements, expectedRevision: 1, expectedArtifactSha256: failed.artifact.sha256 });
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'requirements', expectedRevision: 1, expectedArtifactSha256: passed.artifact.sha256 }))
      .rejects.toMatchObject({ code: 'RevisionConflict' });
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'requirements', expectedRevision: 2, expectedArtifactSha256: passed.artifact.sha256 }))
      .resolves.toMatchObject({ approved: true });
    const persisted = JSON.parse(await readFile(path.join(projectRoot, '.spec/specs/payments/spec.json'), 'utf8'));
    expect(persisted).toMatchObject({
      schema_version: 5,
      description: 'Govern checkout',
      phase: 'requirements',
      approvals: { requirements: { revision: 2, approved: true, artifact_sha256: passed.artifact.sha256 } },
    });
    expect(persisted.approvals.requirements.artifactSha256).toBeUndefined();
  });

  it('rejects oversized journal endpoints before writing a submission journal', async () => {
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const specPath = path.join(featureRoot, 'spec.json');
    const artifactPath = path.join(featureRoot, 'requirements.md');
    const journalPath = path.join(featureRoot, '.phase-submit.json');
    const priorSpec = await readFile(specPath, 'utf8');
    const oversized = 'x'.repeat(4 * 1024 * 1024 + 1);
    await writeFile(artifactPath, oversized, 'utf8');

    await expect(workflow.submitPhaseArtifact({
      projectRoot,
      featureName: 'payments',
      phase: 'requirements',
      content: requirements,
      expectedRevision: 0,
      expectedArtifactSha256: hash(oversized),
    })).rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(specPath, 'utf8')).toBe(priorSpec);
    expect(await readFile(artifactPath, 'utf8')).toBe(oversized);
    await expect(readFile(journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('restores the prior spec/artifact pair after a caught spec replacement failure', async () => {
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const specPath = path.join(featureRoot, 'spec.json');
    const artifactPath = path.join(featureRoot, 'requirements.md');
    const journalPath = path.join(featureRoot, '.phase-submit.json');
    const priorSpec = await readFile(specPath, 'utf8');
    const writeFileAtomic = fileSystem.writeFileAtomic.bind(fileSystem);
    let failSpecWrite = true;
    jest.spyOn(fileSystem, 'writeFileAtomic').mockImplementation(async (filePath, content) => {
      if (failSpecWrite && filePath === specPath && content.includes('"revision": 1')) {
        failSpecWrite = false;
        throw new Error('injected spec replacement failure');
      }
      await writeFileAtomic(filePath, content);
    });

    await expect(workflow.submitPhaseArtifact({
      projectRoot,
      featureName: 'payments',
      phase: 'requirements',
      content: requirements,
      expectedRevision: 0,
      expectedArtifactSha256: null,
    })).rejects.toThrow('injected spec replacement failure');
    expect(await readFile(specPath, 'utf8')).toBe(priorSpec);
    await expect(readFile(artifactPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('leaves a recoverable journal instead of rolling back after lease loss', async () => {
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const artifactPath = path.join(featureRoot, 'requirements.md');
    const journalPath = path.join(featureRoot, '.phase-submit.json');
    const lockPath = path.join(featureRoot, '.workflow.lock');
    const writeFileAtomic = fileSystem.writeFileAtomic.bind(fileSystem);
    let compromised = false;
    const replacement = jest.spyOn(fileSystem, 'writeFileAtomic').mockImplementation(async (filePath, content) => {
      await writeFileAtomic(filePath, content);
      if (!compromised && filePath === artifactPath) {
        compromised = true;
        await writeFile(lockPath, JSON.stringify({
          token: 'replacement',
          pid: process.pid,
          hostname: os.hostname(),
        }), 'utf8');
      }
    });

    await expect(workflow.submitPhaseArtifact({
      projectRoot,
      featureName: 'payments',
      phase: 'requirements',
      content: requirements,
      expectedRevision: 0,
      expectedArtifactSha256: null,
    })).rejects.toMatchObject({ code: 'LockCompromised' });
    replacement.mockRestore();
    expect(await readFile(artifactPath, 'utf8')).toBe(requirements);
    await expect(readFile(journalPath, 'utf8')).resolves.toContain('"schema_version":1');

    await rm(lockPath, { force: true });
    const recovered = await workflow.getFeatureStatus({ projectRoot, featureName: 'payments' });
    expect(recovered.nextAction).toEqual({ kind: 'submit-phase', phase: 'requirements' });
    await expect(readFile(artifactPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });


  it('reports and refuses approved artifact drift', async () => {
    await submitAndApproveRequirements();
    const artifactPath = path.join(projectRoot, '.spec/specs/payments/requirements.md');
    await writeFile(artifactPath, `${requirements}\nmanual edit`, 'utf8');
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: 'payments' });
    expect(status.nextAction).toEqual({ kind: 'blocked', code: 'ArtifactDrift', phase: 'requirements' });
    expect(status.phases.requirements.observedArtifactSha256).toBe(hash(`${requirements}\nmanual edit`));
    await rm(artifactPath);
    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .resolves.toMatchObject({
        nextAction: { kind: 'blocked', code: 'ArtifactDrift', phase: 'requirements' },
      });
    await expect(workflow.loadFeatureContext({
      projectRoot,
      featureName: 'payments',
      mode: 'compact',
    })).rejects.toMatchObject({ code: 'ArtifactDrift' });
  });

  it('rejects governed phase files that escape through symlinks', async () => {
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const outside = path.join(projectRoot, 'outside-requirements.md');
    const artifactPath = path.join(featureRoot, 'requirements.md');
    await writeFile(outside, requirements, 'utf8');
    await symlink(outside, artifactPath);

    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'SpecPathEscape' });
    expect(await readFile(outside, 'utf8')).toBe(requirements);
  });

  it('serializes concurrent submissions by revision', async () => {
    const first = workflow.submitPhaseArtifact({ projectRoot, featureName: 'payments', phase: 'requirements', content: requirements, expectedRevision: 0, expectedArtifactSha256: null });
    const second = createWorkflow().submitPhaseArtifact({ projectRoot, featureName: 'payments', phase: 'requirements', content: requirements.replace('Checkout', 'Checkout flow'), expectedRevision: 0, expectedArtifactSha256: null });
    const results = await Promise.allSettled([first, second]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(({ status }) => status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: 'RevisionConflict' });
  });

  it('serializes equal-revision submissions across child processes', async () => {
    const results = await Promise.all([
      submitRequirementsInChild(projectRoot, requirements),
      submitRequirementsInChild(projectRoot, requirements.replace('Checkout', 'Checkout flow')),
    ]);
    expect(results.filter(({ ok }) => ok)).toHaveLength(1);
    expect(results.filter(({ ok }) => !ok)).toEqual([
      expect.objectContaining({ code: 'RevisionConflict' }),
    ]);
    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .resolves.toMatchObject({ phases: { requirements: { revision: 1 } } });
    await expect(readFile(path.join(projectRoot, '.spec/specs/payments/.workflow.lock'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('binds task review and approval to the submitted tasks revision', async () => {
    await submitAndApproveDesign();
    const submitted = await workflow.submitPhaseArtifact({ projectRoot, featureName: 'payments', phase: 'tasks', content: tasks, expectedRevision: 0, expectedArtifactSha256: null, reviewTestCases: true });
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'tasks', expectedRevision: 1, expectedArtifactSha256: submitted.artifact.sha256 }))
      .rejects.toMatchObject({ code: 'PhaseNotApproved' });
    await expect(workflow.reviewTestCases({ projectRoot, featureName: 'payments', expectedTasksRevision: 0, expectedArtifactSha256: submitted.artifact.sha256 }))
      .rejects.toMatchObject({ code: 'RevisionConflict' });
    await workflow.reviewTestCases({ projectRoot, featureName: 'payments', expectedTasksRevision: 1, expectedArtifactSha256: submitted.artifact.sha256 });
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'tasks', expectedRevision: 1, expectedArtifactSha256: submitted.artifact.sha256 })).resolves.toMatchObject({ approved: true });
    await expect(workflow.reviewTestCases({
      projectRoot,
      featureName: 'payments',
      expectedTasksRevision: submitted.revision,
      expectedArtifactSha256: submitted.artifact.sha256,
    })).resolves.toMatchObject({
      reviewed: true,
      tasksRevision: submitted.revision,
      artifactSha256: submitted.artifact.sha256,
    });
    const specPath = path.join(projectRoot, '.spec/specs/payments/spec.json');
    const persisted = JSON.parse(await readFile(specPath, 'utf8'));
    persisted.approvals.tasks.validation.status = 'legacy-accepted';
    await writeFile(specPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
    await expect(workflow.reviewTestCases({
      projectRoot,
      featureName: 'payments',
      expectedTasksRevision: submitted.revision,
      expectedArtifactSha256: submitted.artifact.sha256,
    })).resolves.toMatchObject({ reviewed: true });
  });

  it('refuses to materialize approved tasks that fail the executable parser', async () => {
    await submitAndApproveDesign();
    const invalidTasks = tasks.replace('**TDD:** required', '**TDD:** optional');
    await workflow.submitPhaseArtifact({
      projectRoot,
      featureName: 'payments',
      phase: 'tasks',
      content: invalidTasks,
      expectedRevision: 0,
      expectedArtifactSha256: null,
      reviewTestCases: false,
    });
    const specPath = path.join(projectRoot, '.spec/specs/payments/spec.json');
    const persisted = JSON.parse(await readFile(specPath, 'utf8'));
    persisted.approvals.tasks.approved = true;
    persisted.approvals.tasks.validation = {
      status: 'passed',
      checked_at: '2026-07-24T00:00:00.000Z',
      blockers: [],
    };
    await writeFile(specPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');

    await expect(workflow.beginImplementation({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'PhaseValidationFailed' });
    expect(JSON.parse(await readFile(specPath, 'utf8')).implementation).toBeUndefined();
  });

  it('persists RED/GREEN/completion progress across service restart', async () => {
    await prepareImplementation();
    const requirementsPath = path.join(projectRoot, '.spec/specs/payments/requirements.md');
    await writeFile(requirementsPath, `${requirements}\nmanual drift`, 'utf8');
    await expect(workflow.recordTaskProgress({
      projectRoot,
      featureName: 'payments',
      taskNumber: '1.1',
      action: 'start',
      expectedRevision: 0,
    })).rejects.toMatchObject({ code: 'ArtifactDrift' });
    await writeFile(requirementsPath, requirements, 'utf8');
    const started = await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'start', expectedRevision: 0 });
    await expect(workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'record-green', expectedRevision: started.revision, evidence: { command: 'jest order', exitCode: 0, summary: 'passed too early' } }))
      .rejects.toMatchObject({ code: 'TaskTransitionInvalid' });
    await expect(workflow.recordTaskProgress({
      projectRoot,
      featureName: 'payments',
      taskNumber: '1.1',
      action: 'record-red',
      expectedRevision: 1,
      evidence: { command: '   ', exitCode: 1, summary: 'missing implementation' },
    })).rejects.toMatchObject({ code: 'InvalidParams' });
    const red = await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'record-red', expectedRevision: 1, evidence: { command: 'jest order', exitCode: 1, summary: 'missing implementation' } });
    const resumed = await createWorkflow().getFeatureStatus({ projectRoot, featureName: 'payments' });
    expect(resumed.nextAction).toEqual({ kind: 'continue-task', taskNumber: '1.1', taskState: 'red-observed' });
    const green = await createWorkflow().recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'record-green', expectedRevision: red.revision, evidence: { command: 'jest order', exitCode: 0, summary: 'passes' } });
    await expect(workflow.recordTaskProgress({
      projectRoot,
      featureName: 'payments',
      taskNumber: '1.1',
      action: 'complete',
      expectedRevision: green.revision,
      evidence: { command: 'jest order', exitCode: 0, summary: 'verified' },
      affectedArtifacts: ['C:\\outside.ts'],
    })).rejects.toMatchObject({ code: 'InvalidParams' });
    const completed = await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'complete', expectedRevision: green.revision, evidence: { command: 'jest order', exitCode: 0, summary: 'verified' }, affectedArtifacts: ['src/order.ts'] });
    expect(completed.nextAction).toEqual({ kind: 'select-task', candidates: [{ taskNumber: '1.2', taskState: 'pending' }] });
    await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.2', action: 'start', expectedRevision: completed.revision });
    const done = await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.2', action: 'complete', expectedRevision: completed.revision + 1, evidence: { command: 'npm run benchmark', exitCode: 0, summary: 'latency verified' }, affectedArtifacts: [] });
    expect(done.nextAction).toEqual({ kind: 'complete' });
    expect((await workflow.getFeatureStatus({ projectRoot, featureName: 'payments' })).phase).toBe(WorkflowPhase.IMPLEMENTATION_COMPLETED);
  });

  it('rejects incomplete persisted blocker state', async () => {
    await prepareImplementation();
    const specPath = path.join(projectRoot, '.spec/specs/payments/spec.json');
    const persisted = JSON.parse(await readFile(specPath, 'utf8'));
    persisted.implementation.tasks['1.1'].status = 'blocked';
    persisted.implementation.tasks['1.1'].blocked_from = 'pending';
    persisted.implementation.tasks['1.1'].blocker = '   ';
    await writeFile(specPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');

    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'StateInvariantViolation' });
  });

  it('rejects corrupt journals without changing spec bytes', async () => {
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const specPath = path.join(featureRoot, 'spec.json');
    const before = await readFile(specPath, 'utf8');
    await writeFile(path.join(featureRoot, '.phase-submit.json'), JSON.stringify({ schema_version: 1, spec: { prior: { base64: 'eA==', sha256: 'bad' } } }), 'utf8');
    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' })).rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(specPath, 'utf8')).toBe(before);
  });

  it('rejects a journal whose prior artifact endpoint disagrees with generated state', async () => {
    await workflow.submitPhaseArtifact({
      projectRoot,
      featureName: 'payments',
      phase: 'requirements',
      content: requirements,
      expectedRevision: 0,
      expectedArtifactSha256: null,
    });
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const specPath = path.join(featureRoot, 'spec.json');
    const artifactPath = path.join(featureRoot, 'requirements.md');
    const journalPath = path.join(featureRoot, '.phase-submit.json');
    const priorSpec = await readFile(specPath, 'utf8');
    const nextArtifact = requirements.replace('Checkout', 'Checkout flow');
    const next = JSON.parse(priorSpec);
    next.updated_at = '2026-07-24T00:00:00.000Z';
    next.approvals.requirements.revision = 2;
    next.approvals.requirements.artifact_sha256 = hash(nextArtifact);
    next.approvals.requirements.validation.checked_at = '2026-07-24T00:00:00.000Z';
    const nextSpec = `${JSON.stringify(next, null, 2)}\n`;
    const encode = (content: string) => ({
      base64: Buffer.from(content).toString('base64'),
      sha256: hash(content),
    });
    await writeFile(journalPath, `${JSON.stringify({
      schema_version: 1,
      spec: { prior: encode(priorSpec), next: encode(nextSpec) },
      artifact: { prior: null, next: encode(nextArtifact) },
    })}\n`, 'utf8');

    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(specPath, 'utf8')).toBe(priorSpec);
    expect(await readFile(artifactPath, 'utf8')).toBe(requirements);
  });

  it('rejects a journal that would bypass explicit phase approval', async () => {
    const staged = await stageRequirementsJournal();
    const journal = JSON.parse(await readFile(staged.journalPath, 'utf8'));
    const next = JSON.parse(staged.nextSpec);
    next.approvals.requirements.approved = true;
    const maliciousNextSpec = `${JSON.stringify(next, null, 2)}\n`;

    journal.spec.next = {
      base64: Buffer.from(maliciousNextSpec).toString('base64'),
      sha256: hash(maliciousNextSpec),
    };
    const maliciousJournal = `${JSON.stringify(journal)}\n`;
    await writeFile(staged.journalPath, maliciousJournal, 'utf8');

    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(staged.specPath, 'utf8')).toBe(staged.priorSpec);
    expect(await readFile(staged.journalPath, 'utf8')).toBe(maliciousJournal);
  });

  it('rejects a journal that mutates ancillary feature metadata', async () => {
    const staged = await stageRequirementsJournal();
    const journal = JSON.parse(await readFile(staged.journalPath, 'utf8'));
    const next = JSON.parse(staged.nextSpec);
    next.description = 'tampered description';
    const maliciousNextSpec = `${JSON.stringify(next, null, 2)}\n`;
    journal.spec.next = {
      base64: Buffer.from(maliciousNextSpec).toString('base64'),
      sha256: hash(maliciousNextSpec),
    };

    await writeFile(staged.journalPath, `${JSON.stringify(journal)}\n`, 'utf8');
    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(staged.specPath, 'utf8')).toBe(staged.priorSpec);
  });

  it('rejects a journal whose recorded validation cannot be reproduced', async () => {
    const staged = await stageRequirementsJournal();
    const journal = JSON.parse(await readFile(staged.journalPath, 'utf8'));
    const invalidArtifact = requirements.replace(' SHALL ', ' will ');
    const next = JSON.parse(staged.nextSpec);
    next.approvals.requirements.artifact_sha256 = hash(invalidArtifact);
    const maliciousNextSpec = `${JSON.stringify(next, null, 2)}\n`;
    const encode = (content: string) => ({
      base64: Buffer.from(content).toString('base64'),
      sha256: hash(content),
    });
    journal.spec.next = encode(maliciousNextSpec);
    journal.artifact.next = encode(invalidArtifact);
    await writeFile(staged.journalPath, `${JSON.stringify(journal)}\n`, 'utf8');

    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(staged.specPath, 'utf8')).toBe(staged.priorSpec);
    await expect(readFile(staged.artifactPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects oversized raw journals before parsing or writing', async () => {
    const staged = await stageRequirementsJournal();
    await truncate(staged.journalPath, 24 * 1024 * 1024 + 1);

    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(staged.specPath, 'utf8')).toBe(staged.priorSpec);
  });

  it('recovers an artifact-only phase submission back to the prior pair', async () => {
    const staged = await stageRequirementsJournal();
    await writeFile(staged.artifactPath, requirements, 'utf8');

    const status = await workflow.getFeatureStatus({ projectRoot, featureName: 'payments' });
    expect(status.nextAction).toEqual({ kind: 'submit-phase', phase: 'requirements' });
    expect(await readFile(staged.specPath, 'utf8')).toBe(staged.priorSpec);
    await expect(readFile(staged.artifactPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(staged.journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers a spec-committed phase submission forward to the next pair', async () => {
    const staged = await stageRequirementsJournal();
    await writeFile(staged.specPath, staged.nextSpec, 'utf8');

    const status = await workflow.getFeatureStatus({ projectRoot, featureName: 'payments' });
    expect(status.nextAction).toEqual({ kind: 'request-approval', phase: 'requirements' });
    expect(await readFile(staged.specPath, 'utf8')).toBe(staged.nextSpec);
    expect(await readFile(staged.artifactPath, 'utf8')).toBe(requirements);
    await expect(readFile(staged.journalPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a journal and unknown concurrent spec bytes without writes', async () => {
    const staged = await stageRequirementsJournal();
    const unknown = JSON.parse(staged.priorSpec);
    unknown.updated_at = '2026-07-24T01:00:00.000Z';
    const unknownSpec = `${JSON.stringify(unknown, null, 2)}\n`;
    await writeFile(staged.specPath, unknownSpec, 'utf8');
    await writeFile(staged.artifactPath, requirements, 'utf8');
    const journalBefore = await readFile(staged.journalPath, 'utf8');

    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(staged.specPath, 'utf8')).toBe(unknownSpec);
    expect(await readFile(staged.artifactPath, 'utf8')).toBe(requirements);
    expect(await readFile(staged.journalPath, 'utf8')).toBe(journalBefore);
  });


  it('rejects contradictory schema-v5 records instead of coercing them', async () => {
    const specPath = path.join(projectRoot, '.spec/specs/payments/spec.json');
    const persisted = JSON.parse(await readFile(specPath, 'utf8'));
    persisted.approvals.requirements.revision = 1;
    persisted.workflow_options.review_test_cases = 'false';
    await writeFile(specPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'StateInvariantViolation' });
  });

  it('rejects unapproved legacy-accepted validation in schema-v5 state', async () => {
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const specPath = path.join(featureRoot, 'spec.json');
    const persisted = JSON.parse(await readFile(specPath, 'utf8'));
    await writeFile(path.join(featureRoot, 'requirements.md'), requirements, 'utf8');
    persisted.phase = 'requirements';
    persisted.approvals.requirements = {
      generated: true,
      approved: false,
      revision: 1,
      artifact_sha256: hash(requirements),
      validation: { status: 'legacy-accepted', blockers: [] },
    };
    await writeFile(specPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');

    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' }))
      .rejects.toMatchObject({ code: 'StateInvariantViolation' });
  });

  it('surfaces and explicitly replaces a legacy orphan artifact', async () => {
    const legacyRoot = path.join(projectRoot, '.spec/specs/legacy-orphan');
    await mkdir(legacyRoot, { recursive: true });
    const orphan = '# manual requirements';
    await writeFile(path.join(legacyRoot, 'requirements.md'), orphan, 'utf8');
    await writeFile(path.join(legacyRoot, 'spec.json'), JSON.stringify({
      feature_name: 'legacy-orphan',
      phase: 'init',
      approvals: {},
    }), 'utf8');

    const status = await workflow.getFeatureStatus({ projectRoot, featureName: 'legacy-orphan' });
    expect(status.phases.requirements).toMatchObject({
      generated: false,
      observedArtifactSha256: hash(orphan),
    });
    const submitted = await workflow.submitPhaseArtifact({
      projectRoot,
      featureName: 'legacy-orphan',
      phase: 'requirements',
      content: requirements,
      expectedRevision: 0,
      expectedArtifactSha256: hash(orphan),
    });
    expect(submitted).toMatchObject({ revision: 1, validation: { status: 'passed' } });
  });

  it('imports only legacy leaf tasks and detects per-task TDD markers', async () => {
    const legacyRoot = path.join(projectRoot, '.spec/specs/legacy-leaves');
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(path.join(legacyRoot, 'requirements.md'), '# Legacy requirements', 'utf8');
    await writeFile(path.join(legacyRoot, 'design.md'), '# Legacy design', 'utf8');
    await writeFile(path.join(legacyRoot, 'tasks.md'), [
      '# Legacy tasks',
      '### 1 Checkout group',
      '  - [x] 1.1 Completed checkout setup',
      '    Existing implementation.',
      '  - [ ] 1.2 Measure checkout',
      '    Measurement only.',
      '  - [ ] 1.3 Implement checkout',
      '    RED: failing checkout test',
      '    GREEN: passing checkout test',
      '    REFACTOR: simplify checkout',
      '```md',
      '  - [ ] 9.9 Fenced example',
      '```',
    ].join('\n'), 'utf8');
    await writeFile(path.join(legacyRoot, 'spec.json'), JSON.stringify({
      feature_name: 'legacy-leaves',
      legacy_only: 'remove-me',
      phase: 'tasks-approved',
      approvals: {
        requirements: { generated: true, approved: true },
        design: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      },
      workflow_options: { review_test_cases: false },
    }), 'utf8');

    const initialized = await workflow.beginImplementation({
      projectRoot,
      featureName: 'legacy-leaves',
    });
    expect(initialized.tasks).toEqual({ completed: 1, total: 3, active: 0, blocked: 0 });
    expect(initialized.nextAction).toEqual({
      kind: 'select-task',
      candidates: [
        { taskNumber: '1.2', taskState: 'pending' },
        { taskNumber: '1.3', taskState: 'pending' },
      ],
    });
    const migrated = JSON.parse(await readFile(path.join(legacyRoot, 'spec.json'), 'utf8'));
    expect(migrated.legacy_only).toBeUndefined();
    expect(Object.keys(migrated).sort()).toEqual([
      'approvals',
      'checkpoints',
      'created_at',
      'description',
      'feature_name',
      'implementation',
      'language',
      'phase',
      'schema_version',
      'updated_at',
      'workflow_options',
    ]);
    await workflow.recordTaskProgress({
      projectRoot,
      featureName: 'legacy-leaves',
      taskNumber: '1.3',
      action: 'start',
      expectedRevision: 1,
    });
    await expect(workflow.recordTaskProgress({
      projectRoot,
      featureName: 'legacy-leaves',
      taskNumber: '1.3',
      action: 'record-green',
      expectedRevision: 2,
      evidence: { command: 'test checkout', exitCode: 0, summary: 'passes' },
    })).rejects.toMatchObject({ code: 'TaskTransitionInvalid' });
  });

  it('preserves a legacy checkpoint-required choice when workflow options are absent', async () => {
    const legacyRoot = path.join(projectRoot, '.spec/specs/legacy-review');
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(path.join(legacyRoot, 'requirements.md'), requirements, 'utf8');
    await writeFile(path.join(legacyRoot, 'design.md'), design, 'utf8');
    await writeFile(path.join(legacyRoot, 'tasks.md'), tasks, 'utf8');
    await writeFile(path.join(legacyRoot, 'spec.json'), JSON.stringify({
      feature_name: 'legacy-review',
      phase: 'tasks-generated',
      approvals: {
        requirements: { generated: true, approved: true },
        design: { generated: true, approved: true },
        tasks: { generated: true, approved: false },
      },
      checkpoints: { test_cases: { required: true, reviewed: false } },
    }), 'utf8');

    const status = await workflow.getFeatureStatus({
      projectRoot,
      featureName: 'legacy-review',
    });
    expect(status.checkpoint).toMatchObject({ required: true, reviewed: false });
    expect(status.nextAction).toEqual({ kind: 'review-test-cases', phase: 'tasks' });
  });

  it('rejects legacy metadata that cannot form a readable schema-v5 record', async () => {
    const legacyRoot = path.join(projectRoot, '.spec/specs/legacy-language');
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(path.join(legacyRoot, 'spec.json'), JSON.stringify({
      feature_name: 'legacy-language',
      phase: 'init',
      language: 'unsupported',
      approvals: {
        requirements: { generated: false, approved: false },
        design: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      },
    }), 'utf8');

    await expect(workflow.getFeatureStatus({
      projectRoot,
      featureName: 'legacy-language',
    })).rejects.toMatchObject({ code: 'LegacyStateConflict' });
  });

  it('normalizes an approved legacy feature on first mutation', async () => {
    const legacyRoot = path.join(projectRoot, '.spec/specs/legacy');
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(path.join(legacyRoot, 'requirements.md'), '# Legacy requirements', 'utf8');
    await writeFile(path.join(legacyRoot, 'spec.json'), JSON.stringify({
      feature_name: 'legacy',
      phase: 'requirements-approved',
      ready_for_implementation: false,
      implementation_completed: false,
      approvals: {
        requirements: { generated: true, approved: true },
        design: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      },
    }), 'utf8');
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: 'legacy' });
    expect(status.phases.requirements.validation.status).toBe('legacy-accepted');
    const submitted = await workflow.submitPhaseArtifact({ projectRoot, featureName: 'legacy', phase: 'design', content: design.replaceAll('NFR-1', 'FR-1'), expectedRevision: 0, expectedArtifactSha256: null });
    expect(submitted.revision).toBe(1);
    const persisted = JSON.parse(await readFile(path.join(legacyRoot, 'spec.json'), 'utf8'));
    expect(persisted.schema_version).toBe(5);
    expect(persisted.ready_for_implementation).toBeUndefined();
    expect(persisted.implementation_completed).toBeUndefined();
  });
});
