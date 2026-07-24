import { PluginToolRegistry } from '../../../infrastructure/plugins/PluginToolRegistry.ts';
import { PermissionType, ToolCategory, type ToolRegistration, type ToolExecutionContext, type ToolResult } from '../../../domain/plugins/index.js';

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
    const registry = new PluginToolRegistry(createLogger());

    await registry.register('plugin-1', baseToolRegistration);

    const stored = await registry.getTool('sample-tool');
    expect(stored).not.toBeNull();
    expect(stored?.pluginId).toBe('plugin-1');

    const byCategory = await registry.getToolsByCategory(ToolCategory.UTILITY);
    expect(byCategory).toHaveLength(1);
    expect(byCategory[0].name).toBe('sample-tool');
  });

  it('tracks execution metrics for successful runs', async () => {
    const registry = new PluginToolRegistry(createLogger());

    const handler = jest.fn<Promise<ToolResult>, [Record<string, unknown>, ToolExecutionContext]>(async () => ({
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
  it('enforces registration ownership, execution security, and cleanup boundaries', async () => {
    const registry = new PluginToolRegistry(createLogger());
    const context: ToolExecutionContext = {
      toolName: 'sample-tool',
      pluginId: 'plugin-1',
      user: 'tester',
      session: 'session-123',
      metadata: {}
    };

    await expect(registry.execute('missing', {}, context)).resolves.toMatchObject({ success: false });
    await registry.register('plugin-1', baseToolRegistration);
    await registry.register('plugin-1', { ...baseToolRegistration, description: 'replacement' });
    await expect(registry.register('plugin-2', baseToolRegistration)).rejects.toThrow('already registered');
    await expect(registry.unregister('plugin-2', 'sample-tool')).rejects.toThrow("not 'plugin-2'");
    await expect(registry.unregister('plugin-1', 'missing')).resolves.toBeUndefined();

    for (const invalid of [
      { ...baseToolRegistration, name: '' },
      { ...baseToolRegistration, description: '' },
      { ...baseToolRegistration, handler: null },
      { ...baseToolRegistration, permissions: [{ type: 'unknown', resource: '*' }] },
    ]) {
      await expect(registry.register('plugin-1', invalid as unknown as ToolRegistration)).rejects.toThrow();
    }

    await registry.register('plugin-1', {
      ...baseToolRegistration,
      name: 'throwing',
      handler: async () => { throw new Error('handler failed'); },
    });
    await expect(registry.execute('throwing', {}, context)).resolves.toMatchObject({ success: false });
    await expect(registry.execute('sample-tool', { source: 'eval(userInput)' }, context))
      .resolves.toMatchObject({ success: false });

    for (const [name, permission, success] of [
      ['file-ok', { type: PermissionType.FILE_READ, resource: '/tmp/project', actions: [] }, true],
      ['file-denied', { type: PermissionType.FILE_WRITE, resource: '/etc/passwd', actions: [] }, false],
      ['network-ok', { type: PermissionType.NETWORK_REQUEST, resource: 'https://example.com', actions: [] }, true],
      ['network-local', { type: PermissionType.NETWORK_REQUEST, resource: 'http://127.0.0.1', actions: [] }, false],
      ['network-private', { type: PermissionType.NETWORK_REQUEST, resource: 'http://192.168.1.2', actions: [] }, false],
      ['network-invalid', { type: PermissionType.NETWORK_REQUEST, resource: 'not a url', actions: [] }, false],
      ['system-info', { type: PermissionType.SYSTEM_INFO, resource: '*', actions: [] }, true],
    ] as const) {
      await registry.register('plugin-1', {
        ...baseToolRegistration,
        name,
        permissions: [{ ...permission, actions: [...permission.actions] }],
      });
      await expect(registry.execute(name, {}, context)).resolves.toMatchObject({ success });
    }

    expect(Object.keys(await registry.getAllTools()).length).toBeGreaterThan(1);
    expect(await registry.getToolsByPlugin('plugin-1')).not.toHaveLength(0);
    expect(await registry.getToolMetrics()).not.toHaveLength(0);
    expect(await registry.getToolMetrics('throwing')).toHaveLength(1);
    await expect(registry.getToolStatistics('never-run')).resolves.toMatchObject({ totalExecutions: 0 });

    await registry.unregister('plugin-1', 'sample-tool');
    expect(await registry.getTool('sample-tool')).toBeNull();
    await registry.clearTools('plugin-1');
    expect(await registry.getAllTools()).toEqual({});
    await registry.clearTools();
  });
});
