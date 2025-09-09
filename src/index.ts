#!/usr/bin/env node

// MCP SDD Server entry point

import 'reflect-metadata';
import { createContainer } from './infrastructure/di/container.js';
import { TYPES } from './infrastructure/di/types.js';
import type { LoggerPort } from './domain/ports.js';
import { MCPServer } from './infrastructure/mcp/MCPServer.js';

async function main(): Promise<void> {
  try {
    const container = createContainer();
    const logger = container.get<LoggerPort>(TYPES.LoggerPort);
    const mcpServer = container.get<MCPServer>(TYPES.MCPServer);
    
    logger.info('MCP SDD Server starting...', {
      version: process.env.npm_package_version ?? '1.0.0',
      nodeVersion: process.version
    });

    // Initialize MCP server with stdio transport
    await mcpServer.start();

    // TODO: Set up workflow engine (task 3)
    // TODO: Register SDD tools (task 2.3)

    logger.info('MCP SDD Server ready for connections');

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
    
  } catch (error) {
    console.error('Failed to start MCP SDD Server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}