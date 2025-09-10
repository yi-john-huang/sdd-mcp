#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

function createServerInstance() {
  const server = new McpServer({
    name: "sdd-mcp-server",
    version: "1.1.21",
  }, {
    instructions: "Use this server for spec-driven development workflows across AI-agent CLIs and IDEs.",
  });

  // Register SDD tools exactly like context7 does
  server.registerTool("sdd-init", {
    title: "Initialize SDD Project",
    description: "Initialize a new SDD project",
    inputSchema: {
      projectName: {
        type: "string",
        description: "The name of the project to initialize"
      },
      description: {
        type: "string",
        description: "Optional project description"
      }
    },
  }, async ({ projectName, description }) => {
    return {
      content: [
        {
          type: "text",
          text: `SDD project "${projectName}" initialization would begin here.${description ? ` Description: ${description}` : ''}`
        },
      ],
    };
  });

  server.registerTool("sdd-status", {
    title: "Get SDD Project Status", 
    description: "Get current SDD project status",
    inputSchema: {},
  }, async () => {
    return {
      content: [
        {
          type: "text",
          text: "SDD project status: No active project found. Use sdd-init to create a new project."
        },
      ],
    };
  });

  return server;
}

async function main() {
  const server = createServerInstance();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SDD MCP Server running on stdio");
}

main().catch((error) => {
  console.error("SDD MCP Server failed to start:", error);
  process.exit(1);
});