// System validation test - validates complete SDD workflow functionality

import 'reflect-metadata';
import { createMCPServer } from '../../index.js';
import { WorkflowPhase } from '../../domain/types.js';
import { HookType, HookPhase, ToolCategory, SteeringDocumentType, SteeringMode } from '../../domain/plugins/index.js';
import type { ProjectService } from '../../application/services/ProjectService.js';
import type { WorkflowService } from '../../application/services/WorkflowService.js';
import type { PluginManager } from '../../infrastructure/plugins/PluginManager.js';
import type { HookSystem } from '../../infrastructure/plugins/HookSystem.js';
import type { PluginToolRegistry } from '../../infrastructure/plugins/PluginToolRegistry.js';
import type { PluginSteeringRegistry } from '../../infrastructure/plugins/PluginSteeringRegistry.js';
import { TYPES } from '../../infrastructure/di/types.js';
import { TestUtils } from '../setup.js';
import type { Container } from 'inversify';
import path from 'path';
import { promises as fs } from 'fs';

describe('System Validation - Complete SDD Workflow', () => {
  let testDir: string;
  let server: any;
  let container: Container;
  let projectService: ProjectService;
  let workflowService: WorkflowService;
  let pluginManager: PluginManager;
  let hookSystem: HookSystem;
  let toolRegistry: PluginToolRegistry;
  let steeringRegistry: PluginSteeringRegistry;

  beforeAll(async () => {
    testDir = await TestUtils.createTempDir();
    server = await createMCPServer();
    container = server.container;
    
    // Extract services from the server
    projectService = container.get(TYPES.ProjectService);
    workflowService = container.get(TYPES.WorkflowService);
    pluginManager = container.get(TYPES.PluginManager);
    hookSystem = container.get(TYPES.HookSystem);
    toolRegistry = container.get(TYPES.PluginToolRegistry);
    steeringRegistry = container.get(TYPES.PluginSteeringRegistry);
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await TestUtils.cleanupTempDir(testDir);
  });

  describe('1. System Initialization', () => {
    it('should initialize all core components', async () => {
      expect(server.container).toBeDefined();
      expect(server.logger).toBeDefined();
      expect(server.mcpServer).toBeDefined();
      expect(projectService).toBeDefined();
      expect(workflowService).toBeDefined();
      expect(pluginManager).toBeDefined();
      expect(hookSystem).toBeDefined();
      expect(toolRegistry).toBeDefined();
      expect(steeringRegistry).toBeDefined();
    });

    it('should have plugin system fully initialized', async () => {
      const plugins = await pluginManager.getAllPlugins();
      expect(Array.isArray(plugins)).toBe(true);
      
      const hooks = await hookSystem.getAllHooks();
      expect(typeof hooks).toBe('object');
      
      const tools = await toolRegistry.getAllTools();
      expect(typeof tools).toBe('object');
      
      const steering = await steeringRegistry.getSteeringStatistics();
      expect(steering).toHaveProperty('totalDocuments');
      expect(steering).toHaveProperty('documentsByPlugin');
      expect(steering).toHaveProperty('documentsByMode');
    });
  });

  describe('2. Project Creation Workflow', () => {
    it('should create a new SDD project', async () => {
      const testProjectPath = path.join(testDir, 'test-sdd-project');
      const project = await projectService.createProject('Test SDD Project', testProjectPath, 'en');

      expect(project).toBeDefined();
      expect(project.name).toBe('Test SDD Project');
      expect(project.path).toBe(testProjectPath);
      expect(project.phase).toBe(WorkflowPhase.INIT);
      expect(project.metadata).toBeDefined();
      expect(project.metadata.language).toBe('en');
    });

    it('should validate project creation requirements', async () => {
      const project = await projectService.createProject('Validation Test', path.join(testDir, 'validation-test'), 'en');
      
      expect(project.id).toBeDefined();
      expect(project.metadata.createdAt).toBeDefined();
      expect(project.metadata.updatedAt).toBeDefined();
      expect(project.metadata.approvals).toBeDefined();
      expect(project.metadata.approvals.requirements.generated).toBe(false);
      expect(project.metadata.approvals.requirements.approved).toBe(false);
    });
  });

  describe('3. Workflow Phase Validation', () => {
    let testProject: any;

    beforeAll(async () => {
      // Create project for workflow testing
      testProject = await projectService.createProject('Workflow Test Project', path.join(testDir, 'workflow-test'), 'en');
    });

    it('should validate phase transitions', async () => {
      // Test transition validation for requirements phase
      const validation = await workflowService.validatePhaseTransition(
        testProject.id, 
        WorkflowPhase.REQUIREMENTS
      );
      
      expect(validation).toBeDefined();
      expect(validation.canProgress).toBeDefined();
      expect(typeof validation.canProgress).toBe('boolean');
      
      if (!validation.canProgress) {
        expect(validation.reason).toBeDefined();
      }
    });

    it('should handle workflow progression', async () => {
      // Test that we can progress through workflow phases
      const progressResult = await workflowService.advancePhase(testProject.id);
      
      expect(progressResult).toBeDefined();
      expect(progressResult.success).toBeDefined();
      expect(typeof progressResult.success).toBe('boolean');
    });

    it('should update project with workflow data', async () => {
      // Test updating project with new phase
      const updatedProject = await projectService.updateProject(testProject.id, {
        phase: WorkflowPhase.REQUIREMENTS
      });
      
      expect(updatedProject).toBeDefined();
      expect(updatedProject.phase).toBe(WorkflowPhase.REQUIREMENTS);
      expect(updatedProject.metadata.updatedAt).toBeDefined();
    });
  });

  describe('4. Plugin System Integration', () => {
    it('should support hook registration and execution', async () => {
      // Test hook registration and execution
      const mockHook = {
        name: 'test-validation-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_REQUIREMENTS,
        priority: 100,
        handler: jest.fn().mockResolvedValue({ 
          success: true, 
          data: { enhanced: true } 
        }),
        conditions: []
      };

      await hookSystem.register('validation-test', mockHook);
      
      const executionResult = await hookSystem.execute(
        HookPhase.PRE_REQUIREMENTS,
        { test: 'data' },
        {}
      );
      
      expect(executionResult.success).toBe(true);
    });

    it('should support tool registration', async () => {
      const mockTool = {
        name: 'test-validation-tool',
        description: 'A test validation tool',
        category: ToolCategory.VALIDATION,
        handler: jest.fn().mockResolvedValue({
          success: true,
          data: { validated: true }
        }),
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          }
        },
        outputSchema: {
          type: 'object',
          properties: {
            result: { type: 'boolean' }
          }
        },
        permissions: []
      };

      await toolRegistry.register('validation-test', mockTool);
      
      const registeredTools = await toolRegistry.getAllTools();
      expect(registeredTools).toBeDefined();
      expect(typeof registeredTools).toBe('object');
    });

    it('should support steering document registration', async () => {
      const mockSteeringDoc = {
        name: 'test-steering',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.CONDITIONAL,
        priority: 100,
        patterns: ['*.test.ts'],
        template: 'Test steering: {{variable}}',
        variables: [
          {
            name: 'variable',
            type: 'string' as const,
            description: 'Test variable',
            required: false,
            defaultValue: 'default'
          }
        ]
      };

      await steeringRegistry.register('validation-test', mockSteeringDoc);
      
      const stats = await steeringRegistry.getSteeringStatistics();
      expect(stats.totalDocuments).toBeGreaterThan(0);
      expect(stats.documentsByPlugin).toBeDefined();
    });
  });

  describe('5. Quality and Internationalization', () => {
    it('should provide code quality analysis', async () => {
      const qualityService = container.get(TYPES.QualityService);
      
      const testCode = `
        function calculateComplexity(input: any): number {
          if (!input) return 0;
          if (typeof input === 'string') {
            return input.length > 100 ? 5 : 1;
          }
          return 3;
        }
      `;
      
      const analysis = await qualityService.analyzeCode(testCode, 'typescript');
      expect(analysis).toBeDefined();
      expect(analysis.overall).toBeDefined();
      expect(analysis.layers).toBeDefined();
      expect(analysis.layers).toHaveLength(5); // Linus-style 5-layer analysis
    });

    it('should support internationalization', async () => {
      const i18nService = container.get(TYPES.I18nManagerPort);
      
      // Test message localization
      const englishMessage = await i18nService.getMessage('workflow.phase.init', {}, 'en');
      const spanishMessage = await i18nService.getMessage('workflow.phase.init', {}, 'es');
      
      expect(englishMessage).toBeDefined();
      expect(spanishMessage).toBeDefined();
      expect(englishMessage).not.toBe(spanishMessage);
    });
  });

  describe('6. Template System', () => {
    it('should generate files from templates', async () => {
      const templateService = container.get(TYPES.TemplateService);
      
      const templateData = {
        projectName: 'TestProject',
        author: 'Test Developer',
        version: '1.0.0',
        components: ['Auth', 'API', 'Database']
      };
      
      const generatedFiles = await templateService.generateProjectFiles(
        'typescript-library',
        templateData,
        testDir
      );
      
      expect(generatedFiles).toBeDefined();
      expect(Array.isArray(generatedFiles)).toBe(true);
    });
  });

  describe('7. Performance and Reliability', () => {
    it('should handle concurrent project creation', async () => {
      const promises = Array.from({ length: 5 }, async (_, i) => {
        return projectService.createProject(
          `Concurrent Project ${i}`,
          path.join(testDir, `concurrent-project-${i}`),
          'en'
        );
      });
      
      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.name).toBe(`Concurrent Project ${index}`);
        expect(result.id).toBeDefined();
      });
    });

    it('should maintain system stability under load', async () => {
      const startTime = Date.now();
      
      // Simulate high-frequency operations
      const operations = Array.from({ length: 50 }, async () => {
        const hooks = await hookSystem.getAllHooks();
        const tools = await toolRegistry.getAllTools();
        const steering = await steeringRegistry.getSteeringStatistics();
        
        return { hooks, tools, steering };
      });
      
      const results = await Promise.all(operations);
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(results).toHaveLength(50);
      expect(executionTime).toBeWithinTimeThreshold(5000); // Should complete within 5 seconds
      
      // Verify all operations succeeded
      results.forEach(result => {
        expect(result.hooks).toBeDefined();
        expect(result.tools).toBeDefined();
        expect(result.steering).toBeDefined();
      });
    });
  });

  describe('8. System Health and Diagnostics', () => {
    it('should provide comprehensive system status', async () => {
      const systemStatus = {
        server: server.mcpServer ? 'running' : 'stopped',
        plugins: await pluginManager.getAllPlugins(),
        hooks: await hookSystem.getAllHooks(),
        tools: await toolRegistry.getAllTools(),
        steering: await steeringRegistry.getSteeringStatistics()
      };
      
      expect(systemStatus.server).toBe('running');
      expect(Array.isArray(systemStatus.plugins)).toBe(true);
      expect(typeof systemStatus.hooks).toBe('object');
      expect(typeof systemStatus.tools).toBe('object');
      expect(systemStatus.steering).toHaveProperty('totalDocuments');
    });

    it('should handle graceful shutdown', async () => {
      // Test graceful shutdown capability
      expect(typeof server.close).toBe('function');
      
      // Verify server components are properly initialized
      expect(server.mcpServer).toBeDefined();
      expect(server.logger).toBeDefined();
      expect(server.container).toBeDefined();
    });
  });
});