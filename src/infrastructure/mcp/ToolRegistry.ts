import { injectable, inject } from 'inversify';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../di/types.js';
import { LoggerPort, ValidationPort } from '../../domain/ports.js';
import { SDDToolAdapter, SDDToolHandler } from '../../adapters/cli/SDDToolAdapter.js';

export interface ToolExecutionContext {
  sessionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  correlationId: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    executionTime: number;
    sessionId: string;
    correlationId: string;
  };
}

@injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, SDDToolHandler>();
  private readonly toolSchemas = new Map<string, object>();

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.ValidationPort) private readonly validation: ValidationPort
  ) {}

  async initialize(sddToolAdapter: SDDToolAdapter): Promise<void> {
    const correlationId = uuidv4();
    
    this.logger.info('Initializing tool registry', { correlationId });

    const sddTools = sddToolAdapter.getSDDTools();
    
    for (const toolHandler of sddTools) {
      this.registerTool(toolHandler);
    }

    this.logger.info('Tool registry initialization completed', {
      correlationId,
      registeredTools: Array.from(this.tools.keys())
    });
  }

  registerTool(toolHandler: SDDToolHandler): void {
    const { name, tool, handler } = toolHandler;
    
    // Validate tool definition
    if (!name || !tool || !handler) {
      throw new Error(`Invalid tool registration: ${name}`);
    }

    if (this.tools.has(name)) {
      this.logger.warn('Tool already registered, overriding', { toolName: name });
    }

    this.tools.set(name, toolHandler);
    
    if (tool.inputSchema) {
      this.toolSchemas.set(name, tool.inputSchema);
    }

    this.logger.info('Tool registered successfully', {
      toolName: name,
      hasInputSchema: !!tool.inputSchema
    });
  }

  unregisterTool(name: string): boolean {
    const removed = this.tools.delete(name);
    this.toolSchemas.delete(name);
    
    if (removed) {
      this.logger.info('Tool unregistered', { toolName: name });
    }

    return removed;
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values()).map(handler => handler.tool);
  }

  getTool(name: string): Tool | null {
    const handler = this.tools.get(name);
    return handler?.tool || null;
  }

  async executeTool(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { sessionId, toolName, arguments: args, correlationId } = context;
    const startTime = Date.now();

    this.logger.info('Executing tool', {
      correlationId,
      sessionId,
      toolName,
      argumentKeys: Object.keys(args)
    });

    try {
      // Get tool handler
      const handler = this.tools.get(toolName);
      if (!handler) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      // Validate arguments if schema exists
      const schema = this.toolSchemas.get(toolName);
      if (schema) {
        await this.validation.validate(args, schema);
      }

      // Execute tool
      const result = await handler.handler(args);
      const executionTime = Date.now() - startTime;

      this.logger.info('Tool execution completed successfully', {
        correlationId,
        sessionId,
        toolName,
        executionTime
      });

      return {
        success: true,
        data: result,
        metadata: {
          executionTime,
          sessionId,
          correlationId
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Tool execution failed', error as Error, {
        correlationId,
        sessionId,
        toolName,
        executionTime
      });

      return {
        success: false,
        error: errorMessage,
        metadata: {
          executionTime,
          sessionId,
          correlationId
        }
      };
    }
  }

  hasToolAccess(sessionId: string, toolName: string): boolean {
    // Basic access control - can be extended with more sophisticated rules
    const handler = this.tools.get(toolName);
    
    if (!handler) {
      return false;
    }

    // For now, all registered tools are accessible
    // TODO: Implement role-based access control based on session capabilities
    return true;
  }

  getToolDocumentation(toolName: string): {
    name: string;
    description: string;
    inputSchema?: object;
    examples?: Array<{
      description: string;
      arguments: Record<string, unknown>;
    }>;
  } | null {
    const handler = this.tools.get(toolName);
    if (!handler) {
      return null;
    }

    const examples = this.getToolExamples(toolName);

    return {
      name: handler.tool.name,
      description: handler.tool.description,
      inputSchema: handler.tool.inputSchema,
      examples
    };
  }

  private getToolExamples(toolName: string): Array<{
    description: string;
    arguments: Record<string, unknown>;
  }> {
    const examples: Record<string, Array<{
      description: string;
      arguments: Record<string, unknown>;
    }>> = {
      'sdd-init': [
        {
          description: 'Initialize a new SDD project',
          arguments: {
            name: 'my-api-project',
            path: '/workspace/my-api',
            language: 'en'
          }
        }
      ],
      'sdd-status': [
        {
          description: 'Check project status by ID',
          arguments: {
            projectId: 'proj_123456'
          }
        },
        {
          description: 'Check project status by path',
          arguments: {
            projectPath: '/workspace/my-api'
          }
        }
      ],
      'sdd-requirements': [
        {
          description: 'Generate requirements document',
          arguments: {
            projectId: 'proj_123456'
          }
        }
      ],
      'sdd-design': [
        {
          description: 'Generate design document',
          arguments: {
            projectId: 'proj_123456'
          }
        }
      ],
      'sdd-tasks': [
        {
          description: 'Generate implementation tasks',
          arguments: {
            projectId: 'proj_123456'
          }
        }
      ],
      'sdd-quality-check': [
        {
          description: 'Perform Linus-style code review',
          arguments: {
            code: 'function example() {\n  if (condition) {\n    return result;\n  }\n}',
            language: 'typescript'
          }
        }
      ]
    };

    return examples[toolName] || [];
  }

  getToolStats(): {
    totalTools: number;
    toolNames: string[];
    toolsByCategory: Record<string, string[]>;
  } {
    const tools = Array.from(this.tools.keys());
    
    const toolsByCategory: Record<string, string[]> = {
      'Project Management': ['sdd-init', 'sdd-status'],
      'Workflow': ['sdd-requirements', 'sdd-design', 'sdd-tasks'],
      'Quality Assurance': ['sdd-quality-check']
    };

    return {
      totalTools: tools.length,
      toolNames: tools,
      toolsByCategory
    };
  }
}