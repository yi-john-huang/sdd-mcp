// Unit tests for MCP protocol handler

import 'reflect-metadata';
import { MCPProtocolHandler } from '../../../infrastructure/mcp/MCPProtocolHandler.js';
import { LoggerPort } from '../../../domain/ports.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  ListToolsRequest,
  Tool,
  ToolResult,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('MCPProtocolHandler', () => {
  let protocolHandler: MCPProtocolHandler;
  let mockLogger: jest.Mocked<LoggerPort>;
  let mockServer: jest.Mocked<Server>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
      close: jest.fn()
    } as any;

    (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

    protocolHandler = new MCPProtocolHandler(mockLogger);
  });

  describe('initialize', () => {
    it('should initialize MCP server with capabilities', async () => {
      await protocolHandler.initialize();

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function)
      );
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function)
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP protocol handler initialized',
        expect.objectContaining({
          capabilities: expect.arrayContaining(['tools'])
        })
      );
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Initialization failed');
      mockServer.setRequestHandler.mockImplementation(() => {
        throw error;
      });

      await expect(protocolHandler.initialize()).rejects.toThrow('Initialization failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'MCP protocol handler initialization failed',
        error
      );
    });
  });

  describe('registerTool', () => {
    beforeEach(async () => {
      await protocolHandler.initialize();
    });

    it('should register tool successfully', () => {
      const tool: Tool = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: ['input']
        }
      };

      const handler = jest.fn().mockResolvedValue({ 
        content: [{ type: 'text', text: 'success' }] 
      });

      protocolHandler.registerTool(tool, handler);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Tool registered',
        { toolName: 'test-tool' }
      );

      const registeredTools = protocolHandler.getRegisteredTools();
      expect(registeredTools).toContain('test-tool');
    });

    it('should prevent duplicate tool registration', () => {
      const tool: Tool = {
        name: 'duplicate-tool',
        description: 'A duplicate tool',
        inputSchema: { type: 'object' }
      };

      const handler = jest.fn();

      protocolHandler.registerTool(tool, handler);

      expect(() => {
        protocolHandler.registerTool(tool, handler);
      }).toThrow('Tool duplicate-tool is already registered');
    });
  });

  describe('tool execution', () => {
    let listToolsHandler: (request: ListToolsRequest) => Promise<{ tools: Tool[] }>;
    let callToolHandler: (request: CallToolRequest) => Promise<ToolResult>;

    beforeEach(async () => {
      await protocolHandler.initialize();

      // Extract handlers from mock calls
      const setRequestHandlerCalls = mockServer.setRequestHandler.mock.calls;
      const listToolsCall = setRequestHandlerCalls.find(call => 
        call[0] === ListToolsRequestSchema
      );
      const callToolCall = setRequestHandlerCalls.find(call => 
        call[0] === CallToolRequestSchema
      );

      listToolsHandler = listToolsCall![1] as any;
      callToolHandler = callToolCall![1] as any;
    });

    it('should list registered tools', async () => {
      const tool: Tool = {
        name: 'list-test-tool',
        description: 'Tool for list testing',
        inputSchema: { type: 'object' }
      };

      protocolHandler.registerTool(tool, jest.fn());

      const request: ListToolsRequest = {
        method: 'tools/list',
        params: {}
      };

      const response = await listToolsHandler(request);

      expect(response.tools).toHaveLength(1);
      expect(response.tools[0].name).toBe('list-test-tool');
      expect(response.tools[0].description).toBe('Tool for list testing');
    });

    it('should execute tool successfully', async () => {
      const tool: Tool = {
        name: 'exec-test-tool',
        description: 'Tool for execution testing',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      };

      const expectedResult = { 
        content: [{ type: 'text', text: 'Hello from tool' }] 
      };
      
      const handler = jest.fn().mockResolvedValue(expectedResult);
      protocolHandler.registerTool(tool, handler);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'exec-test-tool',
          arguments: { message: 'test' }
        }
      };

      const result = await callToolHandler(request);

      expect(result).toEqual(expectedResult);
      expect(handler).toHaveBeenCalledWith({ message: 'test' });
    });

    it('should handle tool not found error', async () => {
      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'non-existent-tool',
          arguments: {}
        }
      };

      await expect(callToolHandler(request)).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.MethodNotFound,
          message: 'Tool non-existent-tool not found'
        })
      );
    });

    it('should handle tool execution errors', async () => {
      const tool: Tool = {
        name: 'error-tool',
        description: 'Tool that throws errors',
        inputSchema: { type: 'object' }
      };

      const error = new Error('Tool execution failed');
      const handler = jest.fn().mockRejectedValue(error);
      protocolHandler.registerTool(tool, handler);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'error-tool',
          arguments: {}
        }
      };

      await expect(callToolHandler(request)).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.InternalError,
          message: 'Tool execution failed: Tool execution failed'
        })
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Tool execution failed',
        error,
        { toolName: 'error-tool', arguments: {} }
      );
    });

    it('should validate tool arguments against schema', async () => {
      const tool: Tool = {
        name: 'validation-tool',
        description: 'Tool with strict validation',
        inputSchema: {
          type: 'object',
          properties: {
            requiredField: { type: 'string' }
          },
          required: ['requiredField'],
          additionalProperties: false
        }
      };

      const handler = jest.fn();
      protocolHandler.registerTool(tool, handler);

      const invalidRequest: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'validation-tool',
          arguments: { wrongField: 'value' }
        }
      };

      await expect(callToolHandler(invalidRequest)).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.InvalidParams
        })
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('unregisterTool', () => {
    beforeEach(async () => {
      await protocolHandler.initialize();
    });

    it('should unregister tool successfully', () => {
      const tool: Tool = {
        name: 'temp-tool',
        description: 'Temporary tool',
        inputSchema: { type: 'object' }
      };

      protocolHandler.registerTool(tool, jest.fn());
      
      let registeredTools = protocolHandler.getRegisteredTools();
      expect(registeredTools).toContain('temp-tool');

      protocolHandler.unregisterTool('temp-tool');

      registeredTools = protocolHandler.getRegisteredTools();
      expect(registeredTools).not.toContain('temp-tool');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Tool unregistered',
        { toolName: 'temp-tool' }
      );
    });

    it('should warn when unregistering non-existent tool', () => {
      protocolHandler.unregisterTool('non-existent-tool');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to unregister non-existent tool',
        { toolName: 'non-existent-tool' }
      );
    });
  });

  describe('connect', () => {
    beforeEach(async () => {
      await protocolHandler.initialize();
    });

    it('should connect server successfully', async () => {
      const transport = { connect: jest.fn() };
      mockServer.connect.mockResolvedValue(undefined);

      await protocolHandler.connect(transport as any);

      expect(mockServer.connect).toHaveBeenCalledWith(transport);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP server connected',
        { transport: 'provided' }
      );
    });

    it('should handle connection errors', async () => {
      const transport = { connect: jest.fn() };
      const error = new Error('Connection failed');
      mockServer.connect.mockRejectedValue(error);

      await expect(protocolHandler.connect(transport as any)).rejects.toThrow('Connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'MCP server connection failed',
        error
      );
    });
  });

  describe('close', () => {
    beforeEach(async () => {
      await protocolHandler.initialize();
    });

    it('should close server successfully', async () => {
      mockServer.close.mockResolvedValue(undefined);

      await protocolHandler.close();

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('MCP server closed');
    });

    it('should handle close errors gracefully', async () => {
      const error = new Error('Close failed');
      mockServer.close.mockRejectedValue(error);

      // Should not throw, but should log error
      await protocolHandler.close();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error closing MCP server',
        error
      );
    });
  });

  describe('getServerInfo', () => {
    beforeEach(async () => {
      await protocolHandler.initialize();
    });

    it('should return server information', () => {
      const serverInfo = protocolHandler.getServerInfo();

      expect(serverInfo).toEqual({
        name: 'sdd-mcp-server',
        version: '1.0.0',
        capabilities: ['tools'],
        toolsCount: 0,
        connected: false
      });
    });

    it('should update tools count when tools are registered', () => {
      const tool: Tool = {
        name: 'info-test-tool',
        description: 'Tool for testing server info',
        inputSchema: { type: 'object' }
      };

      protocolHandler.registerTool(tool, jest.fn());

      const serverInfo = protocolHandler.getServerInfo();
      expect(serverInfo.toolsCount).toBe(1);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await protocolHandler.initialize();
    });

    it('should handle malformed tool arguments', async () => {
      const tool: Tool = {
        name: 'malformed-test',
        description: 'Test malformed arguments',
        inputSchema: { type: 'object' }
      };

      const handler = jest.fn();
      protocolHandler.registerTool(tool, handler);

      const callToolCall = mockServer.setRequestHandler.mock.calls.find(call => 
        call[0] === CallToolRequestSchema
      );
      const callToolHandler = callToolCall![1] as any;

      const malformedRequest = {
        method: 'tools/call',
        params: {
          name: 'malformed-test',
          arguments: null // Invalid arguments
        }
      };

      await expect(callToolHandler(malformedRequest)).rejects.toThrow(McpError);
    });

    it('should handle circular reference in tool result', async () => {
      const tool: Tool = {
        name: 'circular-test',
        description: 'Test circular reference handling',
        inputSchema: { type: 'object' }
      };

      // Create circular reference
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const handler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(circularObj) }]
      });

      protocolHandler.registerTool(tool, handler);

      const callToolCall = mockServer.setRequestHandler.mock.calls.find(call => 
        call[0] === CallToolRequestSchema
      );
      const callToolHandler = callToolCall![1] as any;

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'circular-test',
          arguments: {}
        }
      };

      // Should handle circular reference gracefully
      await expect(callToolHandler(request)).rejects.toThrow();
    });
  });

  describe('performance monitoring', () => {
    beforeEach(async () => {
      await protocolHandler.initialize();
    });

    it('should track tool execution metrics', async () => {
      const tool: Tool = {
        name: 'performance-tool',
        description: 'Tool for performance testing',
        inputSchema: { type: 'object' }
      };

      const handler = jest.fn().mockResolvedValue({ 
        content: [{ type: 'text', text: 'success' }] 
      });

      protocolHandler.registerTool(tool, handler);

      const callToolCall = mockServer.setRequestHandler.mock.calls.find(call => 
        call[0] === CallToolRequestSchema
      );
      const callToolHandler = callToolCall![1] as any;

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'performance-tool',
          arguments: {}
        }
      };

      await callToolHandler(request);

      // Verify performance logging
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Tool executed successfully',
        expect.objectContaining({
          toolName: 'performance-tool',
          executionTime: expect.any(Number)
        })
      );
    });
  });
});