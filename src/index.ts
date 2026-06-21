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
import { existsSync } from "fs";
import nodePath from "path";
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

  // MCP Tools - Action-oriented tools only
  // Template/guidance tools have been moved to Agent Skills (use /sdd-requirements, /sdd-design, etc.)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "sdd-init",
          description: "Initialize a new SDD project with interactive requirements clarification",
          inputSchema: {
            type: "object",
            properties: {
              projectName: {
                type: "string",
                description: "The name of the project to initialize",
              },
              description: {
                type: "string",
                description: "Project description",
              },
              clarificationAnswers: {
                type: "object",
                description: "Answers to clarification questions (second pass)",
                additionalProperties: { type: "string" },
              },
              reviewTestCases: {
                type: "boolean",
                description:
                  "Enable an optional TDD test-case review checkpoint before implementation",
              },
            },
            required: ["projectName"],
          },
        },
        {
          name: "sdd-status",
          description: "Check workflow progress",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Feature name (optional - shows all if not provided)",
              },
            },
          },
        },
        {
          name: "sdd-approve",
          description: "Approve workflow phases",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Feature name from spec initialization",
              },
              phase: {
                type: "string",
                description: "Phase to approve",
                enum: ["requirements", "design", "tasks"],
              },
            },
            required: ["featureName", "phase"],
          },
        },
        {
          name: "sdd-review-test-cases",
          description: "Mark optional TDD test-case review checkpoint as reviewed",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Feature name from spec initialization",
              },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-quality-check",
          description: "Code quality analysis",
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "Code to analyze",
              },
              language: {
                type: "string",
                description: "Programming language (default: javascript)",
              },
            },
            required: ["code"],
          },
        },
        {
          name: "sdd-context-load",
          description: "Load project context",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Feature name to load context for",
              },
              mode: {
                type: "string",
                enum: ["compact", "standard", "full"],
                description:
                  "Context size mode. Defaults to compact handoff context.",
              },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-validate-design",
          description: "Interactive design quality review and validation",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Feature name to validate design for",
              },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-validate-gap",
          description: "Analyze implementation gap between requirements and codebase",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Feature name to analyze implementation gap for",
              },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-spec-impl",
          description: "Execute spec tasks using TDD methodology",
          inputSchema: {
            type: "object",
            properties: {
              featureName: {
                type: "string",
                description: "Feature name to execute tasks for",
              },
              taskNumbers: {
                type: "string",
                description: "Specific task numbers to execute (e.g., \"1.1,2.3\" or leave empty for all pending)",
              },
            },
            required: ["featureName"],
          },
        },
        {
          name: "sdd-list-skills",
          description: "List available SDD Agent Skills that can be installed for Claude Code",
          inputSchema: {
            type: "object",
            properties: {},
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
      case "sdd-quality-check":
        return await handleQualityCheckSimplified(args);
      case "sdd-approve":
        return await handleApproveSimplified(args);
      case "sdd-review-test-cases":
        return await handleReviewTestCasesSimplified(args);
      case "sdd-context-load":
        return await handleContextLoadSimplified(args);
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
      case "sdd-list-skills":
        return await handleListSkillsSimplified();
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

// List available SDD Agent Skills
async function handleListSkillsSimplified() {
  const path = await import("path");
  const { SkillManager } = await import("./skills/SkillManager.js");

  try {
    // Determine skills path - check multiple locations
    const possiblePaths = [
      path.resolve(process.cwd(), "node_modules/sdd-mcp-server/skills"),
      path.resolve(process.cwd(), "skills"),
      path.resolve(__dirname, "../skills"),
      path.resolve(__dirname, "../../skills"),
    ];

    let skillsPath = possiblePaths[0];
    const fs = await import("fs");
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        skillsPath = p;
        break;
      }
    }

    const skillManager = new SkillManager(skillsPath);
    const skills = await skillManager.listSkills();

    if (skills.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `## SDD Agent Skills

No skills found in the package. Skills may not be installed correctly.

**Expected location**: \`${skillsPath}\`

**Installation**: Run \`npx sdd-mcp-server install-skills\` to install skills to your project.`,
          },
        ],
      };
    }

    const skillsList = skills
      .map((skill) => `- **${skill.name}**: ${skill.description || "No description"}`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `## SDD Agent Skills

Available skills that can be installed for Claude Code:

${skillsList}

**Total**: ${skills.length} skills

**Installation**: Run \`npx sdd-mcp-server install-skills\` to install all skills to \`.claude/skills/\`

After installation, you can use these skills in Claude Code with:
- \`/sdd-requirements <feature-name>\`
- \`/sdd-design <feature-name>\`
- \`/sdd-tasks <feature-name>\`
- \`/sdd-implement <feature-name>\`
- \`/sdd-steering\`
- \`/sdd-commit\``,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error listing skills: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
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

// Status handler aligned with full server behavior
async function handleStatusSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");
  const { featureName } = args || {};
  const currentPath = process.cwd();
  // Support both .spec (new) and .kiro (legacy)
  const specPath = path.join(currentPath, ".spec");
  const kiroPath = path.join(currentPath, ".kiro");
  const sddPath = await fs.promises.access(specPath).then(() => specPath).catch(() => kiroPath);

  const exists = await fs.promises
    .access(sddPath)
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
  const specsPath = path.join(sddPath, "specs");

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
    if (spec.checkpoints?.test_cases?.required) {
      status += `**TDD Test Case Review**: ${spec.checkpoints.test_cases.reviewed ? "✅ Reviewed" : "❌ Pending"}\n`;
    }
    status += `**Ready for Implementation**: ${spec.ready_for_implementation ? "✅ Yes" : "❌ No"}\n\n`;
    if (!spec.approvals.requirements.generated)
      status += `**Next Step**: Run \`sdd-requirements ${featureName}\``;
    else if (!spec.approvals.design.generated)
      status += `**Next Step**: Run \`sdd-design ${featureName}\``;
    else if (!spec.approvals.tasks.generated)
      status += `**Next Step**: Run \`sdd-tasks ${featureName}\``;
    else if (spec.checkpoints?.test_cases?.required && !spec.checkpoints.test_cases.reviewed)
      status += `**Next Step**: Review test cases, then run \`sdd-review-test-cases ${featureName}\``;
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
      if (spec.checkpoints?.test_cases?.required) {
        status += `- Test cases reviewed: ${spec.checkpoints.test_cases.reviewed ? "✅" : "❌"}\n`;
      }
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
    // Support both .spec (new) and .kiro (legacy)
    const sddDir = fs.existsSync(path.join(process.cwd(), ".spec")) ? ".spec" : ".kiro";
    const featurePath = path.join(process.cwd(), sddDir, "specs", featureName);
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
    if (
      phase === "tasks" &&
      spec.checkpoints?.test_cases?.required &&
      !spec.checkpoints.test_cases.reviewed
    ) {
      return {
        content: [
          {
            type: "text",
            text:
              `Error: TDD test cases must be reviewed before approving tasks. ` +
              `After review, run sdd-review-test-cases ${featureName}.`,
          },
        ],
        isError: true,
      };
    }
    spec.approvals[phase].approved = true;
    spec.updated_at = new Date().toISOString();
    spec.ready_for_implementation =
      spec.approvals.requirements?.approved === true &&
      spec.approvals.design?.approved === true &&
      spec.approvals.tasks?.approved === true &&
      (spec.checkpoints?.test_cases?.required !== true ||
        spec.checkpoints.test_cases.reviewed === true);
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
    const handoff = await generateCompactHandoffSimplified(featureName, phase);
    return {
      content: [
        {
          type: "text",
          text:
            `## Phase Approved\n\n` +
            `**Feature**: ${featureName}\n` +
            `**Phase**: ${phase}\n` +
            `**Status**: ✅ Approved\n` +
            `**Context Handoff**: ${handoff.relativePath}\n` +
            `**Estimated Context Reduction**: ${handoff.reductionPercentage}% ` +
            `(~${handoff.sourceTokens} → ~${handoff.compactTokens} tokens)`,
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

async function handleContextLoadSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");
  const { featureName, mode = "compact" } = args || {};

  if (!featureName) {
    return {
      content: [{ type: "text", text: "featureName is required" }],
      isError: true,
    };
  }
  if (!["compact", "standard", "full"].includes(mode)) {
    return {
      content: [{ type: "text", text: "mode must be compact, standard, or full" }],
      isError: true,
    };
  }

  try {
    const { specDir, specPath } = ensureSimplifiedFeatureExists(featureName);
    const handoffPath = path.join(specDir, "context", "handoff.md");

    if (mode === "full") {
      const context = await loadFullContextSimplified(featureName);
      return { content: [{ type: "text", text: context }] };
    }

    if (!fs.existsSync(handoffPath)) {
      await generateCompactHandoffSimplified(featureName, "requirements");
    }

    let context = fs.readFileSync(handoffPath, "utf8");
    if (mode === "standard") {
      context += `\n\n## Current Spec Metadata\n\n\`\`\`json\n${fs.readFileSync(specPath, "utf8")}\n\`\`\``;
    }

    return { content: [{ type: "text", text: context }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error loading context: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

function getSimplifiedSpecDir(featureName: string): string {
  const sddDir = existsSync(nodePath.join(process.cwd(), ".spec")) ? ".spec" : ".kiro";
  return nodePath.join(process.cwd(), sddDir, "specs", featureName);
}

function ensureSimplifiedFeatureExists(featureName: string): { specDir: string; specPath: string } {
  const specDir = getSimplifiedSpecDir(featureName);
  const specPath = nodePath.join(specDir, "spec.json");

  if (!existsSync(specPath)) {
    throw new Error(
      `Feature "${featureName}" not found. Run sdd-init first or check the feature name.`
    );
  }

  return { specDir, specPath };
}

async function generateCompactHandoffSimplified(featureName: string, approvedPhase: string) {
  const fs = await import("fs");
  const path = await import("path");
  const { specDir } = ensureSimplifiedFeatureExists(featureName);
  const contextDir = path.join(specDir, "context");

  const documents = ["requirements.md", "design.md", "tasks.md", "spec.json"]
    .map((name) => {
      const filePath = path.join(specDir, name);
      return fs.existsSync(filePath)
        ? { name, filePath, content: fs.readFileSync(filePath, "utf8") }
        : null;
    })
    .filter(Boolean) as Array<{ name: string; filePath: string; content: string }>;

  if (documents.length === 0) {
    throw new Error(
      `Feature "${featureName}" has no source documents to compact.`
    );
  }

  fs.mkdirSync(contextDir, { recursive: true });

  const sourceCharacters = documents.reduce((sum, doc) => sum + doc.content.length, 0);
  const spec = documents.find((doc) => doc.name === "spec.json");
  const parsedSpec = spec ? JSON.parse(spec.content) : {};
  const summaries = documents.map((doc) => summarizeDocumentSimplified(doc.name, doc.content));
  const nextActions = getSimplifiedNextActions(approvedPhase, parsedSpec);
  const draft = [
    `# SDD Context Handoff: ${featureName}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Approved phase: ${approvedPhase}`,
    "",
    "## Workflow State",
    "",
    `- Requirements: ${formatSimplifiedApproval(parsedSpec.approvals?.requirements)}`,
    `- Design: ${formatSimplifiedApproval(parsedSpec.approvals?.design)}`,
    `- Tasks: ${formatSimplifiedApproval(parsedSpec.approvals?.tasks)}`,
    parsedSpec.checkpoints?.test_cases?.required
      ? `- TDD test-case review: ${parsedSpec.checkpoints.test_cases.reviewed ? "reviewed" : "pending"}`
      : "- TDD test-case review: not required",
    "",
    "## Compact Phase Summaries",
    "",
    summaries.join("\n\n"),
    "",
    "## Next Actions",
    "",
    ...nextActions.map((action) => `- ${action}`),
    "",
    "## Source References",
    "",
    ...documents.map((doc) => `- ${doc.filePath}`),
    "",
    "## Context Budget Estimate",
    "",
    `- Full source context: ~${estimateTokensSimplified(sourceCharacters)} tokens`,
    "- Handoff context: ~0 tokens",
    "- Use `sdd-context-load` default compact mode for routine continuation.",
    '- Use `sdd-context-load` with `mode: "full"` only for audits or ambiguous decisions.'
  ].join("\n");

  const compactTokens = estimateTokensSimplified(draft.length);
  const sourceTokens = estimateTokensSimplified(sourceCharacters);
  const reductionPercentage = sourceTokens === 0
    ? 0
    : Math.max(0, Math.round((1 - compactTokens / sourceTokens) * 100));
  const content = draft.replace("- Handoff context: ~0 tokens", `- Handoff context: ~${compactTokens} tokens`);
  const handoffPath = path.join(contextDir, "handoff.md");
  fs.writeFileSync(handoffPath, content);
  fs.writeFileSync(path.join(contextDir, `${approvedPhase}-handoff.md`), content);

  return {
    relativePath: path.relative(process.cwd(), handoffPath),
    sourceTokens,
    compactTokens,
    reductionPercentage,
  };
}

async function loadFullContextSimplified(featureName: string): Promise<string> {
  const fs = await import("fs");
  const path = await import("path");
  const { specDir } = ensureSimplifiedFeatureExists(featureName);
  const parts = [`# Full SDD Context: ${featureName}`];

  for (const name of ["requirements.md", "design.md", "tasks.md", "spec.json"]) {
    const filePath = path.join(specDir, name);
    if (fs.existsSync(filePath)) {
      parts.push(`## ${name}\n\n${fs.readFileSync(filePath, "utf8")}`);
    }
  }

  return parts.join("\n\n");
}

function summarizeDocumentSimplified(name: string, content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("```"));
  const headings = lines
    .filter((line) => /^#{1,4}\s+/.test(line))
    .map((line) => line.replace(/^#{1,4}\s+/, "").trim())
    .filter(uniqueSimplifiedLine)
    .slice(0, 8);
  const bullets = lines
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line.length <= 220)
    .filter(uniqueSimplifiedLine)
    .slice(0, 8);
  const requirementLines = lines
    .filter((line) => /\b(SHALL|MUST|WHEN|IF|THEN|WHERE|constraint|risk|security|performance|error|edge case)\b/i.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line.length <= 240)
    .filter(uniqueSimplifiedLine)
    .slice(0, 8);

  return [
    `### ${name}`,
    headings.length > 0 ? "\n**Key sections:**" : "",
    ...headings.map((line) => `- ${line}`),
    bullets.length > 0 ? "\n**Important points:**" : "",
    ...bullets.map((line) => `- ${line}`),
    requirementLines.length > 0 ? "\n**Constraints and acceptance signals:**" : "",
    ...requirementLines.map((line) => `- ${line}`),
    headings.length === 0 && bullets.length === 0 && requirementLines.length === 0
      ? "- No structured summary points found; open source document if this phase is active."
      : "",
  ].filter(Boolean).join("\n");
}

function uniqueSimplifiedLine(line: string, index: number, lines: string[]): boolean {
  return lines.findIndex((candidate) => candidate.toLowerCase() === line.toLowerCase()) === index;
}

function getSimplifiedNextActions(approvedPhase: string, spec: any): string[] {
  if (approvedPhase === "requirements") {
    return ["Generate or review design using the approved requirements handoff."];
  }
  if (approvedPhase === "design") {
    return ["Generate TDD task breakdown from the approved design handoff."];
  }
  if (spec.checkpoints?.test_cases?.required && !spec.checkpoints.test_cases.reviewed) {
    return ["Review TDD test cases, then run sdd-review-test-cases before approving tasks."];
  }
  return ["Begin implementation with compact context loaded; open full docs only for ambiguous details."];
}

function formatSimplifiedApproval(status: any): string {
  if (status?.generated && status?.approved) return "generated, approved";
  if (status?.generated) return "generated, pending approval";
  return "not generated";
}

function estimateTokensSimplified(characters: number): number {
  return Math.max(1, Math.ceil(characters / 4));
}

async function handleReviewTestCasesSimplified(args: any) {
  const fs = await import("fs");
  const path = await import("path");
  const { featureName } = args || {};
  if (!featureName) {
    return {
      content: [{ type: "text", text: "featureName is required" }],
      isError: true,
    };
  }

  try {
    const sddDir = fs.existsSync(path.join(process.cwd(), ".spec")) ? ".spec" : ".kiro";
    const specPath = path.join(process.cwd(), sddDir, "specs", featureName, "spec.json");
    const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

    spec.workflow_options = {
      ...(spec.workflow_options ?? {}),
      review_test_cases: true,
    };
    spec.checkpoints = {
      ...(spec.checkpoints ?? {}),
      test_cases: {
        required: true,
        reviewed: true,
        reviewed_at: new Date().toISOString(),
      },
    };
    spec.updated_at = new Date().toISOString();
    spec.ready_for_implementation =
      spec.approvals?.requirements?.approved === true &&
      spec.approvals?.design?.approved === true &&
      spec.approvals?.tasks?.approved === true;

    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

    return {
      content: [
        {
          type: "text",
          text: `## TDD Test Cases Reviewed\n\n**Feature**: ${featureName}\n**Status**: ✅ Reviewed`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error reviewing test cases: ${(error as Error).message}`,
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

  // Support both .spec (new) and .kiro (legacy)
  const sddDir = fs.existsSync(path.join(process.cwd(), ".spec")) ? ".spec" : ".kiro";
  const specsDir = path.join(process.cwd(), sddDir, "specs");

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

  // Support both .spec (new) and .kiro (legacy)
  const sddDir = fs.existsSync(path.join(process.cwd(), ".spec")) ? ".spec" : ".kiro";
  const specDir = path.join(process.cwd(), sddDir, "specs", featureName);
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
    const { projectName, description, reviewTestCases = false } = args;

    if (!description || typeof description !== "string") {
      throw new Error("Description is required for project initialization");
    }

    const projectPath = process.cwd();

    // Generate feature name from projectName (if provided) or description
    const baseFeatureName = projectName && typeof projectName === "string" 
      ? projectName 
      : generateFeatureName(description);
    const featureName = await ensureUniqueFeatureName(baseFeatureName);

    // Create .spec/specs/[feature-name] directory (use .spec for new projects)
    const specDir = path.join(projectPath, ".spec", "specs", featureName);
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
      workflow_options: {
        review_test_cases: reviewTestCases === true,
      },
      checkpoints: {
        test_cases: {
          required: reviewTestCases === true,
          reviewed: reviewTestCases !== true,
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

Spec Driven Development implementation using MCP tools.

## Project Context

### Paths
- Steering: \`.spec/steering/\`
- Specs: \`.spec/specs/\`
- Commands: \`.claude/commands/\`

### Steering vs Specification

**Steering** (\`.spec/steering/\`) - Guide AI with project-wide rules and context
**Specs** (\`.spec/specs/\`) - Formalize development process for individual features

### Active Specifications
- Check \`.spec/specs/\` for active specifications
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
4. \`sdd-tasks\` - Interactive: Confirms requirements/design review and asks whether TDD test cases need a review checkpoint

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
Load steering documents on demand to control token usage:
- \`product.md\`: Product context and business objectives
- \`tech.md\`: Technology stack and architectural decisions
- \`structure.md\`: File organization and code patterns
- \`linus-review.md\`: Code quality review standards
- \`commit.md\`: Commit and PR conventions
- \`security-check.md\`: OWASP Top 10 checklist for code generation and review
- \`tdd-guideline.md\`: TDD workflow for new features
- \`principles.md\`: SOLID, DRY, KISS, YAGNI, Separation of Concerns, Modularity

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
**TDD Test Case Review Checkpoint**: ${reviewTestCases === true ? "Enabled" : "Disabled"}

**Created Files**:
- \`.spec/specs/${featureName}/spec.json\` - Project metadata and phase tracking
- \`.spec/specs/${featureName}/requirements.md\` - Initial requirements template

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
            "Project setup with .spec directory structure and spec.json",
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
          count: 11,
          categories: [
            "sdd-init",
            "sdd-requirements",
            "sdd-design",
            "sdd-tasks",
            "sdd-implement",
            "sdd-status",
            "sdd-approve",
            "sdd-review-test-cases",
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
