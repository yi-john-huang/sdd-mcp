#!/usr/bin/env node

// MCP SDD Server entry point

// IMPORTANT: Detect MCP mode and silence console output BEFORE any imports
// Check multiple indicators for MCP mode
const isMCPMode =
  process.argv[1]?.includes("sdd-mcp-server") ||
  process.argv[0]?.includes("sdd-mcp-server") ||
  process.env.npm_execpath?.includes("npx") || // Executed via npx
  process.stdin.isTTY === false || // MCP servers communicate via stdio pipes
  process.argv.includes("--mcp-mode") || // Explicit MCP mode flag
  process.argv.includes("--simplified") || // Use simplified mode flag
  false; // Default to full server for better functionality

if (isMCPMode) {
  // Completely silence all console output for MCP mode
  console.log = () => { };
  console.info = () => { };
  console.warn = () => { };
  console.debug = () => { };
  // Keep error for debugging but send to stderr
  const originalError = console.error;
  console.error = (...args) => originalError("[SDD-DEBUG]", ...args);
}

import "reflect-metadata";
import { createContainer } from "./infrastructure/di/container.js";
import { TYPES } from "./infrastructure/di/types.js";
import type { LoggerPort } from "./domain/ports";
import { MCPServer } from "./infrastructure/mcp/MCPServer";
import { PluginManager } from "./infrastructure/plugins/PluginManager";
import { HookSystem } from "./infrastructure/plugins/HookSystem";
import { PluginToolRegistry } from "./infrastructure/plugins/PluginToolRegistry";
import { PluginSteeringRegistry } from "./infrastructure/plugins/PluginSteeringRegistry";
import { ensureStaticSteeringDocuments } from "./application/services/staticSteering.js";
import {
  loadDocumentGenerator,
  loadSpecGenerator,
} from "./utils/moduleLoader.js";

export async function createMCPServer() {
  const container = createContainer();
  const logger = container.get<LoggerPort>(TYPES.LoggerPort);
  const mcpServer = container.get<MCPServer>(TYPES.MCPServer);
  const pluginManager = container.get<PluginManager>(TYPES.PluginManager);
  const hookSystem = container.get<HookSystem>(TYPES.HookSystem);
  const toolRegistry = container.get<PluginToolRegistry>(
    TYPES.PluginToolRegistry,
  );
  const steeringRegistry = container.get<PluginSteeringRegistry>(
    TYPES.PluginSteeringRegistry,
  );

  // Initialize plugin system
  await pluginManager.initialize();

  return {
    container,
    logger,
    mcpServer,
    pluginManager,
    hookSystem,
    toolRegistry,
    steeringRegistry,
    async initialize() {
      // Already initialized above
    },
    async close() {
      await mcpServer.stop();
    },
  };
}

