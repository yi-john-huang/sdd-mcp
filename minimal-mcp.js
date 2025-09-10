#!/usr/bin/env node

// Minimal MCP server to test the exact same pattern as context7
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

// Completely silent for MCP mode
console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.debug = () => {};
console.error = () => {};

async function main() {
  const server = new Server({
    name: 'minimal-sdd',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'test-tool',
          description: 'A minimal test tool',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            }
          }
        }
      ]
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'test-tool') {
      return {
        content: [
          {
            type: 'text',
            text: `Test tool called with: ${JSON.stringify(request.params.arguments)}`
          }
        ]
      };
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  // Connect to stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => process.exit(1));