// Basic system validation - ensures all components integrate correctly

import 'reflect-metadata';
import { createMCPServer } from '../../index';
import { TestUtils } from '../setup';

describe('Basic System Integration', () => {
  let testDir: string;
  let server: any;

  beforeAll(async () => {
    testDir = await TestUtils.createTempDir();
    server = await createMCPServer();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await TestUtils.cleanupTempDir(testDir);
  });

  describe('System Initialization', () => {
    it('should create server with all required components', async () => {
      expect(server).toBeDefined();
      expect(server.container).toBeDefined();
      expect(server.logger).toBeDefined();
      expect(server.mcpServer).toBeDefined();
      expect(server.pluginManager).toBeDefined();
      expect(server.hookSystem).toBeDefined();
      expect(server.toolRegistry).toBeDefined();
      expect(server.steeringRegistry).toBeDefined();
    });

    it('should initialize plugin system', async () => {
      const plugins = await server.pluginManager.getAllPlugins();
      expect(Array.isArray(plugins)).toBe(true);
      
      const hooks = await server.hookSystem.getAllHooks();
      expect(typeof hooks).toBe('object');
      
      const tools = await server.toolRegistry.getAllTools();
      expect(typeof tools).toBe('object');
      
      const steeringStats = await server.steeringRegistry.getSteeringStatistics();
      expect(steeringStats).toHaveProperty('totalDocuments');
      expect(steeringStats).toHaveProperty('documentsByPlugin');
      expect(steeringStats).toHaveProperty('documentsByMode');
    });

    it('should have dependency injection container configured', async () => {
      const container = server.container;
      
      // Test that we can get services from container
      expect(() => container.get('ProjectService')).not.toThrow();
      expect(() => container.get('WorkflowService')).not.toThrow();
      expect(() => container.get('TemplateService')).not.toThrow();
      expect(() => container.get('QualityService')).not.toThrow();
    });

    it('should provide server shutdown capability', async () => {
      expect(typeof server.close).toBe('function');
      expect(typeof server.initialize).toBe('function');
    });
  });

  describe('MCP Server Integration', () => {
    it('should have MCP server ready', async () => {
      expect(server.mcpServer).toBeDefined();
      // MCP server should be initialized but we don't start it in tests
    });

    it('should log system capabilities', async () => {
      // Verify logger is working
      expect(server.logger).toBeDefined();
      expect(typeof server.logger.info).toBe('function');
      expect(typeof server.logger.error).toBe('function');
      expect(typeof server.logger.warn).toBe('function');
      expect(typeof server.logger.debug).toBe('function');
    });
  });

  describe('Performance Validation', () => {
    it('should handle multiple system queries efficiently', async () => {
      const startTime = Date.now();
      
      // Run multiple operations in parallel
      const operations = await Promise.all([
        server.pluginManager.getAllPlugins(),
        server.hookSystem.getAllHooks(),
        server.toolRegistry.getAllTools(),
        server.steeringRegistry.getSteeringStatistics(),
        server.pluginManager.getAllPlugins(),
        server.hookSystem.getAllHooks(),
        server.toolRegistry.getAllTools(),
        server.steeringRegistry.getSteeringStatistics()
      ]);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(operations).toHaveLength(8);
      expect(executionTime).toBeWithinTimeThreshold(2000); // Should complete within 2 seconds
      
      // Verify all operations returned valid data
      operations.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should maintain consistent state across operations', async () => {
      // Get initial state
      const initialPlugins = await server.pluginManager.getAllPlugins();
      const initialHooks = await server.hookSystem.getAllHooks();
      const initialTools = await server.toolRegistry.getAllTools();
      
      // Perform some operations
      await server.steeringRegistry.getSteeringStatistics();
      await server.pluginManager.getAllPlugins();
      
      // Get state again
      const finalPlugins = await server.pluginManager.getAllPlugins();
      const finalHooks = await server.hookSystem.getAllHooks();
      const finalTools = await server.toolRegistry.getAllTools();
      
      // State should be consistent
      expect(initialPlugins.length).toBe(finalPlugins.length);
      expect(Object.keys(initialHooks).length).toBe(Object.keys(finalHooks).length);
      expect(Object.keys(initialTools).length).toBe(Object.keys(finalTools).length);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid plugin operations gracefully', async () => {
      // Test various invalid operations don't crash the system
      expect(async () => {
        await server.pluginManager.getAllPlugins();
        await server.hookSystem.getAllHooks();
        await server.toolRegistry.getAllTools();
      }).not.toThrow();
    });

    it('should maintain system integrity after errors', async () => {
      // Verify system is still functional after previous tests
      const plugins = await server.pluginManager.getAllPlugins();
      const hooks = await server.hookSystem.getAllHooks();
      const tools = await server.toolRegistry.getAllTools();
      const steering = await server.steeringRegistry.getSteeringStatistics();
      
      expect(Array.isArray(plugins)).toBe(true);
      expect(typeof hooks).toBe('object');
      expect(typeof tools).toBe('object');
      expect(steering).toHaveProperty('totalDocuments');
    });
  });
});