import path from 'node:path';
import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { 
  Project, 
  WorkflowPhase, 
  PhaseApprovals 
} from '../../domain/types.js';
import {
  ProjectRepository,
  LoggerPort,
  ValidationPort,
  FileSystemPort,
} from '../../domain/ports.js';
import { 
  WorkflowStateMachine, 
  WorkflowAuditEntry 
} from '../../domain/workflow/WorkflowStateMachine.js';
import { ProjectService } from './ProjectService.js';
import { TemplateService } from './TemplateService.js';
import { ContextCompactionService, HandoffResult, ApprovablePhase } from './ContextCompactionService.js';
import { SpecPathResolver } from './SpecPathResolver.js';

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

export interface WorkflowProgressionResult {
  success: boolean;
  updatedProject?: Project;
  message: string;
  auditEntry?: WorkflowAuditEntry;
  nextSteps?: string[];
}

export interface WorkflowRollbackResult {
  success: boolean;
  updatedProject?: Project;
  message: string;
  auditEntry?: WorkflowAuditEntry;
}

@injectable()
export class WorkflowEngineService {
  private readonly stateMachine: WorkflowStateMachine;
  private static readonly featureLocks = new Map<string, Promise<void>>();

  constructor(
    @inject(TYPES.ProjectRepository) private readonly projectRepository: ProjectRepository,
    @inject(TYPES.ProjectService) private readonly projectService: ProjectService,
    @inject(TYPES.TemplateService) private readonly templateService: TemplateService,
    @inject(TYPES.ContextCompactionService) private readonly contextCompactionService: ContextCompactionService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.ValidationPort) private readonly validation: ValidationPort,
    @inject(TYPES.FileSystemPort) private readonly fileSystem?: FileSystemPort,
  ) {
    this.stateMachine = new WorkflowStateMachine();
  }

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

  async progressToNextPhase(
    projectId: string, 
    triggeredBy: string
  ): Promise<WorkflowProgressionResult> {
    const correlationId = uuidv4();
    
    this.logger.info('Progressing project to next phase', {
      correlationId,
      projectId,
      triggeredBy
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        success: false,
        message: `Project not found: ${projectId}`
      };
    }

    const nextPhase = this.stateMachine.getNextPhase(project.phase);
    if (!nextPhase) {
      return {
        success: false,
        message: `Project is already at final phase: ${project.phase}`
      };
    }

    return await this.transitionToPhase(projectId, nextPhase, triggeredBy);
  }

  async transitionToPhase(
    projectId: string, 
    targetPhase: WorkflowPhase, 
    triggeredBy: string
  ): Promise<WorkflowProgressionResult> {
    const correlationId = uuidv4();
    
    this.logger.info('Transitioning project to phase', {
      correlationId,
      projectId,
      targetPhase,
      triggeredBy
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        success: false,
        message: `Project not found: ${projectId}`
      };
    }

    if (project.phase === targetPhase) {
      return {
        success: true,
        updatedProject: project,
        message: `Project is already in ${targetPhase} phase`
      };
    }

    const result = await this.stateMachine.executeTransition(
      project, 
      targetPhase, 
      triggeredBy
    );

    if (!result.success) {
      this.logger.warn('Phase transition failed', {
        correlationId,
        projectId,
        fromPhase: project.phase,
        targetPhase,
        error: result.error
      });

      return {
        success: false,
        message: result.error || 'Phase transition failed',
        auditEntry: result.auditEntry
      };
    }

    // Save updated project
    if (result.updatedProject) {
      await this.projectRepository.save(result.updatedProject);
      
      // Generate phase-specific deliverables if needed
      await this.generatePhaseDeliverables(result.updatedProject, targetPhase);
    }

    this.logger.info('Phase transition completed successfully', {
      correlationId,
      projectId,
      fromPhase: project.phase,
      targetPhase
    });

    const nextSteps = this.getNextSteps(result.updatedProject || project, targetPhase);

    return {
      success: true,
      updatedProject: result.updatedProject,
      message: `Project successfully transitioned to ${targetPhase} phase`,
      auditEntry: result.auditEntry,
      nextSteps
    };
  }

  async rollbackToPreviousPhase(
    projectId: string, 
    triggeredBy: string
  ): Promise<WorkflowRollbackResult> {
    const correlationId = uuidv4();
    
    this.logger.info('Rolling back project to previous phase', {
      correlationId,
      projectId,
      triggeredBy
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        success: false,
        message: `Project not found: ${projectId}`
      };
    }

    const previousPhase = this.stateMachine.getPreviousPhase(project.phase);
    if (!previousPhase) {
      return {
        success: false,
        message: `Project is already at initial phase: ${project.phase}`
      };
    }

    const result = await this.stateMachine.executeTransition(
      project, 
      previousPhase, 
      triggeredBy
    );

    if (!result.success) {
      this.logger.warn('Phase rollback failed', {
        correlationId,
        projectId,
        fromPhase: project.phase,
        targetPhase: previousPhase,
        error: result.error
      });

      return {
        success: false,
        message: result.error || 'Phase rollback failed',
        auditEntry: result.auditEntry
      };
    }

    // Save updated project
    if (result.updatedProject) {
      await this.projectRepository.save(result.updatedProject);
      
      // Reset approvals for rolled back phase
      await this.resetPhaseApprovals(result.updatedProject, project.phase);
    }

    this.logger.info('Phase rollback completed successfully', {
      correlationId,
      projectId,
      fromPhase: project.phase,
      targetPhase: previousPhase
    });

    return {
      success: true,
      updatedProject: result.updatedProject,
      message: `Project rolled back to ${previousPhase} phase`,
      auditEntry: result.auditEntry
    };
  }

  async updateApprovalStatus(
    projectId: string, 
    phase: keyof PhaseApprovals, 
    approval: Partial<{ generated: boolean; approved: boolean }>,
    triggeredBy: string
  ): Promise<{
    success: boolean;
    updatedProject?: Project;
    message: string;
    canProgressToNext?: boolean;
  }> {
    const correlationId = uuidv4();
    
    this.logger.info('Updating approval status', {
      correlationId,
      projectId,
      phase,
      approval,
      triggeredBy
    });

    const updatedProject = await this.projectService.updateApprovalStatus(
      projectId, 
      phase, 
      approval
    );

    // Update spec.json file
    const specContent = await this.templateService.generateSpecJson(updatedProject);
    await this.templateService.writeProjectFile(updatedProject, 'spec.json', specContent);

    let handoffResult: HandoffResult | undefined;
    if (approval.approved) {
      handoffResult = await this.contextCompactionService.generatePhaseHandoff(updatedProject, phase);
    }

    // Check if project can progress to next phase
    const nextPhase = this.stateMachine.getNextPhase(updatedProject.phase);
    let canProgressToNext = false;

    if (nextPhase) {
      const validation = this.stateMachine.canTransition(updatedProject, nextPhase);
      canProgressToNext = validation.allowed;
    }

    const message = approval.approved 
      ? `${phase} phase approved and ready for progression`
      : `${phase} phase approval status updated`;
    const messageWithHandoff = handoffResult
      ? `${message}. Compact handoff: ${handoffResult.path} (${handoffResult.estimate.reductionPercentage}% estimated context reduction, ~${handoffResult.estimate.sourceTokens} -> ~${handoffResult.estimate.compactTokens} tokens)`
      : message;

    this.logger.info('Approval status updated successfully', {
      correlationId,
      projectId,
      phase,
      canProgressToNext
    });

    return {
      success: true,
      updatedProject,
      message: messageWithHandoff,
      canProgressToNext
    };
  }

  async getWorkflowStatus(projectId: string): Promise<{
    project: Project;
    progress: ReturnType<WorkflowStateMachine['getPhaseProgress']>;
    auditTrail: WorkflowAuditEntry[];
    integrity: ReturnType<WorkflowStateMachine['validateWorkflowIntegrity']>;
    validTransitions: WorkflowPhase[];
  } | null> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return null;
    }

    return {
      project,
      progress: this.stateMachine.getPhaseProgress(project),
      auditTrail: this.stateMachine.getAuditTrail(projectId),
      integrity: this.stateMachine.validateWorkflowIntegrity(project),
      validTransitions: this.stateMachine.getValidTransitions(project.phase)
    };
  }

  async validateWorkflowState(projectId: string): Promise<{
    isValid: boolean;
    violations: string[];
    recommendations: string[];
    canProgress: boolean;
    nextPhase?: WorkflowPhase;
  }> {
    const status = await this.getWorkflowStatus(projectId);
    if (!status) {
      return {
        isValid: false,
        violations: ['Project not found'],
        recommendations: [],
        canProgress: false
      };
    }

    const integrity = status.integrity;
    const progress = status.progress;

    return {
      isValid: integrity.isValid,
      violations: integrity.violations,
      recommendations: integrity.recommendations,
      canProgress: progress.canProgress,
      nextPhase: progress.nextPhase
    };
  }

  private async generatePhaseDeliverables(
    project: Project, 
    phase: WorkflowPhase
  ): Promise<void> {
    try {
      switch (phase) {
        case WorkflowPhase.REQUIREMENTS:
          if (!project.metadata.approvals.requirements.generated) {
            const content = await this.templateService.generateRequirementsTemplate(project);
            await this.templateService.writeProjectFile(project, 'requirements.md', content);
            await this.projectService.updateApprovalStatus(
              project.id, 
              'requirements', 
              { generated: true }
            );
          }
          break;

        case WorkflowPhase.DESIGN:
          if (!project.metadata.approvals.design.generated) {
            const content = await this.templateService.generateDesignTemplate(project);
            await this.templateService.writeProjectFile(project, 'design.md', content);
            await this.projectService.updateApprovalStatus(
              project.id, 
              'design', 
              { generated: true }
            );
          }
          break;

        case WorkflowPhase.TASKS:
          if (!project.metadata.approvals.tasks.generated) {
            const content = await this.templateService.generateTasksTemplate(project);
            await this.templateService.writeProjectFile(project, 'tasks.md', content);
            await this.projectService.updateApprovalStatus(
              project.id, 
              'tasks', 
              { generated: true }
            );
          }
          break;
      }
    } catch (error) {
      this.logger.error('Failed to generate phase deliverables', error as Error, {
        projectId: project.id,
        phase
      });
    }
  }

  private async resetPhaseApprovals(
    project: Project, 
    rolledBackFromPhase: WorkflowPhase
  ): Promise<void> {
    // Reset approvals for the phase we're rolling back from
    const resetApprovals: Partial<Record<keyof PhaseApprovals, Partial<{ generated: boolean; approved: boolean }>>> = {};

    switch (rolledBackFromPhase) {
      case WorkflowPhase.REQUIREMENTS:
        resetApprovals.requirements = { approved: false };
        break;
      case WorkflowPhase.DESIGN:
        resetApprovals.design = { approved: false };
        break;
      case WorkflowPhase.TASKS:
        resetApprovals.tasks = { approved: false };
        break;
      case WorkflowPhase.IMPLEMENTATION:
        // No approvals to reset for implementation phase
        break;
    }

    for (const [phase, approval] of Object.entries(resetApprovals)) {
      await this.projectService.updateApprovalStatus(
        project.id, 
        phase as keyof PhaseApprovals, 
        approval as Partial<{ generated: boolean; approved: boolean }>
      );
    }
  }

  private getNextSteps(project: Project, currentPhase: WorkflowPhase): string[] {
    const steps: string[] = [];

    switch (currentPhase) {
      case WorkflowPhase.INIT:
        steps.push('Run sdd-requirements to generate requirements document');
        break;

      case WorkflowPhase.REQUIREMENTS:
        if (!project.metadata.approvals.requirements.approved) {
          steps.push('Review and approve requirements document');
          steps.push('Run sdd-design after requirements approval');
        } else {
          steps.push('Run sdd-design to generate technical design');
        }
        break;

      case WorkflowPhase.DESIGN:
        if (!project.metadata.approvals.design.approved) {
          steps.push('Review and approve design document');
          steps.push('Run sdd-tasks after design approval');
        } else {
          steps.push('Run sdd-tasks to generate implementation tasks');
        }
        break;

      case WorkflowPhase.TASKS:
        if (!project.metadata.approvals.tasks.approved) {
          steps.push('Review and approve task breakdown');
          if (project.metadata.checkpoints?.testCases.required && !project.metadata.checkpoints.testCases.reviewed) {
            steps.push('Review TDD test cases and run sdd-review-test-cases');
          }
          steps.push('Begin implementation after tasks approval');
        } else {
          steps.push('Begin implementation following the task breakdown');
          steps.push('Use sdd-quality-check for code reviews');
        }
        break;

      case WorkflowPhase.IMPLEMENTATION:
        steps.push('Continue implementation following approved tasks');
        steps.push('Use sdd-quality-check for ongoing code quality');
        steps.push('Update task completion status as you progress');
        break;
    }

    return steps;
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
    featureRoot: string;
    specPath: string;
    spec: Record<string, unknown>;
  }> {
    if (!this.fileSystem) throw new Error('FileSystemPort is required for disk-addressed workflow operations');
    const resolver = new SpecPathResolver(this.fileSystem);
    const { featureRoot } = await resolver.resolve(projectRoot, featureName);
    const specPath = path.join(featureRoot, 'spec.json');
    await resolver.assertContained(featureRoot, specPath);
    if (!(await this.fileSystem.exists(specPath))) throw new Error(`Feature metadata not found: ${featureName}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await this.fileSystem.readFile(specPath));
    } catch {
      throw new Error(`Feature metadata is malformed: ${featureName}`);
    }
    if (!parsed || typeof parsed !== 'object') throw new Error(`Feature metadata is invalid: ${featureName}`);
    return { featureRoot, specPath, spec: parsed as Record<string, unknown> };
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
