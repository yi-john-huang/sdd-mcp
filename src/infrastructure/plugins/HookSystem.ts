// Hook system implementation for plugin extensibility

import { injectable, inject } from 'inversify';
import { EventEmitter } from 'events';
import type { LoggerPort } from '../../domain/ports.js';
import type {
  HookSystem as IHookSystem,
  HookRegistration,
  HookExecutionContext,
  HookResult,
  HookPhase,
  HookType,
  HookCondition,
  ConditionOperator,
  CancellationToken
} from '../../domain/plugins/index.js';
import { TYPES } from '../di/types.js';

interface HookExecutionMetrics {
  readonly hookName: string;
  readonly pluginId: string;
  readonly executionTime: number;
  readonly success: boolean;
  readonly error?: Error;
}

interface HookRegistrationInternal extends HookRegistration {
  readonly registeredAt: Date;
  readonly lastExecuted?: Date;
  readonly executionCount: number;
  readonly successCount: number;
  readonly errorCount: number;
}

class CancellationTokenImpl implements CancellationToken {
  private _isCancelled = false;
  private readonly callbacks: (() => void)[] = [];

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  cancel(): void {
    if (!this._isCancelled) {
      this._isCancelled = true;
      this.callbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          // Ignore callback errors
        }
      });
    }
  }

  onCancelled(callback: () => void): void {
    if (this._isCancelled) {
      callback();
    } else {
      this.callbacks.push(callback);
    }
  }
}

@injectable()
export class HookSystem implements IHookSystem {
  private readonly hooks = new Map<string, HookRegistrationInternal[]>();
  private readonly eventEmitter = new EventEmitter();
  private readonly metrics: HookExecutionMetrics[] = [];
  private readonly maxMetricsHistory = 1000;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {
    this.eventEmitter.setMaxListeners(100); // Increase for plugin hooks
  }

  async register(pluginId: string, hook: HookRegistration): Promise<void> {
    const hookName = hook.name;
    
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    const existingHooks = this.hooks.get(hookName)!;
    
    // Check for duplicate registration
    const existingIndex = existingHooks.findIndex(h => h.pluginId === pluginId && h.name === hookName);
    if (existingIndex >= 0) {
      this.logger.warn('Hook already registered, replacing', {
        hookName,
        pluginId,
        type: hook.type,
        phase: hook.phase
      });
      existingHooks.splice(existingIndex, 1);
    }

    const internalHook: HookRegistrationInternal = {
      ...hook,
      registeredAt: new Date(),
      executionCount: 0,
      successCount: 0,
      errorCount: 0
    };

    existingHooks.push(internalHook);
    
    // Sort by priority (higher priority first)
    existingHooks.sort((a, b) => b.priority - a.priority);

    this.logger.info('Hook registered successfully', {
      hookName,
      pluginId,
      type: hook.type,
      phase: hook.phase,
      priority: hook.priority,
      totalHooks: existingHooks.length
    });

    this.eventEmitter.emit('hook-registered', { hookName, pluginId, hook });
  }

  async unregister(pluginId: string, hookName: string): Promise<void> {
    const hooks = this.hooks.get(hookName);
    if (!hooks) {
      this.logger.warn('No hooks found for unregistration', { hookName, pluginId });
      return;
    }

    const initialLength = hooks.length;
    const filteredHooks = hooks.filter(h => !(h.pluginId === pluginId && h.name === hookName));
    
    if (filteredHooks.length === initialLength) {
      this.logger.warn('Hook not found for unregistration', { hookName, pluginId });
      return;
    }

    if (filteredHooks.length === 0) {
      this.hooks.delete(hookName);
    } else {
      this.hooks.set(hookName, filteredHooks);
    }

    this.logger.info('Hook unregistered successfully', {
      hookName,
      pluginId,
      remainingHooks: filteredHooks.length
    });

    this.eventEmitter.emit('hook-unregistered', { hookName, pluginId });
  }

