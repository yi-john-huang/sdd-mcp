#!/usr/bin/env node

// Debug version - logs errors to file to see what's failing in npx
import fs from 'fs';

const logError = (msg, error) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${msg}: ${error?.message || error}\n${error?.stack || ''}\n\n`;
  fs.appendFileSync('/tmp/sdd-mcp-debug.log', logEntry);
};

// Still silence normal output but capture errors
console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.debug = () => {};
console.error = (msg, ...args) => logError('CONSOLE_ERROR', msg + ' ' + args.join(' '));

try {
  logError('DEBUG_START', 'Starting MCP server');
  
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { 
    ListToolsRequestSchema, 
    CallToolRequestSchema,
    InitializedNotificationSchema
  } = await import('@modelcontextprotocol/sdk/types.js');

  logError('DEBUG_IMPORTS', 'All imports successful');

  const server = new Server({
    name: 'sdd-mcp-server',
    version: '1.1.19'
  }, {
    capabilities: {
      tools: {}
    }
  });

  logError('DEBUG_SERVER', 'Server created');

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
            text: `SDD project "${args?.projectName}" initialization would begin here. (Debug mode)`
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

  server.setNotificationHandler(InitializedNotificationSchema, async () => {
    logError('DEBUG_INITIALIZED', 'Server initialized');
  });

  logError('DEBUG_TRANSPORT', 'Creating transport');
  const transport = new StdioServerTransport();
  
  logError('DEBUG_CONNECT', 'Connecting server');
  await server.connect(transport);
  
  logError('DEBUG_SUCCESS', 'Server connected successfully');
  
} catch (error) {
  logError('DEBUG_ERROR', error);
  process.exit(1);
}