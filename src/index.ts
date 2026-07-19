#!/usr/bin/env node

import 'reflect-metadata';
import type { Container } from 'inversify';
import { createContainer } from './infrastructure/di/container.js';
import { TYPES } from './infrastructure/di/types.js';
import type { LoggerPort } from './domain/ports.js';
import { MCPServer } from './infrastructure/mcp/MCPServer.js';
import { PluginManager } from './infrastructure/plugins/PluginManager.js';
import { HookSystem } from './infrastructure/plugins/HookSystem.js';
import { PluginToolRegistry } from './infrastructure/plugins/PluginToolRegistry.js';
import { PluginSteeringRegistry } from './infrastructure/plugins/PluginSteeringRegistry.js';

export interface SDDMCPRuntime {
  container: Container;
  logger: LoggerPort;
  mcpServer: MCPServer;
  pluginManager: PluginManager;
  hookSystem: HookSystem;
  toolRegistry: PluginToolRegistry;
  steeringRegistry: PluginSteeringRegistry;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

export async function createMCPServer(): Promise<SDDMCPRuntime> {
  const container = createContainer();
  const logger = container.get<LoggerPort>(TYPES.LoggerPort);
  const mcpServer = container.get<MCPServer>(TYPES.MCPServer);
  const pluginManager = container.get<PluginManager>(TYPES.PluginManager);
  const hookSystem = container.get<HookSystem>(TYPES.HookSystem);
  const toolRegistry = container.get<PluginToolRegistry>(TYPES.PluginToolRegistry);
  const steeringRegistry = container.get<PluginSteeringRegistry>(TYPES.PluginSteeringRegistry);

  await pluginManager.initialize();

  return {
    container,
    logger,
    mcpServer,
    pluginManager,
    hookSystem,
    toolRegistry,
    steeringRegistry,
    async initialize() {},
    async close() {
      await mcpServer.stop();
    },
  };
}

export async function startMCPServer(): Promise<SDDMCPRuntime> {
  const runtime = await createMCPServer();
  await runtime.mcpServer.start();
  return runtime;
}

function isDirectExecution(): boolean {
  return process.argv[1]?.endsWith('/dist/index.js') === true ||
    process.argv[1]?.endsWith('\\dist\\index.js') === true;
}

if (isDirectExecution()) {
  startMCPServer().catch((error: unknown) => {
    process.stderr.write(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
