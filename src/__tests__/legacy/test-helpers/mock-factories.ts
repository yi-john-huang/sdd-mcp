// Mock factories for consistent test data generation

import { 
  HookType, 
  HookPhase, 
  ToolCategory, 
  PermissionType,
  SteeringDocumentType as PluginSteeringDocumentType,
  SteeringMode,
  PluginState,
  ValidationSeverity,
  SecuritySeverity
} from '../../domain/plugins/index.js';

import {
  WorkflowPhase,
  WorkflowState,
  ApprovalStatus
} from '../../domain/types.js';

import { SteeringDocumentType } from '../../domain/context/ProjectContext.js';

export class MockFactories {
  // Hook System Mocks
  static createMockHookRegistration(overrides: any = {}) {
    return {
      pluginId: 'test-plugin',
      name: 'test-hook',
      type: HookType.FILTER,
      phase: HookPhase.PRE_INIT,
      priority: 100,
      handler: jest.fn().mockResolvedValue({ success: true, data: {} }),
      conditions: [],
      ...overrides
    };
  }

  static createMockHookExecutionContext(overrides: any = {}) {
    return {
      hookName: 'test-hook',
      phase: HookPhase.PRE_INIT,
      data: { test: true },
      metadata: {},
      cancellationToken: {
        isCancelled: false,
        cancel: jest.fn(),
        onCancelled: jest.fn()
      },
      ...overrides
    };
  }

  static createMockHookResult(overrides: any = {}) {
    return {
      success: true,
      data: { processed: true },
      metadata: {
        executionTime: 100,
        hooksExecuted: 1,
        errorCount: 0
      },
      ...overrides
    };
  }

