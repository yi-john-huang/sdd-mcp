// Unit tests for WorkflowEngineService implementation

import 'reflect-metadata';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService.js';
import { 
  WorkflowPhase, 
  WorkflowState, 
  ApprovalStatus 
} from '../../../domain/context/ProjectContext.js';
import { LoggerPort, FileSystemPort } from '../../../domain/ports.js';

describe('WorkflowEngineService', () => {
  let workflowEngine: WorkflowEngineService;
  let mockLogger: jest.Mocked<LoggerPort>;
  let mockFileSystem: jest.Mocked<FileSystemPort>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockFileSystem = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      exists: jest.fn(),
      mkdir: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
      join: jest.fn((...args) => args.join('/')),
      basename: jest.fn((path) => path.split('/').pop() || ''),
      dirname: jest.fn((path) => path.split('/').slice(0, -1).join('/'))
    };

    workflowEngine = new WorkflowEngineService(mockLogger, mockFileSystem);
  });

  describe('initializeWorkflow', () => {
    it('should initialize workflow in INIT phase', async () => {
      const projectPath = '/test/project';
      const workflowState = await workflowEngine.initializeWorkflow(projectPath);

      expect(workflowState.currentPhase).toBe(WorkflowPhase.INIT);
      expect(workflowState.state).toBe(WorkflowState.IN_PROGRESS);
      expect(workflowState.phases.INIT.status).toBe(ApprovalStatus.IN_PROGRESS);
      expect(workflowState.phases.REQUIREMENTS.status).toBe(ApprovalStatus.PENDING);
      expect(workflowState.phases.DESIGN.status).toBe(ApprovalStatus.PENDING);
      expect(workflowState.phases.TASKS.status).toBe(ApprovalStatus.PENDING);
      expect(workflowState.phases.IMPLEMENTATION.status).toBe(ApprovalStatus.PENDING);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow initialized',
        expect.objectContaining({
          projectPath,
          currentPhase: WorkflowPhase.INIT
        })
      );
    });

    it('should create necessary directories', async () => {
      const projectPath = '/test/project';
      mockFileSystem.exists.mockResolvedValue(false);

      await workflowEngine.initializeWorkflow(projectPath);

      expect(mockFileSystem.mkdir).toHaveBeenCalledWith('/test/project/.kiro');
      expect(mockFileSystem.mkdir).toHaveBeenCalledWith('/test/project/.kiro/specs');
      expect(mockFileSystem.mkdir).toHaveBeenCalledWith('/test/project/.kiro/steering');
    });
  });

  describe('canProgressToPhase', () => {
    let workflowState: any;

    beforeEach(() => {
      workflowState = {
        currentPhase: WorkflowPhase.INIT,
        state: WorkflowState.IN_PROGRESS,
        phases: {
          INIT: { status: ApprovalStatus.APPROVED },
          REQUIREMENTS: { status: ApprovalStatus.PENDING },
          DESIGN: { status: ApprovalStatus.PENDING },
          TASKS: { status: ApprovalStatus.PENDING },
          IMPLEMENTATION: { status: ApprovalStatus.PENDING }
        }
      };
    });

    it('should allow progression to next phase when current is approved', async () => {
      const canProgress = await workflowEngine.canProgressToPhase(
        workflowState, 
        WorkflowPhase.REQUIREMENTS
      );

      expect(canProgress).toBe(true);
    });

    it('should prevent progression when current phase not approved', async () => {
      workflowState.phases.INIT.status = ApprovalStatus.IN_PROGRESS;

      const canProgress = await workflowEngine.canProgressToPhase(
        workflowState,
        WorkflowPhase.REQUIREMENTS
      );

      expect(canProgress).toBe(false);
    });

    it('should prevent skipping phases', async () => {
      const canProgress = await workflowEngine.canProgressToPhase(
        workflowState,
        WorkflowPhase.DESIGN // Skipping REQUIREMENTS
      );

      expect(canProgress).toBe(false);
    });

    it('should allow progression to DESIGN after REQUIREMENTS approved', async () => {
      workflowState.currentPhase = WorkflowPhase.REQUIREMENTS;
      workflowState.phases.REQUIREMENTS.status = ApprovalStatus.APPROVED;

      const canProgress = await workflowEngine.canProgressToPhase(
        workflowState,
        WorkflowPhase.DESIGN
      );

      expect(canProgress).toBe(true);
    });

    it('should allow progression to TASKS after DESIGN approved', async () => {
      workflowState.currentPhase = WorkflowPhase.DESIGN;
      workflowState.phases.INIT.status = ApprovalStatus.APPROVED;
      workflowState.phases.REQUIREMENTS.status = ApprovalStatus.APPROVED;
      workflowState.phases.DESIGN.status = ApprovalStatus.APPROVED;

      const canProgress = await workflowEngine.canProgressToPhase(
        workflowState,
        WorkflowPhase.TASKS
      );

      expect(canProgress).toBe(true);
    });

    it('should allow progression to IMPLEMENTATION after TASKS approved', async () => {
      workflowState.currentPhase = WorkflowPhase.TASKS;
      workflowState.phases.INIT.status = ApprovalStatus.APPROVED;
      workflowState.phases.REQUIREMENTS.status = ApprovalStatus.APPROVED;
      workflowState.phases.DESIGN.status = ApprovalStatus.APPROVED;
      workflowState.phases.TASKS.status = ApprovalStatus.APPROVED;

      const canProgress = await workflowEngine.canProgressToPhase(
        workflowState,
        WorkflowPhase.IMPLEMENTATION
      );

      expect(canProgress).toBe(true);
    });
  });

  describe('progressToPhase', () => {
    let workflowState: any;

    beforeEach(() => {
      workflowState = {
        currentPhase: WorkflowPhase.INIT,
        state: WorkflowState.IN_PROGRESS,
        phases: {
          INIT: { status: ApprovalStatus.APPROVED, startedAt: new Date() },
          REQUIREMENTS: { status: ApprovalStatus.PENDING },
          DESIGN: { status: ApprovalStatus.PENDING },
          TASKS: { status: ApprovalStatus.PENDING },
          IMPLEMENTATION: { status: ApprovalStatus.PENDING }
        }
      };
    });

    it('should progress to next phase successfully', async () => {
      const updatedState = await workflowEngine.progressToPhase(
        workflowState,
        WorkflowPhase.REQUIREMENTS
      );

      expect(updatedState.currentPhase).toBe(WorkflowPhase.REQUIREMENTS);
      expect(updatedState.phases.REQUIREMENTS.status).toBe(ApprovalStatus.IN_PROGRESS);
      expect(updatedState.phases.REQUIREMENTS.startedAt).toBeInstanceOf(Date);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow progressed to new phase',
        expect.objectContaining({
          fromPhase: WorkflowPhase.INIT,
          toPhase: WorkflowPhase.REQUIREMENTS
        })
      );
    });

    it('should throw error when progression not allowed', async () => {
      workflowState.phases.INIT.status = ApprovalStatus.IN_PROGRESS;

      await expect(
        workflowEngine.progressToPhase(workflowState, WorkflowPhase.REQUIREMENTS)
      ).rejects.toThrow('Cannot progress to REQUIREMENTS phase');
    });

    it('should complete workflow when progressing to final phase', async () => {
      workflowState.currentPhase = WorkflowPhase.TASKS;
      workflowState.phases.INIT.status = ApprovalStatus.APPROVED;
      workflowState.phases.REQUIREMENTS.status = ApprovalStatus.APPROVED;
      workflowState.phases.DESIGN.status = ApprovalStatus.APPROVED;
      workflowState.phases.TASKS.status = ApprovalStatus.APPROVED;

      const updatedState = await workflowEngine.progressToPhase(
        workflowState,
        WorkflowPhase.IMPLEMENTATION
      );

      expect(updatedState.currentPhase).toBe(WorkflowPhase.IMPLEMENTATION);
      expect(updatedState.phases.IMPLEMENTATION.status).toBe(ApprovalStatus.IN_PROGRESS);
    });
  });

  describe('approvePhase', () => {
    let workflowState: any;

    beforeEach(() => {
      workflowState = {
        currentPhase: WorkflowPhase.REQUIREMENTS,
        state: WorkflowState.IN_PROGRESS,
        phases: {
          INIT: { status: ApprovalStatus.APPROVED },
          REQUIREMENTS: { 
            status: ApprovalStatus.IN_PROGRESS,
            startedAt: new Date(Date.now() - 1000)
          },
          DESIGN: { status: ApprovalStatus.PENDING },
          TASKS: { status: ApprovalStatus.PENDING },
          IMPLEMENTATION: { status: ApprovalStatus.PENDING }
        }
      };
    });

    it('should approve current phase', async () => {
      const updatedState = await workflowEngine.approvePhase(
        workflowState,
        WorkflowPhase.REQUIREMENTS
      );

      expect(updatedState.phases.REQUIREMENTS.status).toBe(ApprovalStatus.APPROVED);
      expect(updatedState.phases.REQUIREMENTS.approvedAt).toBeInstanceOf(Date);
      expect(updatedState.phases.REQUIREMENTS.approvedBy).toBeDefined();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Phase approved',
        expect.objectContaining({
          phase: WorkflowPhase.REQUIREMENTS
        })
      );
    });

    it('should calculate phase duration', async () => {
      const updatedState = await workflowEngine.approvePhase(
        workflowState,
        WorkflowPhase.REQUIREMENTS
      );

      expect(updatedState.phases.REQUIREMENTS.duration).toBeGreaterThan(0);
    });

    it('should prevent approving non-current phase', async () => {
      await expect(
        workflowEngine.approvePhase(workflowState, WorkflowPhase.DESIGN)
      ).rejects.toThrow('Cannot approve non-current phase');
    });

    it('should prevent approving already approved phase', async () => {
      workflowState.phases.REQUIREMENTS.status = ApprovalStatus.APPROVED;

      await expect(
        workflowEngine.approvePhase(workflowState, WorkflowPhase.REQUIREMENTS)
      ).rejects.toThrow('Phase is already approved');
    });
  });

  describe('rejectPhase', () => {
    let workflowState: any;

    beforeEach(() => {
      workflowState = {
        currentPhase: WorkflowPhase.REQUIREMENTS,
        state: WorkflowState.IN_PROGRESS,
        phases: {
          INIT: { status: ApprovalStatus.APPROVED },
          REQUIREMENTS: { 
            status: ApprovalStatus.IN_PROGRESS,
            startedAt: new Date()
          },
          DESIGN: { status: ApprovalStatus.PENDING },
          TASKS: { status: ApprovalStatus.PENDING },
          IMPLEMENTATION: { status: ApprovalStatus.PENDING }
        }
      };
    });

    it('should reject current phase with feedback', async () => {
      const feedback = 'Requirements are incomplete';
      const updatedState = await workflowEngine.rejectPhase(
        workflowState,
        WorkflowPhase.REQUIREMENTS,
        feedback
      );

      expect(updatedState.phases.REQUIREMENTS.status).toBe(ApprovalStatus.REJECTED);
      expect(updatedState.phases.REQUIREMENTS.rejectedAt).toBeInstanceOf(Date);
      expect(updatedState.phases.REQUIREMENTS.feedback).toBe(feedback);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Phase rejected',
        expect.objectContaining({
          phase: WorkflowPhase.REQUIREMENTS,
          feedback
        })
      );
    });

    it('should prevent rejecting non-current phase', async () => {
      await expect(
        workflowEngine.rejectPhase(workflowState, WorkflowPhase.DESIGN, 'feedback')
      ).rejects.toThrow('Cannot reject non-current phase');
    });
  });

  describe('validatePhaseTransition', () => {
    it('should validate all phase transitions', async () => {
      const validTransitions = [
        [WorkflowPhase.INIT, WorkflowPhase.REQUIREMENTS],
        [WorkflowPhase.REQUIREMENTS, WorkflowPhase.DESIGN],
        [WorkflowPhase.DESIGN, WorkflowPhase.TASKS],
        [WorkflowPhase.TASKS, WorkflowPhase.IMPLEMENTATION]
      ];

      for (const [from, to] of validTransitions) {
        const isValid = await workflowEngine.validatePhaseTransition(from, to);
        expect(isValid).toBe(true);
      }
    });

    it('should invalidate skipping phases', async () => {
      const invalidTransitions = [
        [WorkflowPhase.INIT, WorkflowPhase.DESIGN],
        [WorkflowPhase.INIT, WorkflowPhase.TASKS],
        [WorkflowPhase.INIT, WorkflowPhase.IMPLEMENTATION],
        [WorkflowPhase.REQUIREMENTS, WorkflowPhase.TASKS],
        [WorkflowPhase.REQUIREMENTS, WorkflowPhase.IMPLEMENTATION],
        [WorkflowPhase.DESIGN, WorkflowPhase.IMPLEMENTATION]
      ];

      for (const [from, to] of invalidTransitions) {
        const isValid = await workflowEngine.validatePhaseTransition(from, to);
        expect(isValid).toBe(false);
      }
    });

    it('should invalidate backwards transitions', async () => {
      const backwardTransitions = [
        [WorkflowPhase.REQUIREMENTS, WorkflowPhase.INIT],
        [WorkflowPhase.DESIGN, WorkflowPhase.REQUIREMENTS],
        [WorkflowPhase.TASKS, WorkflowPhase.DESIGN],
        [WorkflowPhase.IMPLEMENTATION, WorkflowPhase.TASKS]
      ];

      for (const [from, to] of backwardTransitions) {
        const isValid = await workflowEngine.validatePhaseTransition(from, to);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('rollbackToPhase', () => {
    let workflowState: any;

    beforeEach(() => {
      workflowState = {
        currentPhase: WorkflowPhase.DESIGN,
        state: WorkflowState.IN_PROGRESS,
        phases: {
          INIT: { status: ApprovalStatus.APPROVED },
          REQUIREMENTS: { status: ApprovalStatus.APPROVED },
          DESIGN: { status: ApprovalStatus.IN_PROGRESS },
          TASKS: { status: ApprovalStatus.PENDING },
          IMPLEMENTATION: { status: ApprovalStatus.PENDING }
        }
      };
    });

    it('should rollback to previous phase', async () => {
      const reason = 'Requirements need revision';
      const updatedState = await workflowEngine.rollbackToPhase(
        workflowState,
        WorkflowPhase.REQUIREMENTS,
        reason
      );

      expect(updatedState.currentPhase).toBe(WorkflowPhase.REQUIREMENTS);
      expect(updatedState.phases.REQUIREMENTS.status).toBe(ApprovalStatus.IN_PROGRESS);
      expect(updatedState.phases.DESIGN.status).toBe(ApprovalStatus.PENDING);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Workflow rolled back',
        expect.objectContaining({
          fromPhase: WorkflowPhase.DESIGN,
          toPhase: WorkflowPhase.REQUIREMENTS,
          reason
        })
      );
    });

    it('should prevent rollback to future phase', async () => {
      await expect(
        workflowEngine.rollbackToPhase(workflowState, WorkflowPhase.TASKS, 'invalid rollback')
      ).rejects.toThrow('Cannot rollback to future phase');
    });

    it('should prevent rollback to current phase', async () => {
      await expect(
        workflowEngine.rollbackToPhase(workflowState, WorkflowPhase.DESIGN, 'same phase')
      ).rejects.toThrow('Cannot rollback to current phase');
    });
  });

  describe('getWorkflowMetrics', () => {
    let workflowState: any;

    beforeEach(() => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const twoHoursAgo = new Date(now.getTime() - 7200000);

      workflowState = {
        currentPhase: WorkflowPhase.DESIGN,
        state: WorkflowState.IN_PROGRESS,
        startedAt: twoHoursAgo,
        phases: {
          INIT: { 
            status: ApprovalStatus.APPROVED,
            startedAt: twoHoursAgo,
            approvedAt: oneHourAgo,
            duration: 3600000
          },
          REQUIREMENTS: { 
            status: ApprovalStatus.APPROVED,
            startedAt: oneHourAgo,
            approvedAt: now,
            duration: 3600000
          },
          DESIGN: { 
            status: ApprovalStatus.IN_PROGRESS,
            startedAt: now
          },
          TASKS: { status: ApprovalStatus.PENDING },
          IMPLEMENTATION: { status: ApprovalStatus.PENDING }
        }
      };
    });

    it('should calculate workflow metrics', async () => {
      const metrics = await workflowEngine.getWorkflowMetrics(workflowState);

      expect(metrics.totalDuration).toBeGreaterThan(0);
      expect(metrics.phasesCompleted).toBe(2);
      expect(metrics.phasesRemaining).toBe(3);
      expect(metrics.completionPercentage).toBe(40); // 2/5 phases
      expect(metrics.averagePhaseTime).toBe(3600000); // Average of completed phases
      expect(metrics.estimatedTimeRemaining).toBe(10800000); // 3 * average
      expect(metrics.currentPhaseElapsedTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle workflow with no completed phases', async () => {
      workflowState.phases.INIT.status = ApprovalStatus.IN_PROGRESS;
      workflowState.phases.REQUIREMENTS.status = ApprovalStatus.PENDING;
      workflowState.currentPhase = WorkflowPhase.INIT;

      const metrics = await workflowEngine.getWorkflowMetrics(workflowState);

      expect(metrics.phasesCompleted).toBe(0);
      expect(metrics.completionPercentage).toBe(0);
      expect(metrics.averagePhaseTime).toBe(0);
      expect(metrics.estimatedTimeRemaining).toBe(0);
    });
  });

  describe('persistWorkflowState', () => {
    it('should save workflow state to file', async () => {
      const projectPath = '/test/project';
      const workflowState = {
        currentPhase: WorkflowPhase.REQUIREMENTS,
        state: WorkflowState.IN_PROGRESS,
        phases: {}
      };

      await workflowEngine.persistWorkflowState(projectPath, workflowState);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/test/project/.kiro/workflow-state.json',
        expect.stringContaining('"currentPhase":"REQUIREMENTS"')
      );
    });
  });

  describe('loadWorkflowState', () => {
    it('should load workflow state from file', async () => {
      const projectPath = '/test/project';
      const savedState = {
        currentPhase: WorkflowPhase.REQUIREMENTS,
        state: WorkflowState.IN_PROGRESS,
        phases: {
          INIT: { status: ApprovalStatus.APPROVED }
        }
      };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(savedState));

      const loadedState = await workflowEngine.loadWorkflowState(projectPath);

      expect(loadedState.currentPhase).toBe(WorkflowPhase.REQUIREMENTS);
      expect(loadedState.state).toBe(WorkflowState.IN_PROGRESS);
    });

    it('should return null when file does not exist', async () => {
      const projectPath = '/test/project';
      mockFileSystem.exists.mockResolvedValue(false);

      const loadedState = await workflowEngine.loadWorkflowState(projectPath);

      expect(loadedState).toBeNull();
    });

    it('should handle corrupted workflow state file', async () => {
      const projectPath = '/test/project';
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('invalid json');

      const loadedState = await workflowEngine.loadWorkflowState(projectPath);

      expect(loadedState).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to load workflow state',
        expect.any(Error),
        expect.objectContaining({ projectPath })
      );
    });
  });
});