#!/usr/bin/env node

import { startMCPServer } from './dist/index.js';

startMCPServer().catch((error) => {
  process.stderr.write(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
