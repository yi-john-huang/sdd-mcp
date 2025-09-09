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
  ValidationPort 
} from '../../domain/ports.js';
import { 
  WorkflowStateMachine, 
  WorkflowAuditEntry 
} from '../../domain/workflow/WorkflowStateMachine.js';
import { ProjectService } from './ProjectService.js';
import { TemplateService } from './TemplateService.js';

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

  constructor(
    @inject(TYPES.ProjectRepository) private readonly projectRepository: ProjectRepository,
    @inject(TYPES.ProjectService) private readonly projectService: ProjectService,
    @inject(TYPES.TemplateService) private readonly templateService: TemplateService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.ValidationPort) private readonly validation: ValidationPort
  ) {
    this.stateMachine = new WorkflowStateMachine();
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

    this.logger.info('Approval status updated successfully', {
      correlationId,
      projectId,
      phase,
      canProgressToNext
    });

    return {
      success: true,
      updatedProject,
      message,
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
}