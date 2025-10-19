// Integration tests for cross-component workflow functionality

import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '../../infrastructure/di/types.js';

// Import all the services and components for integration testing
import { WorkflowEngineService } from '../../application/services/WorkflowEngineService.js';
import { ProjectContextService } from '../../application/services/ProjectContextService.js';
import { SteeringDocumentService } from '../../application/services/SteeringDocumentService.js';
import { TemplateService } from '../../application/services/TemplateService.js';
import { QualityService } from '../../application/services/QualityService.js';
import { PluginManager } from '../../infrastructure/plugins/PluginManager.js';
import { HookSystem } from '../../infrastructure/plugins/HookSystem.js';
import { PluginToolRegistry } from '../../infrastructure/plugins/PluginToolRegistry.js';
import { PluginSteeringRegistry } from '../../infrastructure/plugins/PluginSteeringRegistry.js';

import {
  WorkflowPhase,
  WorkflowState,
  ApprovalStatus,
  SteeringMode,
  SteeringDocumentType
} from '../../domain/context/ProjectContext.js';
import { HookType, HookPhase, ToolCategory } from '../../domain/plugins/index.js';
import { LoggerPort, FileSystemPort, ValidationPort } from '../../domain/ports.js';

describe('Workflow Integration Tests', () => {
  let container: Container;
  let workflowEngine: WorkflowEngineService;
  let projectContextService: ProjectContextService;
  let steeringService: SteeringDocumentService;
  let templateService: TemplateService;
  let qualityService: QualityService;
  let pluginManager: PluginManager;
  let hookSystem: HookSystem;
  let toolRegistry: PluginToolRegistry;
  let steeringRegistry: PluginSteeringRegistry;

  let mockLogger: jest.Mocked<LoggerPort>;
  let mockFileSystem: jest.Mocked<FileSystemPort>;
  let mockValidation: jest.Mocked<ValidationPort>;

  beforeEach(() => {
    // Create mock dependencies
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

    mockValidation = {
      validate: jest.fn(),
      validateSchema: jest.fn(),
      createValidator: jest.fn()
    };

    // Set up dependency injection container
    container = new Container();
    
    // Bind mock dependencies
    container.bind<LoggerPort>(TYPES.LoggerPort).toConstantValue(mockLogger);
    container.bind<FileSystemPort>(TYPES.FileSystemPort).toConstantValue(mockFileSystem);
    container.bind<ValidationPort>(TYPES.ValidationPort).toConstantValue(mockValidation);

    // Create service instances
    hookSystem = new HookSystem(mockLogger);
    toolRegistry = new PluginToolRegistry(mockLogger);
    steeringRegistry = new PluginSteeringRegistry(mockLogger, mockFileSystem);
    
    pluginManager = new PluginManager(
      mockLogger, 
      mockFileSystem, 
      hookSystem, 
      toolRegistry, 
      steeringRegistry
    );

    workflowEngine = new WorkflowEngineService(mockLogger, mockFileSystem);
    steeringService = new SteeringDocumentService(
      mockFileSystem, 
      mockLogger, 
      mockValidation,
      steeringRegistry
    );

    // Mock other services for integration
    templateService = {
      renderTemplate: jest.fn(),
      loadTemplate: jest.fn(),
      registerTemplate: jest.fn()
    } as any;

    qualityService = {
      analyzeCode: jest.fn(),
      validateQuality: jest.fn(),
      generateReport: jest.fn()
    } as any;

    projectContextService = {
      initializeProject: jest.fn(),
      loadProjectContext: jest.fn(),
      saveProjectContext: jest.fn()
    } as any;
  });

  describe('Complete SDD Workflow Integration', () => {
    const testProjectPath = '/test/project';

    beforeEach(() => {
      // Setup common filesystem mocks
      mockFileSystem.exists.mockImplementation((path: string) => {
        if (path.includes('.kiro')) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      mockFileSystem.readdir.mockResolvedValue([]);
      mockFileSystem.stat.mockResolvedValue({ 
        mtime: new Date(), 
        size: 1024,
        isFile: () => true,
        isDirectory: () => false
      } as any);
    });

    it('should complete full workflow from initialization to implementation', async () => {
      // Phase 1: Initialize workflow
      const workflowState = await workflowEngine.initializeWorkflow(testProjectPath);
      
      expect(workflowState.currentPhase).toBe(WorkflowPhase.INIT);
      expect(workflowState.state).toBe(WorkflowState.IN_PROGRESS);

      // Verify directory creation
      expect(mockFileSystem.mkdir).toHaveBeenCalledWith('/test/project/.kiro');
      expect(mockFileSystem.mkdir).toHaveBeenCalledWith('/test/project/.kiro/specs');
      expect(mockFileSystem.mkdir).toHaveBeenCalledWith('/test/project/.kiro/steering');

      // Phase 2: Progress through INIT
      const approvedInitState = await workflowEngine.approvePhase(workflowState, WorkflowPhase.INIT);
      expect(approvedInitState.phases.INIT.status).toBe(ApprovalStatus.APPROVED);

      // Phase 3: Progress to REQUIREMENTS
      const requirementsState = await workflowEngine.progressToPhase(
        approvedInitState, 
        WorkflowPhase.REQUIREMENTS
      );
      expect(requirementsState.currentPhase).toBe(WorkflowPhase.REQUIREMENTS);

      // Phase 4: Generate requirements (simulate template service)
      (templateService.renderTemplate as jest.Mock).mockResolvedValue(
        '# Requirements\n\n## Functional Requirements\n- Requirement 1\n- Requirement 2'
      );

      await templateService.renderTemplate('requirements.md', {
        projectName: 'Test Project',
        features: ['feature1', 'feature2']
      });

      expect(templateService.renderTemplate).toHaveBeenCalledWith(
        'requirements.md',
        expect.objectContaining({
          projectName: 'Test Project'
        })
      );

      // Phase 5: Approve requirements and progress to DESIGN
      const approvedRequirementsState = await workflowEngine.approvePhase(
        requirementsState,
        WorkflowPhase.REQUIREMENTS
      );

      const designState = await workflowEngine.progressToPhase(
        approvedRequirementsState,
        WorkflowPhase.DESIGN
      );

      expect(designState.currentPhase).toBe(WorkflowPhase.DESIGN);

      // Phase 6: Generate design document
      (templateService.renderTemplate as jest.Mock).mockResolvedValue(
        '# Design\n\n## Architecture\n- Component 1\n- Component 2'
      );

      await templateService.renderTemplate('design.md', {
        requirements: ['req1', 'req2'],
        architecture: 'clean-architecture'
      });

      // Phase 7: Approve design and progress to TASKS
      const approvedDesignState = await workflowEngine.approvePhase(
        designState,
        WorkflowPhase.DESIGN
      );

      const tasksState = await workflowEngine.progressToPhase(
        approvedDesignState,
        WorkflowPhase.TASKS
      );

      expect(tasksState.currentPhase).toBe(WorkflowPhase.TASKS);

      // Phase 8: Generate task list
      (templateService.renderTemplate as jest.Mock).mockResolvedValue(
        '# Tasks\n\n- [ ] Implement feature 1\n- [ ] Implement feature 2\n- [ ] Write tests'
      );

      await templateService.renderTemplate('tasks.md', {
        designComponents: ['comp1', 'comp2']
      });

      // Phase 9: Approve tasks and progress to IMPLEMENTATION
      const approvedTasksState = await workflowEngine.approvePhase(
        tasksState,
        WorkflowPhase.TASKS
      );

      const implementationState = await workflowEngine.progressToPhase(
        approvedTasksState,
        WorkflowPhase.IMPLEMENTATION
      );

      expect(implementationState.currentPhase).toBe(WorkflowPhase.IMPLEMENTATION);

      // Phase 10: Simulate implementation with quality checks
      (qualityService.analyzeCode as jest.Mock).mockResolvedValue({
        score: 85,
        issues: ['minor issue 1'],
        suggestions: ['suggestion 1']
      });

      const qualityAnalysis = await qualityService.analyzeCode(testProjectPath);
      expect(qualityAnalysis.score).toBe(85);

      // Phase 11: Complete workflow
      const completedState = await workflowEngine.approvePhase(
        implementationState,
        WorkflowPhase.IMPLEMENTATION
      );

      expect(completedState.phases.IMPLEMENTATION.status).toBe(ApprovalStatus.APPROVED);

      // Verify workflow metrics
      const metrics = await workflowEngine.getWorkflowMetrics(completedState);
      expect(metrics.phasesCompleted).toBe(5);
      expect(metrics.completionPercentage).toBe(100);
    });

    it('should handle workflow rollback scenarios', async () => {
      // Initialize and progress to DESIGN
      let workflowState = await workflowEngine.initializeWorkflow(testProjectPath);
      workflowState = await workflowEngine.approvePhase(workflowState, WorkflowPhase.INIT);
      workflowState = await workflowEngine.progressToPhase(workflowState, WorkflowPhase.REQUIREMENTS);
      workflowState = await workflowEngine.approvePhase(workflowState, WorkflowPhase.REQUIREMENTS);
      workflowState = await workflowEngine.progressToPhase(workflowState, WorkflowPhase.DESIGN);

      expect(workflowState.currentPhase).toBe(WorkflowPhase.DESIGN);

      // Simulate issue requiring rollback to REQUIREMENTS
      const rolledBackState = await workflowEngine.rollbackToPhase(
        workflowState,
        WorkflowPhase.REQUIREMENTS,
        'Design needs revision based on new requirements'
      );

      expect(rolledBackState.currentPhase).toBe(WorkflowPhase.REQUIREMENTS);
      expect(rolledBackState.phases.REQUIREMENTS.status).toBe(ApprovalStatus.IN_PROGRESS);
      expect(rolledBackState.phases.DESIGN.status).toBe(ApprovalStatus.PENDING);

      // Verify rollback was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Workflow rolled back',
        expect.objectContaining({
          fromPhase: WorkflowPhase.DESIGN,
          toPhase: WorkflowPhase.REQUIREMENTS,
          reason: 'Design needs revision based on new requirements'
        })
      );

      // Continue workflow after rollback
      const reapprovedState = await workflowEngine.approvePhase(
        rolledBackState,
        WorkflowPhase.REQUIREMENTS
      );

      const progressedState = await workflowEngine.progressToPhase(
        reapprovedState,
        WorkflowPhase.DESIGN
      );

      expect(progressedState.currentPhase).toBe(WorkflowPhase.DESIGN);
    });

    it('should handle workflow rejection and recovery', async () => {
      // Initialize and progress to REQUIREMENTS
      let workflowState = await workflowEngine.initializeWorkflow(testProjectPath);
      workflowState = await workflowEngine.approvePhase(workflowState, WorkflowPhase.INIT);
      workflowState = await workflowEngine.progressToPhase(workflowState, WorkflowPhase.REQUIREMENTS);

      // Reject requirements phase
      const rejectedState = await workflowEngine.rejectPhase(
        workflowState,
        WorkflowPhase.REQUIREMENTS,
        'Requirements are incomplete and need more detail'
      );

      expect(rejectedState.phases.REQUIREMENTS.status).toBe(ApprovalStatus.REJECTED);
      expect(rejectedState.phases.REQUIREMENTS.feedback).toBe(
        'Requirements are incomplete and need more detail'
      );

      // Verify rejection was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Phase rejected',
        expect.objectContaining({
          phase: WorkflowPhase.REQUIREMENTS,
          feedback: 'Requirements are incomplete and need more detail'
        })
      );

      // Simulate rework - reset phase to in progress
      rejectedState.phases.REQUIREMENTS.status = ApprovalStatus.IN_PROGRESS;

      // Re-approve after improvements
      const reapprovedState = await workflowEngine.approvePhase(
        rejectedState,
        WorkflowPhase.REQUIREMENTS
      );

      expect(reapprovedState.phases.REQUIREMENTS.status).toBe(ApprovalStatus.APPROVED);

      // Continue workflow normally
      const designState = await workflowEngine.progressToPhase(
        reapprovedState,
        WorkflowPhase.DESIGN
      );

      expect(designState.currentPhase).toBe(WorkflowPhase.DESIGN);
    });
  });

  describe('Plugin System Integration with Workflow', () => {
    const testProjectPath = '/test/project';

    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(false);
    });

    it('should integrate plugin hooks throughout workflow phases', async () => {
      // Register a plugin hook for pre-requirements phase
      const preRequirementsHook = {
        pluginId: 'test-plugin',
        name: 'pre-requirements-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_REQUIREMENTS,
        priority: 100,
        handler: jest.fn().mockResolvedValue({
          success: true,
          data: { enhanced: true, additionalRequirement: 'Security compliance' }
        })
      };

      await hookSystem.register('test-plugin', preRequirementsHook);

      // Register post-design hook
      const postDesignHook = {
        pluginId: 'test-plugin',
        name: 'post-design-hook',
        type: HookType.VALIDATOR,
        phase: HookPhase.POST_DESIGN,
        priority: 100,
        handler: jest.fn().mockResolvedValue({
          success: true,
          data: { valid: true, designScore: 95 }
        })
      };

      await hookSystem.register('test-plugin', postDesignHook);

      // Initialize workflow
      let workflowState = await workflowEngine.initializeWorkflow(testProjectPath);
      workflowState = await workflowEngine.approvePhase(workflowState, WorkflowPhase.INIT);

      // Execute pre-requirements hook
      const preReqContext = {
        hookName: 'pre-requirements-hook',
        phase: HookPhase.PRE_REQUIREMENTS,
        data: { projectPath: testProjectPath, baseRequirements: ['req1', 'req2'] },
        metadata: { workflowState }
      };

      const preReqResult = await hookSystem.execute('pre-requirements-hook', preReqContext);
      expect(preReqResult.success).toBe(true);
      expect(preReqResult.data?.enhanced).toBe(true);
      expect(preReqResult.data?.additionalRequirement).toBe('Security compliance');

      // Progress to requirements
      workflowState = await workflowEngine.progressToPhase(workflowState, WorkflowPhase.REQUIREMENTS);
      workflowState = await workflowEngine.approvePhase(workflowState, WorkflowPhase.REQUIREMENTS);
      workflowState = await workflowEngine.progressToPhase(workflowState, WorkflowPhase.DESIGN);

      // Execute post-design hook
      const postDesignContext = {
        hookName: 'post-design-hook',
        phase: HookPhase.POST_DESIGN,
        data: { 
          projectPath: testProjectPath, 
          design: 'Clean architecture with microservices' 
        },
        metadata: { workflowState }
      };

      const postDesignResult = await hookSystem.execute('post-design-hook', postDesignContext);
      expect(postDesignResult.success).toBe(true);
      expect(postDesignResult.data?.valid).toBe(true);
      expect(postDesignResult.data?.designScore).toBe(95);

      // Verify hooks were executed
      expect(preRequirementsHook.handler).toHaveBeenCalled();
      expect(postDesignHook.handler).toHaveBeenCalled();
    });

    it('should integrate plugin tools with workflow execution', async () => {
      // Register a plugin tool for code generation
      const codeGenTool = {
        pluginId: 'codegen-plugin',
        name: 'generate-component',
        description: 'Generate component from design',
        category: ToolCategory.SDD,
        handler: jest.fn().mockResolvedValue({
          success: true,
          data: { 
            generatedFiles: ['component.ts', 'component.test.ts'],
            linesOfCode: 150
          }
        }),
        inputSchema: {
          type: 'object',
          properties: {
            componentName: { type: 'string' },
            componentType: { type: 'string' }
          },
          required: ['componentName']
        },
        outputSchema: { type: 'object' },
        permissions: []
      };

      await toolRegistry.register('codegen-plugin', codeGenTool);

      // Initialize workflow to implementation phase
      let workflowState = await workflowEngine.initializeWorkflow(testProjectPath);
      
      // Fast-track to implementation phase for testing
      workflowState.phases.INIT.status = ApprovalStatus.APPROVED;
      workflowState.phases.REQUIREMENTS.status = ApprovalStatus.APPROVED;
      workflowState.phases.DESIGN.status = ApprovalStatus.APPROVED;
      workflowState.phases.TASKS.status = ApprovalStatus.APPROVED;
      workflowState.currentPhase = WorkflowPhase.IMPLEMENTATION;

      // Execute code generation tool
      const toolContext = {
        toolName: 'generate-component',
        pluginId: 'codegen-plugin',
        metadata: { workflowState, phase: WorkflowPhase.IMPLEMENTATION }
      };

      const toolResult = await toolRegistry.execute(
        'generate-component',
        { componentName: 'UserProfile', componentType: 'functional' },
        toolContext
      );

      expect(toolResult.success).toBe(true);
      expect(toolResult.data?.generatedFiles).toEqual(['component.ts', 'component.test.ts']);
      expect(toolResult.data?.linesOfCode).toBe(150);

      // Verify tool was executed with correct parameters
      expect(codeGenTool.handler).toHaveBeenCalledWith(
        { componentName: 'UserProfile', componentType: 'functional' },
        toolContext
      );
    });

    it('should integrate plugin steering documents with workflow phases', async () => {
      // Register plugin steering document for implementation phase
      const implementationSteering = {
        name: 'implementation-guidelines',
        type: SteeringDocumentType.TECHNICAL,
        mode: SteeringMode.CONDITIONAL,
        priority: 150,
        patterns: ['.*implementation.*'],
        template: 'Implementation Phase Guidelines:\n\n{{guidelines}}\n\nCoding Standards: {{codingStandards}}',
        variables: [
          {
            name: 'guidelines',
            type: 'string',
            description: 'Implementation guidelines',
            required: true
          },
          {
            name: 'codingStandards',
            type: 'string',
            description: 'Coding standards to follow',
            required: false,
            defaultValue: 'Follow TypeScript strict mode'
          }
        ]
      };

      await steeringRegistry.registerSteeringDocument('implementation-plugin', implementationSteering);

      // Initialize workflow
      let workflowState = await workflowEngine.initializeWorkflow(testProjectPath);

      // Setup steering context for implementation phase
      const steeringContext = {
        currentFile: 'implementation-phase.md',
        projectPath: testProjectPath,
        workingDirectory: testProjectPath,
        variables: {
          guidelines: 'Follow clean architecture principles\nImplement comprehensive error handling',
          codingStandards: 'Use TypeScript strict mode and ESLint'
        },
        metadata: { phase: WorkflowPhase.IMPLEMENTATION }
      };

      // Get applicable steering documents
      const steeringResults = await steeringRegistry.getApplicableSteeringDocuments(steeringContext);

      expect(steeringResults).toHaveLength(1);
      expect(steeringResults[0].applicable).toBe(true);
      expect(steeringResults[0].content).toContain('Follow clean architecture principles');
      expect(steeringResults[0].content).toContain('Use TypeScript strict mode and ESLint');
      expect(steeringResults[0].priority).toBe(150);

      // Verify steering document was applied
      expect(steeringResults[0].content).toMatch(/Implementation Phase Guidelines:/);
      expect(steeringResults[0].content).toMatch(/Coding Standards:/);
    });
  });

  describe('Cross-Component Error Handling Integration', () => {
    const testProjectPath = '/test/project';

    it('should handle cascading errors across workflow components', async () => {
      // Setup filesystem to fail during directory creation
      mockFileSystem.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

      // Attempt to initialize workflow
      await expect(workflowEngine.initializeWorkflow(testProjectPath))
        .rejects.toThrow('Permission denied');

      // Verify error was logged appropriately
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Workflow initialization failed',
        expect.any(Error),
        expect.objectContaining({ projectPath: testProjectPath })
      );
    });

    it('should handle plugin system errors during workflow execution', async () => {
      // Register a hook that will fail
      const failingHook = {
        pluginId: 'failing-plugin',
        name: 'failing-hook',
        type: HookType.ACTION,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: jest.fn().mockRejectedValue(new Error('Hook processing failed'))
      };

      await hookSystem.register('failing-plugin', failingHook);

      // Execute the failing hook
      const context = {
        hookName: 'failing-hook',
        phase: HookPhase.PRE_INIT,
        data: { test: true },
        metadata: {}
      };

      const result = await hookSystem.execute('failing-hook', context);

      // Verify error handling
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Hook processing failed');

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Hook execution failed',
        expect.objectContaining({
          hookName: 'failing-hook',
          pluginId: 'failing-plugin'
        })
      );
    });

    it('should gracefully handle steering document template errors', async () => {
      // Register steering document with invalid template
      const badTemplateDoc = {
        name: 'bad-template',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.ALWAYS,
        priority: 100,
        patterns: [],
        template: 'Bad template: {{undefined.property.chain}}',
        variables: []
      };

      await steeringRegistry.registerSteeringDocument('bad-plugin', badTemplateDoc);

      const context = {
        currentFile: 'test.ts',
        projectPath: testProjectPath,
        workingDirectory: testProjectPath,
        variables: {},
        metadata: {}
      };

      const results = await steeringRegistry.getApplicableSteeringDocuments(context);

      // Should not return the errored document
      expect(results).toHaveLength(0);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to render steering template',
        expect.objectContaining({
          documentId: 'bad-plugin:bad-template'
        })
      );
    });
  });

  describe('Performance Integration Testing', () => {
    const testProjectPath = '/test/project';

    it('should handle high-volume hook executions efficiently', async () => {
      // Register multiple hooks with different priorities
      const hooks = Array.from({ length: 50 }, (_, i) => ({
        pluginId: `plugin-${i}`,
        name: 'performance-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: Math.floor(Math.random() * 1000),
        handler: jest.fn().mockResolvedValue({ success: true, data: { processed: true } })
      }));

      // Register all hooks
      for (const hook of hooks) {
        await hookSystem.register(hook.pluginId, hook);
      }

      const context = {
        hookName: 'performance-hook',
        phase: HookPhase.PRE_INIT,
        data: { test: true },
        metadata: {}
      };

      const startTime = Date.now();
      const result = await hookSystem.execute('performance-hook', context);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.metadata?.hooksExecuted).toBe(50);
      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second

      // Verify all hooks were executed
      hooks.forEach(hook => {
        expect(hook.handler).toHaveBeenCalled();
      });
    });

    it('should efficiently handle large numbers of plugin tools', async () => {
      // Register many tools across different categories
      const tools = Array.from({ length: 100 }, (_, i) => ({
        pluginId: `tool-plugin-${i}`,
        name: `tool-${i}`,
        description: `Tool number ${i}`,
        category: Object.values(ToolCategory)[i % Object.values(ToolCategory).length],
        handler: jest.fn().mockResolvedValue({ success: true, data: { toolId: i } }),
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        permissions: []
      }));

      // Register all tools
      for (const tool of tools) {
        await toolRegistry.register(tool.pluginId, tool);
      }

      // Test tool retrieval performance
      const startTime = Date.now();
      const allTools = await toolRegistry.getAllTools();
      const retrievalTime = Date.now() - startTime;

      expect(Object.keys(allTools)).toHaveLength(100);
      expect(retrievalTime).toBeLessThan(100); // Should be very fast

      // Test category-based retrieval
      const utilityTools = await toolRegistry.getToolsByCategory(ToolCategory.UTILITY);
      expect(utilityTools.length).toBeGreaterThan(0);

      // Test tool statistics calculation
      const stats = await toolRegistry.getToolStatistics('tool-0');
      expect(stats).toBeDefined();
    });
  });
});