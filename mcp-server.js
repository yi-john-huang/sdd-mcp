#!/usr/bin/env node

// Fast startup MCP server - optimized for Claude Code health checks
const startTime = Date.now();

// Silence console output immediately
console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.debug = () => {};
console.error = () => {};

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  InitializedNotificationSchema
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server({
  name: 'sdd-mcp-server',
  version: '1.1.11'
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