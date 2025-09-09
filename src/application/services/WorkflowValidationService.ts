import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { 
  Project, 
  WorkflowPhase, 
  PhaseApprovals,
  Requirement,
  Task 
} from '../../domain/types.js';
import { 
  ProjectRepository, 
  FileSystemPort, 
  ValidationPort,
  LoggerPort 
} from '../../domain/ports.js';
import { WorkflowStateMachine } from '../../domain/workflow/WorkflowStateMachine.js';

export interface PhaseCompletionValidation {
  isComplete: boolean;
  missingItems: string[];
  qualityIssues: string[];
  readinessScore: number; // 0-100
  recommendations: string[];
}

export interface CrossPhaseValidation {
  isConsistent: boolean;
  inconsistencies: string[];
  traceabilityIssues: string[];
  coverageGaps: string[];
}

export interface WorkflowRollbackValidation {
  canRollback: boolean;
  reason?: string;
  impactedItems: string[];
  rollbackActions: string[];
}

@injectable()
export class WorkflowValidationService {
  private readonly stateMachine: WorkflowStateMachine;

  constructor(
    @inject(TYPES.ProjectRepository) private readonly projectRepository: ProjectRepository,
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.ValidationPort) private readonly validation: ValidationPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {
    this.stateMachine = new WorkflowStateMachine();
  }