  async execute(hookName: string, context: HookExecutionContext): Promise<HookResult> {
    const hooks = this.hooks.get(hookName);
    if (!hooks || hooks.length === 0) {
      this.logger.debug('No hooks registered for execution', { hookName });
      return { success: true, data: context.data };
    }

    const startTime = Date.now();
    const cancellationToken = new CancellationTokenImpl();
    const executionContext: HookExecutionContext = {
      ...context,
      cancellationToken
    };

    this.logger.debug('Executing hooks', {
      hookName,
      phase: context.phase,
      hooksCount: hooks.length
    });

    let aggregatedData = { ...context.data };
    let stopPropagation = false;
    const errors: Error[] = [];

    try {
      for (const hook of hooks) {
        if (cancellationToken.isCancelled || stopPropagation) {
          this.logger.debug('Hook execution stopped', {
            hookName,
            pluginId: hook.pluginId,
            reason: cancellationToken.isCancelled ? 'cancelled' : 'stop-propagation'
          });
          break;
        }

        // Check hook conditions
        if (!this.evaluateConditions(hook.conditions || [], executionContext)) {
          this.logger.debug('Hook conditions not met, skipping', {
            hookName,
            pluginId: hook.pluginId
          });
          continue;
        }

        const hookStartTime = Date.now();
        let success = true;
        let error: Error | undefined;

        try {
          // Update execution context with current data
          const currentContext: HookExecutionContext = {
            ...executionContext,
            data: aggregatedData
          };

          const result = await hook.handler(currentContext);
          
          // Update internal metrics
          (hook as HookRegistrationInternal).executionCount++;
          (hook as HookRegistrationInternal).lastExecuted = new Date();
          (hook as HookRegistrationInternal).successCount++;

          if (result.success) {
            // Merge result data
            if (result.data) {
              aggregatedData = this.mergeHookData(aggregatedData, result.data, hook.type);
            }

            // Check for stop propagation
            if (result.stopPropagation) {
              stopPropagation = true;
            }
          } else {
            success = false;
            error = result.error;
            if (result.error) {
              errors.push(result.error);
              (hook as HookRegistrationInternal).errorCount++;
            }
          }

          this.logger.debug('Hook executed successfully', {
            hookName,
            pluginId: hook.pluginId,
            executionTime: Date.now() - hookStartTime,
            success: result.success,
            stopPropagation: result.stopPropagation
          });

        } catch (executionError) {
          success = false;
          error = executionError instanceof Error ? executionError : new Error(String(executionError));
          errors.push(error);
          
          (hook as HookRegistrationInternal).executionCount++;
          (hook as HookRegistrationInternal).errorCount++;

          this.logger.error('Hook execution failed', {
            hookName,
            pluginId: hook.pluginId,
            error: error.message
          });
        }

        // Record metrics
        this.recordMetrics({
          hookName,
          pluginId: hook.pluginId,
          executionTime: Date.now() - hookStartTime,
          success,
          error
        });
      }

      const totalExecutionTime = Date.now() - startTime;
      const overallSuccess = errors.length === 0;

      this.logger.info('Hook execution completed', {
        hookName,
        phase: context.phase,
        hooksExecuted: hooks.length,
        totalTime: totalExecutionTime,
        success: overallSuccess,
        errorsCount: errors.length
      });

      return {
        success: overallSuccess,
        data: aggregatedData,
        error: errors.length > 0 ? errors[0] : undefined,
        metadata: {
          executionTime: totalExecutionTime,
          hooksExecuted: hooks.length,
          errorCount: errors.length,
          stopPropagation
        }
      };

    } catch (error) {
      this.logger.error('Hook system execution failed', {
        hookName,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          executionTime: Date.now() - startTime,
          hooksExecuted: 0,
          errorCount: 1
        }
      };
    }
  }

  async getHooks(hookName: string): Promise<HookRegistration[]> {
    const hooks = this.hooks.get(hookName);
    return hooks ? [...hooks] : [];
  }

  async getAllHooks(): Promise<Record<string, HookRegistration[]>> {
    const result: Record<string, HookRegistration[]> = {};
    
    for (const [hookName, hooks] of this.hooks.entries()) {
      result[hookName] = [...hooks];
    }
    
    return result;
  }

  // Utility methods for hook system management
  async getHookMetrics(hookName?: string): Promise<HookExecutionMetrics[]> {
    if (hookName) {
      return this.metrics.filter(m => m.hookName === hookName);
    }
    return [...this.metrics];
  }

  async getHookStatistics(hookName: string): Promise<{
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    errorCount: number;
    pluginStats: Record<string, { executions: number; successRate: number }>;
  }> {
    const hooks = this.hooks.get(hookName) || [];
    const metrics = this.metrics.filter(m => m.hookName === hookName);
    
    const totalExecutions = metrics.length;
    const successCount = metrics.filter(m => m.success).length;
    const successRate = totalExecutions > 0 ? successCount / totalExecutions : 0;
    const averageExecutionTime = totalExecutions > 0 
      ? metrics.reduce((sum, m) => sum + m.executionTime, 0) / totalExecutions 
      : 0;
    const errorCount = metrics.filter(m => !m.success).length;

    const pluginStats: Record<string, { executions: number; successRate: number }> = {};
    
    for (const hook of hooks) {
      const internalHook = hook as HookRegistrationInternal;
      pluginStats[hook.pluginId] = {
        executions: internalHook.executionCount,
        successRate: internalHook.executionCount > 0 
          ? internalHook.successCount / internalHook.executionCount 
          : 0
      };
    }

    return {
      totalExecutions,
      successRate,
      averageExecutionTime,
      errorCount,
      pluginStats
    };
  }

