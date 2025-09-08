#!/usr/bin/env node

// MCP SDD Server entry point

import 'reflect-metadata';
import { createContainer } from './infrastructure/di/container.js';
import { TYPES } from './infrastructure/di/types.js';
import type { LoggerPort } from './domain/ports.js';

async function main(): Promise<void> {
  try {
    const container = createContainer();
    const logger = container.get<LoggerPort>(TYPES.LoggerPort);
    
    logger.info('MCP SDD Server starting...', {
      version: process.env.npm_package_version ?? '1.0.0',
      nodeVersion: process.version
    });

    // TODO: Initialize MCP server components (task 1.1)
    // TODO: Set up workflow engine (task 3)
    // TODO: Register SDD tools (task 2.3)

    logger.info('MCP SDD Server foundation established');
    
  } catch (error) {
    console.error('Failed to start MCP SDD Server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}