  async validateRequirementsCompletion(projectId: string): Promise<PhaseCompletionValidation> {
    const correlationId = uuidv4();
    
    this.logger.info('Validating requirements completion', {
      correlationId,
      projectId
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        isComplete: false,
        missingItems: ['Project not found'],
        qualityIssues: [],
        readinessScore: 0,
        recommendations: []
      };
    }

    const missingItems: string[] = [];
    const qualityIssues: string[] = [];
    const recommendations: string[] = [];
    let readinessScore = 0;

    try {
      // Check if requirements document exists
      const requirementsPath = `${project.path}/.kiro/specs/${project.name}/requirements.md`;
      if (!(await this.fileSystem.exists(requirementsPath))) {
        missingItems.push('requirements.md file not found');
      } else {
        const content = await this.fileSystem.readFile(requirementsPath);
        
        // Basic content validation
        if (content.trim().length < 100) {
          qualityIssues.push('Requirements document is too short (less than 100 characters)');
        }

        // Check for EARS format patterns
        const earsPatterns = ['WHEN', 'WHERE', 'IF', 'THEN', 'SHALL'];
        const hasEarsFormat = earsPatterns.some(pattern => content.includes(pattern));
        if (!hasEarsFormat) {
          qualityIssues.push('Requirements do not follow EARS format (missing WHEN/WHERE/IF...THEN/SHALL patterns)');
        } else {
          readinessScore += 30;
        }

        // Check for acceptance criteria
        if (content.includes('Acceptance Criteria') || content.includes('acceptance criteria')) {
          readinessScore += 20;
        } else {
          missingItems.push('Acceptance criteria sections');
        }

        // Check for requirement numbering
        const requirementCount = (content.match(/### Requirement \d+:/g) || []).length;
        if (requirementCount === 0) {
          missingItems.push('Numbered requirement sections');
        } else {
          readinessScore += 20;
        }

        if (requirementCount >= 3) {
          readinessScore += 10; // Bonus for having multiple requirements
        }
      }

      // Check approval status
      if (project.metadata.approvals.requirements.generated) {
        readinessScore += 10;
      } else {
        missingItems.push('Requirements generation flag');
      }

      if (project.metadata.approvals.requirements.approved) {
        readinessScore += 10;
      } else {
        recommendations.push('Requirements need review and approval before proceeding to design');
      }

      // Generate recommendations
      if (missingItems.length > 0) {
        recommendations.push('Complete missing requirements items before approval');
      }
      
      if (qualityIssues.length > 0) {
        recommendations.push('Address quality issues to improve requirements clarity');
      }

      if (readinessScore >= 80) {
        recommendations.push('Requirements are ready for design phase');
      } else if (readinessScore >= 60) {
        recommendations.push('Requirements need minor improvements before design');
      } else {
        recommendations.push('Requirements need significant work before design phase');
      }

      this.logger.info('Requirements validation completed', {
        correlationId,
        projectId,
        readinessScore,
        missingCount: missingItems.length,
        qualityIssueCount: qualityIssues.length
      });

      return {
        isComplete: missingItems.length === 0 && qualityIssues.length === 0,
        missingItems,
        qualityIssues,
        readinessScore: Math.min(readinessScore, 100),
        recommendations
      };

    } catch (error) {
      this.logger.error('Requirements validation failed', error as Error, {
        correlationId,
        projectId
      });

      return {
        isComplete: false,
        missingItems: [`Validation error: ${(error as Error).message}`],
        qualityIssues: [],
        readinessScore: 0,
        recommendations: ['Fix validation errors and try again']
      };
    }
  }

  async validateDesignApproval(projectId: string): Promise<PhaseCompletionValidation> {
    const correlationId = uuidv4();
    
    this.logger.info('Validating design approval readiness', {
      correlationId,
      projectId
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        isComplete: false,
        missingItems: ['Project not found'],
        qualityIssues: [],
        readinessScore: 0,
        recommendations: []
      };
    }

    const missingItems: string[] = [];
    const qualityIssues: string[] = [];
    const recommendations: string[] = [];
    let readinessScore = 0;

    try {
      // Check if design document exists
      const designPath = `${project.path}/.kiro/specs/${project.name}/design.md`;
      if (!(await this.fileSystem.exists(designPath))) {
        missingItems.push('design.md file not found');
      } else {
        const content = await this.fileSystem.readFile(designPath);
        
        // Basic content validation
        if (content.trim().length < 200) {
          qualityIssues.push('Design document is too short (less than 200 characters)');
        }

        // Check for key design sections
        const designSections = [
          'Architecture',
          'Components',
          'Interface',
          'Data Model',
          'Technology'
        ];

        let foundSections = 0;
        for (const section of designSections) {
          if (content.toLowerCase().includes(section.toLowerCase())) {
            foundSections++;
          }
        }

        readinessScore += (foundSections / designSections.length) * 40;
        
        if (foundSections < 3) {
          missingItems.push(`Design missing key sections (found ${foundSections}/${designSections.length})`);
        }

        // Check for architectural diagrams or descriptions
        if (content.includes('```') || content.includes('diagram') || content.includes('architecture')) {
          readinessScore += 20;
        } else {
          qualityIssues.push('Design lacks architectural diagrams or detailed descriptions');
        }

        // Check for technology decisions
        if (content.toLowerCase().includes('technology') || content.toLowerCase().includes('stack')) {
          readinessScore += 15;
        } else {
          missingItems.push('Technology stack decisions');
        }
      }

      // Validate requirements are approved first
      if (!project.metadata.approvals.requirements.approved) {
        missingItems.push('Requirements must be approved before design approval');
      } else {
        readinessScore += 15;
      }

      // Check approval status
      if (project.metadata.approvals.design.generated) {
        readinessScore += 5;
      } else {
        missingItems.push('Design generation flag');
      }

      if (project.metadata.approvals.design.approved) {
        readinessScore += 5;
      } else {
        recommendations.push('Design needs review and approval before proceeding to tasks');
      }

      // Generate recommendations
      if (readinessScore >= 80) {
        recommendations.push('Design is ready for tasks phase');
      } else if (readinessScore >= 60) {
        recommendations.push('Design needs minor improvements before tasks');
      } else {
        recommendations.push('Design needs significant work before tasks phase');
      }

      this.logger.info('Design validation completed', {
        correlationId,
        projectId,
        readinessScore,
        missingCount: missingItems.length,
        qualityIssueCount: qualityIssues.length
      });

      return {
        isComplete: missingItems.length === 0 && qualityIssues.length === 0,
        missingItems,
        qualityIssues,
        readinessScore: Math.min(readinessScore, 100),
        recommendations
      };

    } catch (error) {
      this.logger.error('Design validation failed', error as Error, {
        correlationId,
        projectId
      });

      return {
        isComplete: false,
        missingItems: [`Validation error: ${(error as Error).message}`],
        qualityIssues: [],
        readinessScore: 0,
        recommendations: ['Fix validation errors and try again']
      };
    }
  }

  async validateTaskApproval(projectId: string): Promise<PhaseCompletionValidation> {
    const correlationId = uuidv4();
    
    this.logger.info('Validating task approval readiness', {
      correlationId,
      projectId
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        isComplete: false,
        missingItems: ['Project not found'],
        qualityIssues: [],
        readinessScore: 0,
        recommendations: []
      };
    }

    const missingItems: string[] = [];
    const qualityIssues: string[] = [];
    const recommendations: string[] = [];
    let readinessScore = 0;

    try {
      // Check if tasks document exists
      const tasksPath = `${project.path}/.kiro/specs/${project.name}/tasks.md`;
      if (!(await this.fileSystem.exists(tasksPath))) {
        missingItems.push('tasks.md file not found');
      } else {
        const content = await this.fileSystem.readFile(tasksPath);
        
        // Basic content validation
        if (content.trim().length < 150) {
          qualityIssues.push('Tasks document is too short (less than 150 characters)');
        }

        // Count tasks
        const taskMatches = content.match(/- \[ \] \d+\./g) || [];
        const taskCount = taskMatches.length;

        if (taskCount === 0) {
          missingItems.push('No tasks found in checkbox format');
        } else {
          readinessScore += Math.min(taskCount * 5, 30); // Up to 30 points for tasks
        }

        // Check for requirement references
        const requirementRefs = (content.match(/_Requirements: /g) || []).length;
        if (requirementRefs === 0) {
          qualityIssues.push('Tasks missing requirement traceability references');
        } else {
          readinessScore += 20;
        }

        // Check for subtasks
        const subtaskMatches = content.match(/  - [A-Z]/g) || [];
        if (subtaskMatches.length === 0) {
          qualityIssues.push('Tasks missing detailed subtasks');
        } else {
          readinessScore += 15;
        }

        // Check task categories/organization
        if (content.includes('# Implementation Plan') || content.includes('## ')) {
          readinessScore += 10;
        } else {
          qualityIssues.push('Tasks lack proper organization/categorization');
        }
      }

      // Validate design is approved first
      if (!project.metadata.approvals.design.approved) {
        missingItems.push('Design must be approved before task approval');
      } else {
        readinessScore += 15;
      }

      // Check approval status
      if (project.metadata.approvals.tasks.generated) {
        readinessScore += 5;
      } else {
        missingItems.push('Tasks generation flag');
      }

      if (project.metadata.approvals.tasks.approved) {
        readinessScore += 5;
      } else {
        recommendations.push('Tasks need review and approval before proceeding to implementation');
      }

      // Generate recommendations
      if (readinessScore >= 80) {
        recommendations.push('Tasks are ready for implementation phase');
        recommendations.push('Begin implementing tasks in order of priority');
      } else if (readinessScore >= 60) {
        recommendations.push('Tasks need minor improvements before implementation');
      } else {
        recommendations.push('Tasks need significant work before implementation phase');
      }

      this.logger.info('Tasks validation completed', {
        correlationId,
        projectId,
        readinessScore,
        missingCount: missingItems.length,
        qualityIssueCount: qualityIssues.length
      });

      return {
        isComplete: missingItems.length === 0 && qualityIssues.length === 0,
        missingItems,
        qualityIssues,
        readinessScore: Math.min(readinessScore, 100),
        recommendations
      };

    } catch (error) {
      this.logger.error('Tasks validation failed', error as Error, {
        correlationId,
        projectId
      });

      return {
        isComplete: false,
        missingItems: [`Validation error: ${(error as Error).message}`],
        qualityIssues: [],
        readinessScore: 0,
        recommendations: ['Fix validation errors and try again']
      };
    }
  }

  async validateCrossPhaseConsistency(projectId: string): Promise<CrossPhaseValidation> {
    const correlationId = uuidv4();
    
    this.logger.info('Validating cross-phase consistency', {
      correlationId,
      projectId
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        isConsistent: false,
        inconsistencies: ['Project not found'],
        traceabilityIssues: [],
        coverageGaps: []
      };
    }

    const inconsistencies: string[] = [];
    const traceabilityIssues: string[] = [];
    const coverageGaps: string[] = [];

    try {
      const basePath = `${project.path}/.kiro/specs/${project.name}`;
      
      // Read all phase documents
      const documents: { [key: string]: string } = {};
      const files = ['requirements.md', 'design.md', 'tasks.md'];
      
      for (const file of files) {
        const filePath = `${basePath}/${file}`;
        if (await this.fileSystem.exists(filePath)) {
          documents[file] = await this.fileSystem.readFile(filePath);
        }
      }

      // Validate Requirements -> Design traceability
      if (documents['requirements.md'] && documents['design.md']) {
        const requirements = documents['requirements.md'];
        const design = documents['design.md'];
        
        // Extract requirement titles
        const reqMatches = requirements.match(/### Requirement \d+: (.+)/g) || [];
        const requirementTitles = reqMatches.map(match => 
          match.replace(/### Requirement \d+: /, '').trim()
        );

        // Check if design addresses all requirements
        for (const reqTitle of requirementTitles) {
          const keywords = reqTitle.split(' ').filter(word => word.length > 3);
          const hasReference = keywords.some(keyword => 
            design.toLowerCase().includes(keyword.toLowerCase())
          );
          
          if (!hasReference) {
            traceabilityIssues.push(`Design may not address requirement: "${reqTitle}"`);
          }
        }
      }

      // Validate Design -> Tasks traceability
      if (documents['design.md'] && documents['tasks.md']) {
        const design = documents['design.md'];
        const tasks = documents['tasks.md'];

        // Look for component mentions in design
        const componentMatches = design.match(/## (.+Component|.+Service|.+Manager)/g) || [];
        const components = componentMatches.map(match => 
          match.replace('## ', '').trim()
        );

        // Check if tasks cover all components
        for (const component of components) {
          const keywords = component.split(' ').filter(word => word.length > 3);
          const hasCoverage = keywords.some(keyword => 
            tasks.toLowerCase().includes(keyword.toLowerCase())
          );
          
          if (!hasCoverage) {
            coverageGaps.push(`Tasks may not cover design component: "${component}"`);
          }
        }
      }

      // Validate phase consistency with project metadata
      const { phase, metadata } = project;
      
      if (phase === WorkflowPhase.REQUIREMENTS && !metadata.approvals.requirements.generated) {
        inconsistencies.push('Project in requirements phase but requirements not marked as generated');
      }
      
      if (phase === WorkflowPhase.DESIGN && !metadata.approvals.design.generated) {
        inconsistencies.push('Project in design phase but design not marked as generated');
      }
      
      if (phase === WorkflowPhase.TASKS && !metadata.approvals.tasks.generated) {
        inconsistencies.push('Project in tasks phase but tasks not marked as generated');
      }

      // Check for orphaned approvals (approved but not generated)
      Object.entries(metadata.approvals).forEach(([phaseName, approval]) => {
        if (approval.approved && !approval.generated) {
          inconsistencies.push(`${phaseName} marked as approved but not generated`);
        }
      });

      this.logger.info('Cross-phase validation completed', {
        correlationId,
        projectId,
        inconsistencyCount: inconsistencies.length,
        traceabilityIssueCount: traceabilityIssues.length,
        coverageGapCount: coverageGaps.length
      });

      return {
        isConsistent: inconsistencies.length === 0 && 
                     traceabilityIssues.length === 0 && 
                     coverageGaps.length === 0,
        inconsistencies,
        traceabilityIssues,
        coverageGaps
      };

    } catch (error) {
      this.logger.error('Cross-phase validation failed', error as Error, {
        correlationId,
        projectId
      });

      return {
        isConsistent: false,
        inconsistencies: [`Validation error: ${(error as Error).message}`],
        traceabilityIssues: [],
        coverageGaps: []
      };
    }
  }

  async validateWorkflowRollback(
    projectId: string, 
    targetPhase: WorkflowPhase
  ): Promise<WorkflowRollbackValidation> {
    const correlationId = uuidv4();
    
    this.logger.info('Validating workflow rollback', {
      correlationId,
      projectId,
      targetPhase
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return {
        canRollback: false,
        reason: 'Project not found',
        impactedItems: [],
        rollbackActions: []
      };
    }

    const impactedItems: string[] = [];
    const rollbackActions: string[] = [];

    try {
      // Check if rollback is valid
      const validation = this.stateMachine.canTransition(project, targetPhase);
      if (!validation.allowed) {
        return {
          canRollback: false,
          reason: validation.reason,
          impactedItems: [],
          rollbackActions: []
        };
      }

      // Identify impacted items based on rollback target
      const currentPhase = project.phase;
      
      switch (currentPhase) {
        case WorkflowPhase.REQUIREMENTS:
          if (targetPhase === WorkflowPhase.INIT) {
            impactedItems.push('Requirements document and approval status');
            rollbackActions.push('Reset requirements approval status');
            rollbackActions.push('Optionally backup requirements.md');
          }
          break;

        case WorkflowPhase.DESIGN:
          if (targetPhase === WorkflowPhase.REQUIREMENTS) {
            impactedItems.push('Design document and approval status');
            rollbackActions.push('Reset design approval status');
            rollbackActions.push('Optionally backup design.md');
          }
          break;

        case WorkflowPhase.TASKS:
          if (targetPhase === WorkflowPhase.DESIGN) {
            impactedItems.push('Tasks document and approval status');
            rollbackActions.push('Reset tasks approval status');
            rollbackActions.push('Optionally backup tasks.md');
          }
          break;

        case WorkflowPhase.IMPLEMENTATION:
          if (targetPhase === WorkflowPhase.TASKS) {
            impactedItems.push('Implementation progress');
            rollbackActions.push('Implementation work may be lost');
            rollbackActions.push('Consider backing up current implementation');
          }
          break;
      }

      // Add general rollback actions
      rollbackActions.push('Update project phase in spec.json');
      rollbackActions.push('Update project metadata timestamps');
      rollbackActions.push('Create audit trail entry');

      this.logger.info('Workflow rollback validation completed', {
        correlationId,
        projectId,
        currentPhase,
        targetPhase,
        impactedCount: impactedItems.length
      });

      return {
        canRollback: true,
        impactedItems,
        rollbackActions
      };

    } catch (error) {
      this.logger.error('Workflow rollback validation failed', error as Error, {
        correlationId,
        projectId,
        targetPhase
      });

      return {
        canRollback: false,
        reason: `Validation error: ${(error as Error).message}`,
        impactedItems: [],
        rollbackActions: []
      };
    }
  }

  async generateComprehensiveValidationReport(projectId: string): Promise<{
    project: Project;
    overall: {
      isValid: boolean;
      readinessScore: number;
      phase: WorkflowPhase;
      canProgress: boolean;
    };
    phases: {
      requirements: PhaseCompletionValidation;
      design: PhaseCompletionValidation;
      tasks: PhaseCompletionValidation;
    };
    crossPhase: CrossPhaseValidation;
    recommendations: string[];
    nextActions: string[];
  } | null> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return null;
    }

    const phases = {
      requirements: await this.validateRequirementsCompletion(projectId),
      design: await this.validateDesignApproval(projectId),
      tasks: await this.validateTaskApproval(projectId)
    };

    const crossPhase = await this.validateCrossPhaseConsistency(projectId);

    // Calculate overall readiness
    const phaseScores = [
      phases.requirements.readinessScore,
      phases.design.readinessScore,
      phases.tasks.readinessScore
    ];
    const overallScore = Math.round(phaseScores.reduce((sum, score) => sum + score, 0) / 3);

    // Determine overall validity
    const isValid = phases.requirements.isComplete && 
                   phases.design.isComplete && 
                   phases.tasks.isComplete && 
                   crossPhase.isConsistent;

    // Check if can progress
    const nextPhase = this.stateMachine.getNextPhase(project.phase);
    const canProgress = nextPhase ? 
      this.stateMachine.canTransition(project, nextPhase).allowed : false;

    // Collect recommendations
    const recommendations = [
      ...phases.requirements.recommendations,
      ...phases.design.recommendations,
      ...phases.tasks.recommendations
    ];

    // Generate next actions
    const nextActions: string[] = [];
    if (!canProgress && nextPhase) {
      nextActions.push(`Complete requirements for ${nextPhase} phase progression`);
    }
    
    if (crossPhase.inconsistencies.length > 0) {
      nextActions.push('Resolve cross-phase consistency issues');
    }
    
    if (isValid && canProgress) {
      nextActions.push('Project is ready for phase progression');
    }

    return {
      project,
      overall: {
        isValid,
        readinessScore: overallScore,
        phase: project.phase,
        canProgress
      },
      phases,
      crossPhase,
      recommendations: [...new Set(recommendations)], // Remove duplicates
      nextActions
    };
  }
}