// Domain model for SDD workflow state transitions

import { WorkflowPhase, Project, PhaseApprovals } from '../types.js';

export interface StateTransition {
  from: WorkflowPhase;
  to: WorkflowPhase;
  condition: TransitionCondition;
  action?: TransitionAction;
}

export interface TransitionCondition {
  check: (project: Project) => boolean;
  errorMessage: string;
  requiredApprovals?: (keyof PhaseApprovals)[];
}

export interface TransitionAction {
  execute: (project: Project) => Promise<Project>;
  rollback?: (project: Project) => Promise<Project>;
}

export interface WorkflowAuditEntry {
  id: string;
  projectId: string;
  timestamp: Date;
  fromPhase: WorkflowPhase;
  toPhase: WorkflowPhase;
  triggeredBy: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export class WorkflowStateMachine {
  private readonly transitions: Map<string, StateTransition[]>;
  private readonly auditLog: WorkflowAuditEntry[] = [];

  constructor() {
    this.transitions = new Map();
    this.initializeTransitions();
  }

  private initializeTransitions(): void {
    const transitions: StateTransition[] = [
      // INIT -> REQUIREMENTS
      {
        from: WorkflowPhase.INIT,
        to: WorkflowPhase.REQUIREMENTS,
        condition: {
          check: () => true, // Always allow init -> requirements
          errorMessage: 'Cannot transition from INIT to REQUIREMENTS'
        }
      },

      // REQUIREMENTS -> DESIGN
      {
        from: WorkflowPhase.REQUIREMENTS,
        to: WorkflowPhase.DESIGN,
        condition: {
          check: (project: Project) => 
            project.metadata.approvals.requirements.generated &&
            project.metadata.approvals.requirements.approved,
          errorMessage: 'Requirements must be generated and approved before design phase',
          requiredApprovals: ['requirements']
        }
      },

      // DESIGN -> TASKS
      {
        from: WorkflowPhase.DESIGN,
        to: WorkflowPhase.TASKS,
        condition: {
          check: (project: Project) => 
            project.metadata.approvals.design.generated &&
            project.metadata.approvals.design.approved,
          errorMessage: 'Design must be generated and approved before tasks phase',
          requiredApprovals: ['design']
        }
      },

      // TASKS -> IMPLEMENTATION
      {
        from: WorkflowPhase.TASKS,
        to: WorkflowPhase.IMPLEMENTATION,
        condition: {
          check: (project: Project) => 
            project.metadata.approvals.tasks.generated &&
            project.metadata.approvals.tasks.approved,
          errorMessage: 'Tasks must be generated and approved before implementation phase',
          requiredApprovals: ['tasks']
        }
      },

      // Rollback transitions (always allowed for workflow corrections)
      {
        from: WorkflowPhase.REQUIREMENTS,
        to: WorkflowPhase.INIT,
        condition: {
          check: () => true,
          errorMessage: 'Cannot rollback from REQUIREMENTS to INIT'
        }
      },
      {
        from: WorkflowPhase.DESIGN,
        to: WorkflowPhase.REQUIREMENTS,
        condition: {
          check: () => true,
          errorMessage: 'Cannot rollback from DESIGN to REQUIREMENTS'
        }
      },
      {
        from: WorkflowPhase.TASKS,
        to: WorkflowPhase.DESIGN,
        condition: {
          check: () => true,
          errorMessage: 'Cannot rollback from TASKS to DESIGN'
        }
      },
      {
        from: WorkflowPhase.IMPLEMENTATION,
        to: WorkflowPhase.TASKS,
        condition: {
          check: () => true,
          errorMessage: 'Cannot rollback from IMPLEMENTATION to TASKS'
        }
      }
    ];

    // Group transitions by source phase
    for (const transition of transitions) {
      const key = transition.from;
      if (!this.transitions.has(key)) {
        this.transitions.set(key, []);
      }
      this.transitions.get(key)!.push(transition);
    }
  }

  canTransition(project: Project, toPhase: WorkflowPhase): {
    allowed: boolean;
    reason?: string;
    requiredApprovals?: string[];
  } {
    const fromPhase = project.phase;
    const transitions = this.transitions.get(fromPhase) || [];
    const validTransition = transitions.find(t => t.to === toPhase);

    if (!validTransition) {
      return {
        allowed: false,
        reason: `No valid transition from ${fromPhase} to ${toPhase}`
      };
    }

    const conditionMet = validTransition.condition.check(project);
    if (!conditionMet) {
      return {
        allowed: false,
        reason: validTransition.condition.errorMessage,
        requiredApprovals: validTransition.condition.requiredApprovals
      };
    }

    return { allowed: true };
  }

  async executeTransition(
    project: Project, 
    toPhase: WorkflowPhase, 
    triggeredBy: string
  ): Promise<{
    success: boolean;
    updatedProject?: Project;
    error?: string;
    auditEntry: WorkflowAuditEntry;
  }> {
    const auditEntry: WorkflowAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId: project.id,
      timestamp: new Date(),
      fromPhase: project.phase,
      toPhase,
      triggeredBy,
      success: false
    };

    try {
      const validation = this.canTransition(project, toPhase);
      if (!validation.allowed) {
        auditEntry.errorMessage = validation.reason;
        this.auditLog.push(auditEntry);
        return {
          success: false,
          error: validation.reason,
          auditEntry
        };
      }

      const transitions = this.transitions.get(project.phase) || [];
      const transition = transitions.find(t => t.to === toPhase);

      let updatedProject = { ...project, phase: toPhase };

      // Execute transition action if defined
      if (transition?.action) {
        updatedProject = await transition.action.execute(updatedProject);
      }

      // Update metadata
      updatedProject.metadata = {
        ...updatedProject.metadata,
        updatedAt: new Date()
      };

      auditEntry.success = true;
      auditEntry.metadata = {
        previousPhase: project.phase,
        newPhase: toPhase
      };
      
      this.auditLog.push(auditEntry);

      return {
        success: true,
        updatedProject,
        auditEntry
      };

    } catch (error) {
      auditEntry.errorMessage = (error as Error).message;
      this.auditLog.push(auditEntry);

      return {
        success: false,
        error: (error as Error).message,
        auditEntry
      };
    }
  }

