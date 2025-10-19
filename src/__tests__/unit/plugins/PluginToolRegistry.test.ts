import { PluginToolRegistry } from '../../../infrastructure/plugins/PluginToolRegistry.ts';
import { ToolCategory, type ToolRegistration, type ToolExecutionContext, type ToolResult } from '../../../domain/plugins/index.js';

const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
});

const baseToolRegistration: Omit<ToolRegistration, 'handler'> & { handler: ToolRegistration['handler'] } = {
  pluginId: 'plugin-1',
  name: 'sample-tool',
  description: 'Sample tool for testing',
  category: ToolCategory.UTILITY,
  handler: async () => ({ success: true }),
  inputSchema: {},
  outputSchema: {},
  permissions: []
};

describe('PluginToolRegistry', () => {
  it('registers a tool and makes it discoverable', async () => {
    const registry = new PluginToolRegistry(createLogger() as any);

    await registry.register('plugin-1', baseToolRegistration);

    const stored = await registry.getTool('sample-tool');
    expect(stored).not.toBeNull();
    expect(stored?.pluginId).toBe('plugin-1');

    const byCategory = await registry.getToolsByCategory(ToolCategory.UTILITY);
    expect(byCategory).toHaveLength(1);
    expect(byCategory[0].name).toBe('sample-tool');
  });

  it('tracks execution metrics for successful runs', async () => {
    const registry = new PluginToolRegistry(createLogger() as any);

    const handler = jest.fn<Promise<ToolResult>, any[]>(async () => ({
      success: true,
      data: { ok: true }
    }));

    await registry.register('plugin-1', {
      ...baseToolRegistration,
      handler
    });

    const context: ToolExecutionContext = {
      toolName: 'sample-tool',
      pluginId: 'plugin-1',
      user: 'tester',
      session: 'session-123',
      metadata: {}
    };

    const result = await registry.execute('sample-tool', { foo: 'bar' }, context);
    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    const stats = await registry.getToolStatistics('sample-tool');
    expect(stats.totalExecutions).toBe(1);
    expect(stats.successRate).toBe(1);
    expect(stats.errorRate).toBe(0);
  });
});
