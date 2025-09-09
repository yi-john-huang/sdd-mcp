// Plugin tool registry implementation for custom tool integration

import { injectable, inject } from 'inversify';
import { EventEmitter } from 'events';
import type { LoggerPort } from '../../domain/ports.js';
import type {
  ToolRegistry as IToolRegistry,
  ToolRegistration,
  ToolExecutionContext,
  ToolResult,
  ToolCategory,
  ToolPermission,
  PermissionType
} from '../../domain/plugins/index.js';
import { TYPES } from '../di/types.js';

interface ToolExecutionMetrics {
  readonly toolName: string;
  readonly pluginId: string;
  readonly executionTime: number;
  readonly success: boolean;
  readonly inputSize: number;
  readonly outputSize: number;
  readonly error?: Error;
  readonly timestamp: Date;
}

interface ToolRegistrationInternal extends ToolRegistration {
  readonly registeredAt: Date;
  readonly lastExecuted?: Date;
  readonly executionCount: number;
  readonly successCount: number;
  readonly errorCount: number;
  readonly averageExecutionTime: number;
}

interface ToolSecurityContext {
  readonly user?: string;
  readonly session?: string;
  readonly permissions: Set<string>;
  readonly restrictions: ToolRestriction[];
}

interface ToolRestriction {
  readonly type: string;
  readonly pattern: string;
  readonly action: 'allow' | 'deny' | 'audit';
  readonly message?: string;
}

