import {
  TaskDomainService,
  WorkflowDomainService,
} from '../../../domain/services/DomainService';
import type { Project, Task } from '../../../domain/types';
import { WorkflowPhase } from '../../../domain/types';

function project(overrides: {
  phase?: WorkflowPhase;
  requirements?: boolean;
  design?: boolean;
  tasks?: boolean;
  reviewRequired?: boolean;
  reviewed?: boolean;
} = {}): Project {
  const record = (approved: boolean) => ({
    generated: approved,
    approved,
    revision: approved ? 1 : 0,
    artifactSha256: approved ? 'a'.repeat(64) : null,
    validation: { status: approved ? 'passed' : 'not-run', blockers: [] },
  });
  // This fixture intentionally supplies only fields consumed by the pure domain service.
  return {
    id: 'payments',
    name: 'payments',
    path: '/workspace/payments',
    phase: overrides.phase ?? WorkflowPhase.INIT,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      language: 'en',
      approvals: {
        requirements: record(overrides.requirements ?? false),
        design: record(overrides.design ?? false),
        tasks: record(overrides.tasks ?? false),
      },
      checkpoints: {
        testCases: {
          required: overrides.reviewRequired ?? false,
          reviewed: overrides.reviewed ?? false,
        },
      },
    },
  } as unknown as Project;
}

const task = (overrides: Partial<Task> = {}): Task => ({
  id: '1',
  title: 'Implement checkout',
  description: 'Implement the bounded checkout flow',
  requirements: ['FR-1'],
  completed: false,
  ...overrides,
});

describe('workflow domain services', () => {
  it('enforces every phase transition and review checkpoint', () => {
    expect(WorkflowDomainService.canTransitionToPhase(project(), WorkflowPhase.INIT)).toBe(true);
    expect(WorkflowDomainService.canTransitionToPhase(project(), WorkflowPhase.REQUIREMENTS)).toBe(true);
    expect(WorkflowDomainService.canTransitionToPhase(project({ phase: WorkflowPhase.DESIGN }), WorkflowPhase.REQUIREMENTS)).toBe(false);
    expect(WorkflowDomainService.canTransitionToPhase(project({ requirements: true }), WorkflowPhase.DESIGN)).toBe(true);
    expect(WorkflowDomainService.canTransitionToPhase(project(), WorkflowPhase.DESIGN)).toBe(false);
    expect(WorkflowDomainService.canTransitionToPhase(project({ design: true }), WorkflowPhase.TASKS)).toBe(true);
    expect(WorkflowDomainService.canTransitionToPhase(project(), WorkflowPhase.TASKS)).toBe(false);
    expect(WorkflowDomainService.canTransitionToPhase(project({ tasks: true }), WorkflowPhase.IMPLEMENTATION)).toBe(true);
    expect(WorkflowDomainService.canTransitionToPhase(project({ tasks: true, reviewRequired: true }), WorkflowPhase.IMPLEMENTATION)).toBe(false);
    expect(WorkflowDomainService.canTransitionToPhase(project(), 'unknown' as WorkflowPhase)).toBe(false);
  });

  it('reports every missing implementation prerequisite', () => {
    const blocked = project({ reviewRequired: true });
    expect(WorkflowDomainService.getRequiredApprovals(blocked, WorkflowPhase.DESIGN)).toEqual(['requirements']);
    expect(WorkflowDomainService.getRequiredApprovals(blocked, WorkflowPhase.TASKS)).toEqual(['design']);
    expect(WorkflowDomainService.getRequiredApprovals(blocked, WorkflowPhase.IMPLEMENTATION)).toEqual(['tasks', 'test-cases']);
    expect(WorkflowDomainService.isReadyForImplementation(blocked)).toBe(false);

    const ready = project({ requirements: true, design: true, tasks: true, reviewRequired: true, reviewed: true });
    expect(WorkflowDomainService.getRequiredApprovals(ready, WorkflowPhase.IMPLEMENTATION)).toEqual([]);
    expect(WorkflowDomainService.isReadyForImplementation(ready)).toBe(true);
  });

  it('calculates task progress and validates durable task fields', () => {
    expect(TaskDomainService.calculateProgress([])).toEqual({ completed: 0, total: 0, percentage: 0 });
    expect(TaskDomainService.calculateProgress([task({ completed: true }), task()])).toEqual({ completed: 1, total: 2, percentage: 50 });
    expect(TaskDomainService.getBlockingTasks([task({ completed: true }), task({ id: '2' })])).toHaveLength(1);
    expect(TaskDomainService.validateTaskCompletion(task({ title: ' ' }))).toMatchObject({ isValid: false });
    expect(TaskDomainService.validateTaskCompletion(task({ description: ' ' }))).toMatchObject({ isValid: false });
    expect(TaskDomainService.validateTaskCompletion(task({ requirements: [] }))).toMatchObject({ isValid: false });
    expect(TaskDomainService.validateTaskCompletion(task())).toEqual({ isValid: true });
  });
});
