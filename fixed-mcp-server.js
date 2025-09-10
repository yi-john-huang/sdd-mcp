#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: 'sdd-mcp-server',
  version: '1.1.20'
}, {
  instructions: 'Use this server for spec-driven development workflows'
});

// Register SDD tools
server.registerTool("sdd-init", {
  title: "Initialize SDD Project",
  description: "Initialize a new SDD project",
  inputSchema: {
    projectName: z.string().describe('The name of the project to initialize'),
    description: z.string().optional().describe('Optional project description')
  },
}, async ({ projectName, description }) => {
  return {
    content: [{
      type: 'text',
      text: `SDD project "${projectName}" initialization would begin here.${description ? ` Description: ${description}` : ''}`
    }]
  };
});

server.registerTool("sdd-status", {
  title: "Get SDD Project Status",
  description: "Get current SDD project status",
  inputSchema: {},
}, async () => {
  return {
    content: [{
      type: 'text',
      text: 'SDD project status: No active project found. Use sdd-init to create a new project.'
    }]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);