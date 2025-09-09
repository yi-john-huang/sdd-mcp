import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { LoggerPort } from '../../domain/ports.js';
import { TYPES } from '../di/types.js';

interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
}

@injectable()
export class MCPServer {
  private readonly server: Server;
  private readonly logger: LoggerPort;
  private readonly sessionId: string;

  constructor(
    @inject(TYPES.LoggerPort) logger: LoggerPort
  ) {
    this.logger = logger;
    this.sessionId = uuidv4();
    
    const config: MCPServerConfig = {
      name: 'sdd-mcp-server',
      version: '1.0.0',
      description: 'MCP server for spec-driven development workflows'
    };

    this.server = new Server(config, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    });

    this.setupRequestHandlers();
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting MCP server', { 
        sessionId: this.sessionId,
        capabilities: this.server.getCapabilities()
      });

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info('MCP server started successfully', { sessionId: this.sessionId });
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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const correlationId = uuidv4();
      
      this.logger.debug('Listing available tools', {
        sessionId: this.sessionId,
        correlationId
      });

      // TODO: Return registered SDD tools (task 2.3)
      return {
        tools: []
      };
    });
  }

  getSessionId(): string {
    return this.sessionId;
  }
}