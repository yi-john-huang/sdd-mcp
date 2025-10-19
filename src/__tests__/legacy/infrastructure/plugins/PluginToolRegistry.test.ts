// Unit tests for PluginToolRegistry implementation

import 'reflect-metadata';
import { PluginToolRegistry } from '../../../infrastructure/plugins/PluginToolRegistry.js';
import { 
  ToolCategory,
  PermissionType,
  ToolExecutionContext,
  ToolResult 
} from '../../../domain/plugins/index.js';
import { LoggerPort } from '../../../domain/ports.js';

describe('PluginToolRegistry', () => {
  let toolRegistry: PluginToolRegistry;
  let mockLogger: jest.Mocked<LoggerPort>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    toolRegistry = new PluginToolRegistry(mockLogger);
  });

  describe('register', () => {
    it('should register a tool successfully', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ 
        success: true, 
        data: { result: 'success' } 
      });
      
      const tool = {
        pluginId: 'test-plugin',
        name: 'test-tool',
        description: 'A test tool',
        category: ToolCategory.UTILITY,
        handler: mockHandler,
        inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
        permissions: []
      };

      await toolRegistry.register('test-plugin', tool);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Tool registered successfully',
        expect.objectContaining({
          toolName: 'test-tool',
          pluginId: 'test-plugin',
          category: ToolCategory.UTILITY
        })
      );

      const registeredTool = await toolRegistry.getTool('test-tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool!.name).toBe('test-tool');
    });

    it('should replace existing tool from same plugin', async () => {
      const handler1 = jest.fn().mockResolvedValue({ success: true });
      const handler2 = jest.fn().mockResolvedValue({ success: true });
      
      const tool1 = {
        pluginId: 'test-plugin',
        name: 'test-tool',
        description: 'Original tool',
        category: ToolCategory.UTILITY,
        handler: handler1,
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      const tool2 = {
        pluginId: 'test-plugin',
        name: 'test-tool',
        description: 'Updated tool',
        category: ToolCategory.SDD,
        handler: handler2,
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      await toolRegistry.register('test-plugin', tool1);
      await toolRegistry.register('test-plugin', tool2);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Tool already registered, replacing',
        expect.objectContaining({
          toolName: 'test-tool',
          pluginId: 'test-plugin'
        })
      );

      const registeredTool = await toolRegistry.getTool('test-tool');
      expect(registeredTool!.description).toBe('Updated tool');
      expect(registeredTool!.category).toBe(ToolCategory.SDD);
    });

    it('should prevent registration from different plugins with same tool name', async () => {
      const tool1 = {
        pluginId: 'plugin-1',
        name: 'common-tool',
        description: 'Tool from plugin 1',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      const tool2 = {
        pluginId: 'plugin-2',
        name: 'common-tool',
        description: 'Tool from plugin 2',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      await toolRegistry.register('plugin-1', tool1);
      await expect(toolRegistry.register('plugin-2', tool2)).rejects.toThrow(
        'Tool name "common-tool" is already registered by plugin "plugin-1"'
      );
    });
  });

  describe('unregister', () => {
    it('should unregister tool successfully', async () => {
      const tool = {
        pluginId: 'test-plugin',
        name: 'test-tool',
        description: 'A test tool',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      await toolRegistry.register('test-plugin', tool);
      await toolRegistry.unregister('test-plugin', 'test-tool');

      const registeredTool = await toolRegistry.getTool('test-tool');
      expect(registeredTool).toBeNull();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Tool unregistered successfully',
        expect.objectContaining({
          toolName: 'test-tool',
          pluginId: 'test-plugin'
        })
      );
    });

    it('should warn when tool not found for unregistration', async () => {
      await toolRegistry.unregister('test-plugin', 'non-existent-tool');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Tool not found for unregistration',
        { toolName: 'non-existent-tool', pluginId: 'test-plugin' }
      );
    });
  });

  describe('execute', () => {
    it('should execute tool successfully', async () => {
      const expectedResult = { result: 'success' };
      const mockHandler = jest.fn().mockResolvedValue({ 
        success: true, 
        data: expectedResult 
      });
      
      const tool = {
        pluginId: 'test-plugin',
        name: 'test-tool',
        description: 'A test tool',
        category: ToolCategory.UTILITY,
        handler: mockHandler,
        inputSchema: { 
          type: 'object', 
          properties: { 
            input: { type: 'string' } 
          },
          required: ['input']
        },
        outputSchema: { type: 'object' },
        permissions: []
      };

      await toolRegistry.register('test-plugin', tool);

      const input = { input: 'test' };
      const context: ToolExecutionContext = {
        toolName: 'test-tool',
        pluginId: 'test-plugin',
        metadata: { test: true }
      };

      const result = await toolRegistry.execute('test-tool', input, context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedResult);
      expect(mockHandler).toHaveBeenCalledWith(input, context);
    });

    it('should fail when tool not found', async () => {
      const input = { test: true };
      const context: ToolExecutionContext = {
        toolName: 'non-existent-tool',
        pluginId: 'test-plugin',
        metadata: {}
      };

      await expect(toolRegistry.execute('non-existent-tool', input, context))
        .rejects.toThrow('Tool "non-existent-tool" not found');
    });

    it('should validate input schema', async () => {
      const tool = {
        pluginId: 'test-plugin',
        name: 'test-tool',
        description: 'A test tool',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: { 
          type: 'object', 
          properties: { 
            required_field: { type: 'string' } 
          },
          required: ['required_field']
        },
        outputSchema: { type: 'object' },
        permissions: []
      };

      await toolRegistry.register('test-plugin', tool);

      const invalidInput = { wrong_field: 'test' };
      const context: ToolExecutionContext = {
        toolName: 'test-tool',
        pluginId: 'test-plugin',
        metadata: {}
      };

      await expect(toolRegistry.execute('test-tool', invalidInput, context))
        .rejects.toThrow('Input validation failed');
    });

    it('should check permissions', async () => {
      const tool = {
        pluginId: 'test-plugin',
        name: 'file-tool',
        description: 'A file manipulation tool',
        category: ToolCategory.FILE_SYSTEM,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        permissions: [{
          type: PermissionType.FILE_WRITE,
          resource: '/sensitive/path',
          actions: ['write']
        }]
      };

      await toolRegistry.register('test-plugin', tool);

      const input = { path: '/sensitive/path/file.txt', content: 'data' };
      const context: ToolExecutionContext = {
        toolName: 'file-tool',
        pluginId: 'test-plugin',
        metadata: {}
      };

      // This should work since the path matches the permission
      const result = await toolRegistry.execute('file-tool', input, context);
      expect(result.success).toBe(true);

      // Test with unauthorized path
      const unauthorizedInput = { path: '/unauthorized/path/file.txt', content: 'data' };
      await expect(toolRegistry.execute('file-tool', unauthorizedInput, context))
        .rejects.toThrow('Permission denied');
    });

    it('should handle tool execution errors', async () => {
      const error = new Error('Tool execution failed');
      const mockHandler = jest.fn().mockRejectedValue(error);
      
      const tool = {
        pluginId: 'test-plugin',
        name: 'error-tool',
        description: 'A tool that fails',
        category: ToolCategory.UTILITY,
        handler: mockHandler,
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        permissions: []
      };

      await toolRegistry.register('test-plugin', tool);

      const context: ToolExecutionContext = {
        toolName: 'error-tool',
        pluginId: 'test-plugin',
        metadata: {}
      };

      const result = await toolRegistry.execute('error-tool', {}, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Tool execution failed',
        expect.objectContaining({
          toolName: 'error-tool',
          pluginId: 'test-plugin',
          error: 'Tool execution failed'
        })
      );
    });

    it('should detect malicious patterns in input', async () => {
      const tool = {
        pluginId: 'test-plugin',
        name: 'test-tool',
        description: 'A test tool',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        permissions: []
      };

      await toolRegistry.register('test-plugin', tool);

      const maliciousInputs = [
        { command: 'eval("malicious code")' },
        { script: '<script>alert("xss")</script>' },
        { path: '../../../etc/passwd' },
        { query: 'SELECT * FROM users; DROP TABLE users;' }
      ];

      const context: ToolExecutionContext = {
        toolName: 'test-tool',
        pluginId: 'test-plugin',
        metadata: {}
      };

      for (const input of maliciousInputs) {
        await expect(toolRegistry.execute('test-tool', input, context))
          .rejects.toThrow('Security violation detected');
      }
    });
  });

  describe('getToolsByCategory', () => {
    it('should return tools by category', async () => {
      const utilityTool = {
        pluginId: 'plugin-1',
        name: 'utility-tool',
        description: 'A utility tool',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      const sddTool = {
        pluginId: 'plugin-2',
        name: 'sdd-tool',
        description: 'An SDD tool',
        category: ToolCategory.SDD,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      await toolRegistry.register('plugin-1', utilityTool);
      await toolRegistry.register('plugin-2', sddTool);

      const utilityTools = await toolRegistry.getToolsByCategory(ToolCategory.UTILITY);
      const sddTools = await toolRegistry.getToolsByCategory(ToolCategory.SDD);

      expect(utilityTools).toHaveLength(1);
      expect(utilityTools[0].name).toBe('utility-tool');

      expect(sddTools).toHaveLength(1);
      expect(sddTools[0].name).toBe('sdd-tool');
    });

    it('should return empty array for category with no tools', async () => {
      const tools = await toolRegistry.getToolsByCategory(ToolCategory.NETWORK);
      expect(tools).toHaveLength(0);
    });
  });

  describe('getToolStatistics', () => {
    it('should return accurate execution statistics', async () => {
      const successHandler = jest.fn().mockResolvedValue({ success: true });
      const tool = {
        pluginId: 'test-plugin',
        name: 'stat-tool',
        description: 'A tool for testing stats',
        category: ToolCategory.UTILITY,
        handler: successHandler,
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        permissions: []
      };

      await toolRegistry.register('test-plugin', tool);

      const context: ToolExecutionContext = {
        toolName: 'stat-tool',
        pluginId: 'test-plugin',
        metadata: {}
      };

      // Execute multiple times
      await toolRegistry.execute('stat-tool', {}, context);
      await toolRegistry.execute('stat-tool', {}, context);
      await toolRegistry.execute('stat-tool', {}, context);

      const stats = await toolRegistry.getToolStatistics('stat-tool');

      expect(stats.totalExecutions).toBe(3);
      expect(stats.successRate).toBe(1.0); // 100% success
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('clearTools', () => {
    it('should clear tools for specific plugin', async () => {
      const tool1 = {
        pluginId: 'plugin-1',
        name: 'tool-1',
        description: 'Tool 1',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      const tool2 = {
        pluginId: 'plugin-2',
        name: 'tool-2',
        description: 'Tool 2',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      await toolRegistry.register('plugin-1', tool1);
      await toolRegistry.register('plugin-2', tool2);

      await toolRegistry.clearTools('plugin-1');

      const remainingTool1 = await toolRegistry.getTool('tool-1');
      const remainingTool2 = await toolRegistry.getTool('tool-2');

      expect(remainingTool1).toBeNull();
      expect(remainingTool2).toBeDefined();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plugin tools cleared',
        { pluginId: 'plugin-1', toolsCleared: 1 }
      );
    });

    it('should clear all tools when no plugin specified', async () => {
      const tool1 = {
        pluginId: 'plugin-1',
        name: 'tool-1',
        description: 'Tool 1',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      const tool2 = {
        pluginId: 'plugin-2',
        name: 'tool-2',
        description: 'Tool 2',
        category: ToolCategory.UTILITY,
        handler: jest.fn().mockResolvedValue({ success: true }),
        inputSchema: {},
        outputSchema: {},
        permissions: []
      };

      await toolRegistry.register('plugin-1', tool1);
      await toolRegistry.register('plugin-2', tool2);

      await toolRegistry.clearTools();

      const allTools = await toolRegistry.getAllTools();
      expect(Object.keys(allTools)).toHaveLength(0);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'All tools cleared',
        { toolsCleared: 2 }
      );
    });
  });
});