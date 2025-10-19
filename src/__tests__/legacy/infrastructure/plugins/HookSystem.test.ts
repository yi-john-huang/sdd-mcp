// Unit tests for HookSystem implementation

import 'reflect-metadata';
import { HookSystem } from '../../../infrastructure/plugins/HookSystem.js';
import { 
  HookType, 
  HookPhase, 
  HookExecutionContext, 
  HookResult,
  ConditionOperator 
} from '../../../domain/plugins/index.js';
import { LoggerPort } from '../../../domain/ports.js';

describe('HookSystem', () => {
  let hookSystem: HookSystem;
  let mockLogger: jest.Mocked<LoggerPort>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    hookSystem = new HookSystem(mockLogger);
  });

  describe('register', () => {
    it('should register a hook successfully', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const hook = {
        pluginId: 'test-plugin',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: mockHandler,
        conditions: []
      };

      await hookSystem.register('test-plugin', hook);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Hook registered successfully',
        expect.objectContaining({
          hookName: 'test-hook',
          pluginId: 'test-plugin',
          type: HookType.FILTER,
          phase: HookPhase.PRE_INIT,
          priority: 100
        })
      );
    });

    it('should replace existing hook from same plugin', async () => {
      const handler1 = jest.fn().mockResolvedValue({ success: true });
      const handler2 = jest.fn().mockResolvedValue({ success: true });
      
      const hook1 = {
        pluginId: 'test-plugin',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: handler1
      };

      const hook2 = {
        pluginId: 'test-plugin',
        name: 'test-hook',
        type: HookType.ACTION,
        phase: HookPhase.POST_INIT,
        priority: 200,
        handler: handler2
      };

      await hookSystem.register('test-plugin', hook1);
      await hookSystem.register('test-plugin', hook2);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Hook already registered, replacing',
        expect.objectContaining({
          hookName: 'test-hook',
          pluginId: 'test-plugin'
        })
      );

      const hooks = await hookSystem.getHooks('test-hook');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].type).toBe(HookType.ACTION);
      expect(hooks[0].priority).toBe(200);
    });

    it('should sort hooks by priority (higher first)', async () => {
      const lowPriorityHook = {
        pluginId: 'plugin-1',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 50,
        handler: jest.fn().mockResolvedValue({ success: true })
      };

      const highPriorityHook = {
        pluginId: 'plugin-2',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 150,
        handler: jest.fn().mockResolvedValue({ success: true })
      };

      await hookSystem.register('plugin-1', lowPriorityHook);
      await hookSystem.register('plugin-2', highPriorityHook);

      const hooks = await hookSystem.getHooks('test-hook');
      expect(hooks).toHaveLength(2);
      expect(hooks[0].priority).toBe(150);
      expect(hooks[1].priority).toBe(50);
    });
  });

  describe('unregister', () => {
    it('should unregister hook successfully', async () => {
      const hook = {
        pluginId: 'test-plugin',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: jest.fn().mockResolvedValue({ success: true })
      };

      await hookSystem.register('test-plugin', hook);
      await hookSystem.unregister('test-plugin', 'test-hook');

      const hooks = await hookSystem.getHooks('test-hook');
      expect(hooks).toHaveLength(0);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Hook unregistered successfully',
        expect.objectContaining({
          hookName: 'test-hook',
          pluginId: 'test-plugin',
          remainingHooks: 0
        })
      );
    });

    it('should warn when hook not found for unregistration', async () => {
      await hookSystem.unregister('test-plugin', 'non-existent-hook');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No hooks found for unregistration',
        { hookName: 'non-existent-hook', pluginId: 'test-plugin' }
      );
    });
  });

  describe('execute', () => {
    it('should execute hook successfully', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ 
        success: true, 
        data: { modified: true } 
      });
      
      const hook = {
        pluginId: 'test-plugin',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: mockHandler
      };

      await hookSystem.register('test-plugin', hook);

      const context: HookExecutionContext = {
        hookName: 'test-hook',
        phase: HookPhase.PRE_INIT,
        data: { original: true },
        metadata: { test: true }
      };

      const result = await hookSystem.execute('test-hook', context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ modified: true });
      expect(mockHandler).toHaveBeenCalledWith(expect.objectContaining({
        hookName: 'test-hook',
        phase: HookPhase.PRE_INIT,
        data: { original: true }
      }));
    });

    it('should return success when no hooks registered', async () => {
      const context: HookExecutionContext = {
        hookName: 'non-existent-hook',
        phase: HookPhase.PRE_INIT,
        data: { test: true },
        metadata: {}
      };

      const result = await hookSystem.execute('non-existent-hook', context);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: true });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'No hooks registered for execution',
        { hookName: 'non-existent-hook' }
      );
    });

    it('should handle hook execution errors gracefully', async () => {
      const error = new Error('Hook execution failed');
      const mockHandler = jest.fn().mockRejectedValue(error);
      
      const hook = {
        pluginId: 'test-plugin',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: mockHandler
      };

      await hookSystem.register('test-plugin', hook);

      const context: HookExecutionContext = {
        hookName: 'test-hook',
        phase: HookPhase.PRE_INIT,
        data: { test: true },
        metadata: {}
      };

      const result = await hookSystem.execute('test-hook', context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Hook execution failed',
        expect.objectContaining({
          hookName: 'test-hook',
          pluginId: 'test-plugin',
          error: 'Hook execution failed'
        })
      );
    });

    it('should stop propagation when requested', async () => {
      const handler1 = jest.fn().mockResolvedValue({ 
        success: true, 
        stopPropagation: true 
      });
      const handler2 = jest.fn().mockResolvedValue({ 
        success: true 
      });
      
      const hook1 = {
        pluginId: 'plugin-1',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 200,
        handler: handler1
      };

      const hook2 = {
        pluginId: 'plugin-2',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: handler2
      };

      await hookSystem.register('plugin-1', hook1);
      await hookSystem.register('plugin-2', hook2);

      const context: HookExecutionContext = {
        hookName: 'test-hook',
        phase: HookPhase.PRE_INIT,
        data: { test: true },
        metadata: {}
      };

      const result = await hookSystem.execute('test-hook', context);

      expect(result.success).toBe(true);
      expect(result.metadata?.stopPropagation).toBe(true);
      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should evaluate conditions correctly', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      
      const hook = {
        pluginId: 'test-plugin',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: mockHandler,
        conditions: [{
          type: 'data.enabled',
          value: true,
          operator: ConditionOperator.EQUALS
        }]
      };

      await hookSystem.register('test-plugin', hook);

      // Test with matching condition
      const context1: HookExecutionContext = {
        hookName: 'test-hook',
        phase: HookPhase.PRE_INIT,
        data: { enabled: true },
        metadata: {}
      };

      await hookSystem.execute('test-hook', context1);
      expect(mockHandler).toHaveBeenCalled();

      mockHandler.mockClear();

      // Test with non-matching condition
      const context2: HookExecutionContext = {
        hookName: 'test-hook',
        phase: HookPhase.PRE_INIT,
        data: { enabled: false },
        metadata: {}
      };

      await hookSystem.execute('test-hook', context2);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should merge data correctly for different hook types', async () => {
      // Test FILTER hook (merges data)
      const filterHandler = jest.fn().mockResolvedValue({
        success: true,
        data: { filtered: true }
      });

      const filterHook = {
        pluginId: 'filter-plugin',
        name: 'filter-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: filterHandler
      };

      await hookSystem.register('filter-plugin', filterHook);

      const filterContext: HookExecutionContext = {
        hookName: 'filter-hook',
        phase: HookPhase.PRE_INIT,
        data: { original: true },
        metadata: {}
      };

      const filterResult = await hookSystem.execute('filter-hook', filterContext);
      expect(filterResult.data).toEqual({ original: true, filtered: true });

      // Test TRANSFORMER hook (replaces data)
      const transformerHandler = jest.fn().mockResolvedValue({
        success: true,
        data: { transformed: true }
      });

      const transformerHook = {
        pluginId: 'transformer-plugin',
        name: 'transformer-hook',
        type: HookType.TRANSFORMER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: transformerHandler
      };

      await hookSystem.register('transformer-plugin', transformerHook);

      const transformerContext: HookExecutionContext = {
        hookName: 'transformer-hook',
        phase: HookPhase.PRE_INIT,
        data: { original: true },
        metadata: {}
      };

      const transformerResult = await hookSystem.execute('transformer-hook', transformerContext);
      expect(transformerResult.data).toEqual({ transformed: true });
    });
  });

  describe('getHookStatistics', () => {
    it('should return accurate statistics', async () => {
      const successHandler = jest.fn().mockResolvedValue({ success: true });
      const errorHandler = jest.fn().mockRejectedValue(new Error('Test error'));
      
      const successHook = {
        pluginId: 'success-plugin',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 200,
        handler: successHandler
      };

      const errorHook = {
        pluginId: 'error-plugin',
        name: 'test-hook',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: errorHandler
      };

      await hookSystem.register('success-plugin', successHook);
      await hookSystem.register('error-plugin', errorHook);

      const context: HookExecutionContext = {
        hookName: 'test-hook',
        phase: HookPhase.PRE_INIT,
        data: { test: true },
        metadata: {}
      };

      // Execute multiple times to generate statistics
      await hookSystem.execute('test-hook', context);
      await hookSystem.execute('test-hook', context);

      const stats = await hookSystem.getHookStatistics('test-hook');

      expect(stats.totalExecutions).toBe(4); // 2 executions × 2 hooks
      expect(stats.errorCount).toBe(2); // Error hook called twice
      expect(stats.successRate).toBe(0.5); // 50% success rate
      expect(stats.pluginStats).toHaveProperty('success-plugin');
      expect(stats.pluginStats).toHaveProperty('error-plugin');
    });
  });

  describe('clearHooks', () => {
    it('should clear all hooks for specific plugin', async () => {
      const hook1 = {
        pluginId: 'plugin-1',
        name: 'hook-1',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: jest.fn().mockResolvedValue({ success: true })
      };

      const hook2 = {
        pluginId: 'plugin-2',
        name: 'hook-2',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: jest.fn().mockResolvedValue({ success: true })
      };

      await hookSystem.register('plugin-1', hook1);
      await hookSystem.register('plugin-2', hook2);

      await hookSystem.clearHooks('plugin-1');

      const hooks1 = await hookSystem.getHooks('hook-1');
      const hooks2 = await hookSystem.getHooks('hook-2');

      expect(hooks1).toHaveLength(0);
      expect(hooks2).toHaveLength(1);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plugin hooks cleared',
        { pluginId: 'plugin-1' }
      );
    });

    it('should clear all hooks when no plugin specified', async () => {
      const hook1 = {
        pluginId: 'plugin-1',
        name: 'hook-1',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: jest.fn().mockResolvedValue({ success: true })
      };

      const hook2 = {
        pluginId: 'plugin-2',
        name: 'hook-2',
        type: HookType.FILTER,
        phase: HookPhase.PRE_INIT,
        priority: 100,
        handler: jest.fn().mockResolvedValue({ success: true })
      };

      await hookSystem.register('plugin-1', hook1);
      await hookSystem.register('plugin-2', hook2);

      await hookSystem.clearHooks();

      const allHooks = await hookSystem.getAllHooks();
      expect(Object.keys(allHooks)).toHaveLength(0);

      expect(mockLogger.info).toHaveBeenCalledWith('All hooks cleared');
    });
  });
});