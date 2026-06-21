import { WorkflowDomainService } from '../../../domain/services/DomainService';
import { WorkflowPhase, Project } from '../../../domain/types';
import { AjvValidationAdapter } from '../../../infrastructure/adapters/AjvValidationAdapter';
import { projectSchema } from '../../../infrastructure/schemas/project.schema';

function createReadyProject(checkpoint: { required: boolean; reviewed: boolean }): Project {
  return {
    id: 'project-1',
    name: 'checkout-flow',
    path: '/tmp/checkout-flow',
    phase: WorkflowPhase.TASKS,
    metadata: {
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
      updatedAt: new Date('2026-06-21T00:00:00.000Z'),
      language: 'en',
      approvals: {
        requirements: { generated: true, approved: true },
        design: { generated: true, approved: true },
        tasks: { generated: true, approved: true }
      },
      workflowOptions: {
        reviewTestCases: checkpoint.required
      },
      checkpoints: {
        testCases: checkpoint
      }
    }
  };
}

describe('TDD test-case review checkpoint', () => {
  it('blocks implementation readiness when review is required but not completed', () => {
    const project = createReadyProject({ required: true, reviewed: false });

    expect(WorkflowDomainService.isReadyForImplementation(project)).toBe(false);
    expect(
      WorkflowDomainService.canTransitionToPhase(project, WorkflowPhase.IMPLEMENTATION)
    ).toBe(false);
    expect(
      WorkflowDomainService.getRequiredApprovals(project, WorkflowPhase.IMPLEMENTATION)
    ).toContain('test-cases');
  });

  it('does not block implementation when the review checkpoint is disabled', () => {
    const project = createReadyProject({ required: false, reviewed: true });

    expect(WorkflowDomainService.isReadyForImplementation(project)).toBe(true);
  });

  it('allows implementation when required review is completed', () => {
    const project = createReadyProject({ required: true, reviewed: true });

    expect(WorkflowDomainService.isReadyForImplementation(project)).toBe(true);
  });

  it('validates checkpoint metadata with in-memory Date values', async () => {
    const project = {
      ...createReadyProject({ required: true, reviewed: true }),
      metadata: {
        ...createReadyProject({ required: true, reviewed: true }).metadata,
        checkpoints: {
          testCases: {
            required: true,
            reviewed: true,
            reviewedAt: new Date('2026-06-21T00:00:00.000Z')
          }
        }
      }
    };
    const validator = new AjvValidationAdapter();

    await expect(validator.validate(project, projectSchema)).resolves.toEqual(project);
  });
});