  getValidTransitions(fromPhase: WorkflowPhase): WorkflowPhase[] {
    const transitions = this.transitions.get(fromPhase) || [];
    return transitions.map(t => t.to);
  }

  getNextPhase(currentPhase: WorkflowPhase): WorkflowPhase | null {
    const phaseOrder: WorkflowPhase[] = [
      WorkflowPhase.INIT,
      WorkflowPhase.REQUIREMENTS,
      WorkflowPhase.DESIGN,
      WorkflowPhase.TASKS,
      WorkflowPhase.IMPLEMENTATION
    ];

    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex >= 0 && currentIndex < phaseOrder.length - 1) {
      return phaseOrder[currentIndex + 1];
    }

    return null; // Already at final phase
  }

  getPreviousPhase(currentPhase: WorkflowPhase): WorkflowPhase | null {
    const phaseOrder: WorkflowPhase[] = [
      WorkflowPhase.INIT,
      WorkflowPhase.REQUIREMENTS,
      WorkflowPhase.DESIGN,
      WorkflowPhase.TASKS,
      WorkflowPhase.IMPLEMENTATION
    ];

    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex > 0) {
      return phaseOrder[currentIndex - 1];
    }

    return null; // Already at initial phase
  }

  getAuditTrail(projectId: string): WorkflowAuditEntry[] {
    return this.auditLog.filter(entry => entry.projectId === projectId);
  }

  getPhaseProgress(project: Project): {
    currentPhase: WorkflowPhase;
    phaseIndex: number;
    totalPhases: number;
    progressPercentage: number;
    nextPhase?: WorkflowPhase;
    canProgress: boolean;
    blockers?: string[];
  } {
    const phaseOrder: WorkflowPhase[] = [
      WorkflowPhase.INIT,
      WorkflowPhase.REQUIREMENTS,
      WorkflowPhase.DESIGN,
      WorkflowPhase.TASKS,
      WorkflowPhase.IMPLEMENTATION
    ];

    const currentIndex = phaseOrder.indexOf(project.phase);
    const nextPhase = this.getNextPhase(project.phase);
    
    let canProgress = false;
    let blockers: string[] = [];

    if (nextPhase) {
      const validation = this.canTransition(project, nextPhase);
      canProgress = validation.allowed;
      if (!canProgress && validation.reason) {
        blockers.push(validation.reason);
      }
    }

    return {
      currentPhase: project.phase,
      phaseIndex: currentIndex,
      totalPhases: phaseOrder.length,
      progressPercentage: Math.round(((currentIndex + 1) / phaseOrder.length) * 100),
      nextPhase: nextPhase || undefined,
      canProgress,
      blockers: blockers.length > 0 ? blockers : undefined
    };
  }

  validateWorkflowIntegrity(project: Project): {
    isValid: boolean;
    violations: string[];
    recommendations: string[];
  } {
    const violations: string[] = [];
    const recommendations: string[] = [];

    const { approvals } = project.metadata;

    // Check phase consistency with approvals
    switch (project.phase) {
      case WorkflowPhase.REQUIREMENTS:
        if (!approvals.requirements.generated) {
          violations.push('Requirements phase active but requirements not generated');
        }
        break;

      case WorkflowPhase.DESIGN:
        if (!approvals.requirements.approved) {
          violations.push('Design phase active but requirements not approved');
        }
        if (!approvals.design.generated) {
          violations.push('Design phase active but design not generated');
        }
        break;

      case WorkflowPhase.TASKS:
        if (!approvals.design.approved) {
          violations.push('Tasks phase active but design not approved');
        }
        if (!approvals.tasks.generated) {
          violations.push('Tasks phase active but tasks not generated');
        }
        break;

      case WorkflowPhase.IMPLEMENTATION:
        if (!approvals.tasks.approved) {
          violations.push('Implementation phase active but tasks not approved');
        }
        break;
    }

    // Generate recommendations
    if (approvals.requirements.generated && !approvals.requirements.approved) {
      recommendations.push('Requirements are ready for review and approval');
    }
    if (approvals.design.generated && !approvals.design.approved) {
      recommendations.push('Design is ready for review and approval');
    }
    if (approvals.tasks.generated && !approvals.tasks.approved) {
      recommendations.push('Tasks are ready for review and approval');
    }

    return {
      isValid: violations.length === 0,
      violations,
      recommendations
    };
  }
}