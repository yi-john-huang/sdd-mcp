import path from 'node:path';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../infrastructure/di/types.js';
import {
  Project,
  WorkflowPhase,
} from '../../domain/types.js';
import {
  ProjectRepository,
  LoggerPort,
  FileSystemPort,
} from '../../domain/ports.js';
import { ProjectService } from './ProjectService.js';
import { TemplateService } from './TemplateService.js';
import { ContextCompactionService, ApprovablePhase } from './ContextCompactionService.js';
import { SpecPathResolver, validateFeatureName } from './SpecPathResolver.js';

export interface ApprovalRequest {
  readonly projectRoot: string;
  readonly featureName: string;
  readonly phase: ApprovablePhase;
}

export interface ReviewTestCasesRequest {
  readonly projectRoot: string;
  readonly featureName: string;
}

export interface RollbackRequest {
  readonly projectRoot: string;
  readonly featureName: string;
  readonly triggeredBy: string;
}

export interface HandoffPublication {
  readonly status: 'published' | 'pending-regeneration';
  readonly path?: string;
  readonly fingerprint?: string;
  readonly payloadEstimatedTokens?: number;
  readonly warning?: { readonly code: 'HandoffPublicationFailed'; readonly message: string };
}

export interface ApprovalResult {
  readonly featureName: string;
  readonly phase: ApprovablePhase;
  readonly approved: true;
  readonly canProgressToNext: boolean;
  readonly handoff: HandoffPublication;
}

export interface ReviewTestCasesResult {
  readonly featureName: string;
  readonly reviewed: true;
  readonly canApproveTasks: boolean;
  readonly handoff: HandoffPublication;
}


export interface FeatureRequest {
  readonly projectRoot: string;
  readonly featureName: string;
}

export interface InitializeFeatureRequest extends FeatureRequest {
  readonly language: string;
  readonly reviewTestCases: boolean;
}

export interface GeneratePhaseRequest extends FeatureRequest {
  readonly phase: ApprovablePhase;
  readonly reviewTestCases?: boolean;
}

export interface DurableFeatureStatus {
  readonly featureName: string;
  readonly phase: WorkflowPhase;
  readonly currentPhase?: WorkflowPhase;
  readonly nextPhase?: WorkflowPhase;
  readonly canProgress?: boolean;
  readonly blockers?: string[];
  readonly testCases?: { required: boolean; reviewed: boolean };
}

@injectable()
export class WorkflowEngineService {
  private static readonly featureLocks = new Map<string, Promise<void>>();