  async clearHooks(pluginId?: string): Promise<void> {
    if (pluginId) {
      // Clear all hooks for a specific plugin
      for (const [hookName, hooks] of this.hooks.entries()) {
        const filteredHooks = hooks.filter(h => h.pluginId !== pluginId);
        if (filteredHooks.length === 0) {
          this.hooks.delete(hookName);
        } else {
          this.hooks.set(hookName, filteredHooks);
        }
      }
      this.logger.info('Plugin hooks cleared', { pluginId });
    } else {
      // Clear all hooks
      this.hooks.clear();
      this.logger.info('All hooks cleared');
    }
  }

  // Private helper methods
  private evaluateConditions(conditions: HookCondition[], context: HookExecutionContext): boolean {
    if (conditions.length === 0) return true;

    return conditions.every(condition => {
      const contextValue = this.getContextValue(context, condition.type);
      return this.evaluateCondition(contextValue, condition.value, condition.operator);
    });
  }

  private getContextValue(context: HookExecutionContext, path: string): unknown {
    const parts = path.split('.');
    let value: unknown = context;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  private evaluateCondition(contextValue: unknown, conditionValue: unknown, operator: ConditionOperator): boolean {
    switch (operator) {
      case ConditionOperator.EQUALS:
        return contextValue === conditionValue;
      case ConditionOperator.NOT_EQUALS:
        return contextValue !== conditionValue;
      case ConditionOperator.GREATER_THAN:
        return typeof contextValue === 'number' && typeof conditionValue === 'number' && contextValue > conditionValue;
      case ConditionOperator.GREATER_THAN_OR_EQUAL:
        return typeof contextValue === 'number' && typeof conditionValue === 'number' && contextValue >= conditionValue;
      case ConditionOperator.LESS_THAN:
        return typeof contextValue === 'number' && typeof conditionValue === 'number' && contextValue < conditionValue;
      case ConditionOperator.LESS_THAN_OR_EQUAL:
        return typeof contextValue === 'number' && typeof conditionValue === 'number' && contextValue <= conditionValue;
      case ConditionOperator.CONTAINS:
        return typeof contextValue === 'string' && typeof conditionValue === 'string' && contextValue.includes(conditionValue);
      case ConditionOperator.STARTS_WITH:
        return typeof contextValue === 'string' && typeof conditionValue === 'string' && contextValue.startsWith(conditionValue);
      case ConditionOperator.ENDS_WITH:
        return typeof contextValue === 'string' && typeof conditionValue === 'string' && contextValue.endsWith(conditionValue);
      case ConditionOperator.MATCHES:
        try {
          const regex = new RegExp(String(conditionValue));
          return typeof contextValue === 'string' && regex.test(contextValue);
        } catch {
          return false;
        }
      case ConditionOperator.IN:
        return Array.isArray(conditionValue) && conditionValue.includes(contextValue);
      case ConditionOperator.NOT_IN:
        return Array.isArray(conditionValue) && !conditionValue.includes(contextValue);
      default:
        return false;
    }
  }

  private mergeHookData(currentData: Record<string, unknown>, newData: Record<string, unknown>, hookType: HookType): Record<string, unknown> {
    switch (hookType) {
      case HookType.FILTER:
        // For filter hooks, new data replaces current data
        return { ...currentData, ...newData };
      case HookType.TRANSFORMER:
        // For transformer hooks, new data transforms current data
        return newData;
      case HookType.ACTION:
      case HookType.OBSERVER:
        // For action/observer hooks, merge data without replacement
        return { ...currentData, ...newData };
      case HookType.VALIDATOR:
        // For validator hooks, merge validation results
        return {
          ...currentData,
          ...newData,
          valid: (currentData.valid !== false) && (newData.valid !== false)
        };
      default:
        return { ...currentData, ...newData };
    }
  }

  private recordMetrics(metrics: HookExecutionMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only the most recent metrics to prevent memory issues
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.splice(0, this.metrics.length - this.maxMetricsHistory);
    }
  }
}