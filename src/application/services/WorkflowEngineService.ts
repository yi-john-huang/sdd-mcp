import { createHash } from 'node:crypto';
import { readFile, rmdir, stat, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../infrastructure/di/types.js';
import {
  ExecutionEvidence, PhaseRecord, Project, TaskStatus, WorkflowPhase,
} from '../../domain/types.js';
import { ProjectRepository, LoggerPort, FileSystemPort } from '../../domain/ports.js';
import {
  ContextCompactionService,
  type ApprovablePhase,
  type ContextLoadRequest,
  type ContextLoadResult,
} from './ContextCompactionService.js';
import { InvalidFeatureNameError, SpecPathResolver, validateFeatureName } from './SpecPathResolver.js';
import { WorkflowValidationService, type DesignValidationResult } from './WorkflowValidationService.js';
import { GovernanceError } from './WorkflowErrors.js';
import { FilesystemLockCompromisedError, withFilesystemLock } from '../../utils/withFilesystemLock.js';

const PHASES: ApprovablePhase[] = ['requirements', 'design', 'tasks'];
const JOURNAL_LIMIT = 4 * 1024 * 1024;
const JOURNAL_FILE_LIMIT = 24 * 1024 * 1024;
const PHASE_CONTENT_CHARACTER_LIMIT = 1_048_576;

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
const VALIDATION_STATUSES = new Set(['not-run', 'passed', 'failed', 'legacy-accepted'] as const);
const TASK_STATUSES = new Set<TaskStatus>([
  'pending',
  'in-progress',
  'red-observed',
  'green-observed',
  'blocked',
  'completed',
]);


@injectable()
export class WorkflowEngineService {
  private readonly validator = new WorkflowValidationService();

  constructor(
    @inject(TYPES.ProjectRepository) private readonly projectRepository: ProjectRepository,
    @inject(TYPES.ContextCompactionService) private readonly contextCompactionService: ContextCompactionService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.FileSystemPort) private readonly fileSystem?: FileSystemPort,
  ) {}

  async initializeFeature(request: InitializeFeatureRequest): Promise<Project> {
    validateFeatureName(request.featureName);
    if (!request.description || request.description.length > 20_000) {
      throw new GovernanceError('InvalidParams', 'description must contain 1-20000 characters');
    }
    if (!this.fileSystem) throw new GovernanceError('StateInvariantViolation', 'FileSystemPort is required');

    const absoluteProjectRoot = path.resolve(request.projectRoot);
    const metadataRoot = path.join(absoluteProjectRoot, '.spec');
    const specsRoot = path.join(metadataRoot, 'specs');
    const resolver = new SpecPathResolver(this.fileSystem);
    if (await this.fileSystem.exists(metadataRoot)) {
      await resolver.assertContained(absoluteProjectRoot, metadataRoot);
    } else {
      await this.fileSystem.mkdir(metadataRoot);
      await resolver.assertContained(absoluteProjectRoot, metadataRoot);
    }
    if (await this.fileSystem.exists(specsRoot)) {
      await resolver.assertContained(absoluteProjectRoot, specsRoot);
    } else {
      await this.fileSystem.mkdir(specsRoot);
      await resolver.assertContained(absoluteProjectRoot, specsRoot);
    }
    const resolved = await resolver.resolve(absoluteProjectRoot, request.featureName);
    const initializationLock = path.join(resolved.specsRoot, `.${request.featureName}.init.lock`);
    await resolver.assertContained(resolved.specsRoot, initializationLock);

    return withFilesystemLock(initializationLock, async (lease) => {
      if (await this.fileSystem!.exists(resolved.featureRoot)) {
        throw new GovernanceError('StateInvariantViolation', `Feature already exists: ${request.featureName}`);
      }
      await this.fileSystem!.mkdir(resolved.featureRoot);
      const now = new Date().toISOString();
      const empty = (): PhaseRecord => ({
        generated: false,
        approved: false,
        revision: 0,
        validation: { status: 'not-run', blockers: [] },
      });
      const spec: WorkflowSpecV5 = {
        schema_version: 5,
        feature_name: request.featureName,
        description: request.description,
        language: request.language ?? 'en',
        phase: WorkflowPhase.INIT,
        created_at: now,
        updated_at: now,
        approvals: { requirements: empty(), design: empty(), tasks: empty() },
        workflow_options: { review_test_cases: null },
        checkpoints: { test_cases: { required: false, reviewed: false } },
      };
      const specPath = path.join(resolved.featureRoot, 'spec.json');
      try {
        await resolver.assertContained(resolved.featureRoot, specPath);
        await this.persistSpecCas(specPath, null, spec, lease.assertHeld);
      } catch (error) {
        try {
          await rmdir(resolved.featureRoot);
        } catch {
          // Preserve a non-empty directory: another actor created content we do not own.
        }
        throw error;
      }
      return this.hydrateProject(resolved.projectRoot, request.featureName, spec);
    });
  }

  async submitPhaseArtifact(request: SubmitPhaseArtifactRequest): Promise<PhaseSubmissionResult> {
    if (!request.content || request.content.length > PHASE_CONTENT_CHARACTER_LIMIT) {
      throw new GovernanceError('InvalidParams', 'content must contain 1-1048576 characters');
    }
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, specPath, spec, assertHeld, currentSpecBytes }) => {
      await this.assertNoApprovedArtifactDrift(featureRoot, spec);
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
      await this.commitPhaseSubmission(
        specPath,
        artifactPath,
        currentSpecBytes(),
        nextSpec,
        priorArtifact,
        request.content,
        assertHeld,
      );
      return {
        featureName: request.featureName, phase: request.phase, revision: record.revision + 1,
        artifact: { path: path.relative(request.projectRoot, artifactPath), sha256: artifactSha256 },
        validation, approvalRequired: validation.status === 'passed',
      };
    });
  }

  async approve(request: ApprovalRequest): Promise<ApprovalResult> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, spec, commitSpec }) => {
      await this.assertNoApprovedArtifactDrift(featureRoot, spec);
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
        await commitSpec(spec);
      }
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return { featureName: request.featureName, phase: request.phase, approved: true, canProgressToNext: true, handoff };
    });
  }

  async reviewTestCases(request: ReviewTestCasesRequest): Promise<ReviewTestCasesResult> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, spec, commitSpec }) => {
      await this.assertNoApprovedArtifactDrift(featureRoot, spec);
      const tasks = spec.approvals.tasks;
      if (spec.workflow_options.review_test_cases !== true) throw new GovernanceError('StateInvariantViolation', 'Test-case review is not required');
      if (!tasks.generated) throw new GovernanceError('PhaseNotApproved', 'Tasks are not ready for test-case review');
      if (tasks.revision !== request.expectedTasksRevision) throw new GovernanceError('RevisionConflict', 'The tasks review revision is stale');
      if (tasks.artifactSha256 !== request.expectedArtifactSha256 || sha256(await this.requireArtifact(featureRoot, 'tasks')) !== request.expectedArtifactSha256) throw new GovernanceError('ArtifactDrift', 'The tasks artifact changed before review');
      const checkpoint = spec.checkpoints.test_cases;
      const alreadyReviewed = checkpoint.reviewed
        && checkpoint.reviewed_revision === tasks.revision
        && checkpoint.reviewed_artifact_sha256 === tasks.artifactSha256;
      if (!alreadyReviewed) {
        if (tasks.validation.status !== 'passed' || !spec.approvals.design.approved || tasks.approved) throw new GovernanceError('PhaseNotApproved', 'Tasks are not ready for test-case review');
        spec.checkpoints.test_cases = { required: true, reviewed: true, reviewed_at: new Date().toISOString(), reviewed_revision: tasks.revision, reviewed_artifact_sha256: tasks.artifactSha256 };
        spec.updated_at = new Date().toISOString();
        await commitSpec(spec);
      }
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return { featureName: request.featureName, reviewed: true, tasksRevision: tasks.revision, artifactSha256: tasks.artifactSha256!, canApproveTasks: true, handoff };
    });
  }

  async beginImplementation(request: FeatureRequest): Promise<{
    featureName: string; phase: WorkflowPhase.IMPLEMENTATION | WorkflowPhase.IMPLEMENTATION_COMPLETED; ready: true;
    revision: number; tasks: { completed: number; total: number; active: number; blocked: number }; nextAction: NextAction; handoff: HandoffPublication;
  }> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, spec, commitSpec }) => {
      await this.assertNoApprovedArtifactDrift(featureRoot, spec);
      const tasksRecord = spec.approvals.tasks;
      if (!tasksRecord.approved) throw new GovernanceError('PhaseNotApproved', 'Tasks are not approved');
      if (sha256(await this.requireArtifact(featureRoot, 'tasks')) !== tasksRecord.artifactSha256) throw new GovernanceError('ArtifactDrift', 'Approved tasks artifact has drifted');
      if (spec.workflow_options.review_test_cases === true) {
        const cp = spec.checkpoints.test_cases;
        if (!cp.reviewed || cp.reviewed_revision !== tasksRecord.revision || cp.reviewed_artifact_sha256 !== tasksRecord.artifactSha256) throw new GovernanceError('PhaseNotApproved', 'Tasks review checkpoint is stale');
      }
      if (!spec.implementation) {
        const content = await this.requireArtifact(featureRoot, 'tasks');
        const parsed = (() => {
          if (tasksRecord.validation.status === 'legacy-accepted') return this.parseLegacyTasks(content);
          const current = this.validator.parseTasks(content);
          if (current.status !== 'passed') {
            throw new GovernanceError(
              'PhaseValidationFailed',
              'Approved tasks no longer satisfy the executable task contract',
              { blockers: current.blockers },
            );
          }
          return Object.entries(current.tasks).map(([id, task]) => ({ id, ...task }));
        })();
        if (parsed.length === 0) throw new GovernanceError('LegacyTaskConflict', 'Tasks artifact contains no executable leaf tasks');
        const taskStates: WorkflowSpecV5['implementation']['tasks'] = {};
        for (const task of parsed) {
          taskStates[task.id] = {
            title: task.title, tdd_required: task.tddRequired, dependencies: [...task.dependencies],
            status: 'completed' in task && task.completed ? 'completed' : 'pending',
            evidence: {},
            planned_artifacts: [...task.plannedArtifacts],
            observed_artifacts: [],
          };
        }
        spec.implementation = { revision: tasksRecord.validation.status === 'legacy-accepted' ? 1 : 0, tasks_revision: tasksRecord.revision, legacy_imported: tasksRecord.validation.status === 'legacy-accepted', tasks: taskStates };
        spec.phase = this.allComplete(spec.implementation) ? WorkflowPhase.IMPLEMENTATION_COMPLETED : WorkflowPhase.IMPLEMENTATION;
        spec.updated_at = new Date().toISOString();
        await commitSpec(spec);
      }
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      const counts = this.implementationCounts(spec.implementation!);
      return { featureName: request.featureName, phase: spec.phase as WorkflowPhase.IMPLEMENTATION | WorkflowPhase.IMPLEMENTATION_COMPLETED, ready: true, revision: spec.implementation!.revision, tasks: counts, nextAction: this.resolveNextAction(spec), handoff };
    });
  }

  async recordTaskProgress(request: RecordTaskProgressRequest): Promise<{ featureName: string; taskNumber: string; taskState: TaskStatus; revision: number; nextAction: NextAction; handoff: HandoffPublication }> {
    return this.withLockedFeature(request.projectRoot, request.featureName, true, async ({ featureRoot, spec, commitSpec }) => {
      await this.assertNoApprovedArtifactDrift(featureRoot, spec);
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
        if (request.blocker.length > 2_000) throw new GovernanceError('InvalidParams', 'Task blocker exceeds 2000 characters');
        task.status = 'blocked'; task.blocked_from = prior as 'in-progress' | 'red-observed' | 'green-observed'; task.blocker = request.blocker.trim();
      }
      implementation.revision += 1;
      spec.phase = this.allComplete(implementation) ? WorkflowPhase.IMPLEMENTATION_COMPLETED : WorkflowPhase.IMPLEMENTATION;
      spec.updated_at = new Date().toISOString();
      await commitSpec(spec);
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return { featureName: request.featureName, taskNumber: request.taskNumber, taskState: task.status, revision: implementation.revision, nextAction: this.resolveNextAction(spec), handoff };
    });
  }
  async getFeatureStatus(request: FeatureRequest): Promise<DurableFeatureStatus> {
    return this.withLockedFeature(
      request.projectRoot,
      request.featureName,
      false,
      async ({ featureRoot, spec }) => this.buildStatus(request.featureName, featureRoot, spec),
    );
  }

  async loadFeatureContext(request: ContextLoadRequest): Promise<ContextLoadResult> {
    return this.withLockedFeature(
      request.projectRoot,
      request.featureName,
      false,
      async ({ featureRoot, spec }) => {
        await this.assertNoApprovedArtifactDrift(featureRoot, spec);
        return this.contextCompactionService.loadContext(request);
      },
    );
  }

  async listFeatureStatuses(request: { projectRoot: string }): Promise<DurableFeatureStatus[]> {
    if (!this.fileSystem) throw new GovernanceError('StateInvariantViolation', 'FileSystemPort is required');
    const root = path.join(path.resolve(request.projectRoot), '.spec', 'specs');
    if (!(await this.fileSystem.exists(root))) return [];
    const statuses: DurableFeatureStatus[] = [];
    for (const name of (await this.fileSystem.readdir(root)).sort()) {
      try {
        validateFeatureName(name);
      } catch (error) {
        if (error instanceof InvalidFeatureNameError) continue;
        throw error;
      }
      const candidate = path.join(root, name);
      if ((await this.fileSystem.stat(candidate)).isDirectory()) {
        statuses.push(await this.getFeatureStatus({ projectRoot: request.projectRoot, featureName: name }));
      }
    }
    return statuses;
  }

  async loadProject(request: FeatureRequest): Promise<Project> {
    return this.withLockedFeature(request.projectRoot, request.featureName, false, async ({ projectRoot, spec }) => this.hydrateProject(projectRoot, request.featureName, spec));
  }


  async validateDesignArtifact(request: FeatureRequest): Promise<DesignValidationResult> {
    return this.withLockedFeature(request.projectRoot, request.featureName, false, async ({ featureRoot }) => {
      const requirements = await this.requireArtifact(featureRoot, 'requirements');
      const design = await this.requireArtifact(featureRoot, 'design');
      return this.validator.validateDesign(design, requirements);
    });
  }

  private async withLockedFeature<T>(
    projectRoot: string,
    featureName: string,
    mutate: boolean,
    action: (value: {
      projectRoot: string;
      featureRoot: string;
      specPath: string;
      spec: WorkflowSpecV5;
      assertHeld(): Promise<void>;
      commitSpec(next: WorkflowSpecV5): Promise<void>;
      currentSpecBytes(): string;
    }) => Promise<T>,
  ): Promise<T> {
    if (!this.fileSystem) throw new GovernanceError('StateInvariantViolation', 'FileSystemPort is required');
    const resolver = new SpecPathResolver(this.fileSystem);
    const resolved = await resolver.resolve(projectRoot, featureName);
    const lockPath = path.join(resolved.featureRoot, '.workflow.lock');
    await resolver.assertContained(resolved.featureRoot, lockPath);
    return withFilesystemLock(lockPath, async (lease) => {
      await this.assertGovernedFilesContained(resolved.featureRoot);
      await this.recoverSubmission(resolved.featureRoot, lease.assertHeld);
      const specPath = path.join(resolved.featureRoot, 'spec.json');
      const raw = await this.readRequired(specPath, `Feature metadata not found: ${featureName}`);
      const rawSpec = this.parseSpecBytes(raw);
      const spec = this.normalizeSpec(rawSpec, resolved.featureRoot);
      if (spec.feature_name !== featureName) {
        throw new GovernanceError(
          'StateInvariantViolation',
          `Feature metadata name does not match directory: ${featureName}`,
        );
      }
      let expectedSpecBytes = raw;
      const commitSpec = async (next: WorkflowSpecV5): Promise<void> => {
        expectedSpecBytes = await this.persistSpecCas(
          specPath,
          expectedSpecBytes,
          next,
          lease.assertHeld,
        );
      };
      const currentSpecBytes = (): string => expectedSpecBytes;
      if (mutate && rawSpec.schema_version !== 5) {
        await commitSpec(spec);
      }
      return action({
        projectRoot: resolved.projectRoot,
        featureRoot: resolved.featureRoot,
        specPath,
        spec,
        assertHeld: lease.assertHeld,
        commitSpec,
        currentSpecBytes,
      });
    });
  }

  private normalizeSpec(raw: Record<string, unknown>, featureRoot: string): WorkflowSpecV5 {
    if (raw.schema_version === 5) return this.normalizeV5(raw);
    if (
      raw.schema_version !== undefined
      && (!Number.isInteger(raw.schema_version)
        || (raw.schema_version as number) < 1
        || (raw.schema_version as number) > 4)
    ) {
      throw new GovernanceError('LegacyStateConflict', `Unsupported workflow schema: ${String(raw.schema_version)}`);
    }
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
        artifactSha256: generated && artifact !== null ? sha256(artifact) : undefined,
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
          checkedAt: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
          blockers: validation.blockers,
        },
      };
    }
    this.assertLegacyOrdering(approvals);
    this.assertLegacyPhaseRank(legacyPhase, approvals, raw);
    const optionsRaw = raw.workflow_options && typeof raw.workflow_options === 'object' ? raw.workflow_options as Record<string, unknown> : {};
    const checkpointRaw = raw.checkpoints && typeof raw.checkpoints === 'object' ? raw.checkpoints as Record<string, unknown> : {};
    const testRaw = (checkpointRaw.test_cases ?? checkpointRaw.testCases) as Record<string, unknown> | undefined;
    const legacyRequired = typeof testRaw?.required === 'boolean' ? testRaw.required : undefined;
    const choice = typeof optionsRaw.review_test_cases === 'boolean'
      ? optionsRaw.review_test_cases
      : legacyRequired ?? (approvals.tasks.approved ? false : null);
    const reviewed = choice === true && testRaw?.reviewed === true;
    const completedRank = legacyPhase === 'completed' || legacyPhase === 'implementation-completed';
    const implementationRank = ['implementation-ready', 'implementation', 'completed', 'implementation-completed'].includes(legacyPhase);
    if (implementationRank && (!approvals.tasks.approved || (choice === true && !reviewed))) throw new GovernanceError('LegacyStateConflict', 'Legacy implementation rank does not satisfy tasks governance');
    const description = typeof raw.description === 'string' ? raw.description : '';
    const language = typeof raw.language === 'string' ? raw.language : 'en';
    if (description.length > 20_000) {
      throw new GovernanceError('LegacyStateConflict', 'Legacy description exceeds the schema-v5 limit');
    }
    if (!['en', 'ja', 'zh-TW'].includes(language)) {
      throw new GovernanceError('LegacyStateConflict', `Unsupported legacy language: ${language}`);
    }
    const updatedAt = typeof raw.updated_at === 'string'
      ? raw.updated_at
      : typeof raw.updatedAt === 'string'
        ? raw.updatedAt
        : new Date(0).toISOString();
    const createdAt = typeof raw.created_at === 'string'
      ? raw.created_at
      : typeof raw.createdAt === 'string'
        ? raw.createdAt
        : updatedAt;
    const spec: WorkflowSpecV5 = {
      schema_version: 5, feature_name: String(raw.feature_name ?? raw.name ?? path.basename(featureRoot)),
      description, language, created_at: createdAt, updated_at: updatedAt,
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
    const driftedPhases = new Set<ApprovablePhase>();
    for (const phase of PHASES) {
      const record = spec.approvals[phase];
      const current = await this.readOptional(path.join(featureRoot, `${phase}.md`));
      const observed = current === null ? undefined : sha256(current);
      const drift = record.artifactSha256 !== observed;
      if (drift) driftedPhases.add(phase);
      phases[phase] = { ...record, observedArtifactSha256: drift ? observed : undefined };
      if (record.approved && drift) blockers.push(`${phase} artifact drift`);
    }
    const cp = spec.checkpoints.test_cases;
    const implementation = spec.implementation ? { revision: spec.implementation.revision, ...this.implementationCounts(spec.implementation) } : undefined;
    return { featureName, phase: spec.phase, currentPhase: spec.phase, nextAction: this.resolveNextAction(spec, driftedPhases), blockers, phases, checkpoint: { required: cp.required, reviewed: cp.reviewed, reviewedRevision: cp.reviewed_revision, reviewedArtifactSha256: cp.reviewed_artifact_sha256 }, implementation };
  }

  private resolveNextAction(
    spec: WorkflowSpecV5,
    driftedPhases: ReadonlySet<ApprovablePhase> = new Set(),
  ): NextAction {
    for (const phase of PHASES) if (spec.approvals[phase].approved && driftedPhases.has(phase)) return { kind: 'blocked', code: 'ArtifactDrift', phase };
    for (const phase of ['requirements', 'design'] as ApprovablePhase[]) {
      const record = spec.approvals[phase];
      if (!record.generated) return { kind: 'submit-phase', phase };
      if (!record.approved) return record.validation.status === 'passed' && !driftedPhases.has(phase) ? { kind: 'request-approval', phase } : { kind: 'revise-phase', phase };
    }
    const tasks = spec.approvals.tasks;
    if (!tasks.generated) return { kind: 'submit-phase', phase: 'tasks' };
    if (!tasks.approved) {
      if (tasks.validation.status !== 'passed' || spec.workflow_options.review_test_cases === null || driftedPhases.has('tasks')) return { kind: 'revise-phase', phase: 'tasks' };
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

  private async assertNoApprovedArtifactDrift(
    featureRoot: string,
    spec: WorkflowSpecV5,
  ): Promise<void> {
    for (const phase of PHASES) {
      const record = spec.approvals[phase];
      if (!record.approved) continue;
      const content = await this.readOptional(path.join(featureRoot, `${phase}.md`));
      const observedArtifactSha256 = content === null ? undefined : sha256(content);
      if (observedArtifactSha256 !== record.artifactSha256) {
        throw new GovernanceError(
          'ArtifactDrift',
          `Approved ${phase}.md differs from revision ${record.revision}`,
          { phase, observedArtifactSha256 },
        );
      }
    }
  }

  private async commitPhaseSubmission(
    specPath: string,
    artifactPath: string,
    expectedSpecBytes: string,
    nextSpec: WorkflowSpecV5,
    priorArtifact: string | null,
    nextArtifact: string,
    assertHeld: () => Promise<void>,
  ): Promise<void> {
    this.assertV5Invariants(nextSpec);
    const currentSpecBytes = expectedSpecBytes;
    const nextSpecBytes = this.specBytes(nextSpec);
    const endpoints = [
      currentSpecBytes,
      nextSpecBytes,
      ...(priorArtifact === null ? [] : [priorArtifact]),
      nextArtifact,
    ];
    if (endpoints.some((value) => Buffer.byteLength(value, 'utf8') > JOURNAL_LIMIT)) {
      throw new GovernanceError('RecoveryConflict', 'Submission endpoint exceeds the journal size limit');
    }
    const journal: SubmissionJournal = {
      schema_version: 1,
      spec: { prior: encode(currentSpecBytes), next: encode(nextSpecBytes) },
      artifact: { prior: priorArtifact === null ? null : encode(priorArtifact), next: encode(nextArtifact) },
    };
    const journalBytes = `${JSON.stringify(journal)}\n`;
    const journalPath = path.join(path.dirname(specPath), '.phase-submit.json');
    await this.replaceCas(journalPath, null, journalBytes, assertHeld);
    try {
      await this.replaceCas(artifactPath, priorArtifact, nextArtifact, assertHeld);
      await this.replaceCas(specPath, currentSpecBytes, nextSpecBytes, assertHeld);
      await this.replaceCas(journalPath, journalBytes, null, assertHeld);
    } catch (error) {
      if (error instanceof FilesystemLockCompromisedError) throw error;
      try {
        await this.replaceCas(artifactPath, nextArtifact, priorArtifact, assertHeld);
        await this.replaceCas(specPath, nextSpecBytes, currentSpecBytes, assertHeld);
        await this.replaceCas(journalPath, journalBytes, null, assertHeld);
      } catch (rollbackError) {
        throw new GovernanceError(
          'RecoveryConflict',
          'Submission failed and CAS rollback could not safely restore prior bytes',
          { cause: errorSummary(error), rollback: errorSummary(rollbackError) },
        );
      }
      throw error;
    }
  }

  private async recoverSubmission(featureRoot: string, assertHeld: () => Promise<void>): Promise<void> {
    const journalPath = path.join(featureRoot, '.phase-submit.json');
    if (!this.fileSystem) throw new GovernanceError('StateInvariantViolation', 'FileSystemPort is required');
    if (await this.fileSystem.exists(journalPath)) {
      const journalStats = await stat(journalPath);
      if (!journalStats.isFile() || journalStats.size > JOURNAL_FILE_LIMIT) {
        throw new GovernanceError('RecoveryConflict', 'Submission journal exceeds its raw size limit');
      }
    }
    const raw = await this.readOptional(journalPath);
    if (raw === null) return;
    let journal: SubmissionJournal;
    try {
      journal = JSON.parse(raw) as SubmissionJournal;
    } catch {
      throw new GovernanceError('RecoveryConflict', 'Submission journal is malformed');
    }
    if (journal.schema_version !== 1) {
      throw new GovernanceError('RecoveryConflict', 'Submission journal schema is unsupported');
    }
    const priorSpec = decode(journal.spec?.prior);
    const nextSpec = decode(journal.spec?.next);
    const priorArtifact = journal.artifact?.prior === null ? null : decode(journal.artifact?.prior);
    const nextArtifact = decode(journal.artifact?.next);
    const specPath = path.join(featureRoot, 'spec.json');
    const journalPhase = this.artifactPhaseFromJournal(priorSpec, nextSpec, priorArtifact, nextArtifact);
    const artifactPath = path.join(featureRoot, `${journalPhase}.md`);
    const currentSpec = await this.readOptional(specPath);
    const currentArtifact = await this.readOptional(artifactPath);
    const convergeNext = currentSpec === nextSpec;
    if (currentSpec !== priorSpec && !convergeNext) {
      throw new GovernanceError('RecoveryConflict', 'Current spec bytes match neither journal endpoint');
    }
    if (currentArtifact !== priorArtifact && currentArtifact !== nextArtifact) {
      throw new GovernanceError('RecoveryConflict', 'Current artifact bytes match neither journal endpoint');
    }
    await this.assertJournalValidation(featureRoot, journalPhase, nextSpec, nextArtifact);
    await this.replaceCas(artifactPath, currentArtifact, convergeNext ? nextArtifact : priorArtifact, assertHeld);
    await this.replaceCas(specPath, currentSpec, convergeNext ? nextSpec : priorSpec, assertHeld);
    await this.replaceCas(journalPath, raw, null, assertHeld);
  }

  private async replaceCas(
    filePath: string,
    expected: string | null,
    desired: string | null,
    assertHeld: () => Promise<void>,
  ): Promise<void> {
    await assertHeld();
    const current = await this.readOptional(filePath);
    if (current !== expected) {
      if (current === desired) {
        await assertHeld();
        return;
      }
      throw new GovernanceError('RecoveryConflict', `Concurrent byte change at ${path.basename(filePath)}`);
    }
    if (desired === null) {
      if (current !== null) await unlink(filePath);
      if (await this.readOptional(filePath) !== null) {
        throw new GovernanceError('RecoveryConflict', `Delete verification failed for ${path.basename(filePath)}`);
      }
    } else {
      await this.requireAtomicFileSystem().writeFileAtomic(filePath, desired);
      if (await this.readOptional(filePath) !== desired) {
        throw new GovernanceError('RecoveryConflict', `Write verification failed for ${path.basename(filePath)}`);
      }
    }
    await assertHeld();
  }

  private parseLegacyTasks(content: string): Array<{
    id: string;
    title: string;
    tddRequired: boolean;
    dependencies: string[];
    plannedArtifacts: string[];
    completed: boolean;
  }> {
    const lines = this.visibleLegacyLines(content);
    const headingPattern = /^#{3,4}\s+(\d+(?:\.\d+)*)\s+(.+?)\s*$/;
    const checklistPattern = /^(\s*)-\s+\[([ xX])\]\s+(\d+(?:\.\d+)*)\s+(.+?)\s*$/;
    const headings = new Map<string, { title: string; body: string[] }>();
    const checklist = new Map<string, { title: string; checked: boolean; body: string[] }>();

    for (const [index, line] of lines.entries()) {
      const heading = headingPattern.exec(line);
      if (heading) {
        const id = heading[1];
        if (headings.has(id)) {
          throw new GovernanceError('LegacyTaskConflict', `Duplicate legacy task ${id}`);
        }
        const body: string[] = [];
        for (let cursor = index + 1; cursor < lines.length && !headingPattern.test(lines[cursor]); cursor += 1) {
          body.push(lines[cursor]);
        }
        headings.set(id, { title: heading[2].trim(), body });
      }

      const item = checklistPattern.exec(line);
      if (!item || checklist.has(item[3])) continue;
      const indentation = item[1].length;
      const body: string[] = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (headingPattern.test(lines[cursor])) break;
        const nextItem = checklistPattern.exec(lines[cursor]);
        if (nextItem && nextItem[1].length <= indentation) break;
        body.push(lines[cursor]);
      }
      checklist.set(item[3], {
        title: item[4].trim(),
        checked: item[2].toLowerCase() === 'x',
        body,
      });
    }

    const ids = new Set([...headings.keys(), ...checklist.keys()]);
    if (ids.size > 5_000) {
      throw new GovernanceError('LegacyTaskConflict', 'Legacy tasks contain too many task identifiers');
    }
    for (const id of ids) {
      const title = headings.get(id)?.title ?? checklist.get(id)?.title ?? id;
      if (id.length > 50 || title.trim().length === 0 || title.length > 500) {
        throw new GovernanceError('LegacyTaskConflict', `Legacy task ${id.slice(0, 50)} exceeds schema-v5 field limits`);
      }
    }
    const parents = new Set<string>();
    for (const id of ids) {
      const segments = id.split('.');
      while (segments.length > 1) {
        segments.pop();
        parents.add(segments.join('.'));
      }
    }
    const leaves = [...ids].filter((id) => !parents.has(id));
    if (leaves.length > 1_000) {
      throw new GovernanceError('LegacyTaskConflict', 'Legacy tasks contain more than 1000 executable leaves');
    }
    return leaves.map((id) => {
      const heading = headings.get(id);
      const item = checklist.get(id);
      const ownedBody = heading?.body ?? item?.body ?? [];
      const headingStatus = ownedBody
        .map((line) => /^\s*\*\*Status:\*\*\s*\[([ xX])\]\s*$/.exec(line)?.[1])
        .find((value) => value !== undefined);
      const body = ownedBody.join('\n');
      const hasMarker = (marker: string): boolean =>
        new RegExp(`(^|[^A-Za-z0-9_])${marker}([^A-Za-z0-9_]|$)`, 'i').test(body);
      return {
        id,
        title: heading?.title ?? item?.title ?? id,
        tddRequired: hasMarker('RED') && hasMarker('GREEN') && hasMarker('REFACTOR'),
        dependencies: [],
        plannedArtifacts: [],
        completed: headingStatus !== undefined
          ? headingStatus.toLowerCase() === 'x'
          : item?.checked ?? false,
      };
    });
  }

  private visibleLegacyLines(content: string): string[] {
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    let fence: { marker: '`' | '~'; length: number } | undefined;
    return lines.map((line) => {
      const opening = /^\s*(`{3,}|~{3,})/.exec(line);
      if (!fence) {
        if (opening) {
          fence = { marker: opening[1][0] as '`' | '~', length: opening[1].length };
          return '';
        }
        return line;
      }
      const closing = new RegExp(`^\\s*${fence.marker}{${fence.length},}\\s*$`);
      if (closing.test(line)) fence = undefined;
      return '';
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
  private evidence(value: { command: string; exitCode: number; summary: string }): ExecutionEvidence {
    if (
      typeof value.command !== 'string'
      || value.command.trim().length === 0
      || value.command.length > 500
      || !Number.isInteger(value.exitCode)
      || typeof value.summary !== 'string'
      || value.summary.trim().length === 0
      || value.summary.length > 2_000
    ) {
      throw new GovernanceError('InvalidParams', 'Execution evidence is invalid');
    }
    return { ...value, observedAt: new Date().toISOString() };
  }
  private normalizeArtifacts(values: string[]): string[] { const output = [...new Set(values.map((value) => value.trim()).filter(Boolean))]; for (const value of output) if (!this.isProjectRelativePath(value)) throw new GovernanceError('InvalidParams', `Invalid affected artifact path: ${value}`); return output; }
  private requireAtomicFileSystem(): FileSystemPort & { writeFileAtomic(filePath: string, content: string): Promise<void> } { if (!this.fileSystem?.writeFileAtomic) throw new GovernanceError('StateInvariantViolation', 'Atomic filesystem writes are required'); return this.fileSystem as FileSystemPort & { writeFileAtomic(filePath: string, content: string): Promise<void> }; }
  private normalizeV5(raw: Record<string, unknown>): WorkflowSpecV5 {
    if (typeof raw.feature_name !== 'string' || raw.feature_name.length === 0) {
      throw new GovernanceError('StateInvariantViolation', 'schema-v5 feature_name is missing');
    }
    if (
      typeof raw.description !== 'string'
      || raw.description.length > 20_000
      || typeof raw.language !== 'string'
      || !['en', 'ja', 'zh-TW'].includes(raw.language)
      || typeof raw.created_at !== 'string'
      || typeof raw.updated_at !== 'string'
    ) {
      throw new GovernanceError('StateInvariantViolation', 'schema-v5 description or language is invalid');
    }
    if (!Object.values(WorkflowPhase).includes(raw.phase as WorkflowPhase)) {
      throw new GovernanceError('StateInvariantViolation', `Unknown schema-v5 phase: ${String(raw.phase)}`);
    }

    const approvalsRaw = this.requireSpecRecord(raw.approvals, 'approvals');
    const approvals = {} as Record<ApprovablePhase, PhaseRecord>;
    for (const phase of PHASES) {
      const record = this.requireSpecRecord(approvalsRaw[phase], `approvals.${phase}`);
      const validation = this.requireSpecRecord(record.validation, `approvals.${phase}.validation`);
      if (record.artifact_sha256 !== undefined && typeof record.artifact_sha256 !== 'string') {
        throw new GovernanceError('StateInvariantViolation', `${phase} artifact hash must be a string`);
      }
      if (validation.checked_at !== undefined && typeof validation.checked_at !== 'string') {
        throw new GovernanceError('StateInvariantViolation', `${phase} validation timestamp must be a string`);
      }
      if (typeof record.generated !== 'boolean' || typeof record.approved !== 'boolean') {
        throw new GovernanceError('StateInvariantViolation', `${phase} approval flags must be booleans`);
      }
      if (!Number.isInteger(record.revision) || (record.revision as number) < 0) {
        throw new GovernanceError('StateInvariantViolation', `${phase} revision must be a non-negative integer`);
      }
      if (!VALIDATION_STATUSES.has(validation.status as never)) {
        throw new GovernanceError('StateInvariantViolation', `${phase} validation status is invalid`);
      }
      if (!Array.isArray(validation.blockers)) {
        throw new GovernanceError('StateInvariantViolation', `${phase} validation blockers must be an array`);
      }
      const blockers = validation.blockers.map((value, index) => {
        const item = this.requireSpecRecord(value, `approvals.${phase}.validation.blockers[${index}]`);
        if (
          typeof item.code !== 'string'
          || typeof item.message !== 'string'
          || (item.reference !== undefined && typeof item.reference !== 'string')
        ) {
          throw new GovernanceError('StateInvariantViolation', `${phase} validation blocker is invalid`);
        }
        return {
          code: item.code,
          message: item.message,
          ...(typeof item.reference === 'string' ? { reference: item.reference } : {}),
        };
      });
      approvals[phase] = {
        generated: record.generated,
        approved: record.approved,
        revision: record.revision as number,
        artifactSha256: typeof record.artifact_sha256 === 'string' ? record.artifact_sha256 : undefined,
        validation: {
          status: validation.status as PhaseRecord['validation']['status'],
          checkedAt: typeof validation.checked_at === 'string' ? validation.checked_at : undefined,
          blockers,
        },
      };
    }

    const options = this.requireSpecRecord(raw.workflow_options, 'workflow_options');
    if (options.review_test_cases !== null && typeof options.review_test_cases !== 'boolean') {
      throw new GovernanceError('StateInvariantViolation', 'workflow_options.review_test_cases is invalid');
    }
    const checkpoints = this.requireSpecRecord(raw.checkpoints, 'checkpoints');
    const testCases = this.requireSpecRecord(checkpoints.test_cases, 'checkpoints.test_cases');
    if (typeof testCases.required !== 'boolean' || typeof testCases.reviewed !== 'boolean') {
      throw new GovernanceError('StateInvariantViolation', 'test-case checkpoint flags must be booleans');
    }
    if (
      (testCases.reviewed_at !== undefined && typeof testCases.reviewed_at !== 'string')
      || (testCases.reviewed_revision !== undefined && !Number.isInteger(testCases.reviewed_revision))
      || (testCases.reviewed_artifact_sha256 !== undefined
        && typeof testCases.reviewed_artifact_sha256 !== 'string')
    ) {
      throw new GovernanceError('StateInvariantViolation', 'Test-case checkpoint binding is invalid');
    }

    const spec = {
      ...structuredClone(raw),
      schema_version: 5,
      feature_name: raw.feature_name,
      description: raw.description,
      language: raw.language,
      phase: raw.phase as WorkflowPhase,
      approvals,
      workflow_options: { review_test_cases: options.review_test_cases as boolean | null },
      checkpoints: {
        test_cases: {
          required: testCases.required,
          reviewed: testCases.reviewed,
          reviewed_at: typeof testCases.reviewed_at === 'string' ? testCases.reviewed_at : undefined,
          reviewed_revision: typeof testCases.reviewed_revision === 'number' ? testCases.reviewed_revision : undefined,
          reviewed_artifact_sha256: typeof testCases.reviewed_artifact_sha256 === 'string'
            ? testCases.reviewed_artifact_sha256
            : undefined,
        },
      },
      implementation: raw.implementation === undefined
        ? undefined
        : this.normalizeV5Implementation(raw.implementation),
    } as WorkflowSpecV5;
    this.assertV5Invariants(spec);
    return spec;
  }

  private normalizeV5Implementation(value: unknown): NonNullable<WorkflowSpecV5['implementation']> {
    const raw = this.requireSpecRecord(value, 'implementation');
    if (
      !Number.isInteger(raw.revision)
      || (raw.revision as number) < 0
      || !Number.isInteger(raw.tasks_revision)
      || (raw.tasks_revision as number) < 1
      || typeof raw.legacy_imported !== 'boolean'
    ) {
      throw new GovernanceError('StateInvariantViolation', 'Implementation metadata is invalid');
    }
    const tasksRaw = this.requireSpecRecord(raw.tasks, 'implementation.tasks');
    const tasks: NonNullable<WorkflowSpecV5['implementation']>['tasks'] = {};
    if (Object.keys(tasksRaw).length > 1_000) {
      throw new GovernanceError('StateInvariantViolation', 'Implementation contains too many tasks');
    }
    for (const [taskNumber, value] of Object.entries(tasksRaw)) {
      const task = this.requireSpecRecord(value, `implementation.tasks.${taskNumber}`);
      if (
        typeof task.title !== 'string'
        || typeof task.tdd_required !== 'boolean'
        || !TASK_STATUSES.has(task.status as TaskStatus)
      ) {
        throw new GovernanceError('StateInvariantViolation', `Implementation task ${taskNumber} is invalid`);
      }
      if (
        !/^\d+(?:\.\d+)*$/.test(taskNumber)
        || taskNumber.length > 50
        || task.title.trim().length === 0
        || task.title.length > 500
      ) {
        throw new GovernanceError('StateInvariantViolation', `Implementation task identifier ${taskNumber} is invalid`);
      }
      if (task.blocker !== undefined && typeof task.blocker !== 'string') {
        throw new GovernanceError('StateInvariantViolation', `Implementation task ${taskNumber} blocker is invalid`);
      }
      if (
        task.blocked_from !== undefined
        && !['in-progress', 'red-observed', 'green-observed'].includes(String(task.blocked_from))
      ) {
        throw new GovernanceError('StateInvariantViolation', `Implementation task ${taskNumber} blocked_from is invalid`);
      }
      const dependencies = this.requireStringArray(task.dependencies, `${taskNumber}.dependencies`);
      const plannedArtifacts = this.requireStringArray(task.planned_artifacts, `${taskNumber}.planned_artifacts`);
      const observedArtifacts = this.requireStringArray(task.observed_artifacts, `${taskNumber}.observed_artifacts`);
      this.assertPersistedArtifactPaths(plannedArtifacts, `${taskNumber}.planned_artifacts`);
      this.assertPersistedArtifactPaths(observedArtifacts, `${taskNumber}.observed_artifacts`);
      const evidenceRaw = this.requireSpecRecord(task.evidence, `${taskNumber}.evidence`);
      if (Object.keys(evidenceRaw).some((key) => !['red', 'green', 'verification'].includes(key))) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber}.evidence contains an unknown entry`);
      }
      const evidence: NonNullable<WorkflowSpecV5['implementation']>['tasks'][string]['evidence'] = {};
      for (const key of ['red', 'green', 'verification'] as const) {
        if (evidenceRaw[key] !== undefined) {
          evidence[key] = this.normalizeV5Evidence(evidenceRaw[key], `${taskNumber}.evidence.${key}`);
        }
      }
      tasks[taskNumber] = {
        title: task.title,
        tdd_required: task.tdd_required,
        dependencies,
        status: task.status as TaskStatus,
        blocker: typeof task.blocker === 'string' ? task.blocker : undefined,
        blocked_from: ['in-progress', 'red-observed', 'green-observed'].includes(String(task.blocked_from))
          ? task.blocked_from as 'in-progress' | 'red-observed' | 'green-observed'
          : undefined,
        evidence,
        planned_artifacts: plannedArtifacts,
        observed_artifacts: observedArtifacts,
      };
    }
    return {
      revision: raw.revision as number,
      tasks_revision: raw.tasks_revision as number,
      legacy_imported: raw.legacy_imported,
      tasks,
    };
  }

  private normalizeV5Evidence(value: unknown, reference: string): ExecutionEvidence {
    const evidence = this.requireSpecRecord(value, reference);
    if (
      typeof evidence.command !== 'string'
      || evidence.command.length === 0
      || evidence.command.length > 500
      || !Number.isInteger(evidence.exit_code)
      || typeof evidence.summary !== 'string'
      || evidence.summary.length === 0
      || evidence.summary.length > 2_000
      || typeof evidence.observed_at !== 'string'
    ) {
      throw new GovernanceError('StateInvariantViolation', `${reference} is invalid`);
    }
    return {
      command: evidence.command,
      exitCode: evidence.exit_code as number,
      summary: evidence.summary,
      observedAt: evidence.observed_at,
    };
  }

  private requireSpecRecord(value: unknown, reference: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new GovernanceError('StateInvariantViolation', `${reference} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private requireStringArray(value: unknown, reference: string): string[] {
    if (
      !Array.isArray(value)
      || value.length > 100
      || value.some((item) => typeof item !== 'string' || item.length === 0)
      || new Set(value).size !== value.length
    ) {
      throw new GovernanceError('StateInvariantViolation', `${reference} must be a unique string array`);
    }
    return value as string[];
  }

  private assertPersistedArtifactPaths(values: string[], reference: string): void {
    if (values.length > 100 || new Set(values).size !== values.length || values.some((value) => !this.isProjectRelativePath(value))) {
      throw new GovernanceError('StateInvariantViolation', `${reference} contains an invalid project-relative path`);
    }
  }

  private isProjectRelativePath(value: string): boolean {
    return value.length > 0
      && value.length <= 500
      && !/^[/\\]/.test(value)
      && !path.isAbsolute(value)
      && !/^[A-Za-z]:/.test(value)
      && !value.includes('\0')
      && !value.split(/[\\/]/).includes('..')
      && value === value.trim();
  }

  private assertV5Invariants(spec: WorkflowSpecV5): void {
    for (const [index, phase] of PHASES.entries()) {
      const record = spec.approvals[phase];
      if (!record.generated) {
        if (
          record.approved
          || record.revision !== 0
          || record.artifactSha256 !== undefined
          || record.validation.status !== 'not-run'
          || record.validation.blockers.length > 0
        ) {
          throw new GovernanceError('StateInvariantViolation', `${phase} has state without a generated artifact`);
        }
        continue;
      }
      if (
        record.revision < 1
        || !record.artifactSha256
        || !/^[a-f0-9]{64}$/.test(record.artifactSha256)
        || record.validation.status === 'not-run'
      ) {
        throw new GovernanceError('StateInvariantViolation', `${phase} generated state is incomplete`);
      }
      if (record.approved && !['passed', 'legacy-accepted'].includes(record.validation.status)) {
        throw new GovernanceError('StateInvariantViolation', `${phase} approval lacks successful validation`);
      }
      if (record.validation.status === 'legacy-accepted' && !record.approved) {
        throw new GovernanceError('StateInvariantViolation', `${phase} has unapproved legacy validation`);
      }
      if (
        record.validation.blockers.length > 100
        || record.validation.blockers.some((blocker) =>
          blocker.code.trim().length === 0
          || blocker.code.length > 100
          || blocker.message.trim().length === 0
          || blocker.message.length > 2_000
          || (blocker.reference !== undefined && blocker.reference.trim().length === 0)
          || (blocker.reference?.length ?? 0) > 200)
        || (record.validation.status === 'failed' && record.validation.blockers.length === 0)
        || (record.validation.status !== 'failed' && record.validation.blockers.length > 0)
      ) {
        throw new GovernanceError('StateInvariantViolation', `${phase} validation blockers disagree with validation status`);
      }
      for (const prior of PHASES.slice(0, index)) {
        if (!spec.approvals[prior].approved) {
          throw new GovernanceError('StateInvariantViolation', `${phase} exists before ${prior} approval`);
        }
      }
    }

    const checkpoint = spec.checkpoints.test_cases;
    const reviewRequired = spec.workflow_options.review_test_cases === true;
    if (checkpoint.required !== reviewRequired) {
      throw new GovernanceError('StateInvariantViolation', 'Test-case checkpoint disagrees with workflow option');
    }
    if (spec.approvals.tasks.generated && spec.workflow_options.review_test_cases === null) {
      throw new GovernanceError('StateInvariantViolation', 'Generated tasks are missing the review choice');
    }
    if (checkpoint.reviewed) {
      if (
        !reviewRequired
        || checkpoint.reviewed_revision !== spec.approvals.tasks.revision
        || checkpoint.reviewed_artifact_sha256 !== spec.approvals.tasks.artifactSha256
        || (!checkpoint.reviewed_at && spec.approvals.tasks.validation.status !== 'legacy-accepted')
      ) {
        throw new GovernanceError('StateInvariantViolation', 'Test-case review checkpoint is stale');
      }
    } else if (
      checkpoint.reviewed_revision !== undefined
      || checkpoint.reviewed_artifact_sha256 !== undefined
      || checkpoint.reviewed_at !== undefined
    ) {
      throw new GovernanceError('StateInvariantViolation', 'Unreviewed checkpoint contains a review binding');
    }

    if (spec.implementation) {
      if (
        !spec.approvals.tasks.approved
        || spec.implementation.tasks_revision !== spec.approvals.tasks.revision
        || Object.keys(spec.implementation.tasks).length === 0
      ) {
        throw new GovernanceError('StateInvariantViolation', 'Implementation is not bound to executable approved tasks');
      }
      if (spec.implementation.legacy_imported
        !== (spec.approvals.tasks.validation.status === 'legacy-accepted')) {
        throw new GovernanceError(
          'StateInvariantViolation',
          'Implementation legacy marker disagrees with the approved tasks record',
        );
      }
      if (reviewRequired && !checkpoint.reviewed) {
        throw new GovernanceError('StateInvariantViolation', 'Implementation review checkpoint is stale');
      }
      this.assertImplementationTasks(spec.implementation);
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

  private assertImplementationTasks(implementation: NonNullable<WorkflowSpecV5['implementation']>): void {
    const ids = new Set(Object.keys(implementation.tasks));
    for (const [taskNumber, task] of Object.entries(implementation.tasks)) {
      if (task.dependencies.length > 100 || new Set(task.dependencies).size !== task.dependencies.length) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} dependencies must be a unique bounded list`);
      }
      if (task.dependencies.some((dependency) => !ids.has(dependency))) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} has an unknown dependency`);
      }
      this.assertPersistedArtifactPaths(task.planned_artifacts, `${taskNumber}.planned_artifacts`);
      this.assertPersistedArtifactPaths(task.observed_artifacts, `${taskNumber}.observed_artifacts`);
      for (const [evidenceType, evidence] of Object.entries(task.evidence)) {
        this.assertExecutionEvidence(evidence, `${taskNumber}.evidence.${evidenceType}`);
      }
      if (task.status === 'blocked') {
        if (
          !task.blocker
          || task.blocker.trim().length === 0
          || task.blocker.length > 2_000
          || !task.blocked_from
        ) {
          throw new GovernanceError('StateInvariantViolation', `${taskNumber} has incomplete blocked state`);
        }
      } else if (task.blocker !== undefined || task.blocked_from !== undefined) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} has stale blocker state`);
      }

      const acceptedLegacyCompletion = implementation.legacy_imported
        && task.status === 'completed'
        && Object.keys(task.evidence).length === 0;
      const effectiveState = task.status === 'blocked' ? task.blocked_from : task.status;
      if (
        effectiveState !== 'pending'
        && task.dependencies.some((dependency) => implementation.tasks[dependency].status !== 'completed')
      ) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} advanced before its dependencies`);
      }
      if (
        (task.evidence.red && !['red-observed', 'green-observed', 'completed'].includes(effectiveState!))
        || (task.evidence.green && !['green-observed', 'completed'].includes(effectiveState!))
        || (task.evidence.verification && task.status !== 'completed')
      ) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} contains evidence ahead of its state`);
      }
      if (!task.tdd_required && ['red-observed', 'green-observed'].includes(effectiveState!)) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} has TDD evidence for a non-TDD task`);
      }
      if (
        task.tdd_required
        && !acceptedLegacyCompletion
        && ['red-observed', 'green-observed', 'completed'].includes(effectiveState!)
        && (!task.evidence.red || task.evidence.red.exitCode === 0)
      ) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} lacks failing RED evidence`);
      }
      if (
        task.tdd_required
        && !acceptedLegacyCompletion
        && ['green-observed', 'completed'].includes(effectiveState!)
        && (!task.evidence.green || task.evidence.green.exitCode !== 0)
      ) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} lacks passing GREEN evidence`);
      }
      if (
        task.status === 'completed'
        && !acceptedLegacyCompletion
        && (!task.evidence.verification || task.evidence.verification.exitCode !== 0)
      ) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} lacks final verification`);
      }
      if (task.status !== 'completed' && task.observed_artifacts.length > 0) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} records artifacts before completion`);
      }
      if (
        task.status === 'completed'
        && !acceptedLegacyCompletion
        && task.planned_artifacts.length > 0
        && task.observed_artifacts.length === 0
      ) {
        throw new GovernanceError('StateInvariantViolation', `${taskNumber} completion lacks observed artifacts`);
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (taskNumber: string): void => {
      if (visiting.has(taskNumber)) {
        throw new GovernanceError('StateInvariantViolation', 'Implementation task dependencies contain a cycle');
      }
      if (visited.has(taskNumber)) return;
      visiting.add(taskNumber);
      for (const dependency of implementation.tasks[taskNumber].dependencies) visit(dependency);
      visiting.delete(taskNumber);
      visited.add(taskNumber);
    };
    for (const taskNumber of ids) visit(taskNumber);
  }
  private assertExecutionEvidence(value: ExecutionEvidence, reference: string): void {
    if (
      typeof value.command !== 'string'
      || value.command.trim().length === 0
      || value.command.length > 500
      || !Number.isInteger(value.exitCode)
      || typeof value.summary !== 'string'
      || value.summary.trim().length === 0
      || value.summary.length > 2_000
      || typeof value.observedAt !== 'string'
    ) {
      throw new GovernanceError('StateInvariantViolation', `${reference} is invalid`);
    }
  }

  private specBytes(spec: WorkflowSpecV5): string {
    const persisted = structuredClone(spec) as unknown as Record<string, unknown>;
    delete persisted.ready_for_implementation;
    delete persisted.implementation_completed;
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
  private async persistSpecCas(
    specPath: string,
    expectedBytes: string | null,
    spec: WorkflowSpecV5,
    assertHeld: () => Promise<void>,
  ): Promise<string> {
    this.assertV5Invariants(spec);
    const bytes = this.specBytes(spec);
    await this.replaceCas(specPath, expectedBytes, bytes, assertHeld);
    return bytes;
  }

  private parseSpecBytes(bytes: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes);
    } catch {
      throw new GovernanceError('StateInvariantViolation', 'Feature metadata is malformed');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new GovernanceError('StateInvariantViolation', 'Feature metadata must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  }
  private async requireArtifact(root: string, phase: ApprovablePhase): Promise<string> { return this.readRequired(path.join(root, `${phase}.md`), `${phase}.md is missing`); }
  private async readRequired(filePath: string, message: string): Promise<string> { const value = await this.readOptional(filePath); if (value === null) throw new GovernanceError('StateInvariantViolation', message); return value; }
  private async assertGovernedFilesContained(featureRoot: string): Promise<void> {
    if (!this.fileSystem) throw new GovernanceError('StateInvariantViolation', 'FileSystemPort is required');
    const resolver = new SpecPathResolver(this.fileSystem);
    await Promise.all([
      'spec.json',
      '.phase-submit.json',
      '.workflow.lock',
      ...PHASES.map((phase) => `${phase}.md`),
    ].map((name) => resolver.assertContained(featureRoot, path.join(featureRoot, name))));
  }

  private async readOptional(filePath: string): Promise<string | null> { try { return await readFile(filePath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
  private readOptionalSync(filePath: string): string | null { try { return readFileSync(filePath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
  private artifactPhaseFromJournal(
    priorBytes: string,
    nextBytes: string,
    priorArtifact: string | null,
    nextArtifact: string,
  ): ApprovablePhase {
    const priorRaw = this.parseSpecBytes(priorBytes);
    const nextRaw = this.parseSpecBytes(nextBytes);
    if (priorRaw.schema_version !== 5 || nextRaw.schema_version !== 5) {
      throw new GovernanceError('RecoveryConflict', 'Submission journal endpoints must use schema-v5');
    }
    let prior: WorkflowSpecV5;
    let next: WorkflowSpecV5;
    try {
      prior = this.normalizeV5(priorRaw);
      next = this.normalizeV5(nextRaw);
    } catch (error) {
      throw new GovernanceError(
        'RecoveryConflict',
        'Submission journal contains invalid workflow state',
        { cause: errorSummary(error) },
      );
    }
    const changed = PHASES.filter(
      (phase) => next.approvals[phase].revision === prior.approvals[phase].revision + 1,
    );
    if (
      changed.length !== 1
      || prior.feature_name !== next.feature_name
      || PHASES.some((phase) =>
        phase !== changed[0]
        && next.approvals[phase].revision !== prior.approvals[phase].revision)
    ) {
      throw new GovernanceError('RecoveryConflict', 'Submission journal does not describe one phase revision');
    }
    const changedPhase = changed[0];
    const priorRecord = prior.approvals[changedPhase];
    const nextRecord = next.approvals[changedPhase];
    const otherApprovalsUnchanged = PHASES
      .filter((phase) => phase !== changedPhase)
      .every((phase) => JSON.stringify(prior.approvals[phase]) === JSON.stringify(next.approvals[phase]));
    const ancillaryUnchanged = this.journalAncillaryState(prior) === this.journalAncillaryState(next);
    const submissionRecordValid = !priorRecord.approved
      && nextRecord.generated
      && !nextRecord.approved
      && nextArtifact.length > 0
      && nextArtifact.length <= PHASE_CONTENT_CHARACTER_LIMIT
      && (nextRecord.validation.status === 'passed' || nextRecord.validation.status === 'failed')
      && nextRecord.artifactSha256 === sha256(nextArtifact);
    const priorArtifactValid = !priorRecord.generated
      || (priorArtifact !== null && sha256(priorArtifact) === priorRecord.artifactSha256);
    const workflowMetadataValid = changedPhase === 'tasks'
      ? (
          typeof next.workflow_options.review_test_cases === 'boolean'
          && (
            prior.workflow_options.review_test_cases === null
            || prior.workflow_options.review_test_cases === next.workflow_options.review_test_cases
          )
          && next.checkpoints.test_cases.required === next.workflow_options.review_test_cases
          && !next.checkpoints.test_cases.reviewed
          && next.checkpoints.test_cases.reviewed_at === undefined
          && next.checkpoints.test_cases.reviewed_revision === undefined
          && next.checkpoints.test_cases.reviewed_artifact_sha256 === undefined
        )
      : (
          JSON.stringify(prior.workflow_options) === JSON.stringify(next.workflow_options)
          && JSON.stringify(prior.checkpoints) === JSON.stringify(next.checkpoints)
        );
    if (
      !ancillaryUnchanged
      || next.phase !== this.phaseValue(changedPhase)
      || !otherApprovalsUnchanged
      || !priorArtifactValid
      || !submissionRecordValid
      || !workflowMetadataValid
    ) {
      throw new GovernanceError('RecoveryConflict', 'Submission journal does not describe a valid phase submission');
    }
    return changedPhase;
  }
  private async assertJournalValidation(
    featureRoot: string,
    phase: ApprovablePhase,
    nextSpecBytes: string,
    nextArtifact: string,
  ): Promise<void> {
    try {
      const next = this.normalizeV5(this.parseSpecBytes(nextSpecBytes));
      const upstream = await this.readUpstream(featureRoot, phase);
      const observed = this.validate(phase, nextArtifact, upstream.requirements, upstream.design);
      const recorded = next.approvals[phase].validation;
      if (
        observed.status !== recorded.status
        || JSON.stringify(observed.blockers) !== JSON.stringify(recorded.blockers)
      ) {
        throw new Error('recorded validation does not match deterministic validation');
      }
    } catch (error) {
      throw new GovernanceError(
        'RecoveryConflict',
        'Submission journal validation cannot be reproduced',
        { cause: errorSummary(error) },
      );
    }
  }

  private journalAncillaryState(spec: WorkflowSpecV5): string {
    const stable = structuredClone(spec) as unknown as Record<string, unknown>;
    delete stable.phase;
    delete stable.updated_at;
    delete stable.approvals;
    delete stable.workflow_options;
    delete stable.checkpoints;
    return JSON.stringify(stable);
  }

  private async publishHandoff(
    projectRoot: string,
    featureName: string,
  ): Promise<HandoffPublication> {
    try {
      const result = await this.contextCompactionService.loadContext({
        projectRoot,
        featureName,
        mode: 'compact',
      });
      return {
        status: 'published',
        path: path.join(projectRoot, '.spec', 'specs', featureName, 'context', 'handoff.md'),
        fingerprint: result.fingerprint,
        payloadEstimatedTokens: result.payloadEstimatedTokens,
      };
    } catch (error) {
      try {
        await this.contextCompactionService.invalidateCanonicalHandoff({ projectRoot, featureName });
      } catch (invalidationError) {
        this.logger.warn('Failed to invalidate stale workflow handoff', {
          featureName,
          message: invalidationError instanceof Error
            ? invalidationError.message
            : String(invalidationError),
        });
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Workflow state committed but handoff publication failed', {
        featureName,
        message,
      });
      return {
        status: 'pending-regeneration',
        warning: { code: 'HandoffPublicationFailed', message },
      };
    }
  }
}

function sha256(content: string): string { return createHash('sha256').update(content).digest('hex'); }
function encode(content: string): JournalBytes { return { base64: Buffer.from(content).toString('base64'), sha256: sha256(content) }; }
function decode(value: JournalBytes | undefined): string { if (!value || typeof value.base64 !== 'string' || typeof value.sha256 !== 'string') throw new GovernanceError('RecoveryConflict', 'Journal byte record is malformed'); const bytes = Buffer.from(value.base64, 'base64'); if (bytes.length > JOURNAL_LIMIT) throw new GovernanceError('RecoveryConflict', 'Journal byte record exceeds size limit'); const content = bytes.toString('utf8'); if (sha256(content) !== value.sha256 || Buffer.from(content).toString('base64') !== value.base64) throw new GovernanceError('RecoveryConflict', 'Journal byte hash or encoding is invalid'); return content; }
function errorSummary(error: unknown): string { return String(error).slice(0, 2_000); }
