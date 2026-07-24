import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../infrastructure/di/types.js';
import {
  ExecutionEvidence, ImplementationState, ImplementationTaskState, PhaseRecord, Project,
  TaskStatus, WorkflowPhase,
} from '../../domain/types.js';
import { ProjectRepository, LoggerPort, FileSystemPort } from '../../domain/ports.js';
import { ProjectService } from './ProjectService.js';
import { TemplateService } from './TemplateService.js';
import { ContextCompactionService, ApprovablePhase } from './ContextCompactionService.js';
import { SpecPathResolver, validateFeatureName } from './SpecPathResolver.js';
import { WorkflowValidationService, type DesignValidationResult } from './WorkflowValidationService.js';
import { GovernanceError } from './WorkflowErrors.js';
import { withFilesystemLock } from '../../utils/withFilesystemLock.js';

const PHASES: ApprovablePhase[] = ['requirements', 'design', 'tasks'];
const JOURNAL_LIMIT = 4 * 1024 * 1024;

export type NextAction =
  | { kind: 'submit-phase' | 'revise-phase' | 'request-approval'; phase: ApprovablePhase }
  | { kind: 'review-test-cases'; phase: 'tasks' }
  | { kind: 'start-implementation' }
  | { kind: 'continue-task'; taskNumber: string; taskState: TaskStatus }
  | { kind: 'select-task'; candidates: Array<{ taskNumber: string; taskState: TaskStatus }> }
  | { kind: 'blocked'; code: 'ArtifactDrift'; phase: ApprovablePhase }
  | { kind: 'complete' };

export interface ApprovalRequest {
  readonly projectRoot: string; readonly featureName: string; readonly phase: ApprovablePhase;
  readonly expectedRevision: number; readonly expectedArtifactSha256: string;
}
export interface ReviewTestCasesRequest {
  readonly projectRoot: string; readonly featureName: string;
  readonly expectedTasksRevision: number; readonly expectedArtifactSha256: string;
}
export interface RollbackRequest { readonly projectRoot: string; readonly featureName: string; readonly triggeredBy: string }
export interface HandoffPublication {
  readonly status: 'published' | 'pending-regeneration'; readonly path?: string; readonly fingerprint?: string;
  readonly payloadEstimatedTokens?: number; readonly warning?: { readonly code: 'HandoffPublicationFailed'; readonly message: string };
}
export interface ApprovalResult {
  readonly featureName: string; readonly phase: ApprovablePhase; readonly approved: true;
  readonly canProgressToNext: boolean; readonly handoff: HandoffPublication;
}
export interface ReviewTestCasesResult {
  readonly featureName: string; readonly reviewed: true; readonly tasksRevision: number;
  readonly artifactSha256: string; readonly canApproveTasks: true; readonly handoff: HandoffPublication;
}
export interface FeatureRequest { readonly projectRoot: string; readonly featureName: string }
export interface InitializeFeatureRequest extends FeatureRequest {
  readonly description: string; readonly language?: 'en' | 'ja' | 'zh-TW';
}
export interface SubmitPhaseArtifactRequest extends FeatureRequest {
  readonly phase: ApprovablePhase; readonly content: string; readonly expectedRevision: number;
  readonly expectedArtifactSha256: string | null; readonly reviewTestCases?: boolean;
}
export interface PhaseSubmissionResult {
  readonly featureName: string; readonly phase: ApprovablePhase; readonly revision: number;
  readonly artifact: { readonly path: string; readonly sha256: string };
  readonly validation: { readonly status: 'passed' | 'failed'; readonly blockers: readonly { code: string; message: string; reference?: string }[] };
  readonly approvalRequired: boolean;
}
export interface DurableFeatureStatus {
  readonly featureName: string; readonly phase: WorkflowPhase; readonly currentPhase: WorkflowPhase;
  readonly nextAction: NextAction; readonly blockers: readonly string[];
  readonly phases: Record<ApprovablePhase, PhaseRecord & { observedArtifactSha256?: string }>;
  readonly checkpoint: { required: boolean; reviewed: boolean; reviewedRevision?: number; reviewedArtifactSha256?: string };
  readonly implementation?: { revision: number; completed: number; total: number; active: number; blocked: number };
}
export interface RecordTaskProgressRequest extends FeatureRequest {
  readonly taskNumber: string; readonly action: 'start' | 'record-red' | 'record-green' | 'complete' | 'block';
  readonly expectedRevision: number; readonly evidence?: { command: string; exitCode: number; summary: string };
  readonly affectedArtifacts?: string[]; readonly blocker?: string;
}
interface WorkflowSpecV5 extends Record<string, unknown> {
  schema_version: 5; feature_name: string; description: string; language: string; phase: WorkflowPhase;
  approvals: Record<ApprovablePhase, PhaseRecord>;
  workflow_options: { review_test_cases: boolean | null };
  checkpoints: { test_cases: { required: boolean; reviewed: boolean; reviewed_at?: string; reviewed_revision?: number; reviewed_artifact_sha256?: string } };
  implementation?: {
    revision: number; tasks_revision: number; legacy_imported: boolean;
    tasks: Record<string, {
      title: string; tdd_required: boolean; dependencies: string[]; status: TaskStatus; blocker?: string;
      blocked_from?: 'in-progress' | 'red-observed' | 'green-observed'; evidence: { red?: ExecutionEvidence; green?: ExecutionEvidence; verification?: ExecutionEvidence };
      planned_artifacts: string[]; observed_artifacts: string[];
    }>;
  };
}
interface JournalBytes { base64: string; sha256: string }
interface SubmissionJournal { schema_version: 1; spec: { prior: JournalBytes; next: JournalBytes }; artifact: { prior: JournalBytes | null; next: JournalBytes } }

@injectable()
export class WorkflowEngineService {
  private readonly validator = new WorkflowValidationService();

