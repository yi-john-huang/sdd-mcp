// Domain services contain business logic that doesn't naturally fit within entities

import { Project, WorkflowPhase, Task } from '../types.js';

export class WorkflowDomainService {
  static canTransitionToPhase(project: Project, targetPhase: WorkflowPhase): boolean {
    const { phase, metadata } = project;
    const { approvals } = metadata;

    switch (targetPhase) {
      case WorkflowPhase.INIT:
        return true; // Can always go back to init

      case WorkflowPhase.REQUIREMENTS:
        return phase === WorkflowPhase.INIT;

      case WorkflowPhase.DESIGN:
        return approvals.requirements.generated && approvals.requirements.approved;

      case WorkflowPhase.TASKS:
        return approvals.design.generated && approvals.design.approved;

      case WorkflowPhase.IMPLEMENTATION:
        return approvals.tasks.generated && approvals.tasks.approved;

      default:
        return false;
    }
  }

  static isReadyForImplementation(project: Project): boolean {
    const { approvals } = project.metadata;
    return approvals.requirements.approved &&
           approvals.design.approved &&
           approvals.tasks.approved;
  }

  static getRequiredApprovals(project: Project, targetPhase: WorkflowPhase): string[] {
    const missing: string[] = [];

    if (targetPhase === WorkflowPhase.DESIGN) {
      if (!project.metadata.approvals.requirements.approved) {
        missing.push('requirements');
      }
    }

    if (targetPhase === WorkflowPhase.TASKS) {
      if (!project.metadata.approvals.design.approved) {
        missing.push('design');
      }
    }

    if (targetPhase === WorkflowPhase.IMPLEMENTATION) {
      if (!project.metadata.approvals.tasks.approved) {
        missing.push('tasks');
      }
    }

    return missing;
  }
}

export class TaskDomainService {
  static calculateProgress(tasks: Task[]): {
    completed: number;
    total: number;
    percentage: number;
  } {
    const total = tasks.length;
    const completed = tasks.filter(task => task.completed).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  }

  static getBlockingTasks(tasks: Task[]): Task[] {
    return tasks.filter(task => !task.completed);
  }

  static validateTaskCompletion(task: Task): { isValid: boolean; reason?: string } {
    if (!task.title.trim()) {
      return { isValid: false, reason: 'Task title cannot be empty' };
    }

    if (!task.description.trim()) {
      return { isValid: false, reason: 'Task description cannot be empty' };
    }

    if (task.requirements.length === 0) {
      return { isValid: false, reason: 'Task must be linked to at least one requirement' };
    }

    return { isValid: true };
  }
}