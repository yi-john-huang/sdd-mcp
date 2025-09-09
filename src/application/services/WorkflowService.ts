import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { Project, WorkflowPhase } from '../../domain/types.js';
import { ProjectRepository, LoggerPort } from '../../domain/ports.js';

export interface WorkflowValidationResult {
  canProgress: boolean;
  reason?: string;
  requiredApprovals?: string[];
}

@injectable()
export class WorkflowService {
  constructor(
    @inject(TYPES.ProjectRepository) private readonly projectRepository: ProjectRepository,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  async validatePhaseTransition(
    projectId: string, 
    targetPhase: WorkflowPhase
  ): Promise<WorkflowValidationResult> {
    const correlationId = uuidv4();
    
    this.logger.info('Validating phase transition', {
      correlationId,
      projectId,
      targetPhase
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        canProgress: false,
        reason: `Project not found: ${projectId}`
      };
    }

    const validation = this.getPhaseValidation(project, targetPhase);
    
    this.logger.info('Phase transition validation result', {
      correlationId,
      projectId,
      currentPhase: project.phase,
      targetPhase,
      canProgress: validation.canProgress,
      reason: validation.reason
    });

    return validation;
  }

  private getPhaseValidation(project: Project, targetPhase: WorkflowPhase): WorkflowValidationResult {
    const { phase, metadata } = project;
    const { approvals } = metadata;

    switch (targetPhase) {
      case WorkflowPhase.REQUIREMENTS:
        if (phase !== WorkflowPhase.INIT) {
          return {
            canProgress: false,
            reason: 'Requirements phase can only be entered from INIT phase'
          };
        }
        return { canProgress: true };

      case WorkflowPhase.DESIGN:
        if (!approvals.requirements.generated || !approvals.requirements.approved) {
          return {
            canProgress: false,
            reason: 'Requirements must be generated and approved before design phase',
            requiredApprovals: ['requirements']
          };
        }
        return { canProgress: true };

      case WorkflowPhase.TASKS:
        if (!approvals.design.generated || !approvals.design.approved) {
          return {
            canProgress: false,
            reason: 'Design must be generated and approved before tasks phase',
            requiredApprovals: ['design']
          };
        }
        return { canProgress: true };

      case WorkflowPhase.IMPLEMENTATION:
        if (!approvals.tasks.generated || !approvals.tasks.approved) {
          return {
            canProgress: false,
            reason: 'Tasks must be generated and approved before implementation phase',
            requiredApprovals: ['tasks']
          };
        }
        return { canProgress: true };

      default:
        return {
          canProgress: false,
          reason: `Unknown target phase: ${targetPhase}`
        };
    }
  }

  async getWorkflowStatus(projectId: string): Promise<{
    project: Project;
    currentPhase: WorkflowPhase;
    nextPhase?: WorkflowPhase;
    canProgress: boolean;
    blockers?: string[];
  } | null> {
    const correlationId = uuidv4();
    
    this.logger.info('Getting workflow status', {
      correlationId,
      projectId
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return null;
    }

    const nextPhase = this.getNextPhase(project.phase);
    let canProgress = false;
    let blockers: string[] = [];

    if (nextPhase) {
      const validation = await this.validatePhaseTransition(projectId, nextPhase);
      canProgress = validation.canProgress;
      if (!canProgress && validation.reason) {
        blockers.push(validation.reason);
      }
    }

    return {
      project,
      currentPhase: project.phase,
      nextPhase,
      canProgress,
      blockers: blockers.length > 0 ? blockers : undefined
    };
  }

  private getNextPhase(currentPhase: WorkflowPhase): WorkflowPhase | undefined {
    switch (currentPhase) {
      case WorkflowPhase.INIT:
        return WorkflowPhase.REQUIREMENTS;
      case WorkflowPhase.REQUIREMENTS:
        return WorkflowPhase.DESIGN;
      case WorkflowPhase.DESIGN:
        return WorkflowPhase.TASKS;
      case WorkflowPhase.TASKS:
        return WorkflowPhase.IMPLEMENTATION;
      case WorkflowPhase.IMPLEMENTATION:
        return undefined; // Final phase
      default:
        return undefined;
    }
  }
}