  // Tool Registry Mocks
  static createMockToolRegistration(overrides: any = {}) {
    return {
      pluginId: 'test-plugin',
      name: 'test-tool',
      description: 'A test tool',
      category: ToolCategory.UTILITY,
      handler: jest.fn().mockResolvedValue({ success: true, data: {} }),
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'string' }
        }
      },
      permissions: [],
      ...overrides
    };
  }

  static createMockToolExecutionContext(overrides: any = {}) {
    return {
      toolName: 'test-tool',
      pluginId: 'test-plugin',
      user: 'test-user',
      session: 'test-session',
      metadata: {},
      ...overrides
    };
  }

  static createMockToolResult(overrides: any = {}) {
    return {
      success: true,
      data: { result: 'success' },
      metadata: {
        executionTime: 150,
        inputValidated: true,
        outputValidated: true
      },
      ...overrides
    };
  }

  // Steering Document Mocks
  static createMockSteeringDeclaration(overrides: any = {}) {
    return {
      name: 'test-steering',
      type: SteeringDocumentType.CUSTOM,
      mode: SteeringMode.ALWAYS,
      priority: 100,
      patterns: [],
      template: 'Test steering content: {{variable}}',
      variables: [
        {
          name: 'variable',
          type: 'string',
          description: 'Test variable',
          required: false,
          defaultValue: 'default'
        }
      ],
      ...overrides
    };
  }

  static createMockSteeringContext(overrides: any = {}) {
    return {
      currentFile: 'test.ts',
      projectPath: '/test/project',
      workingDirectory: '/test/project',
      variables: { variable: 'test-value' },
      metadata: { timestamp: new Date().toISOString() },
      ...overrides
    };
  }

  static createMockSteeringResult(overrides: any = {}) {
    return {
      applicable: true,
      content: 'Test steering content: test-value',
      variables: { variable: 'test-value' },
      priority: 100,
      conflictsWith: [],
      ...overrides
    };
  }

  // Plugin Mocks
  static createMockPlugin(overrides: any = {}) {
    return {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A comprehensive test plugin',
      author: 'Test Developer',
      homepage: 'https://example.com',
      repository: 'https://github.com/test/plugin',
      license: 'MIT',
      keywords: ['test', 'sdd', 'plugin'],
      dependencies: [],
      peerDependencies: [],
      engines: [
        { name: 'node', version: '>=18.0.0' },
        { name: 'sdd-mcp', version: '>=1.0.0' }
      ],
      capabilities: [
        {
          type: 'hook',
          name: 'workflow-enhancement',
          description: 'Enhances workflow execution',
          required: false,
          configuration: {}
        }
      ],
      hooks: [
        {
          name: 'enhance-requirements',
          type: HookType.FILTER,
          phase: HookPhase.PRE_REQUIREMENTS,
          priority: 200,
          description: 'Enhances requirements with additional context',
          parameters: [
            {
              name: 'context',
              type: 'object',
              required: true,
              description: 'Execution context'
            }
          ],
          returnType: 'HookResult'
        }
      ],
      tools: [
        {
          name: 'analyze-complexity',
          description: 'Analyzes code complexity',
          category: ToolCategory.QUALITY,
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string' }
            },
            required: ['filePath']
          },
          outputSchema: {
            type: 'object',
            properties: {
              complexity: { type: 'number' },
              suggestions: { type: 'array' }
            }
          },
          examples: [
            {
              name: 'Analyze TypeScript file',
              description: 'Analyze complexity of a TypeScript file',
              input: { filePath: 'src/component.ts' },
              expectedOutput: { complexity: 15, suggestions: ['Extract helper function'] }
            }
          ],
          permissions: [
            {
              type: PermissionType.FILE_READ,
              resource: 'src/**/*.ts',
              actions: ['read']
            }
          ]
        }
      ],
      steeringDocuments: [
        {
          name: 'coding-standards',
          type: SteeringDocumentType.TECHNICAL,
          mode: SteeringMode.ALWAYS,
          priority: 150,
          patterns: [],
          template: '# Coding Standards\n\nFollow {{standard}} guidelines.',
          variables: [
            {
              name: 'standard',
              type: 'string',
              description: 'Coding standard to follow',
              required: true,
              defaultValue: 'TypeScript'
            }
          ]
        }
      ],
      configuration: {
        schema: {
          type: 'object',
          properties: {
            enableEnhancements: { type: 'boolean' },
            complexityThreshold: { type: 'number', minimum: 0, maximum: 100 }
          }
        },
        defaults: {
          enableEnhancements: true,
          complexityThreshold: 10
        },
        required: ['enableEnhancements'],
        validation: [
          {
            field: 'complexityThreshold',
            type: 'range',
            rules: [
              {
                type: 'min',
                value: 1,
                message: 'Complexity threshold must be at least 1'
              }
            ],
            message: 'Invalid complexity threshold'
          }
        ]
      },
      metadata: {
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
        installedAt: new Date('2024-01-20'),
        lastUsed: new Date('2024-01-22'),
        usageCount: 50,
        ratings: [
          {
            userId: 'user1',
            rating: 5,
            comment: 'Excellent plugin!',
            createdAt: new Date('2024-01-21')
          }
        ],
        tags: ['workflow', 'quality', 'analysis'],
        category: 'QUALITY',
        maturity: 'STABLE',
        supportedLanguages: ['typescript', 'javascript']
      },
      ...overrides
    };
  }

  static createMockPluginInstance(overrides: any = {}) {
    const plugin = this.createMockPlugin();
    return {
      plugin,
      instance: {
        initialize: jest.fn(),
        activate: jest.fn(),
        deactivate: jest.fn(),
        dispose: jest.fn(),
        getConfiguration: jest.fn().mockReturnValue({}),
        setConfiguration: jest.fn(),
        executeHook: jest.fn().mockResolvedValue({ success: true }),
        executeTool: jest.fn().mockResolvedValue({ success: true })
      },
      state: PluginState.ACTIVE,
      loadedAt: new Date(),
      configuration: plugin.configuration.defaults,
      hooks: [],
      tools: [],
      ...overrides
    };
  }

  static createMockPluginDescriptor(overrides: any = {}) {
    return {
      path: '/plugins/test-plugin',
      manifest: this.createMockPlugin(),
      valid: true,
      errors: [],
      warnings: [],
      ...overrides
    };
  }

  static createMockPluginValidationResult(overrides: any = {}) {
    return {
      valid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
      compatibilityIssues: [],
      ...overrides
    };
  }

  // Workflow Mocks
  static createMockWorkflowState(overrides: any = {}) {
    return {
      currentPhase: WorkflowPhase.INIT,
      state: WorkflowState.IN_PROGRESS,
      phases: {
        [WorkflowPhase.INIT]: {
          status: WorkflowState.IN_PROGRESS,
          startedAt: new Date(),
          duration: 0
        },
        [WorkflowPhase.REQUIREMENTS]: {
          status: WorkflowState.PENDING,
          duration: 0
        },
        [WorkflowPhase.DESIGN]: {
          status: WorkflowState.PENDING,
          duration: 0
        },
        [WorkflowPhase.TASKS]: {
          status: WorkflowState.PENDING,
          duration: 0
        },
        [WorkflowPhase.IMPLEMENTATION]: {
          status: WorkflowState.PENDING,
          duration: 0
        }
      },
      startedAt: new Date(),
      projectPath: '/test/project',
      ...overrides
    };
  }

  static createMockWorkflowMetrics(overrides: any = {}) {
    return {
      totalDuration: 3600000, // 1 hour
      phasesCompleted: 2,
      phasesRemaining: 3,
      completionPercentage: 40,
      averagePhaseTime: 1800000, // 30 minutes
      estimatedTimeRemaining: 5400000, // 1.5 hours
      currentPhaseElapsedTime: 300000, // 5 minutes
      ...overrides
    };
  }

  // MCP Protocol Mocks
  static createMockMCPTool(overrides: any = {}) {
    return {
      name: 'sdd-init',
      description: 'Initialize a new SDD project',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string' },
          projectName: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['projectPath', 'projectName']
      },
      ...overrides
    };
  }

  static createMockMCPRequest(overrides: any = {}) {
    return {
      method: 'tools/call',
      params: {
        name: 'sdd-init',
        arguments: {
          projectPath: '/test/project',
          projectName: 'Test Project'
        }
      },
      ...overrides
    };
  }

  static createMockMCPResponse(overrides: any = {}) {
    return {
      content: [
        {
          type: 'text',
          text: 'Operation completed successfully'
        }
      ],
      isError: false,
      ...overrides
    };
  }

  // Performance Testing Mocks
  static createMockPerformanceMetrics(overrides: any = {}) {
    return {
      executionTime: 150,
      memoryUsage: 1024 * 1024, // 1MB
      cpuUsage: 15.5,
      operationsPerSecond: 1000,
      errorRate: 0.01,
      successRate: 0.99,
      ...overrides
    };
  }

  // Error and Validation Mocks
  static createMockValidationError(overrides: any = {}) {
    return {
      type: 'validation-error',
      message: 'Validation failed',
      field: 'testField',
      severity: ValidationSeverity.HIGH,
      ...overrides
    };
  }

  static createMockSecurityIssue(overrides: any = {}) {
    return {
      type: 'code-injection',
      severity: SecuritySeverity.HIGH,
      message: 'Potential code injection vulnerability detected',
      recommendation: 'Sanitize user input before processing',
      cve: 'CVE-2024-0001',
      ...overrides
    };
  }

  // Utility methods for batch creation
  static createMockHookRegistrations(count: number): any[] {
    return Array.from({ length: count }, (_, i) => 
      this.createMockHookRegistration({
        name: `hook-${i}`,
        priority: 100 - i,
        pluginId: `plugin-${i}`
      })
    );
  }

  static createMockToolRegistrations(count: number): any[] {
    return Array.from({ length: count }, (_, i) => 
      this.createMockToolRegistration({
        name: `tool-${i}`,
        pluginId: `plugin-${i}`,
        category: Object.values(ToolCategory)[i % Object.values(ToolCategory).length]
      })
    );
  }

  static createMockSteeringDocuments(count: number): any[] {
    return Array.from({ length: count }, (_, i) => 
      this.createMockSteeringDeclaration({
        name: `steering-${i}`,
        priority: 200 - i,
        mode: Object.values(SteeringMode)[i % Object.values(SteeringMode).length]
      })
    );
  }
}