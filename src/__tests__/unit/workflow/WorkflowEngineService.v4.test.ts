import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

describe('WorkflowEngineService schema-v5 governance', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;
  let workflow: WorkflowEngineService;

  function createWorkflow(): WorkflowEngineService {
    return new WorkflowEngineService(
      repository(), undefined!, undefined!,
      new ContextCompactionService(fileSystem, logger), logger, fileSystem,
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

  it('reports and refuses approved artifact drift', async () => {
    await submitAndApproveRequirements();
    const artifactPath = path.join(projectRoot, '.spec/specs/payments/requirements.md');
    await writeFile(artifactPath, `${requirements}\nmanual edit`, 'utf8');
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: 'payments' });
    expect(status.nextAction).toEqual({ kind: 'blocked', code: 'ArtifactDrift', phase: 'requirements' });
    expect(status.phases.requirements.observedArtifactSha256).toBe(hash(`${requirements}\nmanual edit`));
  });

  it('serializes concurrent submissions by revision', async () => {
    const first = workflow.submitPhaseArtifact({ projectRoot, featureName: 'payments', phase: 'requirements', content: requirements, expectedRevision: 0, expectedArtifactSha256: null });
    const second = createWorkflow().submitPhaseArtifact({ projectRoot, featureName: 'payments', phase: 'requirements', content: requirements.replace('Checkout', 'Checkout flow'), expectedRevision: 0, expectedArtifactSha256: null });
    const results = await Promise.allSettled([first, second]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(({ status }) => status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: 'RevisionConflict' });
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
  });

  it('persists RED/GREEN/completion progress across service restart', async () => {
    await prepareImplementation();
    const started = await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'start', expectedRevision: 0 });
    await expect(workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'record-green', expectedRevision: started.revision, evidence: { command: 'jest order', exitCode: 0, summary: 'passed too early' } }))
      .rejects.toMatchObject({ code: 'TaskTransitionInvalid' });
    const red = await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'record-red', expectedRevision: 1, evidence: { command: 'jest order', exitCode: 1, summary: 'missing implementation' } });
    const resumed = await createWorkflow().getFeatureStatus({ projectRoot, featureName: 'payments' });
    expect(resumed.nextAction).toEqual({ kind: 'continue-task', taskNumber: '1.1', taskState: 'red-observed' });
    const green = await createWorkflow().recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'record-green', expectedRevision: red.revision, evidence: { command: 'jest order', exitCode: 0, summary: 'passes' } });
    const completed = await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.1', action: 'complete', expectedRevision: green.revision, evidence: { command: 'jest order', exitCode: 0, summary: 'verified' }, affectedArtifacts: ['src/order.ts'] });
    expect(completed.nextAction).toEqual({ kind: 'select-task', candidates: [{ taskNumber: '1.2', taskState: 'pending' }] });
    await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.2', action: 'start', expectedRevision: completed.revision });
    const done = await workflow.recordTaskProgress({ projectRoot, featureName: 'payments', taskNumber: '1.2', action: 'complete', expectedRevision: completed.revision + 1, evidence: { command: 'npm run benchmark', exitCode: 0, summary: 'latency verified' }, affectedArtifacts: [] });
    expect(done.nextAction).toEqual({ kind: 'complete' });
    expect((await workflow.getFeatureStatus({ projectRoot, featureName: 'payments' })).phase).toBe(WorkflowPhase.IMPLEMENTATION_COMPLETED);
  });

  it('rejects corrupt journals without changing spec bytes', async () => {
    const featureRoot = path.join(projectRoot, '.spec/specs/payments');
    const specPath = path.join(featureRoot, 'spec.json');
    const before = await readFile(specPath, 'utf8');
    await writeFile(path.join(featureRoot, '.phase-submit.json'), JSON.stringify({ schema_version: 1, spec: { prior: { base64: 'eA==', sha256: 'bad' } } }), 'utf8');
    await expect(workflow.getFeatureStatus({ projectRoot, featureName: 'payments' })).rejects.toMatchObject({ code: 'RecoveryConflict' });
    expect(await readFile(specPath, 'utf8')).toBe(before);
  });

  it('normalizes an approved legacy feature on first mutation', async () => {
    const legacyRoot = path.join(projectRoot, '.spec/specs/legacy');
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(path.join(legacyRoot, 'requirements.md'), '# Legacy requirements', 'utf8');
    await writeFile(path.join(legacyRoot, 'spec.json'), JSON.stringify({ feature_name: 'legacy', phase: 'requirements-approved', approvals: { requirements: { generated: true, approved: true }, design: { generated: false, approved: false }, tasks: { generated: false, approved: false } } }), 'utf8');
    const status = await workflow.getFeatureStatus({ projectRoot, featureName: 'legacy' });
    expect(status.phases.requirements.validation.status).toBe('legacy-accepted');
    const submitted = await workflow.submitPhaseArtifact({ projectRoot, featureName: 'legacy', phase: 'design', content: design.replaceAll('NFR-1', 'FR-1'), expectedRevision: 0, expectedArtifactSha256: null });
    expect(submitted.revision).toBe(1);
    expect(JSON.parse(await readFile(path.join(legacyRoot, 'spec.json'), 'utf8')).schema_version).toBe(5);
  });
});
