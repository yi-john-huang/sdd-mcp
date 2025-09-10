import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { LoggerPort } from '../../domain/ports.js';
import { TYPES } from '../di/types.js';
import { CapabilityNegotiator } from './CapabilityNegotiator.js';
import { SessionManager } from './SessionManager.js';
import { ResourceManager } from './ResourceManager.js';
import { PromptManager } from './PromptManager.js';
import { ToolRegistry } from './ToolRegistry.js';
import { SDDToolAdapter } from '../../adapters/cli/SDDToolAdapter.js';

interface MCPServerConfig {
  [x: string]: unknown;
  name: string;
  version: string;
  description: string;
}

@injectable()
export class MCPServer {
  private readonly server: Server;
  private readonly logger: LoggerPort;
  private readonly sessionId: string;
  private readonly capabilityNegotiator: CapabilityNegotiator;
  private readonly sessionManager: SessionManager;
  private readonly resourceManager: ResourceManager;
  private readonly promptManager: PromptManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly sddToolAdapter: SDDToolAdapter;

  constructor(
    @inject(TYPES.LoggerPort) logger: LoggerPort,
    @inject(TYPES.CapabilityNegotiator) capabilityNegotiator: CapabilityNegotiator,
    @inject(TYPES.SessionManager) sessionManager: SessionManager,
    @inject(TYPES.ResourceManager) resourceManager: ResourceManager,
    @inject(TYPES.PromptManager) promptManager: PromptManager,
    @inject(TYPES.ToolRegistry) toolRegistry: ToolRegistry,
    @inject(TYPES.SDDToolAdapter) sddToolAdapter: SDDToolAdapter
  ) {
    this.logger = logger;
    this.sessionId = uuidv4();
    this.capabilityNegotiator = capabilityNegotiator;
    this.sessionManager = sessionManager;
    this.resourceManager = resourceManager;
    this.promptManager = promptManager;
    this.toolRegistry = toolRegistry;
    this.sddToolAdapter = sddToolAdapter;
    
    const config: MCPServerConfig = {
      name: 'sdd-mcp-server',
      version: '1.0.0',
      description: 'MCP server for spec-driven development workflows'
    };

    // Negotiate capabilities
    const negotiated = this.capabilityNegotiator.negotiate();

    this.server = new Server(config, {
      capabilities: negotiated.server
    });

    this.setupRequestHandlers();
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting MCP server', { 
        sessionId: this.sessionId
      });

      // Initialize tool registry with SDD tools
      await this.toolRegistry.initialize(this.sddToolAdapter);

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info('MCP server started successfully', { 
        sessionId: this.sessionId,
        registeredTools: this.toolRegistry.getToolStats().totalTools
      });
    } catch (error) {
      this.logger.error('Failed to start MCP server', error as Error, { 
        sessionId: this.sessionId 
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping MCP server', { sessionId: this.sessionId });
      await this.server.close();
      this.logger.info('MCP server stopped successfully', { sessionId: this.sessionId });
    } catch (error) {
      this.logger.error('Error stopping MCP server', error as Error, { 
        sessionId: this.sessionId 
      });
      throw error;
    }
  }

  registerTool(tool: Tool, handler: (args: Record<string, unknown>) => Promise<unknown>): void {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const correlationId = uuidv4();
      
      if (request.params.name !== tool.name) {
        return;
      }

      this.logger.info('Executing tool', {
        sessionId: this.sessionId,
        correlationId,
        toolName: tool.name,
        arguments: request.params.arguments
      });

      try {
        const result = await handler(request.params.arguments ?? {});
        
        this.logger.info('Tool executed successfully', {
          sessionId: this.sessionId,
          correlationId,
          toolName: tool.name
        });

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        this.logger.error('Tool execution failed', error as Error, {
          sessionId: this.sessionId,
          correlationId,
          toolName: tool.name
        });

        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${tool.name}: ${(error as Error).message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  private setupRequestHandlers(): void {
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const correlationId = uuidv4();
      
      this.logger.debug('Listing available tools', {
        sessionId: this.sessionId,
        correlationId
      });

      return {
        tools: this.toolRegistry.listTools()
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const correlationId = uuidv4();
      const { name, arguments: args } = request.params;

      const result = await this.toolRegistry.executeTool({
        sessionId: this.sessionId,
        toolName: name,
        arguments: args ?? {},
        correlationId
      });

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error}`
            }
          ],
          isError: true
        };
      }
    });

    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const correlationId = uuidv4();
      
      this.logger.debug('Listing available resources', {
        sessionId: this.sessionId,
        correlationId
      });

      return {
        resources: await this.resourceManager.listResources()
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const correlationId = uuidv4();
      const { uri } = request.params;

      this.logger.debug('Reading resource', {
        sessionId: this.sessionId,
        correlationId,
        uri
      });

      const contents = await this.resourceManager.readResource(uri);
      return { contents: [contents] };
    });

    // Prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const correlationId = uuidv4();
      
      this.logger.debug('Listing available prompts', {
        sessionId: this.sessionId,
        correlationId
      });

      return {
        prompts: await this.promptManager.listPrompts()
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const correlationId = uuidv4();
      const { name, arguments: args } = request.params;

      this.logger.debug('Getting prompt', {
        sessionId: this.sessionId,
        correlationId,
        promptName: name
      });

      const prompt = await this.promptManager.getPrompt(name, args ?? {});
      return prompt;
    });
  }

  getSessionId(): string {
    return this.sessionId;
  }
}