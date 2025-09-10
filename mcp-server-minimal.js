#!/usr/bin/env node

// Ultra-minimal MCP server for Claude Code compatibility testing
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
  version: '1.1.12'
}, {
  capabilities: {
    tools: {}
  }
});

// Minimal tools implementation
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'sdd-init',
      description: 'Initialize a new SDD project',
      inputSchema: {
        type: 'object',
        properties: {
          projectName: { type: 'string' }
        },
        required: ['projectName']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === 'sdd-init') {
    return {
      content: [{
        type: 'text',
        text: `SDD project "${args?.projectName}" would be initialized here.`
      }]
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

server.setNotificationHandler(InitializedNotificationSchema, async () => {
  // Client initialized
});

const transport = new StdioServerTransport();
await server.connect(transport);