  constructor(
    @inject(TYPES.ProjectRepository) private readonly projectRepository: ProjectRepository,
    @inject(TYPES.ProjectService) private readonly projectService: ProjectService,
    @inject(TYPES.TemplateService) private readonly templateService: TemplateService,
    @inject(TYPES.ContextCompactionService) private readonly contextCompactionService: ContextCompactionService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.FileSystemPort) private readonly fileSystem?: FileSystemPort,
  ) {}

  async approve(request: ApprovalRequest): Promise<ApprovalResult> {
    return this.withFeatureLock(request.projectRoot, request.featureName, async () => {
      const { featureRoot, specPath, spec } = await this.readDiskSpec(request.projectRoot, request.featureName);
      const approvals = this.readApprovals(spec);
      const current = approvals[request.phase];
      if (!current.generated) {
        throw new Error(`Cannot approve ${request.phase}: phase document has not been generated`);
      }
      const phaseIndex = (['requirements', 'design', 'tasks'] as ApprovablePhase[]).indexOf(request.phase);
      for (const prior of (['requirements', 'design', 'tasks'] as ApprovablePhase[]).slice(0, phaseIndex)) {
        if (!approvals[prior].approved) throw new Error(`Cannot approve ${request.phase}: ${prior} is not approved`);
      }
      if (!this.fileSystem) throw new Error('FileSystemPort is required for disk-addressed workflow operations');
      const resolver = new SpecPathResolver(this.fileSystem);
      for (const selectedPhase of (['requirements', 'design', 'tasks'] as ApprovablePhase[]).slice(0, phaseIndex + 1)) {
        const documentPath = path.join(featureRoot, `${selectedPhase}.md`);
        await resolver.assertContained(featureRoot, documentPath);
        if (!(await this.fileSystem.exists(documentPath))) {
          throw new Error(`Cannot approve ${request.phase}: required document is missing: ${selectedPhase}.md`);
        }
      }
      const review = this.readReviewState(spec);
      if (request.phase === 'tasks' && review.required && !review.reviewed) {
        throw new Error('Cannot approve tasks: test-case review is required');
      }

      if (!current.approved) {
        approvals[request.phase] = { ...current, approved: true };
        const prospective = {
          ...spec,
          updated_at: new Date().toISOString(),
          phase: `${request.phase}-approved`,
          approvals,
          ready_for_implementation: request.phase === 'tasks',
        };
        await this.writeSpecAtomic(specPath, prospective);
        await this.synchronizeRepository(featureRoot, approvals);
      }

      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return {
        featureName: request.featureName,
        phase: request.phase,
        approved: true,
        canProgressToNext: request.phase !== 'tasks' || !review.required || review.reviewed,
        handoff,
      };
    });
  }

  async reviewTestCases(request: ReviewTestCasesRequest): Promise<ReviewTestCasesResult> {
    return this.withFeatureLock(request.projectRoot, request.featureName, async () => {
      const { specPath, spec } = await this.readDiskSpec(request.projectRoot, request.featureName);
      const approvals = this.readApprovals(spec);
      const review = this.readReviewState(spec);
      if (!review.required) throw new Error('Test-case review is not configured for this feature');
      if (!approvals.tasks.generated) throw new Error('Cannot review test cases before tasks are generated');

      if (!review.reviewed) {
        const checkpointsValue = spec.checkpoints;
        const checkpoints = checkpointsValue && typeof checkpointsValue === 'object'
          ? checkpointsValue as Record<string, unknown>
          : {};
        const key = 'test_cases' in checkpoints ? 'test_cases' : 'testCases';
        const testValue = checkpoints[key];
        const test = testValue && typeof testValue === 'object' ? testValue as Record<string, unknown> : {};
        const prospective = {
          ...spec,
          updated_at: new Date().toISOString(),
          checkpoints: {
            ...checkpoints,
            [key]: { ...test, required: true, reviewed: true, reviewed_at: new Date().toISOString() },
          },
        };
        await this.writeSpecAtomic(specPath, prospective);
      }
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return { featureName: request.featureName, reviewed: true, canApproveTasks: true, handoff };
    });
  }

  async rollback(request: RollbackRequest): Promise<{
    readonly featureName: string;
    readonly rolledBackPhase: ApprovablePhase;
    readonly handoff: HandoffPublication;
  }> {
    return this.withFeatureLock(request.projectRoot, request.featureName, async () => {
      const { specPath, spec } = await this.readDiskSpec(request.projectRoot, request.featureName);
      const approvals = this.readApprovals(spec);
      const rolledBackPhase = ([...(['requirements', 'design', 'tasks'] as ApprovablePhase[])].reverse())
        .find((phase) => approvals[phase].approved);
      if (!rolledBackPhase) throw new Error('Feature has no approved phase to roll back');
      const phaseIndex = (['requirements', 'design', 'tasks'] as ApprovablePhase[]).indexOf(rolledBackPhase);
      for (const phase of (['requirements', 'design', 'tasks'] as ApprovablePhase[]).slice(phaseIndex)) {
        approvals[phase] = { ...approvals[phase], approved: false };
      }
      const prior = phaseIndex > 0 ? (['requirements', 'design', 'tasks'] as ApprovablePhase[])[phaseIndex - 1] : undefined;
      await this.writeSpecAtomic(specPath, {
        ...spec,
        updated_at: new Date().toISOString(),
        phase: prior ? `${prior}-approved` : 'init',
        approvals,
        ready_for_implementation: false,
        rollback_triggered_by: request.triggeredBy,
      });
      await this.contextCompactionService.invalidateCanonicalHandoff(request);
      const handoff = await this.publishHandoff(request.projectRoot, request.featureName);
      return { featureName: request.featureName, rolledBackPhase, handoff };
    });
  }

  async initializeFeature(request: InitializeFeatureRequest): Promise<Project> {
    return this.withFeatureLock(request.projectRoot, request.featureName, async () => {
      if (!this.fileSystem) throw new Error('FileSystemPort is required for disk-addressed workflow operations');
      validateFeatureName(request.featureName);
      const absoluteProject = path.resolve(request.projectRoot);
      const resolver = new SpecPathResolver(this.fileSystem);
      const canonicalProject = this.fileSystem.realpath
        ? await this.fileSystem.realpath(absoluteProject)
        : absoluteProject;
      await resolver.assertContained(canonicalProject, path.join(canonicalProject, '.spec'));
      await this.fileSystem.mkdir(path.join(canonicalProject, '.spec', 'specs'));
      const resolved = await resolver.resolve(canonicalProject, request.featureName);
      if (await this.fileSystem.exists(resolved.featureRoot)) {
        throw new Error(`Feature already exists: ${request.featureName}`);
      }

      const project = await this.projectService.createProject(
        request.featureName,
        resolved.projectRoot,
        request.language,
        { reviewTestCases: request.reviewTestCases },
      );
      try {
        const rendered = await this.templateService.generateSpecJson(project);
        const parsed = JSON.parse(rendered) as Record<string, unknown>;
        await this.writeSpecAtomic(path.join(resolved.featureRoot, 'spec.json'), parsed);
        return project;
      } catch (error) {
        await this.projectRepository.delete(project.id);
        throw error;
      }
    });
  }

  async listFeatureStatuses(request: { readonly projectRoot: string }): Promise<DurableFeatureStatus[]> {
    if (!this.fileSystem) throw new Error('FileSystemPort is required for disk-addressed workflow operations');
    const absoluteProject = path.resolve(request.projectRoot);
    const specsRoot = path.join(absoluteProject, '.spec', 'specs');
    if (!(await this.fileSystem.exists(specsRoot))) return [];
    const resolver = new SpecPathResolver(this.fileSystem);
    await resolver.assertContained(absoluteProject, specsRoot);
    const names = (await this.fileSystem.readdir(specsRoot)).sort();
    const results: DurableFeatureStatus[] = [];
    for (const featureName of names) {
      const candidate = path.join(specsRoot, featureName);
      const stat = await this.fileSystem.stat(candidate);
      if (!stat.isDirectory()) continue;
      const project = await this.loadProject({ projectRoot: absoluteProject, featureName });
      results.push({ featureName: project.name, phase: project.phase });
    }
    return results;
  }

  async getFeatureStatus(request: FeatureRequest): Promise<DurableFeatureStatus> {
    const { projectRoot, spec } = await this.readDiskSpec(request.projectRoot, request.featureName);
    const project = await this.hydrateProject(projectRoot, request.featureName, spec);
    const approvals = this.readApprovals(spec);
    const review = this.readReviewState(spec);
    const progression = this.resolveProgression(approvals, review, project.phase);
    return {
      featureName: project.name,
      phase: project.phase,
      currentPhase: project.phase,
      nextPhase: progression.nextPhase,
      canProgress: progression.nextPhase !== undefined && progression.blockers.length === 0,
      blockers: progression.blockers,
      testCases: review,
    };
  }

  async loadProject(request: FeatureRequest): Promise<Project> {
    const { projectRoot, spec } = await this.readDiskSpec(request.projectRoot, request.featureName);
    return this.hydrateProject(projectRoot, request.featureName, spec);
  }

  async generatePhase(request: GeneratePhaseRequest): Promise<string> {
    return this.withFeatureLock(request.projectRoot, request.featureName, async () => {
      const fileSystem = this.requireAtomicFileSystem();
      const { projectRoot, featureRoot, specPath, spec } = await this.readDiskSpec(
        request.projectRoot,
        request.featureName,
      );
      const approvals = this.readApprovals(spec);
      this.assertPhaseCanBeGenerated(request.phase, approvals);
      const project = await this.hydrateProject(projectRoot, request.featureName, spec);
      const content = await this.renderPhase(project, request.phase);
      await this.persistPhaseDocument(
        fileSystem,
        featureRoot,
        request.phase,
        content,
        approvals[request.phase].generated,
      );
      const prospective = this.buildGeneratedSpec(spec, request);
      await this.writeSpecAtomic(specPath, prospective);
      await this.synchronizeRepository(featureRoot, this.readApprovals(prospective));
      return `${this.phaseTitle(request.phase)} document generated for project "${request.featureName}"`;
    });
  }

  async beginImplementation(request: FeatureRequest): Promise<{
    readonly featureName: string;
    readonly phase: WorkflowPhase;
    readonly ready: true;
  }> {
    return this.withFeatureLock(request.projectRoot, request.featureName, async () => {
      const { featureRoot, specPath, spec } = await this.readDiskSpec(request.projectRoot, request.featureName);
      const approvals = this.readApprovals(spec);
      const review = this.readReviewState(spec);
      if (!approvals.tasks.approved) throw new Error('Cannot begin implementation: tasks are not approved');
      if (review.required && !review.reviewed) {
        throw new Error('Cannot begin implementation: test-case review is required');
      }
      if (spec.phase === WorkflowPhase.IMPLEMENTATION && spec.ready_for_implementation === true) {
        return { featureName: request.featureName, phase: WorkflowPhase.IMPLEMENTATION, ready: true };
      }
      const prospective = {
        ...spec,
        updated_at: new Date().toISOString(),
        phase: WorkflowPhase.IMPLEMENTATION,
        ready_for_implementation: true,
      };
      await this.writeSpecAtomic(specPath, prospective);
      await this.synchronizeRepository(featureRoot, approvals);
      return { featureName: request.featureName, phase: WorkflowPhase.IMPLEMENTATION, ready: true };
    });
  }

  private requireAtomicFileSystem(): FileSystemPort & {
    writeFileAtomic(filePath: string, content: string): Promise<void>;
  } {
    if (!this.fileSystem?.writeFileAtomic) {
      throw new Error('FileSystemPort.writeFileAtomic is required for workflow persistence');
    }
    return this.fileSystem as FileSystemPort & {
      writeFileAtomic(filePath: string, content: string): Promise<void>;
    };
  }

  private assertPhaseCanBeGenerated(
    phase: ApprovablePhase,
    approvals: Record<ApprovablePhase, { generated: boolean; approved: boolean }>,
  ): void {
    const phases = ['requirements', 'design', 'tasks'] as ApprovablePhase[];
    for (const prior of phases.slice(0, phases.indexOf(phase))) {
      if (!approvals[prior].approved) {
        throw new Error(`Cannot generate ${phase}: ${prior} is not approved`);
      }
    }
    if (approvals[phase].approved) {
      throw new Error(`Cannot generate ${phase}: phase is already approved`);
    }
  }

  private async persistPhaseDocument(
    fileSystem: FileSystemPort & {
      writeFileAtomic(filePath: string, content: string): Promise<void>;
    },
    featureRoot: string,
    phase: ApprovablePhase,
    content: string,
    alreadyGenerated: boolean,
  ): Promise<void> {
    const resolver = new SpecPathResolver(fileSystem);
    const documentPath = path.join(featureRoot, `${phase}.md`);
    await resolver.assertContained(featureRoot, documentPath);
    if (!(await fileSystem.exists(documentPath))) {
      await fileSystem.writeFileAtomic(documentPath, content);
      return;
    }
    const existing = await fileSystem.readFile(documentPath);
    if (alreadyGenerated || existing !== content) {
      throw new Error(`Cannot generate ${phase}: phase document already exists`);
    }
  }

  private buildGeneratedSpec(
    spec: Record<string, unknown>,
    request: GeneratePhaseRequest,
  ): Record<string, unknown> {
    const approvalRecord = spec.approvals && typeof spec.approvals === 'object'
      ? spec.approvals as Record<string, unknown>
      : {};
    const prospective: Record<string, unknown> = {
      ...spec,
      updated_at: new Date().toISOString(),
      phase: `${request.phase}-generated`,
      approvals: {
        ...approvalRecord,
        [request.phase]: { generated: true, approved: false },
      },
      ready_for_implementation: false,
    };
    if (request.phase !== 'tasks' || typeof request.reviewTestCases !== 'boolean') {
      return prospective;
    }
    const options = spec.workflow_options && typeof spec.workflow_options === 'object'
      ? spec.workflow_options as Record<string, unknown>
      : {};
    const checkpoints = spec.checkpoints && typeof spec.checkpoints === 'object'
      ? spec.checkpoints as Record<string, unknown>
      : {};
    const checkpointKey = 'test_cases' in checkpoints ? 'test_cases' : 'testCases';
    const existingTest = checkpoints[checkpointKey] && typeof checkpoints[checkpointKey] === 'object'
      ? checkpoints[checkpointKey] as Record<string, unknown>
      : {};
    prospective.workflow_options = {
      ...options,
      review_test_cases: request.reviewTestCases,
    };
    prospective.checkpoints = {
      ...checkpoints,
      [checkpointKey]: {
        ...existingTest,
        required: request.reviewTestCases,
        reviewed: !request.reviewTestCases,
      },
    };
    return prospective;
  }

  private async renderPhase(project: Project, phase: ApprovablePhase): Promise<string> {
    if (phase === 'requirements') return this.templateService.generateRequirementsTemplate(project);
    if (phase === 'design') return this.templateService.generateDesignTemplate(project);
    return this.templateService.generateTasksTemplate(project);
  }

  private phaseTitle(phase: ApprovablePhase): string {
    if (phase === 'requirements') return 'Requirements';
    if (phase === 'design') return 'Design';
    return 'Tasks';
  }

  private async hydrateProject(
    projectRoot: string,
    featureName: string,
    spec: Record<string, unknown>,
  ): Promise<Project> {
    const persistedName = typeof spec.feature_name === 'string'
      ? spec.feature_name
      : typeof spec.name === 'string'
        ? spec.name
        : undefined;
    if (persistedName !== undefined && persistedName !== featureName) {
      throw new Error(`Feature metadata name does not match directory: ${featureName}`);
    }
    const approvals = this.readApprovals(spec);
    const review = this.readReviewState(spec);
    const existing = (await this.projectRepository.list()).find((candidate) => candidate.name === featureName);
    const project: Project = {
      id: existing?.id ?? `disk:${featureName}`,
      name: featureName,
      path: projectRoot,
      phase: this.readWorkflowPhase(spec, approvals),
      metadata: {
        createdAt: this.readDate(spec.created_at ?? spec.createdAt),
        updatedAt: this.readDate(spec.updated_at ?? spec.updatedAt),
        language: typeof spec.language === 'string' ? spec.language : 'en',
        approvals,
        workflowOptions: { reviewTestCases: review.required },
        checkpoints: { testCases: review },
      },
    };
    await this.projectRepository.save(project);
    return project;
  }

  private readDate(value: unknown): Date {
    if (typeof value === 'string' || value instanceof Date) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(0);
  }

  private readWorkflowPhase(
    spec: Record<string, unknown>,
    approvals: Record<ApprovablePhase, { generated: boolean; approved: boolean }>,
  ): WorkflowPhase {
    const phase = typeof spec.phase === 'string' ? spec.phase : '';
    if (phase.startsWith('implementation')) return WorkflowPhase.IMPLEMENTATION;
    if (phase.startsWith('tasks') || approvals.tasks.generated) return WorkflowPhase.TASKS;
    if (phase.startsWith('design') || approvals.design.generated) return WorkflowPhase.DESIGN;
    if (phase.startsWith('requirements') || approvals.requirements.generated) return WorkflowPhase.REQUIREMENTS;
    return WorkflowPhase.INIT;
  }

  private resolveProgression(
    approvals: Record<ApprovablePhase, { generated: boolean; approved: boolean }>,
    review: { required: boolean; reviewed: boolean },
    currentPhase: WorkflowPhase,
  ): { nextPhase?: WorkflowPhase; blockers: string[] } {
    if (currentPhase === WorkflowPhase.IMPLEMENTATION) return { blockers: [] };
    if (!approvals.requirements.generated) return { nextPhase: WorkflowPhase.REQUIREMENTS, blockers: [] };
    if (!approvals.requirements.approved) {
      return { nextPhase: WorkflowPhase.DESIGN, blockers: ['Requirements must be approved'] };
    }
    if (!approvals.design.generated) return { nextPhase: WorkflowPhase.DESIGN, blockers: [] };
    if (!approvals.design.approved) {
      return { nextPhase: WorkflowPhase.TASKS, blockers: ['Design must be approved'] };
    }
    if (!approvals.tasks.generated) return { nextPhase: WorkflowPhase.TASKS, blockers: [] };
    if (!approvals.tasks.approved) {
      return { nextPhase: WorkflowPhase.IMPLEMENTATION, blockers: ['Tasks must be approved'] };
    }
    if (review.required && !review.reviewed) {
      return { nextPhase: WorkflowPhase.IMPLEMENTATION, blockers: ['Test cases must be reviewed'] };
    }
    return { nextPhase: WorkflowPhase.IMPLEMENTATION, blockers: [] };
  }

  private async withFeatureLock<T>(
    projectRoot: string,
    featureName: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${path.resolve(projectRoot)}\0${featureName}`;
    const previous = WorkflowEngineService.featureLocks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const current = previous.then(() => gate);
    WorkflowEngineService.featureLocks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (WorkflowEngineService.featureLocks.get(key) === current) {
        WorkflowEngineService.featureLocks.delete(key);
      }
    }
  }

  private async readDiskSpec(projectRoot: string, featureName: string): Promise<{
    projectRoot: string;
    featureRoot: string;
    specPath: string;
    spec: Record<string, unknown>;
  }> {
    if (!this.fileSystem) throw new Error('FileSystemPort is required for disk-addressed workflow operations');
    const resolver = new SpecPathResolver(this.fileSystem);
    const resolved = await resolver.resolve(projectRoot, featureName);
    const specPath = path.join(resolved.featureRoot, 'spec.json');
    await resolver.assertContained(resolved.featureRoot, specPath);
    if (!(await this.fileSystem.exists(specPath))) throw new Error(`Feature metadata not found: ${featureName}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await this.fileSystem.readFile(specPath));
    } catch {
      throw new Error(`Feature metadata is malformed: ${featureName}`);
    }
    if (!parsed || typeof parsed !== 'object') throw new Error(`Feature metadata is invalid: ${featureName}`);
    const record = parsed as Record<string, unknown>;
    const persistedName = typeof record.feature_name === 'string'
      ? record.feature_name
      : typeof record.name === 'string'
        ? record.name
        : undefined;
    if (persistedName !== undefined && persistedName !== featureName) {
      throw new Error(`Feature metadata name does not match directory: ${featureName}`);
    }
    return { projectRoot: resolved.projectRoot, featureRoot: resolved.featureRoot, specPath, spec: record };
  }

  private readApprovals(spec: Record<string, unknown>): Record<ApprovablePhase, { generated: boolean; approved: boolean }> {
    const value = spec.approvals;
    if (!value || typeof value !== 'object') throw new Error('Feature metadata has no approval state');
    const record = value as Record<string, unknown>;
    const result = {} as Record<ApprovablePhase, { generated: boolean; approved: boolean }>;
    for (const phase of ['requirements', 'design', 'tasks'] as ApprovablePhase[]) {
      const phaseValue = record[phase];
      const state = phaseValue && typeof phaseValue === 'object' ? phaseValue as Record<string, unknown> : {};
      result[phase] = { generated: state.generated === true, approved: state.approved === true };
    }
    return result;
  }

  private readReviewState(spec: Record<string, unknown>): { required: boolean; reviewed: boolean } {
    const checkpointsValue = spec.checkpoints;
    const checkpoints = checkpointsValue && typeof checkpointsValue === 'object'
      ? checkpointsValue as Record<string, unknown>
      : {};
    const testValue = checkpoints.test_cases ?? checkpoints.testCases;
    const test = testValue && typeof testValue === 'object' ? testValue as Record<string, unknown> : {};
    const optionsValue = spec.workflow_options ?? spec.workflowOptions;
    const options = optionsValue && typeof optionsValue === 'object' ? optionsValue as Record<string, unknown> : {};
    return {
      required: test.required === true || options.review_test_cases === true || options.reviewTestCases === true,
      reviewed: test.reviewed === true,
    };
  }

  private async writeSpecAtomic(specPath: string, spec: Record<string, unknown>): Promise<void> {
    if (!this.fileSystem?.writeFileAtomic) throw new Error('FileSystemPort.writeFileAtomic is required for workflow persistence');
    await this.fileSystem.writeFileAtomic(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  }

  private async publishHandoff(projectRoot: string, featureName: string): Promise<HandoffPublication> {
    try {
      const result = await this.contextCompactionService.loadContext({ projectRoot, featureName, mode: 'compact' });
      return {
        status: 'published',
        path: path.join(projectRoot, '.spec', 'specs', featureName, 'context', 'handoff.md'),
        fingerprint: result.fingerprint,
        payloadEstimatedTokens: result.payloadEstimatedTokens,
      };
    } catch (error) {
      try {
        await this.contextCompactionService.invalidateCanonicalHandoff({ projectRoot, featureName });
      } catch {
        // A missing cache is already invalid; publication remains repairable.
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Workflow state committed but handoff publication failed', { featureName, message });
      return {
        status: 'pending-regeneration',
        warning: { code: 'HandoffPublicationFailed', message },
      };
    }
  }

  private async synchronizeRepository(
    featureRoot: string,
    approvals: Record<ApprovablePhase, { generated: boolean; approved: boolean }>,
  ): Promise<void> {
    const projects = await this.projectRepository.list();
    const existing = projects.find((project) => project.name === path.basename(featureRoot));
    if (!existing) return;
    await this.projectRepository.save({
      ...existing,
      metadata: {
        ...existing.metadata,
        updatedAt: new Date(),
        approvals,
      },
    });
  }
}
