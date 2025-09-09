// End-to-end tests for complete MCP SDD workflow validation

import 'reflect-metadata';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import the complete MCP server setup
import { createMCPServer } from '../../index.js';
import { 
  WorkflowPhase, 
  WorkflowState, 
  ApprovalStatus 
} from '../../domain/context/ProjectContext.js';

// Mock MCP SDK for E2E testing
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('End-to-End MCP SDD Workflow Tests', () => {
  let tempDir: string;
  let testProjectPath: string;
  let mcpServer: any;
  let mockServer: jest.Mocked<Server>;
  let mockTransport: jest.Mocked<StdioServerTransport>;

  beforeAll(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-sdd-e2e-'));
    testProjectPath = path.join(tempDir, 'test-project');
    await fs.mkdir(testProjectPath, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Setup MCP SDK mocks
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
      close: jest.fn()
    } as any;

    mockTransport = {
      start: jest.fn(),
      close: jest.fn()
    } as any;

    (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);
    (StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>).mockImplementation(() => mockTransport);
  });

  describe('Complete SDD Workflow via MCP Tools', () => {
    let registeredTools: Map<string, any>;
    let toolHandlers: Map<string, Function>;

    beforeEach(async () => {
      registeredTools = new Map();
      toolHandlers = new Map();

      // Mock server.setRequestHandler to capture tool registrations
      mockServer.setRequestHandler.mockImplementation((schema: any, handler: Function) => {
        if (schema.method === 'tools/list') {
          // Store list tools handler
          toolHandlers.set('list', handler);
        } else if (schema.method === 'tools/call') {
          // Store call tool handler
          toolHandlers.set('call', handler);
        }
      });

      // Initialize MCP server
      mcpServer = await createMCPServer();
      await mcpServer.initialize();
    });

    afterEach(async () => {
      if (mcpServer) {
        await mcpServer.close();
      }
    });

    it('should complete full SDD workflow using MCP tools', async () => {
      // Step 1: List available tools
      const listHandler = toolHandlers.get('list');
      expect(listHandler).toBeDefined();

      const toolsResponse = await listHandler!({ method: 'tools/list', params: {} });
      const tools = toolsResponse.tools;

      // Verify essential SDD tools are available
      const toolNames = tools.map((tool: any) => tool.name);
      expect(toolNames).toEqual(expect.arrayContaining([
        'sdd-init',
        'sdd-requirements',
        'sdd-design',
        'sdd-tasks',
        'sdd-implement',
        'sdd-status',
        'sdd-approve',
        'sdd-quality-check',
        'sdd-template-render',
        'sdd-context-load'
      ]));

      const callHandler = toolHandlers.get('call');
      expect(callHandler).toBeDefined();

      // Step 2: Initialize SDD project
      const initResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-init',
          arguments: {
            projectPath: testProjectPath,
            projectName: 'E2E Test Project',
            description: 'End-to-end testing project for MCP SDD workflow'
          }
        }
      });

      expect(initResult.content[0].text).toContain('Project initialized successfully');
      
      // Verify .kiro directory structure was created
      const kiroPath = path.join(testProjectPath, '.kiro');
      const kiroExists = await fs.access(kiroPath).then(() => true).catch(() => false);
      expect(kiroExists).toBe(true);

      // Step 3: Check initial status
      const statusResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-status',
          arguments: { projectPath: testProjectPath }
        }
      });

      const statusData = JSON.parse(statusResult.content[0].text);
      expect(statusData.currentPhase).toBe('INIT');
      expect(statusData.state).toBe('IN_PROGRESS');

      // Step 4: Generate requirements
      const requirementsResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-requirements',
          arguments: {
            projectPath: testProjectPath,
            features: [
              'User authentication',
              'Data persistence',
              'API endpoints',
              'Error handling'
            ],
            constraints: [
              'Must be TypeScript',
              'Must use clean architecture',
              'Must have 90%+ test coverage'
            ]
          }
        }
      });

      expect(requirementsResult.content[0].text).toContain('Requirements generated successfully');

      // Verify requirements.md was created
      const requirementsPath = path.join(testProjectPath, '.kiro', 'specs', 'requirements.md');
      const requirementsExists = await fs.access(requirementsPath).then(() => true).catch(() => false);
      expect(requirementsExists).toBe(true);

      const requirementsContent = await fs.readFile(requirementsPath, 'utf8');
      expect(requirementsContent).toContain('User authentication');
      expect(requirementsContent).toContain('TypeScript');

      // Step 5: Approve INIT phase
      const approveInitResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-approve',
          arguments: {
            projectPath: testProjectPath,
            phase: 'INIT',
            comment: 'Initial setup looks good'
          }
        }
      });

      expect(approveInitResult.content[0].text).toContain('Phase INIT approved successfully');

      // Step 6: Progress to REQUIREMENTS phase (should happen automatically)
      const requirementsStatusResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-status',
          arguments: { projectPath: testProjectPath }
        }
      });

      const requirementsStatusData = JSON.parse(requirementsStatusResult.content[0].text);
      expect(requirementsStatusData.currentPhase).toBe('REQUIREMENTS');

      // Step 7: Approve REQUIREMENTS phase
      const approveReqResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-approve',
          arguments: {
            projectPath: testProjectPath,
            phase: 'REQUIREMENTS',
            comment: 'Requirements are comprehensive and clear'
          }
        }
      });

      expect(approveReqResult.content[0].text).toContain('Phase REQUIREMENTS approved successfully');

      // Step 8: Generate design document
      const designResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-design',
          arguments: {
            projectPath: testProjectPath,
            architecture: 'clean-architecture',
            components: [
              'Authentication Service',
              'Data Access Layer',
              'API Controllers',
              'Business Logic Layer'
            ],
            patterns: [
              'Repository Pattern',
              'Dependency Injection',
              'Strategy Pattern'
            ]
          }
        }
      });

      expect(designResult.content[0].text).toContain('Design document generated successfully');

      // Verify design.md was created
      const designPath = path.join(testProjectPath, '.kiro', 'specs', 'design.md');
      const designExists = await fs.access(designPath).then(() => true).catch(() => false);
      expect(designExists).toBe(true);

      const designContent = await fs.readFile(designPath, 'utf8');
      expect(designContent).toContain('clean-architecture');
      expect(designContent).toContain('Authentication Service');

      // Step 9: Approve DESIGN phase
      const approveDesignResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-approve',
          arguments: {
            projectPath: testProjectPath,
            phase: 'DESIGN',
            comment: 'Architecture design is solid'
          }
        }
      });

      expect(approveDesignResult.content[0].text).toContain('Phase DESIGN approved successfully');

      // Step 10: Generate task list
      const tasksResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-tasks',
          arguments: {
            projectPath: testProjectPath,
            breakdown: 'component-based',
            priority: 'high-to-low'
          }
        }
      });

      expect(tasksResult.content[0].text).toContain('Task list generated successfully');

      // Verify tasks.md was created
      const tasksPath = path.join(testProjectPath, '.kiro', 'specs', 'tasks.md');
      const tasksExists = await fs.access(tasksPath).then(() => true).catch(() => false);
      expect(tasksExists).toBe(true);

      const tasksContent = await fs.readFile(tasksPath, 'utf8');
      expect(tasksContent).toContain('- [ ]'); // Should contain task checkboxes
      expect(tasksContent).toContain('Authentication'); // Based on design components

      // Step 11: Approve TASKS phase
      const approveTasksResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-approve',
          arguments: {
            projectPath: testProjectPath,
            phase: 'TASKS',
            comment: 'Task breakdown is detailed and actionable'
          }
        }
      });

      expect(approveTasksResult.content[0].text).toContain('Phase TASKS approved successfully');

      // Step 12: Begin implementation phase
      const implementResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-implement',
          arguments: {
            projectPath: testProjectPath,
            taskId: 1,
            implementation: 'Created authentication service with JWT support'
          }
        }
      });

      expect(implementResult.content[0].text).toContain('Implementation progress recorded');

      // Step 13: Run quality check
      const qualityResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-quality-check',
          arguments: {
            projectPath: testProjectPath,
            includeMetrics: true
          }
        }
      });

      expect(qualityResult.content[0].text).toContain('Quality check completed');

      // Step 14: Check final status
      const finalStatusResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-status',
          arguments: { projectPath: testProjectPath }
        }
      });

      const finalStatusData = JSON.parse(finalStatusResult.content[0].text);
      expect(finalStatusData.currentPhase).toBe('IMPLEMENTATION');
      expect(finalStatusData.phases.INIT.status).toBe('APPROVED');
      expect(finalStatusData.phases.REQUIREMENTS.status).toBe('APPROVED');
      expect(finalStatusData.phases.DESIGN.status).toBe('APPROVED');
      expect(finalStatusData.phases.TASKS.status).toBe('APPROVED');

      // Verify workflow metrics
      expect(finalStatusData.metrics).toBeDefined();
      expect(finalStatusData.metrics.phasesCompleted).toBeGreaterThan(3);
      expect(finalStatusData.metrics.completionPercentage).toBeGreaterThan(60);
    });

    it('should handle workflow rollback via MCP tools', async () => {
      const callHandler = toolHandlers.get('call');

      // Initialize and progress to DESIGN phase
      await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-init',
          arguments: { projectPath: testProjectPath, projectName: 'Rollback Test' }
        }
      });

      await callHandler!({ method: 'tools/call', params: { name: 'sdd-approve', arguments: { projectPath: testProjectPath, phase: 'INIT' } } });
      await callHandler!({ method: 'tools/call', params: { name: 'sdd-requirements', arguments: { projectPath: testProjectPath, features: ['feature1'] } } });
      await callHandler!({ method: 'tools/call', params: { name: 'sdd-approve', arguments: { projectPath: testProjectPath, phase: 'REQUIREMENTS' } } });
      await callHandler!({ method: 'tools/call', params: { name: 'sdd-design', arguments: { projectPath: testProjectPath, architecture: 'mvc' } } });

      // Check we're in DESIGN phase
      const beforeRollbackStatus = await callHandler!({
        method: 'tools/call',
        params: { name: 'sdd-status', arguments: { projectPath: testProjectPath } }
      });

      const beforeData = JSON.parse(beforeRollbackStatus.content[0].text);
      expect(beforeData.currentPhase).toBe('DESIGN');

      // Perform rollback to REQUIREMENTS
      const rollbackResult = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-rollback',
          arguments: {
            projectPath: testProjectPath,
            targetPhase: 'REQUIREMENTS',
            reason: 'Need to revise requirements based on design feedback'
          }
        }
      });

      expect(rollbackResult.content[0].text).toContain('Workflow rolled back successfully');

      // Verify rollback
      const afterRollbackStatus = await callHandler!({
        method: 'tools/call',
        params: { name: 'sdd-status', arguments: { projectPath: testProjectPath } }
      });

      const afterData = JSON.parse(afterRollbackStatus.content[0].text);
      expect(afterData.currentPhase).toBe('REQUIREMENTS');
      expect(afterData.phases.DESIGN.status).toBe('PENDING');
    });

    it('should handle concurrent MCP client sessions', async () => {
      const callHandler = toolHandlers.get('call');

      // Simulate multiple clients working on different projects
      const project1Path = path.join(tempDir, 'project1');
      const project2Path = path.join(tempDir, 'project2');

      await fs.mkdir(project1Path, { recursive: true });
      await fs.mkdir(project2Path, { recursive: true });

      // Client 1: Initialize project 1
      const init1Result = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-init',
          arguments: { projectPath: project1Path, projectName: 'Concurrent Project 1' }
        }
      });

      expect(init1Result.content[0].text).toContain('Project initialized successfully');

      // Client 2: Initialize project 2 simultaneously
      const init2Result = await callHandler!({
        method: 'tools/call',
        params: {
          name: 'sdd-init',
          arguments: { projectPath: project2Path, projectName: 'Concurrent Project 2' }
        }
      });

      expect(init2Result.content[0].text).toContain('Project initialized successfully');

      // Verify both projects are independent
      const status1Result = await callHandler!({
        method: 'tools/call',
        params: { name: 'sdd-status', arguments: { projectPath: project1Path } }
      });

      const status2Result = await callHandler!({
        method: 'tools/call',
        params: { name: 'sdd-status', arguments: { projectPath: project2Path } }
      });

      const status1Data = JSON.parse(status1Result.content[0].text);
      const status2Data = JSON.parse(status2Result.content[0].text);

      expect(status1Data.projectPath).toBe(project1Path);
      expect(status2Data.projectPath).toBe(project2Path);
      expect(status1Data.currentPhase).toBe('INIT');
      expect(status2Data.currentPhase).toBe('INIT');

      // Progress project 1 to REQUIREMENTS
      await callHandler!({ method: 'tools/call', params: { name: 'sdd-approve', arguments: { projectPath: project1Path, phase: 'INIT' } } });
      await callHandler!({ method: 'tools/call', params: { name: 'sdd-requirements', arguments: { projectPath: project1Path, features: ['auth'] } } });

      // Verify project 2 is unaffected
      const finalStatus2Result = await callHandler!({
        method: 'tools/call',
        params: { name: 'sdd-status', arguments: { projectPath: project2Path } }
      });

      const finalStatus2Data = JSON.parse(finalStatus2Result.content[0].text);
      expect(finalStatus2Data.currentPhase).toBe('INIT'); // Should still be INIT
    });
  });

  describe('Plugin System E2E Integration', () => {
    let callHandler: Function;

    beforeEach(async () => {
      // Setup MCP server with plugin system
      mcpServer = await createMCPServer();
      await mcpServer.initialize();

      const handlers = new Map<string, Function>();
      mockServer.setRequestHandler.mockImplementation((schema: any, handler: Function) => {
        if (schema.method === 'tools/call') {
          handlers.set('call', handler);
        }
      });

      callHandler = handlers.get('call')!;
    });

    it('should load and execute plugins throughout workflow', async () => {
      // Initialize project
      await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-init',
          arguments: { projectPath: testProjectPath, projectName: 'Plugin Test Project' }
        }
      });

      // Install a test plugin (simulate plugin installation)
      const pluginInstallResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-plugin-install',
          arguments: {
            projectPath: testProjectPath,
            pluginId: 'test-enhancement-plugin',
            version: '1.0.0'
          }
        }
      });

      expect(pluginInstallResult.content[0].text).toContain('Plugin installed successfully');

      // List available plugins
      const pluginListResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-plugin-list',
          arguments: { projectPath: testProjectPath }
        }
      });

      const pluginData = JSON.parse(pluginListResult.content[0].text);
      expect(pluginData.plugins).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'test-enhancement-plugin',
          status: 'installed'
        })
      ]));

      // Execute plugin-provided tool
      const pluginToolResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'enhance-requirements', // Tool provided by plugin
          arguments: {
            projectPath: testProjectPath,
            enhancementType: 'security'
          }
        }
      });

      expect(pluginToolResult.content[0].text).toContain('Requirements enhanced with security considerations');

      // Verify plugin hooks were executed during workflow
      await callHandler({ method: 'tools/call', params: { name: 'sdd-approve', arguments: { projectPath: testProjectPath, phase: 'INIT' } } });
      
      const requirementsResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-requirements',
          arguments: { projectPath: testProjectPath, features: ['basic-auth'] }
        }
      });

      // Plugin should have enhanced the requirements
      expect(requirementsResult.content[0].text).toContain('enhanced by plugin');
    });

    it('should handle plugin failures gracefully', async () => {
      // Initialize project
      await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-init',
          arguments: { projectPath: testProjectPath, projectName: 'Plugin Failure Test' }
        }
      });

      // Try to install a non-existent plugin
      const failedPluginResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-plugin-install',
          arguments: {
            projectPath: testProjectPath,
            pluginId: 'non-existent-plugin',
            version: '1.0.0'
          }
        }
      });

      expect(failedPluginResult.content[0].text).toContain('Plugin installation failed');

      // Verify workflow can continue without the plugin
      await callHandler({ method: 'tools/call', params: { name: 'sdd-approve', arguments: { projectPath: testProjectPath, phase: 'INIT' } } });
      
      const requirementsResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-requirements',
          arguments: { projectPath: testProjectPath, features: ['basic-feature'] }
        }
      });

      expect(requirementsResult.content[0].text).toContain('Requirements generated successfully');
    });
  });

  describe('Error Recovery and Data Persistence E2E', () => {
    let callHandler: Function;

    beforeEach(async () => {
      mcpServer = await createMCPServer();
      await mcpServer.initialize();

      const handlers = new Map<string, Function>();
      mockServer.setRequestHandler.mockImplementation((schema: any, handler: Function) => {
        if (schema.method === 'tools/call') {
          handlers.set('call', handler);
        }
      });

      callHandler = handlers.get('call')!;
    });

    it('should recover workflow state after server restart', async () => {
      // Initialize and progress through multiple phases
      await callHandler({ method: 'tools/call', params: { name: 'sdd-init', arguments: { projectPath: testProjectPath, projectName: 'Recovery Test' } } });
      await callHandler({ method: 'tools/call', params: { name: 'sdd-approve', arguments: { projectPath: testProjectPath, phase: 'INIT' } } });
      await callHandler({ method: 'tools/call', params: { name: 'sdd-requirements', arguments: { projectPath: testProjectPath, features: ['recovery-test'] } } });
      await callHandler({ method: 'tools/call', params: { name: 'sdd-approve', arguments: { projectPath: testProjectPath, phase: 'REQUIREMENTS' } } });

      // Check status before "restart"
      const beforeRestartStatus = await callHandler({
        method: 'tools/call',
        params: { name: 'sdd-status', arguments: { projectPath: testProjectPath } }
      });

      const beforeData = JSON.parse(beforeRestartStatus.content[0].text);
      expect(beforeData.currentPhase).toBe('DESIGN');
      expect(beforeData.phases.REQUIREMENTS.status).toBe('APPROVED');

      // Simulate server restart by creating new instance
      await mcpServer.close();
      mcpServer = await createMCPServer();
      await mcpServer.initialize();

      // Recreate handler after restart
      mockServer.setRequestHandler.mockImplementation((schema: any, handler: Function) => {
        if (schema.method === 'tools/call') {
          callHandler = handler;
        }
      });

      // Load project context after restart
      const loadContextResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-context-load',
          arguments: { projectPath: testProjectPath }
        }
      });

      expect(loadContextResult.content[0].text).toContain('Project context loaded successfully');

      // Verify state was restored
      const afterRestartStatus = await callHandler({
        method: 'tools/call',
        params: { name: 'sdd-status', arguments: { projectPath: testProjectPath } }
      });

      const afterData = JSON.parse(afterRestartStatus.content[0].text);
      expect(afterData.currentPhase).toBe(beforeData.currentPhase);
      expect(afterData.phases.REQUIREMENTS.status).toBe('APPROVED');
      expect(afterData.phases.INIT.status).toBe('APPROVED');

      // Verify workflow can continue normally
      const designResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-design',
          arguments: { projectPath: testProjectPath, architecture: 'restored' }
        }
      });

      expect(designResult.content[0].text).toContain('Design document generated successfully');
    });

    it('should handle corrupted workflow state gracefully', async () => {
      // Initialize project
      await callHandler({ method: 'tools/call', params: { name: 'sdd-init', arguments: { projectPath: testProjectPath, projectName: 'Corruption Test' } } });

      // Manually corrupt workflow state file
      const workflowStatePath = path.join(testProjectPath, '.kiro', 'workflow-state.json');
      await fs.writeFile(workflowStatePath, 'invalid json content');

      // Try to load context - should handle corruption gracefully
      const loadResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-context-load',
          arguments: { projectPath: testProjectPath }
        }
      });

      expect(loadResult.content[0].text).toContain('Workflow state corrupted, reinitializing');

      // Verify status shows reinitialized state
      const statusResult = await callHandler({
        method: 'tools/call',
        params: { name: 'sdd-status', arguments: { projectPath: testProjectPath } }
      });

      const statusData = JSON.parse(statusResult.content[0].text);
      expect(statusData.currentPhase).toBe('INIT');
      expect(statusData.state).toBe('IN_PROGRESS');
    });
  });

  describe('Performance and Load Testing E2E', () => {
    let callHandler: Function;

    beforeEach(async () => {
      mcpServer = await createMCPServer();
      await mcpServer.initialize();

      const handlers = new Map<string, Function>();
      mockServer.setRequestHandler.mockImplementation((schema: any, handler: Function) => {
        if (schema.method === 'tools/call') {
          handlers.set('call', handler);
        }
      });

      callHandler = handlers.get('call')!;
    });

    it('should handle multiple concurrent workflows efficiently', async () => {
      const numProjects = 10;
      const projects = Array.from({ length: numProjects }, (_, i) => ({
        path: path.join(tempDir, `concurrent-project-${i}`),
        name: `Concurrent Project ${i}`
      }));

      // Create project directories
      await Promise.all(projects.map(p => fs.mkdir(p.path, { recursive: true })));

      const startTime = Date.now();

      // Initialize all projects concurrently
      const initPromises = projects.map(project => 
        callHandler({
          method: 'tools/call',
          params: {
            name: 'sdd-init',
            arguments: { projectPath: project.path, projectName: project.name }
          }
        })
      );

      const initResults = await Promise.all(initPromises);
      
      // Verify all initializations succeeded
      initResults.forEach(result => {
        expect(result.content[0].text).toContain('Project initialized successfully');
      });

      // Progress all projects through requirements phase
      const requirementsPromises = projects.map(async (project, i) => {
        await callHandler({ method: 'tools/call', params: { name: 'sdd-approve', arguments: { projectPath: project.path, phase: 'INIT' } } });
        return callHandler({
          method: 'tools/call',
          params: {
            name: 'sdd-requirements',
            arguments: { projectPath: project.path, features: [`feature-${i}`] }
          }
        });
      });

      const requirementsResults = await Promise.all(requirementsPromises);
      
      requirementsResults.forEach(result => {
        expect(result.content[0].text).toContain('Requirements generated successfully');
      });

      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all projects have independent state
      const statusPromises = projects.map(project => 
        callHandler({
          method: 'tools/call',
          params: { name: 'sdd-status', arguments: { projectPath: project.path } }
        })
      );

      const statusResults = await Promise.all(statusPromises);
      
      statusResults.forEach((result, i) => {
        const statusData = JSON.parse(result.content[0].text);
        expect(statusData.currentPhase).toBe('REQUIREMENTS');
        expect(statusData.projectPath).toBe(projects[i].path);
      });
    });

    it('should maintain performance with large project structures', async () => {
      // Create project with many files and directories
      const largeProjectPath = path.join(tempDir, 'large-project');
      await fs.mkdir(largeProjectPath, { recursive: true });

      // Create nested directory structure
      for (let i = 0; i < 10; i++) {
        const dirPath = path.join(largeProjectPath, `module-${i}`);
        await fs.mkdir(dirPath, { recursive: true });
        
        for (let j = 0; j < 20; j++) {
          const filePath = path.join(dirPath, `file-${j}.ts`);
          await fs.writeFile(filePath, `// File content ${i}-${j}\nexport default {};`);
        }
      }

      const startTime = Date.now();

      // Initialize large project
      const initResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-init',
          arguments: { projectPath: largeProjectPath, projectName: 'Large Project Test' }
        }
      });

      const initTime = Date.now() - startTime;
      expect(initResult.content[0].text).toContain('Project initialized successfully');
      expect(initTime).toBeLessThan(2000); // Should complete within 2 seconds

      // Test codebase analysis performance
      const analysisStartTime = Date.now();
      
      const analysisResult = await callHandler({
        method: 'tools/call',
        params: {
          name: 'sdd-analyze-codebase',
          arguments: { 
            projectPath: largeProjectPath,
            includeMetrics: true,
            deepScan: true
          }
        }
      });

      const analysisTime = Date.now() - analysisStartTime;
      expect(analysisResult.content[0].text).toContain('Codebase analysis completed');
      expect(analysisTime).toBeLessThan(3000); // Should complete within 3 seconds

      const analysisData = JSON.parse(analysisResult.content[0].text);
      expect(analysisData.stats.totalFiles).toBe(200);
      expect(analysisData.stats.totalDirectories).toBe(10);
    });
  });
});