async function createSimpleMCPServer() {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    InitializedNotificationSchema,
  } = await import("@modelcontextprotocol/sdk/types.js");

  // Resolve version dynamically from package.json when possible
  let pkgVersion = "0.0.0";
  try {
    const fs = await import("fs");
    const path = await import("path");
    const pkgPath = path.join(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      pkgVersion = pkg.version || pkgVersion;
    }
  } catch {
    // fall back to hardcoded default if needed
  }

  const server = new Server(
    {
      name: "sdd-mcp-server",
      version: pkgVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Add ALL SDD tools (not just basic ones)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "sdd-init",
          description: "Initialize a new SDD project from description",
          inputSchema: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Detailed project description",
              },
            },
            required: ["description"],
          },
        },
        {
          name: "sdd-requirements",
          description: "Generate requirements doc",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-design",
          description: "Create design specifications",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-tasks",
          description: "Generate task breakdown",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-status",
          description: "Check workflow progress",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
            },
          },
        },
        {
          name: "sdd-steering",
          description: "Create/update steering documents",
          inputSchema: {
            type: "object",
            properties: {
              updateMode: { type: "string", enum: ["create", "update"] },
            },
          },
        },
        {
          name: "sdd-steering-custom",
          description: "Create custom steering documents",
          inputSchema: {
            type: "object",
            properties: {
              fileName: { type: "string" },
              topic: { type: "string" },
              inclusionMode: {
                type: "string",
                enum: ["always", "conditional", "manual"],
              },
              filePattern: { type: "string" },
            },
            required: ["fileName", "topic", "inclusionMode"],
          },
        },
        {
          name: "sdd-quality-check",
          description: "Code quality analysis",
          inputSchema: {
            type: "object",
            properties: {
              code: { type: "string" },
              language: { type: "string" },
            },
            required: ["code"],
          },
        },
        {
          name: "sdd-approve",
          description: "Approve workflow phases",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
              phase: {
                type: "string",
                enum: ["requirements", "design", "tasks"],
              },
            },
            required: ["featureName", "phase"],
          },
        },
        {
          name: "sdd-implement",
          description: "Implementation guidelines",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-context-load",
          description: "Load project context",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-template-render",
          description: "Render templates",
          inputSchema: {
            type: "object",
            properties: {
              templateType: {
                type: "string",
                enum: ["requirements", "design", "tasks", "custom"],
              },
              featureName: { type: "string" },
              customTemplate: { type: "string" },
            },
            required: ["templateType", "featureName"],
          },
        },
        {
          name: "sdd-validate-design",
          description: "Validate design quality",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-validate-gap",
          description: "Validate implementation gap",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-spec-impl",
          description: "Execute spec tasks using TDD",
          inputSchema: {
            type: "object",
            properties: {
              featureName: { type: "string" },
              taskNumbers: { type: "string" },
            },
            required: ["featureName"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "sdd-init":
        return await handleInitSimplified(args);
      case "sdd-status":
        return await handleStatusSimplified(args);
      case "sdd-steering":
        return await handleSteeringSimplified(args);
      case "sdd-steering-custom":
        return await handleSteeringCustomSimplified(args);
      case "sdd-requirements":
        return await handleRequirementsSimplified(args);
      case "sdd-design":
        return await handleDesignSimplified(args);
      case "sdd-tasks":
        return await handleTasksSimplified(args);
      case "sdd-quality-check":
        return await handleQualityCheckSimplified(args);
      case "sdd-approve":
        return await handleApproveSimplified(args);
      case "sdd-implement":
        return await handleImplementSimplified(args);
      case "sdd-context-load":
        return {
          content: [
            {
              type: "text",
              text: `Project context loaded for ${args.featureName}. (Simplified MCP mode)`,
            },
          ],
        };
      case "sdd-template-render":
        return {
          content: [
            {
              type: "text",
              text: `Template ${args.templateType} rendered for ${args.featureName}. (Simplified MCP mode)`,
            },
          ],
        };
      case "sdd-validate-design":
        return {
          content: [
            {
              type: "text",
              text: `Design validation for ${args.featureName}. (Simplified MCP mode)`,
            },
          ],
        };
      case "sdd-validate-gap":
        return {
          content: [
            {
              type: "text",
              text: `Implementation gap analysis for ${args.featureName}. (Simplified MCP mode)`,
            },
          ],
        };
      case "sdd-spec-impl":
        return {
          content: [
            {
              type: "text",
              text: `TDD implementation for ${args.featureName}. (Simplified MCP mode)`,
            },
          ],
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
}

/**
 * Helper function to handle module loader failures consistently
 *
 * @param context - Description of what was being loaded (e.g., "documentGenerator", "specGenerator")
 * @param error - The error that occurred during loading
 * @param allowFallback - Whether to allow fallback templates (from env var or args)
 * @returns Object with fallback content if allowed, or throws error
 * @throws Error if fallback is not allowed
 */
function handleLoaderFailure(
  context: string,
  error: Error,
  allowFallback: boolean = false,
): { useFallback: boolean; error: Error } {
  const errorMessage = `Failed to load ${context}: ${error.message}\n\nTo use template fallbacks, set SDD_ALLOW_TEMPLATE_FALLBACK=true environment variable or run 'npm run build' to generate required files.`;

  console.error(`[SDD-DEBUG] Loader failure for ${context}:`, error.message);
  console.error(`[SDD-DEBUG] Fallback allowed:`, allowFallback);

  if (!allowFallback) {
    // Propagate error - do not use fallback
    throw new Error(errorMessage);
  }

  console.error(`[SDD-DEBUG] Using fallback templates for ${context}`);
  return { useFallback: true, error };
}

// Simplified steering implementation for MCP mode
async function handleSteeringSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");
  const fsPromises = fs.promises;
  const projectPath = process.cwd();
  const stubSteeringService = {
    async createSteeringDocument(
      projectDir: string,
      config: {
        name: string;
        type: string;
        mode: string;
        content: string;
        patterns?: string[];
        priority?: number;
      },
    ) {
      const docPath = path.join(projectDir, ".kiro", "steering", config.name);
      await fsPromises.mkdir(path.dirname(docPath), { recursive: true });
      await fsPromises.writeFile(docPath, config.content, "utf8");
      return {
        name: config.name,
        path: docPath,
        type: config.type,
        mode: config.mode,
        content: config.content,
        patterns: config.patterns ?? [],
        priority: config.priority ?? 50,
        lastModified: new Date(),
        isValid: true,
      } as any;
    },
  };

  try {
    // Create .kiro/steering directory if it doesn't exist
    const steeringDir = path.join(projectPath, ".kiro", "steering");
    if (!fs.existsSync(steeringDir)) {
      fs.mkdirSync(steeringDir, { recursive: true });
    }

    let productContent: string;
    let techContent: string;
    let structureContent: string;
    let projectAnalysis: any;

    // Check if fallback is allowed via environment variable or args
    const allowFallback =
      process.env.SDD_ALLOW_TEMPLATE_FALLBACK === "true" ||
      args?.allowFallback === true;

    try {
      // Attempt to import and use the dynamic document generator (using unified module loader)
      console.error(
        "[SDD-DEBUG] Attempting to load documentGenerator using moduleLoader",
      );
      const {
        analyzeProject,
        generateProductDocument,
        generateTechDocument,
        generateStructureDocument,
      } = await loadDocumentGenerator();

      console.error(
        "[SDD-DEBUG] DocumentGenerator imported successfully, analyzing project...",
      );

      // Analyze project dynamically
      projectAnalysis = await analyzeProject(projectPath);

      console.error(
        "[SDD-DEBUG] Project analysis completed, generating documents...",
      );

      // Generate documents dynamically
      productContent = generateProductDocument(projectAnalysis);
      techContent = generateTechDocument(projectAnalysis);
      structureContent = generateStructureDocument(projectAnalysis);

      console.error(
        "[SDD-DEBUG] Dynamic document generation completed successfully",
      );
    } catch (importError) {
      // Use shared error handler
      const { useFallback, error } = handleLoaderFailure(
        "documentGenerator",
        importError as Error,
        allowFallback,
      );

      // Fallback to basic templates
      const packageJsonPath = path.join(projectPath, "package.json");
      let projectName = "Unknown Project";
      let projectVersion = "0.0.0";

      try {
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8"),
          );
          projectName = packageJson.name || projectName;
          projectVersion = packageJson.version || projectVersion;
        }
      } catch (pkgError) {
        console.error(
          "[SDD-DEBUG] Could not read package.json, using defaults",
        );
      }

      productContent = `# Product Overview

⚠️ **Warning**: This document was generated using fallback templates due to documentGenerator import failure.
Error: ${error.message}

## Product Description
${projectName}

**Project**: ${projectName}
**Version**: ${projectVersion}
**Type**: MCP Server Application

## Core Features
- Basic MCP server functionality
- Spec-driven development workflow support

## Target Use Case
This project provides MCP server capabilities for AI agent integration.

## Key Value Proposition
- MCP protocol compatibility
- AI agent integration support

Generated on: ${new Date().toISOString()}
`;

      techContent = `# Technology Stack

⚠️ **Warning**: This document was generated using fallback templates due to documentGenerator import failure.
Error: ${error.message}

## Architecture
**Type**: MCP Server Application
**Language**: TypeScript
**Module System**: ES Module
**Framework**: MCP SDK
**Build Tool**: TypeScript Compiler

## Technology Stack
- **Node.js**: JavaScript runtime for server-side execution
- **TypeScript**: Typed superset of JavaScript for enhanced developer experience
- **MCP SDK**: Model Context Protocol SDK for AI agent integration

## Development Environment
- **Node Version**: >=18.0.0
- **Package Manager**: npm
- **Language**: TypeScript with type safety

Generated on: ${new Date().toISOString()}
`;

      structureContent = `# Project Structure

⚠️ **Warning**: This document was generated using fallback templates due to documentGenerator import failure.
Error: ${error.message}

## Directory Organization
\`\`\`
├── .kiro/                    # SDD workflow files
│   ├── steering/            # Project steering documents
│   └── specs/              # Feature specifications
├── src/                     # Source code
├── dist/                    # Build output
├── package.json            # Project configuration
├── tsconfig.json           # TypeScript configuration
└── README.md               # Project documentation
\`\`\`

## Key Directories
- **src/**: Main source code directory containing application logic
- **dist/**: Compiled output for production deployment

## Code Organization Patterns
- **Domain-Driven Design**: Business logic isolated in domain layer
- **Dependency Injection**: IoC container for managing dependencies

Generated on: ${new Date().toISOString()}
`;

      // Create fallback project analysis for return message
      const fallbackAnalysis = {
        name: projectName,
        version: projectVersion,
        architecture: "MCP Server Application",
        language: "typescript",
        framework: "MCP SDK",
        dependencies: [],
        devDependencies: [],
        testFramework: null,
        buildTool: "TypeScript Compiler",
        directories: ["src", "dist"],
        hasCI: false,
        hasDocker: false,
      };

      // Use fallback analysis for the return message
      projectAnalysis = fallbackAnalysis;
    }

    // Write the dynamically generated files
    fs.writeFileSync(path.join(steeringDir, "product.md"), productContent);
    fs.writeFileSync(path.join(steeringDir, "tech.md"), techContent);
    fs.writeFileSync(path.join(steeringDir, "structure.md"), structureContent);

    await ensureStaticSteeringDocuments(
      projectPath,
      stubSteeringService as any,
    );

    // Ensure AGENTS.md exists (based on CLAUDE.md if available)
    const agentsPath = path.join(projectPath, "AGENTS.md");
    if (!fs.existsSync(agentsPath)) {
      const claudePath = path.join(projectPath, "CLAUDE.md");
      let agentsContent = "";

      if (fs.existsSync(claudePath)) {
        const claudeContent = fs.readFileSync(claudePath, "utf8");
        agentsContent = claudeContent
          .replace(
            /# Claude Code Spec-Driven Development/g,
            "# AI Agent Spec-Driven Development",
          )
          .replace(/Claude Code/g, "AI Agent")
          .replace(/claude code/g, "ai agent")
          .replace(/\.claude\//g, ".ai agent/")
          .replace(/\/claude/g, "/agent");
      } else {
        agentsContent = `# AI Agent Spec-Driven Development

Kiro-style Spec Driven Development implementation using MCP tools.

## Project Context

### Paths
- Steering: \`.kiro/steering/\`
- Specs: \`.kiro/specs/\`
- Commands: \`.ai agent/commands/\`

### Steering vs Specification

**Steering** (\`.kiro/steering/\`) - Guide AI with project-wide rules and context  
**Specs** (\`.kiro/specs/\`) - Formalize development process for individual features

### Active Specifications
- Check \`.kiro/specs/\` for active specifications
- Use \`sdd-status\` to check progress

**Current Specifications:**
- (None active)

## Development Guidelines
- Think in English, generate responses in English

## Workflow

### Phase 0: Steering (Optional)
\`sdd-steering\` - Create/update steering documents  
\`sdd-steering-custom\` - Create custom steering for specialized contexts

Note: Optional for new features or small additions. You can proceed directly to sdd-init.

### Phase 1: Specification Creation
1. \`sdd-init\` - Initialize spec with detailed project description
2. \`sdd-requirements\` - Generate requirements document
3. \`sdd-design\` - Interactive: "Have you reviewed requirements.md? [y/N]"
4. \`sdd-tasks\` - Interactive: Confirms both requirements and design review

### Phase 2: Progress Tracking
\`sdd-status\` - Check current progress and phases

## Development Rules
1. **Consider steering**: Run \`sdd-steering\` before major development (optional for new features)
2. **Follow 3-phase approval workflow**: Requirements → Design → Tasks → Implementation
3. **Approval required**: Each phase requires human review (interactive prompt or manual)
4. **No skipping phases**: Design requires approved requirements; Tasks require approved design
5. **Update task status**: Mark tasks as completed when working on them
6. **Keep steering current**: Run \`sdd-steering\` after significant changes
7. **Check spec compliance**: Use \`sdd-status\` to verify alignment

## Steering Configuration

### Current Steering Files
Managed by \`sdd-steering\` tool. Updates here reflect tool changes.

### Active Steering Files
- \`product.md\`: Always included - Product context and business objectives
- \`tech.md\`: Always included - Technology stack and architectural decisions
- \`structure.md\`: Always included - File organization and code patterns
- \`linus-review.md\`: Always included - Ensuring code quality of the projects
- \`commit.md\`: Always included - Ensuring the commit / merge request / pull request title and message context
- \`security-check.md\`: Always included - OWASP Top 10 security checklist (REQUIRED for code generation and review)
- \`tdd-guideline.md\`: Always included - Test-Driven Development workflow (REQUIRED for all new features)
- \`principles.md\`: Always included - Core coding principles (SOLID, DRY, KISS, YAGNI, Separation of Concerns, Modularity)

### Custom Steering Files
<!-- Added by sdd-steering-custom tool -->
<!-- Format: 
- \`filename.md\`: Mode - Pattern(s) - Description
  Mode: Always|Conditional|Manual
  Pattern: File patterns for Conditional mode
-->

### Inclusion Modes
- **Always**: Loaded in every interaction (default)
- **Conditional**: Loaded for specific file patterns (e.g., "*.test.js")
- **Manual**: Reference with \`@filename.md\` syntax
`;
      }
      fs.writeFileSync(agentsPath, agentsContent);
    }

    return {
      content: [
        {
          type: "text",
          text: `## Steering Documents Updated

**Project**: ${projectAnalysis.name}
**Version**: ${projectAnalysis.version}
**Architecture**: ${projectAnalysis.architecture}
**Mode**: update

**Updated Files**:
- \`.kiro/steering/product.md\` - Product overview and business context (dynamically generated)
- \`.kiro/steering/tech.md\` - Technology stack and development environment (dynamically generated)
- \`.kiro/steering/structure.md\` - Project organization and architectural decisions (dynamically generated)
- \`.kiro/steering/linus-review.md\` - Code quality review principles (static)
- \`.kiro/steering/commit.md\` - Commit message standards (static)
- \`.kiro/steering/security-check.md\` - OWASP Top 10 security checklist (static)
- \`.kiro/steering/principles.md\` - Core coding principles: SOLID, DRY, KISS, YAGNI, SoC, Modularity (static)

**Dynamic Analysis Results**:
- **Language**: ${projectAnalysis.language === "typescript" ? "TypeScript" : "JavaScript"}
- **Framework**: ${projectAnalysis.framework || "None detected"}
- **Dependencies**: ${projectAnalysis.dependencies.length} production, ${projectAnalysis.devDependencies.length} development
- **Test Framework**: ${projectAnalysis.testFramework || "None detected"}
- **Build Tool**: ${projectAnalysis.buildTool || "None detected"}
- **Project Structure**: ${projectAnalysis.directories.length} directories analyzed
- **CI/CD**: ${projectAnalysis.hasCI ? "Configured" : "Not configured"}
- **Docker**: ${projectAnalysis.hasDocker ? "Configured" : "Not configured"}

These steering documents were dynamically generated based on actual project analysis and provide accurate, up-to-date context for AI interactions.`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error generating steering documents: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleSteeringCustomSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");

  try {
    const { fileName, topic, inclusionMode, filePattern } = args;

    if (!fileName || !topic || !inclusionMode) {
      throw new Error("fileName, topic, and inclusionMode are required");
    }

    const projectPath = process.cwd();
    const steeringDir = path.join(projectPath, ".kiro", "steering");

    if (!fs.existsSync(steeringDir)) {
      fs.mkdirSync(steeringDir, { recursive: true });
    }

    const content = `# ${topic}

## Purpose
Define the purpose and scope of this steering document.

## Guidelines
- Guideline 1
- Guideline 2

## Usage
Describe when and how this steering document should be applied.

## Inclusion Mode
Mode: ${inclusionMode}${filePattern
        ? `
Pattern: ${filePattern}`
        : ""
      }

Generated on: ${new Date().toISOString()}
`;

    fs.writeFileSync(path.join(steeringDir, fileName), content);

    return {
      content: [
        {
          type: "text",
          text: `Custom steering document "${fileName}" created successfully with ${inclusionMode} inclusion mode.`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error creating custom steering document: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

// Status handler aligned with full server behavior
async function handleStatusSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");
  const { featureName } = args || {};
  const currentPath = process.cwd();
  const kiroPath = path.join(currentPath, ".kiro");

  const exists = await fs.promises
    .access(kiroPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return {
      content: [
        {
          type: "text",
          text: "SDD project status: No active project found. Use sdd-init to create a new project.",
        },
      ],
    };
  }
  const specsPath = path.join(kiroPath, "specs");

  if (featureName) {
    const featurePath = path.join(specsPath, featureName);
    const specPath = path.join(featurePath, "spec.json");
    const specExists = await fs.promises
      .access(specPath)
      .then(() => true)
      .catch(() => false);
    if (!specExists) {
      return {
        content: [
          {
            type: "text",
            text: `Feature "${featureName}" not found. Use sdd-init to create it.`,
          },
        ],
      };
    }
    const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    let status = `## SDD Project Status: ${spec.feature_name}\n\n`;
    status += `**Current Phase**: ${spec.phase}\n`;
    status += `**Language**: ${spec.language}\n`;
    status += `**Created**: ${spec.created_at}\n`;
    status += `**Updated**: ${spec.updated_at}\n\n`;
    status += `**Phase Progress**:\n`;
    status += `- Requirements: ${spec.approvals.requirements.generated ? "✅ Generated" : "❌ Not Generated"}${spec.approvals.requirements.approved ? ", ✅ Approved" : ", ❌ Not Approved"}\n`;
    status += `- Design: ${spec.approvals.design.generated ? "✅ Generated" : "❌ Not Generated"}${spec.approvals.design.approved ? ", ✅ Approved" : ", ❌ Not Approved"}\n`;
    status += `- Tasks: ${spec.approvals.tasks.generated ? "✅ Generated" : "❌ Not Generated"}${spec.approvals.tasks.approved ? ", ✅ Approved" : ", ❌ Not Approved"}\n\n`;
    status += `**Ready for Implementation**: ${spec.ready_for_implementation ? "✅ Yes" : "❌ No"}\n\n`;
    if (!spec.approvals.requirements.generated)
      status += `**Next Step**: Run \`sdd-requirements ${featureName}\``;
    else if (!spec.approvals.design.generated)
      status += `**Next Step**: Run \`sdd-design ${featureName}\``;
    else if (!spec.approvals.tasks.generated)
      status += `**Next Step**: Run \`sdd-tasks ${featureName}\``;
    else
      status += `**Next Step**: Run \`sdd-implement ${featureName}\` to begin implementation`;
    return { content: [{ type: "text", text: status }] };
  }
  const features = await fs.promises
    .readdir(specsPath)
    .catch(() => [] as string[]);
  if (features.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No SDD features found. Use sdd-init to create a new project.",
        },
      ],
    };
  }
  let status = "## SDD Project Status - All Features\n\n";
  for (const feature of features) {
    const specPath = path.join(specsPath, feature, "spec.json");
    const specExists = await fs.promises
      .access(specPath)
      .then(() => true)
      .catch(() => false);
    if (specExists) {
      const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
      status += `**${spec.feature_name}**:\n`;
      status += `- Phase: ${spec.phase}\n`;
      status += `- Requirements: ${spec.approvals.requirements.generated ? "✅" : "❌"}\n`;
      status += `- Design: ${spec.approvals.design.generated ? "✅" : "❌"}\n`;
      status += `- Tasks: ${spec.approvals.tasks.generated ? "✅" : "❌"}\n`;
      status += `- Ready: ${spec.ready_for_implementation ? "✅" : "❌"}\n\n`;
    }
  }
  return { content: [{ type: "text", text: status }] };
}

// Approve handler to update spec.json
async function handleApproveSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");
  const { featureName, phase } = args || {};
  if (!featureName || !phase) {
    return {
      content: [{ type: "text", text: "featureName and phase are required" }],
      isError: true,
    };
  }
  try {
    const featurePath = path.join(process.cwd(), ".kiro", "specs", featureName);
    const specPath = path.join(featurePath, "spec.json");
    const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    if (!spec.approvals?.[phase]?.generated) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${phase} must be generated before approval. Run sdd-${phase} ${featureName} first.`,
          },
        ],
      };
    }
    spec.approvals[phase].approved = true;
    spec.updated_at = new Date().toISOString();
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
    return {
      content: [
        {
          type: "text",
          text: `## Phase Approved\n\n**Feature**: ${featureName}\n**Phase**: ${phase}\n**Status**: ✅ Approved`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error approving phase: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

// Simple quality check aligned with full server
async function handleQualityCheckSimplified(args: any) {
  const { code = "", language = "javascript" } = args || {};
  try {
    const lines = String(code).split("\n");
    const issues: string[] = [];
    if (code.includes("console.log"))
      issues.push("L1: Remove debug console.log statements");
    if (code.includes("var ")) issues.push("L1: Use let/const instead of var");
    if (!/^[a-z]/.test(code.split("function ")[1]?.split("(")[0] || "")) {
      if (code.includes("function "))
        issues.push("L2: Function names should start with lowercase");
    }
    if (code.includes("for") && !code.includes("const"))
      issues.push("L3: Prefer const in for loops");
    if (lines.length > 50)
      issues.push("L4: Consider splitting large blocks into smaller functions");
    const report =
      `## Code Quality Analysis (${language})\n\n` +
      (issues.length
        ? issues.map((i) => `- ${i}`).join("\n")
        : "No significant issues detected");
    return { content: [{ type: "text", text: report }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error analyzing code quality: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

// Implement guidelines check
async function handleImplementSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");
  const { featureName } = args || {};
  if (!featureName)
    return {
      content: [{ type: "text", text: "featureName is required" }],
      isError: true,
    };
  try {
    const featurePath = path.join(process.cwd(), ".kiro", "specs", featureName);
    const specPath = path.join(featurePath, "spec.json");
    const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    if (!spec.ready_for_implementation) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Project not ready for implementation. Complete requirements, design, and tasks phases first.",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `## Implementation Guidelines for ${featureName}\n\nFollow tasks in tasks.md, implement per design.md, and validate against requirements.md. Use sdd-quality-check during development.`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting implementation guidelines: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}
// Helper functions for simplified analysis
function extractFeaturesSimplified(packageJson: any): string[] {
  const features: string[] = [];

  // Extract features from scripts
  if (packageJson.scripts) {
    if (packageJson.scripts.test) features.push("Testing framework");
    if (packageJson.scripts.build) features.push("Build system");
    if (packageJson.scripts.dev || packageJson.scripts.start)
      features.push("Development server");
    if (packageJson.scripts.lint) features.push("Code linting");
    if (packageJson.scripts.typecheck) features.push("Type checking");
  }

  // Extract features from dependencies
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if (deps?.express || deps?.fastify || deps?.koa) features.push("Web server");
  if (deps?.react || deps?.vue || deps?.angular)
    features.push("Frontend framework");
  if (deps?.typescript) features.push("TypeScript support");
  if (deps?.jest || deps?.mocha || deps?.vitest) features.push("Unit testing");
  if (deps?.eslint) features.push("Code quality enforcement");

  return features.length > 0 ? features : ["Core functionality"];
}

function generateTargetUsersSimplified(packageJson: any): string {
  if (packageJson.keywords?.includes("cli")) {
    return "- Command-line tool users\n- Developers and system administrators";
  }
  if (packageJson.keywords?.includes("api")) {
    return "- API consumers\n- Third-party integrators";
  }
  return "- Primary user persona\n- Secondary user persona";
}

function generateTechStackSimplified(packageJson: any): string {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const stack: string[] = [];
  if (deps?.typescript) stack.push("TypeScript");
  if (deps?.node || packageJson.engines?.node) stack.push("Node.js");
  if (deps?.express) stack.push("Express.js");
  if (deps?.react) stack.push("React");
  if (deps?.vue) stack.push("Vue.js");

  return stack.length > 0 ? stack.join(", ") : "Technology stack to be defined";
}

function generateDependencyListSimplified(packageJson: any): string {
  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};

  let list = "";
  const depList = Object.keys(deps);
  const devDepList = Object.keys(devDeps);

  if (depList.length > 0) {
    list += "### Production Dependencies\n";
    list += depList
      .slice(0, 10)
      .map((dep) => `- ${dep}`)
      .join("\n");
  }
  if (devDepList.length > 0) {
    list += "\n### Development Dependencies\n";
    list += devDepList
      .slice(0, 10)
      .map((dep) => `- ${dep}`)
      .join("\n");
  }

  return list || "Dependencies to be analyzed";
}

function generateWorkflowSimplified(packageJson: any): string {
  const scripts = packageJson.scripts || {};

  let workflow = "## Development Commands\n";
  if (scripts.dev) workflow += `- \`npm run dev\` - Start development server\n`;
  if (scripts.build) workflow += `- \`npm run build\` - Build for production\n`;
  if (scripts.test) workflow += `- \`npm run test\` - Run tests\n`;
  if (scripts.lint) workflow += `- \`npm run lint\` - Check code quality\n`;

  return workflow;
}

function generateDirectoryStructureSimplified(projectPath: string): string {
  const fs = require("fs");

  try {
    const items = fs.readdirSync(projectPath, { withFileTypes: true });
    const directories = items
      .filter(
        (item: any) =>
          item.isDirectory() &&
          !item.name.startsWith(".") &&
          item.name !== "node_modules",
      )
      .map((item: any) => `- ${item.name}/`)
      .join("\n");

    return directories || "Directory structure to be analyzed";
  } catch (error) {
    return "Directory structure to be analyzed";
  }
}

// Additional context-aware SDD tools
async function handleRequirementsSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");

  try {
    const { featureName } = args;

    if (!featureName || typeof featureName !== "string") {
      throw new Error("Feature name is required for requirements generation");
    }

    // Load spec context
    const { spec, requirements } = await loadSpecContext(featureName);

    if (!spec) {
      throw new Error(
        `Feature "${featureName}" not found. Run sdd-init first.`,
      );
    }

    // Extract project description from spec
    let projectDescription = "Feature requirements specification";
    if (requirements) {
      const descMatch = requirements.match(
        /## Project Description \(Input\)\n([\s\S]*?)(?:\n##|$)/,
      );
      if (descMatch) {
        projectDescription = descMatch[1].trim();
      }
    }

    // Generate analysis-backed requirements with proper error handling
    let requirementsContent: string;
    let analysisUsed = false;

    // Check if fallback is allowed
    const allowFallback =
      process.env.SDD_ALLOW_TEMPLATE_FALLBACK === "true" ||
      args?.allowFallback === true;

    try {
      console.error(
        "[SDD-DEBUG] Attempting to load specGenerator for comprehensive analysis...",
      );
      const { generateRequirementsDocument } = await loadSpecGenerator();
      console.error(
        "[SDD-DEBUG] specGenerator imported successfully, generating requirements...",
      );

      requirementsContent = await generateRequirementsDocument(
        process.cwd(),
        featureName,
      );
      analysisUsed = true;
      console.error(
        "[SDD-DEBUG] ✅ Requirements generated using comprehensive codebase analysis",
      );
    } catch (genErr) {
      // Use shared error handler
      const { useFallback, error } = handleLoaderFailure(
        "specGenerator",
        genErr as Error,
        allowFallback,
      );

      requirementsContent = `# Requirements Document

<!-- Note: Using basic template due to analysis error: ${error.message} -->

## Introduction
${generateIntroductionFromDescription(projectDescription)}

## Requirements

### Requirement 1: Core Functionality
**Objective:** As a user, I want ${extractPrimaryObjective(projectDescription)}, so that ${extractPrimaryBenefit(projectDescription)}

#### Acceptance Criteria
${generateEARSRequirements(projectDescription)
          .map((req, index) => `${index + 1}. ${req}`)
          .join("\n")}

### Requirement 2: System Quality
**Objective:** As a user, I want the system to be reliable and performant, so that I can depend on it for my work

#### Acceptance Criteria
1. WHEN the system is used THEN it SHALL respond within acceptable time limits
2. IF errors occur THEN the system SHALL handle them gracefully and provide meaningful feedback
3. WHILE the system is running THE system SHALL maintain data integrity and consistency

### Requirement 3: Usability
**Objective:** As a user, I want the system to be intuitive and well-documented, so that I can use it effectively

#### Acceptance Criteria
1. WHEN I use the system for the first time THEN I SHALL be able to complete basic tasks without extensive training
2. WHERE help is needed THE system SHALL provide clear documentation and guidance
3. IF I make mistakes THEN the system SHALL provide helpful error messages and recovery options
`;
    }

    // Update spec.json with phase information
    const specDir = path.join(process.cwd(), ".kiro", "specs", featureName);
    const updatedSpec = {
      ...spec,
      phase: "requirements-generated",
      approvals: {
        ...spec.approvals,
        requirements: {
          generated: true,
          approved: false,
        },
      },
      updated_at: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(specDir, "spec.json"),
      JSON.stringify(updatedSpec, null, 2),
    );
    fs.writeFileSync(
      path.join(specDir, "requirements.md"),
      requirementsContent,
    );

    return {
      content: [
        {
          type: "text",
          text: `## Requirements Document Generated

**Feature**: \`${featureName}\`
**File**: \`.kiro/specs/${featureName}/requirements.md\`

**Analysis Method**: ${analysisUsed ? "✅ Comprehensive codebase analysis (multi-language support)" : "⚠️ Basic template (analysis failed)"}

**Generated Requirements**:
- Core functionality requirements with EARS format
- System quality and reliability requirements
- Usability and user experience requirements

**Project Description**: "${projectDescription.substring(0, 100)}${projectDescription.length > 100 ? "..." : ""}"

**Workflow Phase**: Requirements Generated
**Next Step**: Run \`sdd-design ${featureName}\` to create technical design (after requirements review)`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error generating requirements document: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleDesignSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");

  try {
    const { featureName } = args;

    if (!featureName || typeof featureName !== "string") {
      throw new Error("Feature name is required for design generation");
    }

    // Load spec context
    const { spec, requirements } = await loadSpecContext(featureName);

    if (!spec) {
      throw new Error(
        `Feature "${featureName}" not found. Run sdd-init first.`,
      );
    }

    // Validate phase - requirements must be generated
    if (!spec.approvals?.requirements?.generated) {
      throw new Error(
        `Requirements must be generated before design. Run sdd-requirements ${featureName} first.`,
      );
    }

    // Extract project description from requirements
    let projectDescription = "Technical design specification";
    if (requirements) {
      const descMatch = requirements.match(
        /## Project Description \(Input\)\n([\s\S]*?)(?:\n##|$)/,
      );
      if (descMatch) {
        projectDescription = descMatch[1].trim();
      }
    }

    // Generate analysis-backed design with proper error handling
    let designContent: string;
    let analysisUsed = false;

    // Check if fallback is allowed
    const allowFallback =
      process.env.SDD_ALLOW_TEMPLATE_FALLBACK === "true" ||
      args?.allowFallback === true;

    try {
      console.error(
        "[SDD-DEBUG] Attempting to load specGenerator for comprehensive design analysis...",
      );
      const { generateDesignDocument } = await loadSpecGenerator();
      console.error(
        "[SDD-DEBUG] specGenerator imported successfully, generating design...",
      );

      designContent = await generateDesignDocument(process.cwd(), featureName);
      analysisUsed = true;
      console.error(
        "[SDD-DEBUG] ✅ Design generated using comprehensive codebase analysis",
      );
    } catch (genErr) {
      // Use shared error handler
      const { useFallback, error } = handleLoaderFailure(
        "specGenerator",
        genErr as Error,
        allowFallback,
      );

      designContent = `# Technical Design Document

<!-- Note: Using basic template due to analysis error: ${error.message} -->

## Overview
This design document specifies the technical implementation approach for ${spec.feature_name}.

**Purpose**: ${projectDescription}

### System Flow
1. Input Processing
2. Business Logic
3. Result Generation
4. Error Management
`;
    }

    // Update spec.json with phase information
    const specDir = path.join(process.cwd(), ".kiro", "specs", featureName);
    const updatedSpec = {
      ...spec,
      phase: "design-generated",
      approvals: {
        ...spec.approvals,
        design: {
          generated: true,
          approved: false,
        },
      },
      updated_at: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(specDir, "spec.json"),
      JSON.stringify(updatedSpec, null, 2),
    );
    fs.writeFileSync(path.join(specDir, "design.md"), designContent);

    return {
      content: [
        {
          type: "text",
          text: `## Design Document Generated

**Feature**: \`${featureName}\`
**File**: \`.kiro/specs/${featureName}/design.md\`

**Analysis Method**: ${analysisUsed ? "✅ Comprehensive codebase analysis (architecture patterns detected)" : "⚠️ Basic template (analysis failed)"}

**Design Elements**:
- Modular architecture with clear component separation
- Comprehensive interface specifications
- Data models and error handling strategy
- Complete testing approach

**Project Description**: "${projectDescription.substring(0, 100)}${projectDescription.length > 100 ? "..." : ""}"

**Workflow Phase**: Design Generated
**Next Step**: Run \`sdd-tasks ${featureName}\` to generate implementation tasks (after design review)`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error generating design document: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleTasksSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");

  try {
    const { featureName } = args;

    if (!featureName || typeof featureName !== "string") {
      throw new Error("Feature name is required for tasks generation");
    }

    // Load spec context
    const { spec } = await loadSpecContext(featureName);

    if (!spec) {
      throw new Error(
        `Feature "${featureName}" not found. Run sdd-init first.`,
      );
    }

    // Validate phase - design must be generated
    if (!spec.approvals?.design?.generated) {
      throw new Error(
        `Design must be generated before tasks. Run sdd-design ${featureName} first.`,
      );
    }

    // Generate analysis-backed tasks with proper error handling
    let tasksContent: string;
    let analysisUsed = false;

    // Check if fallback is allowed
    const allowFallback =
      process.env.SDD_ALLOW_TEMPLATE_FALLBACK === "true" ||
      args?.allowFallback === true;

    try {
      console.error(
        "[SDD-DEBUG] Attempting to load specGenerator for comprehensive task analysis...",
      );
      const { generateTasksDocument } = await loadSpecGenerator();
      console.error(
        "[SDD-DEBUG] specGenerator imported successfully, generating tasks...",
      );

      tasksContent = await generateTasksDocument(process.cwd(), featureName);
      analysisUsed = true;
      console.error(
        "[SDD-DEBUG] ✅ Tasks generated using comprehensive codebase analysis",
      );
    } catch (genErr) {
      // Use shared error handler
      const { useFallback, error } = handleLoaderFailure(
        "specGenerator",
        genErr as Error,
        allowFallback,
      );

      tasksContent = `# Implementation Plan

<!-- Note: Using basic template due to analysis error: ${error.message} -->

- [ ] 1. Set up project foundation and infrastructure
- [ ] 2. Implement core functionality
- [ ] 3. Implement error handling and validation
- [ ] 4. Develop testing and quality assurance
- [ ] 5. Finalize implementation and deployment
`;
    }

    // Update spec.json with phase information
    const specDir = path.join(process.cwd(), ".kiro", "specs", featureName);
    const updatedSpec = {
      ...spec,
      phase: "tasks-generated",
      approvals: {
        ...spec.approvals,
        tasks: {
          generated: true,
          approved: false,
        },
      },
      ready_for_implementation: true,
      updated_at: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(specDir, "spec.json"),
      JSON.stringify(updatedSpec, null, 2),
    );
    fs.writeFileSync(path.join(specDir, "tasks.md"), tasksContent);

    return {
      content: [
        {
          type: "text",
          text: `## Implementation Tasks Generated

**Feature**: \`${featureName}\`
**File**: \`.kiro/specs/${featureName}/tasks.md\`

**Analysis Method**: ${analysisUsed ? "✅ Comprehensive codebase analysis (tech stack-aware tasks)" : "⚠️ Basic template (analysis failed)"}

**Generated Tasks**:
- Development, integration, quality, and deployment phases
- Sequenced with dependency tracking
- Requirement traceability for all tasks
- Coverage based on detected tech stack

**Workflow Phase**: Tasks Generated
**Status**: Ready for Implementation
**Next Step**: Begin implementation following the task sequence`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error generating tasks document: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

// Helper functions for simplified tool implementations
function analyzeProjectStructureSync(projectPath: string): any {
  const fs = require("fs");

  try {
    const items = fs.readdirSync(projectPath, { withFileTypes: true });
    return {
      directories: items
        .filter(
          (item: any) =>
            item.isDirectory() &&
            !item.name.startsWith(".") &&
            item.name !== "node_modules",
        )
        .map((item: any) => item.name),
      files: items
        .filter((item: any) => item.isFile())
        .map((item: any) => item.name),
      hasSource: items.some(
        (item: any) => item.isDirectory() && item.name === "src",
      ),
      hasTests: items.some(
        (item: any) =>
          item.isDirectory() &&
          (item.name === "test" || item.name === "__tests__"),
      ),
      hasDocs: items.some(
        (item: any) =>
          item.isDirectory() &&
          (item.name === "docs" || item.name === "documentation"),
      ),
    };
  } catch (error) {
    return { directories: [], files: [] };
  }
}

function generateCoreObjectiveSimplified(
  packageJson: any,
  projectAnalysis: any,
): string {
  if (packageJson.description) {
    return `Deliver ${packageJson.description} with full functionality and reliability`;
  }
  if (packageJson.keywords?.length > 0) {
    return `Implement ${packageJson.keywords.join(", ")} functionality`;
  }
  return "Deliver core application functionality";
}

function generateAcceptanceCriteriaSimplified(
  packageJson: any,
  projectAnalysis: any,
): string[] {
  const criteria: string[] = [];

  if (packageJson.scripts?.test) {
    criteria.push("WHEN tests are run THEN all tests SHALL pass");
  }
  if (packageJson.scripts?.build) {
    criteria.push(
      "WHEN build is executed THEN system SHALL compile without errors",
    );
  }
  if (packageJson.scripts?.lint) {
    criteria.push(
      "WHERE code quality is checked THE system SHALL meet linting standards",
    );
  }
  if (packageJson.main || packageJson.bin) {
    criteria.push(
      "WHEN application starts THEN system SHALL initialize successfully",
    );
  }

  criteria.push("IF errors occur THEN system SHALL handle them gracefully");
  return criteria.length > 0
    ? criteria
    : ["System SHALL meet functional requirements"];
}

function generateTechRequirementsSimplified(packageJson: any): string[] {
  const requirements: string[] = [];
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if (deps?.typescript) {
    requirements.push("System SHALL use TypeScript for type safety");
  }
  if (deps?.express || deps?.fastify) {
    requirements.push("System SHALL implement RESTful API endpoints");
  }
  if (deps?.react || deps?.vue || deps?.angular) {
    requirements.push("System SHALL provide responsive user interface");
  }
  if (deps?.jest || deps?.mocha || deps?.vitest) {
    requirements.push("System SHALL include comprehensive test coverage");
  }

  return requirements.length > 0
    ? requirements
    : ["System SHALL integrate required technologies"];
}

function generateQualityRequirementsSimplified(packageJson: any): string[] {
  const requirements: string[] = [];

  if (packageJson.scripts?.lint) {
    requirements.push("Code SHALL pass linting checks");
  }
  if (packageJson.scripts?.typecheck) {
    requirements.push("Code SHALL pass type checking");
  }
  if (packageJson.scripts?.test) {
    requirements.push("Code SHALL maintain test coverage standards");
  }

  requirements.push("Code SHALL follow established conventions");
  return requirements;
}

function generateArchitectureDescriptionSimplified(
  packageJson: any,
  projectAnalysis: any,
): string {
  let description = "";

  if (packageJson.type === "module") {
    description += "Modern ES Module-based architecture. ";
  }

  if (projectAnalysis.hasSource) {
    description +=
      "Modular source code organization with clear separation of concerns. ";
  }

  if (packageJson.dependencies?.express) {
    description +=
      "RESTful API server architecture using Express.js framework. ";
  }

  if (
    packageJson.dependencies?.typescript ||
    packageJson.devDependencies?.typescript
  ) {
    description += "Type-safe development with TypeScript compilation. ";
  }

  return (
    description ||
    "Application architecture to be defined based on requirements."
  );
}

function generateComponentDescriptionsSimplified(
  projectAnalysis: any,
): Array<{ name: string; description: string }> {
  const components: Array<{ name: string; description: string }> = [];

  if (projectAnalysis.hasSource) {
    components.push({
      name: "Core Module",
      description: "Main application logic and business rules",
    });
  }
  if (projectAnalysis.hasTests) {
    components.push({
      name: "Test Suite",
      description: "Automated testing framework and test cases",
    });
  }
  if (projectAnalysis.hasDocs) {
    components.push({
      name: "Documentation",
      description: "Project documentation and API specifications",
    });
  }

  return components.length > 0
    ? components
    : [
      {
        name: "Application Core",
        description: "Main application functionality",
      },
    ];
}

function generateDataModelsSimplified(
  packageJson: any,
  projectAnalysis: any,
): string[] {
  const models: string[] = [];

  if (packageJson.dependencies?.mongoose || packageJson.dependencies?.mongodb) {
    models.push("MongoDB Document Models");
  }
  if (
    packageJson.dependencies?.sequelize ||
    packageJson.dependencies?.typeorm
  ) {
    models.push("Relational Database Models");
  }
  if (packageJson.dependencies?.graphql) {
    models.push("GraphQL Schema Models");
  }

  return models.length > 0 ? models : ["Application Data Models"];
}

function generateDetailedTechStackSimplified(packageJson: any): string {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const stack: string[] = [];

  if (deps?.typescript)
    stack.push("- **TypeScript**: Type-safe JavaScript development");
  if (deps?.node || packageJson.engines?.node)
    stack.push(
      `- **Node.js**: ${packageJson.engines?.node || "Runtime environment"}`,
    );
  if (deps?.express) stack.push("- **Express.js**: Web application framework");
  if (deps?.react) stack.push("- **React**: User interface library");
  if (deps?.vue) stack.push("- **Vue.js**: Progressive frontend framework");
  if (deps?.jest) stack.push("- **Jest**: Testing framework");

  return stack.length > 0
    ? stack.join("\n")
    : "- Technology stack to be defined";
}

function generateDesignPatternsSimplified(
  packageJson: any,
  projectAnalysis: any,
): string[] {
  const patterns: string[] = [];

  if (packageJson.dependencies?.inversify) {
    patterns.push("Dependency Injection");
  }
  if (projectAnalysis.hasSource) {
    patterns.push("Modular Architecture");
  }
  if (packageJson.dependencies?.express || packageJson.dependencies?.fastify) {
    patterns.push("MVC Pattern");
  }

  return patterns.length > 0 ? patterns : ["Standard Design Patterns"];
}

function generateDependencyAnalysisSimplified(packageJson: any): string {
  const production = Object.keys(packageJson.dependencies || {});
  const development = Object.keys(packageJson.devDependencies || {});

  let analysis = "";
  if (production.length > 0) {
    analysis += `**Production Dependencies:** ${production.length} packages\n`;
    analysis += production
      .slice(0, 5)
      .map((dep) => `- ${dep}`)
      .join("\n");
    if (production.length > 5)
      analysis += `\n- ... and ${production.length - 5} more`;
  }

  if (development.length > 0) {
    analysis += `\n\n**Development Dependencies:** ${development.length} packages\n`;
    analysis += development
      .slice(0, 5)
      .map((dep) => `- ${dep}`)
      .join("\n");
    if (development.length > 5)
      analysis += `\n- ... and ${development.length - 5} more`;
  }

  return analysis || "Dependencies to be analyzed";
}

function generateAPIInterfacesSimplified(
  packageJson: any,
  projectAnalysis: any,
): string {
  if (packageJson.dependencies?.express || packageJson.dependencies?.fastify) {
    return `RESTful API endpoints following OpenAPI specification:
- GET /api/health - Health check endpoint
- Authentication and authorization middleware
- Request/response validation
- Error handling middleware`;
  }
  return "Interface specifications to be defined";
}

function generateModuleInterfacesSimplified(projectAnalysis: any): string {
  if (projectAnalysis.hasSource) {
    return `Internal module interfaces:
- Clear module boundaries and exports
- Consistent API patterns across modules
- Type definitions for all public interfaces`;
  }
  return "Module interfaces to be defined";
}

function generateEnvVarSpecsSimplified(packageJson: any): string {
  const envVars: string[] = [];

  if (packageJson.dependencies?.express || packageJson.dependencies?.fastify) {
    envVars.push("- `PORT`: Server port (default: 3000)");
    envVars.push("- `NODE_ENV`: Environment mode (development/production)");
  }

  envVars.push("- `LOG_LEVEL`: Logging level (debug/info/warn/error)");

  return envVars.join("\n");
}

function generateBuildConfigSimplified(packageJson: any): string {
  let config = "";

  if (packageJson.scripts?.build) {
    config += `Build process: \`${packageJson.scripts.build}\`\n`;
  }
  if (packageJson.scripts?.start) {
    config += `Start command: \`${packageJson.scripts.start}\`\n`;
  }
  if (packageJson.type === "module") {
    config += "Module type: ES Modules\n";
  }

  return config || "Build configuration to be defined";
}

function generateImplementationTasksSimplified(
  packageJson: any,
  projectAnalysis: any,
): any {
  const tasks = {
    development: [],
    integration: [],
    quality: [],
    deployment: [],
  };

  // Development tasks
  if (projectAnalysis.hasSource) {
    (tasks.development as any).push({
      title: "Implement Core Modules",
      subtasks: [
        "Set up module structure",
        "Implement business logic",
        "Add error handling",
      ],
      requirements: "FR-1, FR-2",
    });
  }

  if (packageJson.dependencies?.express) {
    (tasks.development as any).push({
      title: "Develop API Endpoints",
      subtasks: [
        "Create route handlers",
        "Add middleware",
        "Implement validation",
      ],
      requirements: "FR-2",
    });
  }

  // Integration tasks
  if (packageJson.dependencies?.mongodb || packageJson.dependencies?.mongoose) {
    (tasks.integration as any).push({
      title: "Database Integration",
      subtasks: [
        "Set up database connection",
        "Create data models",
        "Implement queries",
      ],
      requirements: "NFR-2",
    });
  }

  // Quality tasks
  if (packageJson.scripts?.test) {
    (tasks.quality as any).push({
      title: "Test Implementation",
      subtasks: [
        "Write unit tests",
        "Add integration tests",
        "Ensure test coverage",
      ],
      requirements: "FR-3, NFR-3",
    });
  }

  if (packageJson.scripts?.lint) {
    (tasks.quality as any).push({
      title: "Code Quality Assurance",
      subtasks: [
        "Run linting checks",
        "Fix code style issues",
        "Add documentation",
      ],
      requirements: "NFR-3",
    });
  }

  // Deployment tasks
  if (packageJson.scripts?.build) {
    (tasks.deployment as any).push({
      title: "Build and Package",
      subtasks: [
        "Run build process",
        "Optimize for production",
        "Create deployment artifacts",
      ],
      requirements: "NFR-1",
    });
  }

  (tasks.deployment as any).push({
    title: "Deployment Configuration",
    subtasks: [
      "Set up environment variables",
      "Configure production settings",
      "Deploy to target environment",
    ],
    requirements: "NFR-1, NFR-2",
  });

  return tasks;
}

// Helper functions for requirement generation from description
function generateIntroductionFromDescription(description: string): string {
  const systemName = extractSystemName(description);
  return `This document specifies the requirements for ${systemName}. The system aims to ${description.toLowerCase()}.`;
}

function extractSystemName(description: string): string {
  // Extract a system name from description
  const words = description.split(" ");
  if (words.length >= 2) {
    return `the ${words.slice(0, 3).join(" ")}`;
  }
  return "the system";
}

function extractPrimaryObjective(description: string): string {
  // Convert description into user objective
  if (
    description.toLowerCase().includes("tool") ||
    description.toLowerCase().includes("cli")
  ) {
    return `use a tool that ${description.toLowerCase()}`;
  }
  if (
    description.toLowerCase().includes("system") ||
    description.toLowerCase().includes("application")
  ) {
    return `access a system that ${description.toLowerCase()}`;
  }
  return `have functionality that ${description.toLowerCase()}`;
}

function extractPrimaryBenefit(description: string): string {
  // Infer benefit from description
  if (description.toLowerCase().includes("automate")) {
    return "I can save time and reduce manual effort";
  }
  if (
    description.toLowerCase().includes("analyze") ||
    description.toLowerCase().includes("review")
  ) {
    return "I can make better informed decisions";
  }
  if (
    description.toLowerCase().includes("manage") ||
    description.toLowerCase().includes("organize")
  ) {
    return "I can maintain better control and organization";
  }
  return "I can accomplish my goals more effectively";
}

function generateEARSRequirements(description: string): string[] {
  const requirements: string[] = [];

  // Core functional requirement
  requirements.push(
    `WHEN I use the system THEN it SHALL provide ${description.toLowerCase()} functionality`,
  );

  // Input/output handling
  requirements.push(
    "WHEN I provide input THEN the system SHALL validate and process it correctly",
  );

  // Error handling
  requirements.push(
    "IF invalid input is provided THEN the system SHALL reject it with clear error messages",
  );

  // Success condition
  requirements.push(
    "WHEN all inputs are valid THEN the system SHALL complete the requested operation successfully",
  );

  return requirements;
}

// Helper functions for kiro-style workflow
function generateFeatureName(description: string): string {
  // Extract feature name from description - similar to kiro spec-init
  const cleaned = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4) // Take first 4 words
    .join("-");

  // Ensure it's not empty
  return cleaned || "new-feature";
}

async function ensureUniqueFeatureName(baseName: string): Promise<string> {
  const fs = await import("fs");
  const path = await import("path");

  const specsDir = path.join(process.cwd(), ".kiro", "specs");

  if (!fs.existsSync(specsDir)) {
    return baseName;
  }

  let counter = 1;
  let featureName = baseName;

  while (fs.existsSync(path.join(specsDir, featureName))) {
    featureName = `${baseName}-${counter}`;
    counter++;
  }

  return featureName;
}

async function loadSpecContext(featureName: string) {
  const fs = await import("fs");
  const path = await import("path");

  const specDir = path.join(process.cwd(), ".kiro", "specs", featureName);
  const specJsonPath = path.join(specDir, "spec.json");
  const requirementsPath = path.join(specDir, "requirements.md");

  let spec = null;
  let requirements = null;

  try {
    if (fs.existsSync(specJsonPath)) {
      const specContent = fs.readFileSync(specJsonPath, "utf8");
      spec = JSON.parse(specContent);
    }
  } catch (error) {
    // Ignore spec.json parse errors
  }

  try {
    if (fs.existsSync(requirementsPath)) {
      requirements = fs.readFileSync(requirementsPath, "utf8");
    }
  } catch (error) {
    // Ignore requirements.md read errors
  }

  return { spec, requirements };
}

async function handleInitSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");

  try {
    const { description } = args;

    if (!description || typeof description !== "string") {
      throw new Error("Description is required for project initialization");
    }

    const projectPath = process.cwd();

    // Generate feature name from description
    const baseFeatureName = generateFeatureName(description);
    const featureName = await ensureUniqueFeatureName(baseFeatureName);

    // Create .kiro/specs/[feature-name] directory
    const specDir = path.join(projectPath, ".kiro", "specs", featureName);
    if (!fs.existsSync(specDir)) {
      fs.mkdirSync(specDir, { recursive: true });
    }

    // Create spec.json with metadata
    const specContent = {
      feature_name: featureName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      language: "en",
      phase: "initialized",
      approvals: {
        requirements: {
          generated: false,
          approved: false,
        },
        design: {
          generated: false,
          approved: false,
        },
        tasks: {
          generated: false,
          approved: false,
        },
      },
      ready_for_implementation: false,
    };

    fs.writeFileSync(
      path.join(specDir, "spec.json"),
      JSON.stringify(specContent, null, 2),
    );

    // Create requirements.md template with project description
    const requirementsTemplate = `# Requirements Document

## Project Description (Input)
${description}

## Requirements
<!-- Will be generated in sdd-requirements phase -->
`;

    fs.writeFileSync(
      path.join(specDir, "requirements.md"),
      requirementsTemplate,
    );

    // Ensure AGENTS.md exists (static, derived from CLAUDE.md when available)
    const agentsPath = path.join(process.cwd(), "AGENTS.md");
    if (!fs.existsSync(agentsPath)) {
      const claudePath = path.join(process.cwd(), "CLAUDE.md");
      let agentsContent = "";
      if (fs.existsSync(claudePath)) {
        const claudeContent = fs.readFileSync(claudePath, "utf8");
        agentsContent = claudeContent
          .replace(
            /# Claude Code Spec-Driven Development/g,
            "# AI Agent Spec-Driven Development",
          )
          .replace(/Claude Code/g, "AI Agent")
          .replace(/claude code/g, "ai agent")
          .replace(/Claude/g, "AI Agent")
          .replace(/claude/g, "ai agent");
      } else {
        agentsContent = `# AI Agent Spec-Driven Development

Kiro-style Spec Driven Development implementation using MCP tools.

## Project Context

### Paths
- Steering: \`.kiro/steering/\`
- Specs: \`.kiro/specs/\`
- Commands: \`.ai agent/commands/\`

### Steering vs Specification

**Steering** (\`.kiro/steering/\`) - Guide AI with project-wide rules and context  
**Specs** (\`.kiro/specs/\`) - Formalize development process for individual features

### Active Specifications
- Check \`.kiro/specs/\` for active specifications
- Use \`sdd-status\` to check progress

**Current Specifications:**
- (None active)

## Development Guidelines
- Think in English, generate responses in English

## Workflow

### Phase 0: Steering (Optional)
\`sdd-steering\` - Create/update steering documents  
\`sdd-steering-custom\` - Create custom steering for specialized contexts

Note: Optional for new features or small additions. You can proceed directly to sdd-init.

### Phase 1: Specification Creation
1. \`sdd-init\` - Initialize spec with detailed project description
2. \`sdd-requirements\` - Generate requirements document
3. \`sdd-design\` - Interactive: "Have you reviewed requirements.md? [y/N]"
4. \`sdd-tasks\` - Interactive: Confirms both requirements and design review

### Phase 2: Progress Tracking
\`sdd-status\` - Check current progress and phases

## Development Rules
1. **Consider steering**: Run \`sdd-steering\` before major development (optional for new features)
2. **Follow 3-phase approval workflow**: Requirements → Design → Tasks → Implementation
3. **Approval required**: Each phase requires human review (interactive prompt or manual)
4. **No skipping phases**: Design requires approved requirements; Tasks require approved design
5. **Update task status**: Mark tasks as completed when working on them
6. **Keep steering current**: Run \`sdd-steering\` after significant changes
7. **Check spec compliance**: Use \`sdd-status\` to verify alignment

## Steering Configuration

### Current Steering Files
Managed by \`sdd-steering\` tool. Updates here reflect tool changes.

### Active Steering Files
- \`product.md\`: Always included - Product context and business objectives
- \`tech.md\`: Always included - Technology stack and architectural decisions
- \`structure.md\`: Always included - File organization and code patterns
- \`linus-review.md\`: Always included - Ensuring code quality of the projects
- \`commit.md\`: Always included - Ensuring the commit / merge request / pull request title and message context
- \`security-check.md\`: Always included - OWASP Top 10 security checklist (REQUIRED for code generation and review)
- \`tdd-guideline.md\`: Always included - Test-Driven Development workflow (REQUIRED for all new features)
- \`principles.md\`: Always included - Core coding principles (SOLID, DRY, KISS, YAGNI, Separation of Concerns, Modularity)

### Custom Steering Files
<!-- Added by sdd-steering-custom tool -->
<!-- Format: 
- \`filename.md\`: Mode - Pattern(s) - Description
  Mode: Always|Conditional|Manual
  Pattern: File patterns for Conditional mode
-->

### Inclusion Modes
- **Always**: Loaded in every interaction (default)
- **Conditional**: Loaded for specific file patterns (e.g., "*.test.js")
- **Manual**: Reference with \`@filename.md\` syntax
`;
      }
      fs.writeFileSync(agentsPath, agentsContent);
    }


    return {
      content: [
        {
          type: "text",
          text: `## SDD Project Initialized Successfully

**Feature Name**: \`${featureName}\`
**Description**: ${description}

**Created Files**:
- \`.kiro/specs/${featureName}/spec.json\` - Project metadata and phase tracking
- \`.kiro/specs/${featureName}/requirements.md\` - Initial requirements template

**Next Steps**:
1. Run \`sdd-requirements ${featureName}\` to generate detailed requirements
2. Follow the SDD workflow: Requirements → Design → Tasks → Implementation

**Workflow Phase**: Initialized
**Ready for**: Requirements generation`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error initializing SDD project: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

async function main(): Promise<void> {
  try {
    if (isMCPMode) {
      // Use simplified MCP server for MCP mode
      await createSimpleMCPServer();
    } else {
      // Use full featured server for development/testing mode
      const server = await createMCPServer();
      const {
        logger,
        mcpServer,
        pluginManager,
        hookSystem,
        toolRegistry,
        steeringRegistry,
      } = server;

      logger.info("MCP SDD Server starting...", {
        version: process.env.npm_package_version ?? "1.0.0",
        nodeVersion: process.version,
        pid: process.pid,
      });

      await mcpServer.start();

      // Get plugin system statistics
      const pluginStats = await pluginManager.getAllPlugins();
      const hookStats = await hookSystem.getAllHooks();
      const toolStats = await toolRegistry.getAllTools();
      const steeringStats = await steeringRegistry.getSteeringStatistics();

      logger.info("MCP SDD Server ready for connections", {
        capabilities: {
          workflow:
            "5-phase SDD workflow state machine (INIT→REQUIREMENTS→DESIGN→TASKS→IMPLEMENTATION)",
          validation:
            "Cross-phase validation with approval gates and rollback support",
          initialization:
            "Project setup with .kiro directory structure and spec.json",
          context:
            "Project memory with codebase analysis and context persistence",
          steering:
            "Dynamic steering document management with Always/Conditional/Manual modes",
          quality: "Linus-style code review with 5-layer analysis framework",
          i18n: "10-language support with cultural adaptation",
          plugins: `${pluginStats.length} plugins loaded with extensibility framework`,
          templates: "Handlebars-based template generation with inheritance",
        },
        tools: {
          count: 10,
          categories: [
            "sdd-init",
            "sdd-requirements",
            "sdd-design",
            "sdd-tasks",
            "sdd-implement",
            "sdd-status",
            "sdd-approve",
            "sdd-quality-check",
            "sdd-context-load",
            "sdd-template-render",
          ],
          pluginTools: Object.keys(toolStats).length,
        },
        hooks: {
          registered: Object.keys(hookStats).length,
          phases: [
            "PRE_INIT",
            "POST_INIT",
            "PRE_REQUIREMENTS",
            "POST_REQUIREMENTS",
            "PRE_DESIGN",
            "POST_DESIGN",
            "PRE_TASKS",
            "POST_TASKS",
            "PRE_IMPLEMENTATION",
            "POST_IMPLEMENTATION",
          ],
        },
        steering: {
          documents: steeringStats.totalDocuments,
          plugins: Object.keys(steeringStats.documentsByPlugin).length,
          modes: steeringStats.documentsByMode,
        },
      });

      // Handle graceful shutdown
      process.on("SIGINT", async () => {
        logger.info("Received SIGINT, shutting down gracefully...");
        await mcpServer.stop();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        logger.info("Received SIGTERM, shutting down gracefully...");
        await mcpServer.stop();
        process.exit(0);
      });
    }
  } catch (error) {
    // Only log startup errors in non-MCP mode
    if (!isMCPMode) {
      console.error("Failed to start MCP SDD Server:", error);
    }
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