  constructor(
    @inject(TYPES.ProjectRepository) private readonly projectRepository: ProjectRepository,
    @inject(TYPES.ProjectService) private readonly projectService: ProjectService,
    @inject(TYPES.TemplateService) private readonly templateService: TemplateService,
    @inject(TYPES.ContextCompactionService) private readonly contextCompactionService: ContextCompactionService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.FileSystemPort) private readonly fileSystem?: FileSystemPort,
  ) {}

  async initializeFeature(request: InitializeFeatureRequest): Promise<Project> {
    validateFeatureName(request.featureName);
    if (!request.description || request.description.length > 20_000) throw new GovernanceError('InvalidParams', 'description must contain 1-20000 characters');
    if (!this.fileSystem) throw new GovernanceError('StateInvariantViolation', 'FileSystemPort is required');
    await this.fileSystem.mkdir(path.join(path.resolve(request.projectRoot), '.spec', 'specs'));
    const resolver = new SpecPathResolver(this.fileSystem);
    const resolved = await resolver.resolve(request.projectRoot, request.featureName);
    if (await this.fileSystem.exists(resolved.featureRoot)) throw new GovernanceError('StateInvariantViolation', `Feature already exists: ${request.featureName}`);
    await this.fileSystem.mkdir(resolved.featureRoot);
    const now = new Date().toISOString();
    const empty = (): PhaseRecord => ({ generated: false, approved: false, revision: 0, validation: { status: 'not-run', blockers: [] } });
    const spec: WorkflowSpecV5 = {
      schema_version: 5, feature_name: request.featureName, description: request.description,
      language: request.language ?? 'en', phase: WorkflowPhase.INIT, created_at: now, updated_at: now,
      approvals: { requirements: empty(), design: empty(), tasks: empty() },
      workflow_options: { review_test_cases: null },
      checkpoints: { test_cases: { required: false, reviewed: false } },
    };
    await this.writeSpecAtomic(path.join(resolved.featureRoot, 'spec.json'), spec);
    return this.hydrateProject(resolved.projectRoot, request.featureName, spec);
  }

  async submitPhaseArtifact(request: SubmitPhaseArtifactRequest): Promise<PhaseSubmissionResult> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, specPath, spec, assertHeld }) => {
      const record = spec.approvals[request.phase];
      this.assertPriorApproved(request.phase, spec.approvals);
      if (record.approved) throw new GovernanceError('PhaseNotApproved', `${request.phase} is already approved`);
      if (record.revision !== request.expectedRevision) throw new GovernanceError('RevisionConflict', `Expected revision ${request.expectedRevision}, found ${record.revision}`);
      const artifactPath = path.join(featureRoot, `${request.phase}.md`);
      const priorArtifact = await this.readOptional(artifactPath);
      const observedHash = priorArtifact === null ? null : sha256(priorArtifact);
      if (observedHash !== request.expectedArtifactSha256) {
        throw new GovernanceError('ArtifactDrift', `${request.phase}.md changed since it was observed`, { observedArtifactSha256: observedHash });
      }
      if (request.phase === 'tasks') {
        if (typeof request.reviewTestCases !== 'boolean') throw new GovernanceError('InvalidParams', 'reviewTestCases is required for tasks');
        const persisted = spec.workflow_options.review_test_cases;
        if (persisted !== null && persisted !== request.reviewTestCases) throw new GovernanceError('StateInvariantViolation', 'reviewTestCases cannot be changed for this feature');
      }
      const upstream = await this.readUpstream(featureRoot, request.phase);
      const validation = this.validate(request.phase, request.content, upstream.requirements, upstream.design);
      const artifactSha256 = sha256(request.content);
      const nextSpec: WorkflowSpecV5 = structuredClone(spec);
      nextSpec.phase = this.phaseValue(request.phase);
      nextSpec.updated_at = new Date().toISOString();
      nextSpec.approvals[request.phase] = {
        generated: true, approved: false, revision: record.revision + 1, artifactSha256,
        validation: { status: validation.status, checkedAt: new Date().toISOString(), blockers: validation.blockers },
      };
      for (const later of PHASES.slice(PHASES.indexOf(request.phase) + 1)) {
        if (nextSpec.approvals[later].generated) throw new GovernanceError('StateInvariantViolation', `Cannot revise ${request.phase} after ${later} was generated`);
      }
      if (request.phase === 'tasks') {
        nextSpec.workflow_options.review_test_cases = request.reviewTestCases!;
        nextSpec.checkpoints.test_cases = { required: request.reviewTestCases!, reviewed: false };
      }
      await this.commitPhaseSubmission(specPath, artifactPath, spec, nextSpec, priorArtifact, request.content, assertHeld);
      return {
        featureName: request.featureName, phase: request.phase, revision: record.revision + 1,
        artifact: { path: path.relative(request.projectRoot, artifactPath), sha256: artifactSha256 },
        validation, approvalRequired: validation.status === 'passed',
      };
    });
  }

  async approve(request: ApprovalRequest): Promise<ApprovalResult> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, specPath, spec }) => {
      const record = spec.approvals[request.phase];
      if (!record.generated) throw new GovernanceError('PhaseNotApproved', `${request.phase} has not been submitted`);
      if (record.revision !== request.expectedRevision) throw new GovernanceError('RevisionConflict', 'The reviewed revision is stale');
      if (record.artifactSha256 !== request.expectedArtifactSha256) throw new GovernanceError('ArtifactDrift', 'The reviewed artifact hash is stale');
      const artifact = await this.requireArtifact(featureRoot, request.phase);
      if (sha256(artifact) !== record.artifactSha256) throw new GovernanceError('ArtifactDrift', `${request.phase}.md differs from the submitted artifact`);
      this.assertPriorApproved(request.phase, spec.approvals);
      if (record.validation.status !== 'passed' && record.validation.status !== 'legacy-accepted') throw new GovernanceError('PhaseValidationFailed', `${request.phase} did not pass validation`, { blockers: record.validation.blockers });
      if (record.validation.status === 'passed') {
        const upstream = await this.readUpstream(featureRoot, request.phase);
        const validation = this.validate(request.phase, artifact, upstream.requirements, upstream.design);
        if (validation.status !== 'passed') throw new GovernanceError('PhaseValidationFailed', `${request.phase} no longer validates`, { blockers: validation.blockers });
      }
      const checkpoint = spec.checkpoints.test_cases;
      if (request.phase === 'tasks' && spec.workflow_options.review_test_cases === true &&
          (!checkpoint.reviewed || checkpoint.reviewed_revision !== record.revision || checkpoint.reviewed_artifact_sha256 !== record.artifactSha256)) {
        throw new GovernanceError('PhaseNotApproved', 'The current tasks revision requires explicit test-case review');
      }
      if (!record.approved) {
        spec.approvals[request.phase] = { ...record, approved: true };
        spec.phase = this.phaseValue(request.phase);
        spec.updated_at = new Date().toISOString();
        await this.writeSpecAtomic(specPath, spec);
      }
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return { featureName: request.featureName, phase: request.phase, approved: true, canProgressToNext: true, handoff };
    });
  }

  async reviewTestCases(request: ReviewTestCasesRequest): Promise<ReviewTestCasesResult> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, specPath, spec }) => {
      const tasks = spec.approvals.tasks;
      if (spec.workflow_options.review_test_cases !== true) throw new GovernanceError('StateInvariantViolation', 'Test-case review is not required');
      if (!spec.approvals.design.approved || !tasks.generated || tasks.approved || tasks.validation.status !== 'passed') throw new GovernanceError('PhaseNotApproved', 'Tasks are not ready for test-case review');
      if (tasks.revision !== request.expectedTasksRevision) throw new GovernanceError('RevisionConflict', 'The tasks review revision is stale');
      if (tasks.artifactSha256 !== request.expectedArtifactSha256 || sha256(await this.requireArtifact(featureRoot, 'tasks')) !== request.expectedArtifactSha256) throw new GovernanceError('ArtifactDrift', 'The tasks artifact changed before review');
      const checkpoint = spec.checkpoints.test_cases;
      if (!(checkpoint.reviewed && checkpoint.reviewed_revision === tasks.revision && checkpoint.reviewed_artifact_sha256 === tasks.artifactSha256)) {
        spec.checkpoints.test_cases = { required: true, reviewed: true, reviewed_at: new Date().toISOString(), reviewed_revision: tasks.revision, reviewed_artifact_sha256: tasks.artifactSha256 };
        spec.updated_at = new Date().toISOString();
        await this.writeSpecAtomic(specPath, spec);
      }
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return { featureName: request.featureName, reviewed: true, tasksRevision: tasks.revision, artifactSha256: tasks.artifactSha256!, canApproveTasks: true, handoff };
    });
  }

  async beginImplementation(request: FeatureRequest): Promise<{
    featureName: string; phase: WorkflowPhase.IMPLEMENTATION | WorkflowPhase.IMPLEMENTATION_COMPLETED; ready: true;
    revision: number; tasks: { completed: number; total: number; active: number; blocked: number }; nextAction: NextAction; handoff: HandoffPublication;
  }> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, specPath, spec }) => {
      const tasksRecord = spec.approvals.tasks;
      if (!tasksRecord.approved) throw new GovernanceError('PhaseNotApproved', 'Tasks are not approved');
      if (sha256(await this.requireArtifact(featureRoot, 'tasks')) !== tasksRecord.artifactSha256) throw new GovernanceError('ArtifactDrift', 'Approved tasks artifact has drifted');
      if (spec.workflow_options.review_test_cases === true) {
        const cp = spec.checkpoints.test_cases;
        if (!cp.reviewed || cp.reviewed_revision !== tasksRecord.revision || cp.reviewed_artifact_sha256 !== tasksRecord.artifactSha256) throw new GovernanceError('PhaseNotApproved', 'Tasks review checkpoint is stale');
      }
      if (!spec.implementation) {
        const content = await this.requireArtifact(featureRoot, 'tasks');
        const parsed = tasksRecord.validation.status === 'legacy-accepted'
          ? this.parseLegacyTasks(content)
          : Object.entries(this.validator.parseTasks(content).tasks).map(([id, task]) => ({ id, ...task }));
        if (parsed.length === 0) throw new GovernanceError('LegacyTaskConflict', 'Tasks artifact contains no executable leaf tasks');
        const taskStates: WorkflowSpecV5['implementation']['tasks'] = {};
        for (const task of parsed) {
          taskStates[task.id] = {
            title: task.title, tdd_required: task.tddRequired, dependencies: [...task.dependencies],
            status: 'pending', evidence: {}, planned_artifacts: [...task.plannedArtifacts], observed_artifacts: [],
          };
        }
        spec.implementation = { revision: tasksRecord.validation.status === 'legacy-accepted' ? 1 : 0, tasks_revision: tasksRecord.revision, legacy_imported: tasksRecord.validation.status === 'legacy-accepted', tasks: taskStates };
        spec.phase = this.allComplete(spec.implementation) ? WorkflowPhase.IMPLEMENTATION_COMPLETED : WorkflowPhase.IMPLEMENTATION;
        spec.updated_at = new Date().toISOString();
        await this.writeSpecAtomic(specPath, spec);
      }
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      const counts = this.implementationCounts(spec.implementation!);
      return { featureName: request.featureName, phase: spec.phase as WorkflowPhase.IMPLEMENTATION | WorkflowPhase.IMPLEMENTATION_COMPLETED, ready: true, revision: spec.implementation!.revision, tasks: counts, nextAction: this.resolveNextAction(spec), handoff };
    });
  }

  async recordTaskProgress(request: RecordTaskProgressRequest): Promise<{ featureName: string; taskNumber: string; taskState: TaskStatus; revision: number; nextAction: NextAction; handoff: HandoffPublication }> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ specPath, spec }) => {
      const implementation = spec.implementation;
      if (!implementation) throw new GovernanceError('TaskTransitionInvalid', 'Implementation has not started');
      if (implementation.revision !== request.expectedRevision) throw new GovernanceError('RevisionConflict', 'Implementation revision is stale');
      const task = implementation.tasks[request.taskNumber];
      if (!task) throw new GovernanceError('TaskTransitionInvalid', `Unknown task ${request.taskNumber}`);
      const incomplete = task.dependencies.filter((dependency) => implementation.tasks[dependency]?.status !== 'completed');
      if (request.action === 'start' && incomplete.length > 0) throw new GovernanceError('TaskDependencyIncomplete', 'Task dependencies are incomplete', { dependencies: incomplete });
      const prior = task.status;
      if (request.action === 'start') {
        if (prior === 'pending') task.status = 'in-progress';
        else if (prior === 'blocked' && task.blocked_from) { task.status = task.blocked_from; delete task.blocker; delete task.blocked_from; }
        else this.invalidTransition(request.action, prior);
      } else if (request.action === 'record-red') {
        if (!task.tdd_required || prior !== 'in-progress' || !request.evidence || request.evidence.exitCode === 0) this.invalidTransition(request.action, prior);
        task.status = 'red-observed'; task.evidence.red = this.evidence(request.evidence!);
      } else if (request.action === 'record-green') {
        if (!task.tdd_required || prior !== 'red-observed' || !request.evidence || request.evidence.exitCode !== 0) this.invalidTransition(request.action, prior);
        task.status = 'green-observed'; task.evidence.green = this.evidence(request.evidence!);
      } else if (request.action === 'complete') {
        const expected = task.tdd_required ? 'green-observed' : 'in-progress';
        if (prior !== expected || !request.evidence || request.evidence.exitCode !== 0) this.invalidTransition(request.action, prior);
        const artifacts = this.normalizeArtifacts(request.affectedArtifacts ?? []);
        if (task.planned_artifacts.length > 0 && artifacts.length === 0) throw new GovernanceError('TaskTransitionInvalid', 'At least one observed artifact is required');
        task.status = 'completed'; task.evidence.verification = this.evidence(request.evidence!); task.observed_artifacts = artifacts;
      } else {
        if (!['in-progress', 'red-observed', 'green-observed'].includes(prior) || !request.blocker?.trim()) this.invalidTransition(request.action, prior);
        task.status = 'blocked'; task.blocked_from = prior as 'in-progress' | 'red-observed' | 'green-observed'; task.blocker = request.blocker.trim();
      }
      implementation.revision += 1;
      spec.phase = this.allComplete(implementation) ? WorkflowPhase.IMPLEMENTATION_COMPLETED : WorkflowPhase.IMPLEMENTATION;
      spec.updated_at = new Date().toISOString();
      await this.writeSpecAtomic(specPath, spec);
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return { featureName: request.featureName, taskNumber: request.taskNumber, taskState: task.status, revision: implementation.revision, nextAction: this.resolveNextAction(spec), handoff };
    });
  }

  async getFeatureStatus(request: FeatureRequest): Promise<DurableFeatureStatus> {
    return this.withLockedFeature(request.projectRoot, request.featureName, false, async ({ featureRoot, spec }) => this.buildStatus(request.featureName, featureRoot, spec));
  }

  async listFeatureStatuses(request: { projectRoot: string }): Promise<DurableFeatureStatus[]> {
    if (!this.fileSystem) throw new GovernanceError('StateInvariantViolation', 'FileSystemPort is required');
    const root = path.join(path.resolve(request.projectRoot), '.spec', 'specs');
    if (!(await this.fileSystem.exists(root))) return [];
    const statuses: DurableFeatureStatus[] = [];
    for (const name of (await this.fileSystem.readdir(root)).sort()) {
      const candidate = path.join(root, name);
      if ((await this.fileSystem.stat(candidate)).isDirectory()) statuses.push(await this.getFeatureStatus({ projectRoot: request.projectRoot, featureName: name }));
    }
    return statuses;
  }

  async loadProject(request: FeatureRequest): Promise<Project> {
    return this.withLockedFeature(request.projectRoot, request.featureName, false, async ({ projectRoot, spec }) => this.hydrateProject(projectRoot, request.featureName, spec));
  }

  async rollback(request: RollbackRequest): Promise<{ featureName: string; rolledBackPhase: ApprovablePhase; handoff: HandoffPublication }> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ specPath, spec }) => {
      const phase = [...PHASES].reverse().find((candidate) => spec.approvals[candidate].approved);
      if (!phase) throw new GovernanceError('PhaseNotApproved', 'Feature has no approved phase to roll back');

      spec.approvals[phase] = { ...spec.approvals[phase], approved: false };
      delete spec.implementation; spec.phase = this.phaseValue(phase); spec.rollback_triggered_by = request.triggeredBy;
      await this.writeSpecAtomic(specPath, spec);
      await this.contextCompactionService.invalidateCanonicalHandoff(request);
      return { featureName: request.featureName, rolledBackPhase: phase, handoff: await this.publishHandoff(request.projectRoot, request.featureName) };
    });
  }

  async validateDesignArtifact(request: FeatureRequest): Promise<DesignValidationResult> {
    return this.withLockedFeature(request.projectRoot, request.featureName, false, async ({ featureRoot }) => {
      const requirements = await this.requireArtifact(featureRoot, 'requirements');
      const design = await this.requireArtifact(featureRoot, 'design');
      return this.validator.validateDesign(design, requirements);
    });
  }

  private async withLockedFeature<T>(projectRoot: string, featureName: string, mutate: boolean, action: (value: { projectRoot: string; featureRoot: string; specPath: string; spec: WorkflowSpecV5; assertHeld(): Promise<void> }) => Promise<T>): Promise<T> {
    if (!this.fileSystem) throw new GovernanceError('StateInvariantViolation', 'FileSystemPort is required');
    const resolved = await new SpecPathResolver(this.fileSystem).resolve(projectRoot, featureName);
    return withFilesystemLock(path.join(resolved.featureRoot, '.workflow.lock'), async (lease) => {
      await this.recoverSubmission(resolved.featureRoot, lease.assertHeld);
      const specPath = path.join(resolved.featureRoot, 'spec.json');
      const raw = await this.readRequired(specPath, `Feature metadata not found: ${featureName}`);
      let spec = this.normalizeSpec(JSON.parse(raw) as Record<string, unknown>, resolved.featureRoot);
      if (mutate && (JSON.parse(raw) as Record<string, unknown>).schema_version !== 5) {
        await this.writeSpecAtomic(specPath, spec);
      }
      return action({ projectRoot: resolved.projectRoot, featureRoot: resolved.featureRoot, specPath, spec, assertHeld: lease.assertHeld });
    });
  }

  private normalizeSpec(raw: Record<string, unknown>, featureRoot: string): WorkflowSpecV5 {
    if (raw.schema_version === 5) return this.normalizeV5(raw);
    const accepted = new Set(['init', 'requirements-generated', 'requirements-approved', 'design-generated', 'design-approved', 'tasks-generated', 'tasks-approved', 'implementation-ready', 'implementation', 'completed', 'implementation-completed']);
    const legacyPhase = typeof raw.phase === 'string' ? raw.phase : 'init';
    if (!accepted.has(legacyPhase)) throw new GovernanceError('LegacyStateConflict', `Unknown legacy phase: ${legacyPhase}`);
    const legacyApprovals = raw.approvals && typeof raw.approvals === 'object' ? raw.approvals as Record<string, unknown> : {};
    const approvals = {} as Record<ApprovablePhase, PhaseRecord>;
    for (const phase of PHASES) {
      const value = legacyApprovals[phase] && typeof legacyApprovals[phase] === 'object' ? legacyApprovals[phase] as Record<string, unknown> : {};
      const generated = value.generated === true;
      const approved = value.approved === true;
      if (approved && !generated) throw new GovernanceError('LegacyStateConflict', `${phase} is approved but not generated`);
      const artifact = this.readOptionalSync(path.join(featureRoot, `${phase}.md`));
      if (generated && artifact === null) throw new GovernanceError('LegacyStateConflict', `Generated ${phase} artifact is missing`);
      approvals[phase] = {
        generated,
        approved,
        revision: generated ? 1 : 0,
        artifactSha256: artifact === null ? undefined : sha256(artifact),
        validation: { status: approved ? 'legacy-accepted' : 'not-run', blockers: [] },
      };
    }
    for (const phase of PHASES) {
      if (!approvals[phase].generated || approvals[phase].approved) continue;
      const content = this.readOptionalSync(path.join(featureRoot, `${phase}.md`)) ?? '';
      const requirementsContent = this.readOptionalSync(path.join(featureRoot, 'requirements.md')) ?? '';
      const designContent = this.readOptionalSync(path.join(featureRoot, 'design.md')) ?? '';
      const validation = this.validate(phase, content, requirementsContent, designContent);
      approvals[phase] = {
        ...approvals[phase],
        validation: {
          status: validation.status,
          checkedAt: new Date().toISOString(),
          blockers: validation.blockers,
        },
      };
    }
    this.assertLegacyOrdering(approvals);
    this.assertLegacyPhaseRank(legacyPhase, approvals, raw);
    const optionsRaw = raw.workflow_options && typeof raw.workflow_options === 'object' ? raw.workflow_options as Record<string, unknown> : {};
    const checkpointRaw = raw.checkpoints && typeof raw.checkpoints === 'object' ? raw.checkpoints as Record<string, unknown> : {};
    const testRaw = (checkpointRaw.test_cases ?? checkpointRaw.testCases) as Record<string, unknown> | undefined;
    const choice = typeof optionsRaw.review_test_cases === 'boolean' ? optionsRaw.review_test_cases : approvals.tasks.approved ? false : null;
    const reviewed = choice === true && testRaw?.reviewed === true;
    const completedRank = legacyPhase === 'completed' || legacyPhase === 'implementation-completed';
    const implementationRank = ['implementation-ready', 'implementation', 'completed', 'implementation-completed'].includes(legacyPhase);
    if (implementationRank && (!approvals.tasks.approved || (choice === true && !reviewed))) throw new GovernanceError('LegacyStateConflict', 'Legacy implementation rank does not satisfy tasks governance');
    const spec: WorkflowSpecV5 = {
      ...raw, schema_version: 5, feature_name: String(raw.feature_name ?? raw.name ?? path.basename(featureRoot)),
      description: typeof raw.description === 'string' ? raw.description : '', language: typeof raw.language === 'string' ? raw.language : 'en',
      phase: completedRank ? WorkflowPhase.IMPLEMENTATION_COMPLETED : implementationRank ? WorkflowPhase.IMPLEMENTATION : this.legacyPhaseValue(legacyPhase),
      approvals, workflow_options: { review_test_cases: choice },
      checkpoints: { test_cases: { required: choice === true, reviewed, reviewed_revision: reviewed ? approvals.tasks.revision : undefined, reviewed_artifact_sha256: reviewed ? approvals.tasks.artifactSha256 : undefined } },
    };
    if (implementationRank) {
      const tasks = this.parseLegacyTasks(this.readOptionalSync(path.join(featureRoot, 'tasks.md')) ?? '');
      if (tasks.length === 0) throw new GovernanceError('LegacyTaskConflict', 'Legacy tasks contain no leaves');
      spec.implementation = { revision: 1, tasks_revision: approvals.tasks.revision, legacy_imported: true, tasks: Object.fromEntries(tasks.map((task) => [task.id, { title: task.title, tdd_required: task.tddRequired, dependencies: [], status: task.completed ? 'completed' : 'pending', evidence: {}, planned_artifacts: [], observed_artifacts: [] }])) };
      if (completedRank && !this.allComplete(spec.implementation)) throw new GovernanceError('LegacyStateConflict', 'Completed legacy phase has unchecked tasks');
    }
    return spec;
  }

  private async buildStatus(featureName: string, featureRoot: string, spec: WorkflowSpecV5): Promise<DurableFeatureStatus> {
    const phases = {} as DurableFeatureStatus['phases'];
    const blockers: string[] = [];
    for (const phase of PHASES) {
      const record = spec.approvals[phase];
      const current = await this.readOptional(path.join(featureRoot, `${phase}.md`));
      const observed = current === null ? undefined : sha256(current);
      const drift = record.artifactSha256 !== observed;
      phases[phase] = { ...record, observedArtifactSha256: drift ? observed : undefined };
      if (record.approved && drift) blockers.push(`${phase} artifact drift`);
    }
    const cp = spec.checkpoints.test_cases;
    const implementation = spec.implementation ? { revision: spec.implementation.revision, ...this.implementationCounts(spec.implementation) } : undefined;
    return { featureName, phase: spec.phase, currentPhase: spec.phase, nextAction: this.resolveNextAction(spec, phases), blockers, phases, checkpoint: { required: cp.required, reviewed: cp.reviewed, reviewedRevision: cp.reviewed_revision, reviewedArtifactSha256: cp.reviewed_artifact_sha256 }, implementation };
  }

  private resolveNextAction(spec: WorkflowSpecV5, observed?: DurableFeatureStatus['phases']): NextAction {
    for (const phase of PHASES) if (spec.approvals[phase].approved && observed?.[phase].observedArtifactSha256 !== undefined) return { kind: 'blocked', code: 'ArtifactDrift', phase };
    for (const phase of ['requirements', 'design'] as ApprovablePhase[]) {
      const record = spec.approvals[phase];
      if (!record.generated) return { kind: 'submit-phase', phase };
      if (!record.approved) return record.validation.status === 'passed' && observed?.[phase].observedArtifactSha256 === undefined ? { kind: 'request-approval', phase } : { kind: 'revise-phase', phase };
    }
    const tasks = spec.approvals.tasks;
    if (!tasks.generated) return { kind: 'submit-phase', phase: 'tasks' };
    if (!tasks.approved) {
      if (tasks.validation.status !== 'passed' || spec.workflow_options.review_test_cases === null || observed?.tasks.observedArtifactSha256 !== undefined) return { kind: 'revise-phase', phase: 'tasks' };
      const cp = spec.checkpoints.test_cases;
      if (spec.workflow_options.review_test_cases && (!cp.reviewed || cp.reviewed_revision !== tasks.revision || cp.reviewed_artifact_sha256 !== tasks.artifactSha256)) return { kind: 'review-test-cases', phase: 'tasks' };
      return { kind: 'request-approval', phase: 'tasks' };
    }
    if (!spec.implementation) return { kind: 'start-implementation' };
    if (this.allComplete(spec.implementation)) return { kind: 'complete' };
    const active = Object.entries(spec.implementation.tasks).filter(([, task]) => ['in-progress', 'red-observed', 'green-observed', 'blocked'].includes(task.status));
    if (active.length === 1) return { kind: 'continue-task', taskNumber: active[0][0], taskState: active[0][1].status };
    if (active.length > 1) return { kind: 'select-task', candidates: active.map(([taskNumber, task]) => ({ taskNumber, taskState: task.status })) };
    const ready = Object.entries(spec.implementation.tasks).filter(([, task]) => task.status === 'pending' && task.dependencies.every((id) => spec.implementation!.tasks[id]?.status === 'completed'));
    return { kind: 'select-task', candidates: ready.map(([taskNumber, task]) => ({ taskNumber, taskState: task.status })) };
  }

  private validate(phase: ApprovablePhase, content: string, requirements?: string, design?: string) {
    if (phase === 'requirements') return this.validator.validateRequirements(content);
    if (phase === 'design') return this.validator.validateDesign(content, requirements ?? '');
    return this.validator.validateTasks(content, requirements ?? '', design ?? '');
  }

  private async readUpstream(featureRoot: string, phase: ApprovablePhase): Promise<{ requirements?: string; design?: string }> {
    return {
      requirements: phase === 'requirements' ? undefined : await this.requireArtifact(featureRoot, 'requirements'),
      design: phase === 'tasks' ? await this.requireArtifact(featureRoot, 'design') : undefined,
    };
  }

  private async commitPhaseSubmission(
    specPath: string,
    artifactPath: string,
    _priorSpec: WorkflowSpecV5,
    nextSpec: WorkflowSpecV5,
    priorArtifact: string | null,
    nextArtifact: string,
    assertHeld: () => Promise<void>,
  ): Promise<void> {
    const currentSpecBytes = await this.readRequired(specPath, 'Feature metadata is missing');
    const nextSpecBytes = this.specBytes(nextSpec);
    const journal: SubmissionJournal = {
      schema_version: 1,
      spec: { prior: encode(currentSpecBytes), next: encode(nextSpecBytes) },
      artifact: { prior: priorArtifact === null ? null : encode(priorArtifact), next: encode(nextArtifact) },
    };
    const journalPath = path.join(path.dirname(specPath), '.phase-submit.json');
    await this.requireAtomicFileSystem().writeFileAtomic(journalPath, `${JSON.stringify(journal)}\n`);
    try {
      await this.replaceCas(artifactPath, priorArtifact, nextArtifact, assertHeld);
      await this.replaceCas(specPath, currentSpecBytes, nextSpecBytes, assertHeld);
      await unlink(journalPath);
    } catch (error) {
      try {
        await this.replaceCas(specPath, nextSpecBytes, currentSpecBytes, assertHeld);
        await this.replaceCas(artifactPath, nextArtifact, priorArtifact, assertHeld);
        await unlink(journalPath);
      } catch (rollbackError) {
        throw new GovernanceError(
          'RecoveryConflict',
          'Submission failed and CAS rollback could not safely restore prior bytes',
          { cause: String(error), rollback: String(rollbackError) },
        );
      }
      throw error;
    }
  }

  private async recoverSubmission(featureRoot: string, assertHeld: () => Promise<void>): Promise<void> {
    const journalPath = path.join(featureRoot, '.phase-submit.json');
    const raw = await this.readOptional(journalPath);
    if (raw === null) return;
    let journal: SubmissionJournal;
    try {
      journal = JSON.parse(raw) as SubmissionJournal;
    } catch {
      throw new GovernanceError('RecoveryConflict', 'Submission journal is malformed');
    }
    const priorSpec = decode(journal.spec?.prior);
    const nextSpec = decode(journal.spec?.next);
    const priorArtifact = journal.artifact?.prior === null ? null : decode(journal.artifact?.prior);
    const nextArtifact = decode(journal.artifact?.next);
    const specPath = path.join(featureRoot, 'spec.json');
    const artifactPath = path.join(featureRoot, `${this.artifactPhaseFromSpec(nextSpec)}.md`);
    const currentSpec = await this.readOptional(specPath);
    const currentArtifact = await this.readOptional(artifactPath);
    const convergeNext = currentSpec === nextSpec;
    if (currentSpec !== priorSpec && !convergeNext) {
      throw new GovernanceError('RecoveryConflict', 'Current spec bytes match neither journal endpoint');
    }
    if (currentArtifact !== priorArtifact && currentArtifact !== nextArtifact) {
      throw new GovernanceError('RecoveryConflict', 'Current artifact bytes match neither journal endpoint');
    }
    await this.replaceCas(artifactPath, currentArtifact, convergeNext ? nextArtifact : priorArtifact, assertHeld);
    await this.replaceCas(specPath, currentSpec, convergeNext ? nextSpec : priorSpec, assertHeld);
    await unlink(journalPath);
  }

  private async replaceCas(
    filePath: string,
    expected: string | null,
    desired: string | null,
    assertHeld: () => Promise<void>,
  ): Promise<void> {
    const current = await this.readOptional(filePath);
    if (current !== expected) {
      if (current === desired) return;
      throw new GovernanceError('RecoveryConflict', `Concurrent byte change at ${path.basename(filePath)}`);
    }
    if (desired === null) {
      if (current !== null) await unlink(filePath);
    } else {
      await this.requireAtomicFileSystem().writeFileAtomic(filePath, desired);
      if (await this.readOptional(filePath) !== desired) {
        throw new GovernanceError('RecoveryConflict', `Write verification failed for ${path.basename(filePath)}`);
      }
    }
    await assertHeld();
  }

  private parseLegacyTasks(content: string): Array<{ id: string; title: string; tddRequired: boolean; dependencies: string[]; plannedArtifacts: string[]; completed?: boolean }> {
    const stripped = content.replace(/(```|~~~)[\s\S]*?\1/g, '');
    const headings = [...stripped.matchAll(/^#{3,4}\s+(\d+(?:\.\d+)*)\s+(.+)$(?:\n([\s\S]*?))?(?=^#{3,4}\s+\d+(?:\.\d+)*\s+|\Z)/gm)];
    const duplicate = headings.map((m) => m[1]).find((id, index, ids) => ids.indexOf(id) !== index);
    if (duplicate) throw new GovernanceError('LegacyTaskConflict', `Duplicate legacy task ${duplicate}`);
    const checklist = [...stripped.matchAll(/^\s*- \[([ xX])\]\s+(\d+(?:\.\d+)*)\s+(.+)$/gm)];
    const ids = new Set([...headings.map((m) => m[1]), ...checklist.map((m) => m[2])]);
    const leaves = [...ids].filter((id) => ![...ids].some((candidate) => candidate.startsWith(`${id}.`)));
    return leaves.map((id) => {
      const heading = headings.find((m) => m[1] === id); const item = checklist.find((m) => m[2] === id);
      const body = heading?.[3] ?? ''; const status = body.match(/\*\*Status:\*\*\s*\[([ xX])\]/i)?.[1] ?? item?.[1] ?? ' ';
      return { id, title: (heading?.[2] ?? item?.[3] ?? id).trim(), tddRequired: /\bRED\b/i.test(body) && /\bGREEN\b/i.test(body) && /\bREFACTOR\b/i.test(body), dependencies: [], plannedArtifacts: [], completed: /x/i.test(status) };
    });
  }

  private async hydrateProject(projectRoot: string, featureName: string, spec: WorkflowSpecV5): Promise<Project> {
    const approvals = spec.approvals;
    const project: Project = { id: `disk:${featureName}`, name: featureName, path: projectRoot, phase: spec.phase, metadata: { createdAt: new Date(String(spec.created_at ?? 0)), updatedAt: new Date(String(spec.updated_at ?? 0)), language: spec.language, approvals, workflowOptions: { reviewTestCases: spec.workflow_options.review_test_cases }, checkpoints: { testCases: { required: spec.checkpoints.test_cases.required, reviewed: spec.checkpoints.test_cases.reviewed, reviewedAt: spec.checkpoints.test_cases.reviewed_at ? new Date(spec.checkpoints.test_cases.reviewed_at) : undefined, reviewedRevision: spec.checkpoints.test_cases.reviewed_revision, reviewedArtifactSha256: spec.checkpoints.test_cases.reviewed_artifact_sha256 } } } };
    await this.projectRepository.save(project); return project;
  }

  private assertPriorApproved(phase: ApprovablePhase, approvals: Record<ApprovablePhase, PhaseRecord>): void {
    for (const prior of PHASES.slice(0, PHASES.indexOf(phase))) if (!approvals[prior].approved) throw new GovernanceError('PhaseNotApproved', `${prior} is not approved`);
  }
  private assertLegacyOrdering(approvals: Record<ApprovablePhase, PhaseRecord>): void {
    for (const [index, phase] of PHASES.entries()) {
      if (!approvals[phase].generated && !approvals[phase].approved) continue;
      for (const prior of PHASES.slice(0, index)) {
        if (!approvals[prior].approved) {
          throw new GovernanceError('LegacyStateConflict', `${phase} exists before ${prior} approval`);
        }
      }
    }
  }
  private assertLegacyPhaseRank(
    legacyPhase: string,
    approvals: Record<ApprovablePhase, PhaseRecord>,
    raw: Record<string, unknown>,
  ): void {
    const implementationRank = ['implementation-ready', 'implementation', 'completed', 'implementation-completed'].includes(legacyPhase);
    const expected = approvals.tasks.approved
      ? 'tasks-approved'
      : approvals.tasks.generated
        ? 'tasks-generated'
        : approvals.design.approved
          ? 'design-approved'
          : approvals.design.generated
            ? 'design-generated'
            : approvals.requirements.approved
              ? 'requirements-approved'
              : approvals.requirements.generated
                ? 'requirements-generated'
                : 'init';
    if (!implementationRank && legacyPhase !== expected) {
      throw new GovernanceError('LegacyStateConflict', `Legacy phase ${legacyPhase} disagrees with approval records (${expected})`);
    }
    if (typeof raw.ready_for_implementation === 'boolean' && raw.ready_for_implementation !== implementationRank) {
      throw new GovernanceError('LegacyStateConflict', 'ready_for_implementation disagrees with legacy phase rank');
    }
    if (typeof raw.implementation_completed === 'boolean') {
      const completedRank = legacyPhase === 'completed' || legacyPhase === 'implementation-completed';
      if (raw.implementation_completed !== completedRank) {
        throw new GovernanceError('LegacyStateConflict', 'implementation_completed disagrees with legacy phase rank');
      }
    }
  }
  private phaseValue(phase: ApprovablePhase): WorkflowPhase { return phase === 'requirements' ? WorkflowPhase.REQUIREMENTS : phase === 'design' ? WorkflowPhase.DESIGN : WorkflowPhase.TASKS; }
  private legacyPhaseValue(value: string): WorkflowPhase { if (value.startsWith('tasks')) return WorkflowPhase.TASKS; if (value.startsWith('design')) return WorkflowPhase.DESIGN; if (value.startsWith('requirements')) return WorkflowPhase.REQUIREMENTS; return WorkflowPhase.INIT; }
  private implementationCounts(value: NonNullable<WorkflowSpecV5['implementation']>) { const tasks = Object.values(value.tasks); return { completed: tasks.filter((t) => t.status === 'completed').length, total: tasks.length, active: tasks.filter((t) => ['in-progress', 'red-observed', 'green-observed'].includes(t.status)).length, blocked: tasks.filter((t) => t.status === 'blocked').length }; }
  private allComplete(value: NonNullable<WorkflowSpecV5['implementation']>): boolean { const tasks = Object.values(value.tasks); return tasks.length > 0 && tasks.every((task) => task.status === 'completed'); }
  private invalidTransition(action: string, status: TaskStatus): never { throw new GovernanceError('TaskTransitionInvalid', `Cannot ${action} from ${status}`); }
  private evidence(value: { command: string; exitCode: number; summary: string }): ExecutionEvidence { return { ...value, observedAt: new Date().toISOString() }; }
  private normalizeArtifacts(values: string[]): string[] { const output = [...new Set(values.map((value) => value.trim()).filter(Boolean))]; for (const value of output) if (path.isAbsolute(value) || value.includes('\0') || value.split(/[\\/]/).includes('..')) throw new GovernanceError('InvalidParams', `Invalid affected artifact path: ${value}`); return output; }
  private requireAtomicFileSystem(): FileSystemPort & { writeFileAtomic(filePath: string, content: string): Promise<void> } { if (!this.fileSystem?.writeFileAtomic) throw new GovernanceError('StateInvariantViolation', 'Atomic filesystem writes are required'); return this.fileSystem as FileSystemPort & { writeFileAtomic(filePath: string, content: string): Promise<void> }; }
  private normalizeV5(raw: Record<string, unknown>): WorkflowSpecV5 {
    const spec = structuredClone(raw) as unknown as WorkflowSpecV5;
    const approvalsRaw = raw.approvals as Record<string, Record<string, unknown>>;
    spec.approvals = {} as Record<ApprovablePhase, PhaseRecord>;
    for (const phase of PHASES) {
      const record = approvalsRaw[phase] ?? {};
      const validation = (record.validation ?? {}) as Record<string, unknown>;
      spec.approvals[phase] = {
        generated: record.generated === true,
        approved: record.approved === true,
        revision: typeof record.revision === 'number' ? record.revision : 0,
        artifactSha256: typeof record.artifact_sha256 === 'string'
          ? record.artifact_sha256
          : typeof record.artifactSha256 === 'string' ? record.artifactSha256 : undefined,
        validation: {
          status: (validation.status as PhaseRecord['validation']['status']) ?? 'not-run',
          checkedAt: typeof validation.checked_at === 'string'
            ? validation.checked_at
            : typeof validation.checkedAt === 'string' ? validation.checkedAt : undefined,
          blockers: Array.isArray(validation.blockers) ? validation.blockers as PhaseRecord['validation']['blockers'] : [],
        },
      };
    }
    if (spec.implementation) {
      for (const task of Object.values(spec.implementation.tasks)) {
        for (const key of ['red', 'green', 'verification'] as const) {
          const rawEvidence = task.evidence[key] as unknown as Record<string, unknown> | undefined;
          if (!rawEvidence) continue;
          task.evidence[key] = {
            command: String(rawEvidence.command),
            exitCode: Number(rawEvidence.exit_code ?? rawEvidence.exitCode),
            summary: String(rawEvidence.summary),
            observedAt: String(rawEvidence.observed_at ?? rawEvidence.observedAt),
          };
        }
      }
    }
    const validPhases = new Set(Object.values(WorkflowPhase));
    if (!validPhases.has(spec.phase)) {
      throw new GovernanceError('StateInvariantViolation', `Unknown schema-v5 phase: ${String(spec.phase)}`);
    }
    this.assertV5Invariants(spec);
    return spec;
  }

  private assertV5Invariants(spec: WorkflowSpecV5): void {
    for (const [index, phase] of PHASES.entries()) {
      const record = spec.approvals[phase];
      if (record.approved && !record.generated) {
        throw new GovernanceError('StateInvariantViolation', `${phase} is approved but not generated`);
      }
      if (record.generated) {
        for (const prior of PHASES.slice(0, index)) {
          if (!spec.approvals[prior].approved) {
            throw new GovernanceError('StateInvariantViolation', `${phase} exists before ${prior} approval`);
          }
        }
      }
      if (record.artifactSha256 && !/^[a-f0-9]{64}$/.test(record.artifactSha256)) {
        throw new GovernanceError('StateInvariantViolation', `${phase} artifact hash is invalid`);
      }
    }
    if (spec.implementation) {
      if (!spec.approvals.tasks.approved || spec.implementation.tasks_revision !== spec.approvals.tasks.revision) {
        throw new GovernanceError('StateInvariantViolation', 'Implementation is not bound to the approved tasks revision');
      }
      if (spec.workflow_options.review_test_cases === true) {
        const checkpoint = spec.checkpoints.test_cases;
        if (!checkpoint.reviewed
          || checkpoint.reviewed_revision !== spec.approvals.tasks.revision
          || checkpoint.reviewed_artifact_sha256 !== spec.approvals.tasks.artifactSha256) {
          throw new GovernanceError('StateInvariantViolation', 'Implementation review checkpoint is stale');
        }
      }
    }
    const expectedPhase = spec.implementation
      ? this.allComplete(spec.implementation)
        ? WorkflowPhase.IMPLEMENTATION_COMPLETED
        : WorkflowPhase.IMPLEMENTATION
      : spec.approvals.tasks.generated
        ? WorkflowPhase.TASKS
        : spec.approvals.design.generated
          ? WorkflowPhase.DESIGN
          : spec.approvals.requirements.generated
            ? WorkflowPhase.REQUIREMENTS
            : WorkflowPhase.INIT;
    if (spec.phase !== expectedPhase) {
      throw new GovernanceError('StateInvariantViolation', `Phase ${spec.phase} disagrees with durable records (${expectedPhase})`);
    }
  }
  private specBytes(spec: WorkflowSpecV5): string {
    const persisted = structuredClone(spec) as unknown as Record<string, unknown>;
    persisted.approvals = Object.fromEntries(PHASES.map((phase) => {
      const record = spec.approvals[phase];
      return [phase, {
        generated: record.generated,
        approved: record.approved,
        revision: record.revision,
        ...(record.artifactSha256 ? { artifact_sha256: record.artifactSha256 } : {}),
        validation: {
          status: record.validation.status,
          ...(record.validation.checkedAt ? { checked_at: record.validation.checkedAt } : {}),
          blockers: record.validation.blockers,
        },
      }];
    }));
    const implementation = persisted.implementation as WorkflowSpecV5['implementation'] | undefined;
    if (implementation) {
      for (const task of Object.values(implementation.tasks)) {
        for (const key of ['red', 'green', 'verification'] as const) {
          const value = task.evidence[key];
          if (!value) continue;
          task.evidence[key] = {
            command: value.command,
            exit_code: value.exitCode,
            summary: value.summary,
            observed_at: value.observedAt,
          } as unknown as ExecutionEvidence;
        }
      }
    }
    return `${JSON.stringify(persisted, null, 2)}\n`;
  }
  private async writeSpecAtomic(specPath: string, spec: Record<string, unknown>): Promise<void> { await this.requireAtomicFileSystem().writeFileAtomic(specPath, this.specBytes(spec as WorkflowSpecV5)); }
  private async requireArtifact(root: string, phase: ApprovablePhase): Promise<string> { return this.readRequired(path.join(root, `${phase}.md`), `${phase}.md is missing`); }
  private async readRequired(filePath: string, message: string): Promise<string> { const value = await this.readOptional(filePath); if (value === null) throw new GovernanceError('StateInvariantViolation', message); return value; }
  private async readOptional(filePath: string): Promise<string | null> { try { return await readFile(filePath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
  private readOptionalSync(filePath: string): string | null { try { return readFileSync(filePath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
  private artifactPhaseFromSpec(specBytes: string): ApprovablePhase { const value = JSON.parse(specBytes) as WorkflowSpecV5; return value.approvals.tasks.revision > 0 && value.phase === WorkflowPhase.TASKS ? 'tasks' : value.approvals.design.revision > 0 && value.phase === WorkflowPhase.DESIGN ? 'design' : 'requirements'; }
  private async publishHandoff(projectRoot: string, featureName: string): Promise<HandoffPublication> { try { const result = await this.contextCompactionService.loadContext({ projectRoot, featureName, mode: 'compact' }); return { status: 'published', path: path.join(projectRoot, '.spec', 'specs', featureName, 'context', 'handoff.md'), fingerprint: result.fingerprint, payloadEstimatedTokens: result.payloadEstimatedTokens }; } catch (error) { try { await this.contextCompactionService.invalidateCanonicalHandoff({ projectRoot, featureName }); } catch {} const message = error instanceof Error ? error.message : String(error); this.logger.warn('Workflow state committed but handoff publication failed', { featureName, message }); return { status: 'pending-regeneration', warning: { code: 'HandoffPublicationFailed', message } }; } }
}

function sha256(content: string): string { return createHash('sha256').update(content).digest('hex'); }
function encode(content: string): JournalBytes { return { base64: Buffer.from(content).toString('base64'), sha256: sha256(content) }; }
function decode(value: JournalBytes | undefined): string { if (!value || typeof value.base64 !== 'string' || typeof value.sha256 !== 'string') throw new GovernanceError('RecoveryConflict', 'Journal byte record is malformed'); const bytes = Buffer.from(value.base64, 'base64'); if (bytes.length > JOURNAL_LIMIT) throw new GovernanceError('RecoveryConflict', 'Journal byte record exceeds size limit'); const content = bytes.toString('utf8'); if (sha256(content) !== value.sha256 || Buffer.from(content).toString('base64') !== value.base64) throw new GovernanceError('RecoveryConflict', 'Journal byte hash or encoding is invalid'); return content; }
