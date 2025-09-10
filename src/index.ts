#!/usr/bin/env node

// MCP SDD Server entry point

// IMPORTANT: Detect MCP mode and silence console output BEFORE any imports
// Check multiple indicators for MCP mode
const isMCPMode = process.argv[1]?.includes('sdd-mcp-server') || 
                 process.argv[0]?.includes('sdd-mcp-server') ||
                 process.env.npm_execpath?.includes('npx') ||  // Executed via npx
                 (process.stdin.isTTY === false) || // MCP servers communicate via stdio pipes
                 process.argv.includes('--mcp-mode') || // Explicit MCP mode flag
                 true; // Default to MCP mode for npm package

if (isMCPMode) {
  // Completely silence all console output for MCP mode
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};
  // Keep error for debugging but send to stderr
  const originalError = console.error;
  console.error = (...args) => originalError('[SDD-DEBUG]', ...args);
}

import 'reflect-metadata';
import { createContainer } from './infrastructure/di/container.js';
import { TYPES } from './infrastructure/di/types.js';
import type { LoggerPort } from './domain/ports';
import { MCPServer } from './infrastructure/mcp/MCPServer';
import { PluginManager } from './infrastructure/plugins/PluginManager';
import { HookSystem } from './infrastructure/plugins/HookSystem';
import { PluginToolRegistry } from './infrastructure/plugins/PluginToolRegistry';
import { PluginSteeringRegistry } from './infrastructure/plugins/PluginSteeringRegistry';

export async function createMCPServer() {
  const container = createContainer();
  const logger = container.get<LoggerPort>(TYPES.LoggerPort);
  const mcpServer = container.get<MCPServer>(TYPES.MCPServer);
  const pluginManager = container.get<PluginManager>(TYPES.PluginManager);
  const hookSystem = container.get<HookSystem>(TYPES.HookSystem);
  const toolRegistry = container.get<PluginToolRegistry>(TYPES.PluginToolRegistry);
  const steeringRegistry = container.get<PluginSteeringRegistry>(TYPES.PluginSteeringRegistry);

  // Initialize plugin system
  await pluginManager.initialize();

  return {
    container,
    logger,
    mcpServer,
    pluginManager,
    hookSystem,
    toolRegistry,
    steeringRegistry,
    async initialize() {
      // Already initialized above
    },
    async close() {
      await mcpServer.stop();
    }
  };
}

async function createSimpleMCPServer() {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema, InitializedNotificationSchema } = await import('@modelcontextprotocol/sdk/types.js');

  const server = new Server({
    name: 'sdd-mcp-server',
    version: '1.1.12'
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Add basic SDD tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'sdd-init',
          description: 'Initialize a new SDD project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['projectName']
          }
        },
        {
          name: 'sdd-status',  
          description: 'Get current SDD project status',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'sdd-init':
        return {
          content: [{
            type: 'text',
            text: `SDD project "${args?.projectName}" initialization would begin here. (Simplified MCP mode)`
          }]
        };
      case 'sdd-status':
        return {
          content: [{
            type: 'text', 
            text: 'SDD project status: No active project found. Use sdd-init to create a new project.'
          }]
        };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Handle initialized notification
  server.setNotificationHandler(InitializedNotificationSchema, async () => {
    // Client has completed initialization - server is ready
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main(): Promise<void> {
  try {
    if (isMCPMode) {
      // Use simplified MCP server for MCP mode
      await createSimpleMCPServer();
    } else {
      // Use full featured server for standalone mode
      const server = await createMCPServer();
      const { logger, mcpServer, pluginManager, hookSystem, toolRegistry, steeringRegistry } = server;
      
      logger.info('MCP SDD Server starting...', {
        version: process.env.npm_package_version ?? '1.0.0',
        nodeVersion: process.version,
        pid: process.pid
      });

      await mcpServer.start();

      // Get plugin system statistics
      const pluginStats = await pluginManager.getAllPlugins();
      const hookStats = await hookSystem.getAllHooks();
      const toolStats = await toolRegistry.getAllTools();
      const steeringStats = await steeringRegistry.getSteeringStatistics();

      logger.info('MCP SDD Server ready for connections', {
        capabilities: {
          workflow: '5-phase SDD workflow state machine (INIT→REQUIREMENTS→DESIGN→TASKS→IMPLEMENTATION)',
          validation: 'Cross-phase validation with approval gates and rollback support',
          initialization: 'Project setup with .kiro directory structure and spec.json',
          context: 'Project memory with codebase analysis and context persistence',
          steering: 'Dynamic steering document management with Always/Conditional/Manual modes',
          quality: 'Linus-style code review with 5-layer analysis framework',
          i18n: '10-language support with cultural adaptation',
          plugins: `${pluginStats.length} plugins loaded with extensibility framework`,
          templates: 'Handlebars-based template generation with inheritance'
        },
        tools: {
          count: 10,
          categories: ['sdd-init', 'sdd-requirements', 'sdd-design', 'sdd-tasks', 'sdd-implement', 'sdd-status', 'sdd-approve', 'sdd-quality-check', 'sdd-context-load', 'sdd-template-render'],
          pluginTools: Object.keys(toolStats).length
        },
        hooks: {
          registered: Object.keys(hookStats).length,
          phases: ['PRE_INIT', 'POST_INIT', 'PRE_REQUIREMENTS', 'POST_REQUIREMENTS', 'PRE_DESIGN', 'POST_DESIGN', 'PRE_TASKS', 'POST_TASKS', 'PRE_IMPLEMENTATION', 'POST_IMPLEMENTATION']
        },
        steering: {
          documents: steeringStats.totalDocuments,
          plugins: Object.keys(steeringStats.documentsByPlugin).length,
          modes: steeringStats.documentsByMode
        }
      });

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await mcpServer.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await mcpServer.stop();
        process.exit(0);
      });
    }
  } catch (error) {
    // Only log startup errors in non-MCP mode
    if (!isMCPMode) {
      console.error('Failed to start MCP SDD Server:', error);
    }
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}