@injectable()
export class PluginToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, ToolRegistrationInternal>();
  private readonly categories = new Map<ToolCategory, Set<string>>();
  private readonly eventEmitter = new EventEmitter();
  private readonly metrics: ToolExecutionMetrics[] = [];
  private readonly maxMetricsHistory = 1000;
  private readonly securityEnabled = true;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {
    this.initializeCategories();
  }

  async register(pluginId: string, tool: ToolRegistration): Promise<void> {
    const toolName = tool.name;
    
    // Check for conflicts
    if (this.tools.has(toolName)) {
      const existingTool = this.tools.get(toolName)!;
      if (existingTool.pluginId !== pluginId) {
        throw new Error(`Tool '${toolName}' is already registered by plugin '${existingTool.pluginId}'`);
      }
      
      this.logger.warn('Tool already registered, replacing', {
        toolName,
        pluginId,
        previousPlugin: existingTool.pluginId
      });
      
      // Remove from category index
      const categoryTools = this.categories.get(existingTool.category);
      if (categoryTools) {
        categoryTools.delete(toolName);
      }
    }

    // Validate tool registration
    await this.validateToolRegistration(tool);

    const internalTool: ToolRegistrationInternal = {
      ...tool,
      pluginId,
      registeredAt: new Date(),
      executionCount: 0,
      successCount: 0,
      errorCount: 0,
      averageExecutionTime: 0
    };

    this.tools.set(toolName, internalTool);
    
    // Add to category index
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category)!.add(toolName);

    this.logger.info('Tool registered successfully', {
      toolName,
      pluginId,
      category: tool.category,
      permissions: tool.permissions.length,
      totalTools: this.tools.size
    });

    this.eventEmitter.emit('tool-registered', { toolName, pluginId, tool });
  }

  async unregister(pluginId: string, toolName: string): Promise<void> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      this.logger.warn('Tool not found for unregistration', { toolName, pluginId });
      return;
    }

    if (tool.pluginId !== pluginId) {
      throw new Error(`Tool '${toolName}' is registered by plugin '${tool.pluginId}', not '${pluginId}'`);
    }

    // Remove from tools map
    this.tools.delete(toolName);
    
    // Remove from category index
    const categoryTools = this.categories.get(tool.category);
    if (categoryTools) {
      categoryTools.delete(toolName);
    }

    this.logger.info('Tool unregistered successfully', {
      toolName,
      pluginId,
      category: tool.category,
      remainingTools: this.tools.size
    });

    this.eventEmitter.emit('tool-unregistered', { toolName, pluginId });
  }

  async execute(toolName: string, input: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      const error = new Error(`Tool '${toolName}' not found`);
      this.logger.error('Tool execution failed - tool not found', { toolName });
      return { success: false, error };
    }

    const startTime = Date.now();
    const inputSize = this.calculateObjectSize(input);

    this.logger.debug('Executing tool', {
      toolName,
      pluginId: tool.pluginId,
      inputSize,
      user: context.user,
      session: context.session
    });

    try {
      // Security checks
      if (this.securityEnabled) {
        const securityCheck = await this.performSecurityChecks(tool, input, context);
        if (!securityCheck.allowed) {
          throw new Error(`Tool execution denied: ${securityCheck.reason}`);
        }
      }

      // Input validation
      const inputValidation = await this.validateToolInput(tool, input);
      if (!inputValidation.valid) {
        throw new Error(`Input validation failed: ${inputValidation.errors.join(', ')}`);
      }

      // Execute tool
      const result = await tool.handler(input, context);
      
      const executionTime = Date.now() - startTime;
      const outputSize = result.data ? this.calculateObjectSize(result.data) : 0;

      // Update metrics
      this.updateToolMetrics(tool, executionTime, true);
      this.recordExecutionMetrics({
        toolName,
        pluginId: tool.pluginId,
        executionTime,
        success: result.success,
        inputSize,
        outputSize,
        error: result.error,
        timestamp: new Date()
      });

      // Output validation
      if (result.success && result.data) {
        const outputValidation = await this.validateToolOutput(tool, result.data);
        if (!outputValidation.valid) {
          this.logger.warn('Tool output validation failed', {
            toolName,
            errors: outputValidation.errors
          });
        }
      }

      this.logger.info('Tool executed successfully', {
        toolName,
        pluginId: tool.pluginId,
        executionTime,
        success: result.success,
        inputSize,
        outputSize
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const executionError = error instanceof Error ? error : new Error(String(error));
      
      // Update metrics
      this.updateToolMetrics(tool, executionTime, false);
      this.recordExecutionMetrics({
        toolName,
        pluginId: tool.pluginId,
        executionTime,
        success: false,
        inputSize,
        outputSize: 0,
        error: executionError,
        timestamp: new Date()
      });

      this.logger.error('Tool execution failed', {
        toolName,
        pluginId: tool.pluginId,
        executionTime,
        error: executionError.message
      });

      return {
        success: false,
        error: executionError,
        metadata: {
          executionTime,
          inputSize,
          pluginId: tool.pluginId
        }
      };
    }
  }

  async getTool(toolName: string): Promise<ToolRegistration | null> {
    const tool = this.tools.get(toolName);
    return tool ? { ...tool } : null;
  }

  async getAllTools(): Promise<Record<string, ToolRegistration>> {
    const result: Record<string, ToolRegistration> = {};
    
    for (const [toolName, tool] of this.tools.entries()) {
      result[toolName] = { ...tool };
    }
    
    return result;
  }

  async getToolsByCategory(category: ToolCategory): Promise<ToolRegistration[]> {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      return [];
    }

    const tools: ToolRegistration[] = [];
    for (const toolName of toolNames) {
      const tool = this.tools.get(toolName);
      if (tool) {
        tools.push({ ...tool });
      }
    }

    return tools.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Additional utility methods
  async getToolMetrics(toolName?: string): Promise<ToolExecutionMetrics[]> {
    if (toolName) {
      return this.metrics.filter(m => m.toolName === toolName);
    }
    return [...this.metrics];
  }

  async getToolStatistics(toolName: string): Promise<{
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    averageInputSize: number;
    averageOutputSize: number;
    errorRate: number;
    lastExecuted?: Date;
  }> {
    const tool = this.tools.get(toolName);
    const metrics = this.metrics.filter(m => m.toolName === toolName);
    
    if (!tool || metrics.length === 0) {
      return {
        totalExecutions: 0,
        successRate: 0,
        averageExecutionTime: 0,
        averageInputSize: 0,
        averageOutputSize: 0,
        errorRate: 0
      };
    }

    const totalExecutions = metrics.length;
    const successCount = metrics.filter(m => m.success).length;
    const successRate = successCount / totalExecutions;
    const averageExecutionTime = metrics.reduce((sum, m) => sum + m.executionTime, 0) / totalExecutions;
    const averageInputSize = metrics.reduce((sum, m) => sum + m.inputSize, 0) / totalExecutions;
    const averageOutputSize = metrics.reduce((sum, m) => sum + m.outputSize, 0) / totalExecutions;
    const errorRate = (totalExecutions - successCount) / totalExecutions;

    return {
      totalExecutions,
      successRate,
      averageExecutionTime,
      averageInputSize,
      averageOutputSize,
      errorRate,
      lastExecuted: tool.lastExecuted
    };
  }

  async getToolsByPlugin(pluginId: string): Promise<ToolRegistration[]> {
    const tools: ToolRegistration[] = [];
    
    for (const tool of this.tools.values()) {
      if (tool.pluginId === pluginId) {
        tools.push({ ...tool });
      }
    }
    
    return tools.sort((a, b) => a.name.localeCompare(b.name));
  }

  async clearTools(pluginId?: string): Promise<void> {
    if (pluginId) {
      // Clear all tools for a specific plugin
      const toolsToRemove: string[] = [];
      
      for (const [toolName, tool] of this.tools.entries()) {
        if (tool.pluginId === pluginId) {
          toolsToRemove.push(toolName);
          
          // Remove from category index
          const categoryTools = this.categories.get(tool.category);
          if (categoryTools) {
            categoryTools.delete(toolName);
          }
        }
      }
      
      for (const toolName of toolsToRemove) {
        this.tools.delete(toolName);
      }
      
      this.logger.info('Plugin tools cleared', { pluginId, toolsRemoved: toolsToRemove.length });
    } else {
      // Clear all tools
      this.tools.clear();
      for (const categoryTools of this.categories.values()) {
        categoryTools.clear();
      }
      this.logger.info('All tools cleared');
    }
  }

  // Private helper methods
  private initializeCategories(): void {
    for (const category of Object.values(ToolCategory)) {
      this.categories.set(category, new Set());
    }
  }

  private async validateToolRegistration(tool: ToolRegistration): Promise<void> {
    if (!tool.name) {
      throw new Error('Tool name is required');
    }

    if (!tool.description) {
      throw new Error('Tool description is required');
    }

    if (!tool.handler || typeof tool.handler !== 'function') {
      throw new Error('Tool handler must be a function');
    }

    // Validate permissions
    for (const permission of tool.permissions) {
      if (!Object.values(PermissionType).includes(permission.type)) {
        throw new Error(`Invalid permission type: ${permission.type}`);
      }
    }
  }

  private async performSecurityChecks(tool: ToolRegistrationInternal, input: Record<string, unknown>, context: ToolExecutionContext): Promise<{ allowed: boolean; reason?: string }> {
    // Check tool permissions
    for (const permission of tool.permissions) {
      const hasPermission = await this.checkPermission(permission, context);
      if (!hasPermission) {
        return {
          allowed: false,
          reason: `Missing required permission: ${permission.type} for resource: ${permission.resource}`
        };
      }
    }

    // Check input for security issues
    const securityContext = this.createSecurityContext(context);
    const inputSecurityCheck = await this.checkInputSecurity(input, securityContext);
    if (!inputSecurityCheck.safe) {
      return {
        allowed: false,
        reason: `Input security check failed: ${inputSecurityCheck.reason}`
      };
    }

    return { allowed: true };
  }

  private async checkPermission(permission: ToolPermission, context: ToolExecutionContext): Promise<boolean> {
    // In a production environment, this would integrate with a proper permission system
    // For now, we'll do basic checks
    
    switch (permission.type) {
      case PermissionType.FILE_READ:
      case PermissionType.FILE_WRITE:
      case PermissionType.FILE_EXECUTE:
        // Check if the resource path is allowed
        return this.isPathAllowed(permission.resource);
      
      case PermissionType.NETWORK_REQUEST:
        // Check if the network request is allowed
        return this.isNetworkRequestAllowed(permission.resource);
      
      case PermissionType.SYSTEM_INFO:
      case PermissionType.ENVIRONMENT:
      case PermissionType.STORAGE:
        // These might require elevated permissions
        return true; // Allow for now
      
      default:
        return false;
    }
  }

  private isPathAllowed(resourcePath: string): boolean {
    // Prevent access to sensitive system paths
    const restrictedPaths = [
      '/etc',
      '/System',
      '/var/log',
      'C:\\Windows',
      'C:\\System32'
    ];
    
    return !restrictedPaths.some(restricted => resourcePath.startsWith(restricted));
  }

  private isNetworkRequestAllowed(resource: string): boolean {
    try {
      const url = new URL(resource);
      
      // Block private/local networks
      const hostname = url.hostname;
      const blockedHosts = ['localhost', '127.0.0.1', '::1'];
      const blockedPatterns = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./];
      
      if (blockedHosts.includes(hostname)) {
        return false;
      }
      
      return !blockedPatterns.some(pattern => pattern.test(hostname));
    } catch {
      return false;
    }
  }

  private createSecurityContext(context: ToolExecutionContext): ToolSecurityContext {
    return {
      user: context.user,
      session: context.session,
      permissions: new Set(),
      restrictions: []
    };
  }

  private async checkInputSecurity(input: Record<string, unknown>, context: ToolSecurityContext): Promise<{ safe: boolean; reason?: string }> {
    // Check for potential code injection
    const inputString = JSON.stringify(input);
    const dangerousPatterns = [
      /eval\s*\(/i,
      /function\s*\(/i,
      /__proto__/i,
      /constructor/i,
      /prototype/i,
      /<script/i,
      /javascript:/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(inputString)) {
        return {
          safe: false,
          reason: `Potentially dangerous pattern detected: ${pattern.source}`
        };
      }
    }
    
    return { safe: true };
  }

  private async validateToolInput(tool: ToolRegistrationInternal, input: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Basic JSON schema validation would go here
      // For now, just check that input is an object
      if (typeof input !== 'object' || input === null) {
        errors.push('Input must be an object');
      }
      
      // Check against tool's input schema if available
      if (tool.inputSchema) {
        // Schema validation would be implemented here
        // This is a simplified version
      }
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async validateToolOutput(tool: ToolRegistrationInternal, output: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Check against tool's output schema if available
      if (tool.outputSchema) {
        // Schema validation would be implemented here
      }
    } catch (error) {
      errors.push(`Output validation error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private calculateObjectSize(obj: unknown): number {
    try {
      return JSON.stringify(obj).length;
    } catch {
      return 0;
    }
  }

  private updateToolMetrics(tool: ToolRegistrationInternal, executionTime: number, success: boolean): void {
    tool.executionCount++;
    tool.lastExecuted = new Date();
    
    if (success) {
      tool.successCount++;
    } else {
      tool.errorCount++;
    }
    
    // Update rolling average execution time
    tool.averageExecutionTime = 
      (tool.averageExecutionTime * (tool.executionCount - 1) + executionTime) / tool.executionCount;
  }

  private recordExecutionMetrics(metrics: ToolExecutionMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only the most recent metrics to prevent memory issues
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.splice(0, this.metrics.length - this.maxMetricsHistory);
    }
  }
}