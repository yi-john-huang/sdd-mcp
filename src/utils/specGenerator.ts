import { analyzeProject } from "./documentGenerator.js";

/**
 * Governance subtasks that must be included in every task group
 * References steering documents for TDD and coding principles
 */
const TDD_SUBTASK =
  "Follow `.spec/steering/tdd-guideline.md` (Red→Green→Refactor)";
const PRINCIPLES_SUBTASK =
  "Review `.spec/steering/principles.md`; capture any deviations";

/**
 * Enforce governance by adding TDD and principles subtasks to every task
 * Also updates requirements field to include TDD and Principles tags
 *
 * @param tasks - Array of task objects with title, subtasks, and requirements
 * @returns Modified task array with governance subtasks appended
 */
function enforceGovernance(
  tasks: Array<{ title: string; subtasks: string[]; requirements: string }>,
) {
  return tasks.map((task) => {
    // Add governance subtasks if not already present
    if (!task.subtasks.includes(TDD_SUBTASK)) {
      task.subtasks.push(TDD_SUBTASK);
    }
    if (!task.subtasks.includes(PRINCIPLES_SUBTASK)) {
      task.subtasks.push(PRINCIPLES_SUBTASK);
    }

    // Add TDD and Principles tags to requirements if not present
    if (!/TDD|Principles/.test(task.requirements)) {
      task.requirements = `${task.requirements}, TDD, Principles`;
    }

    return task;
  });
}

export async function generateRequirementsDocument(
  projectPath: string,
  featureName: string,
): Promise<string> {
  const analysis = await analyzeProject(projectPath);
  const desc = analysis.description || "Feature requirements specification";
  const obj = generateCoreObjective(analysis);
  const acceptance = generateAcceptanceCriteria(analysis)
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  return `# Requirements Document

## Introduction
${featureName} - Requirements derived from codebase analysis.

**Project**: ${analysis.name}
**Description**: ${desc}

Generated on: ${new Date().toISOString()}

## Functional Requirements

### FR-1: Core Functionality
**Objective:** ${obj}

#### Acceptance Criteria
${acceptance}

### FR-2: Technology Integration
**Objective:** Integrate with the detected technology stack

#### Acceptance Criteria
${generateTechRequirements(analysis)
  .map((r, i) => `${i + 1}. ${r}`)
  .join("\n")}

### FR-3: Quality Standards
**Objective:** Meet quality, testing, and review standards

#### Acceptance Criteria
${generateQualityRequirements(analysis)
  .map((r, i) => `${i + 1}. ${r}`)
  .join("\n")}

## Non-Functional Requirements

### NFR-1: Performance
- System SHALL respond within acceptable time limits
- Memory usage SHALL remain within reasonable bounds

### NFR-2: Reliability
- System SHALL handle errors gracefully
- System SHALL maintain data integrity

### NFR-3: Maintainability
- Code SHALL follow established conventions
- System SHALL be well-documented
`;
}

export async function generateDesignDocument(
  projectPath: string,
  featureName: string,
): Promise<string> {
  const analysis = await analyzeProject(projectPath);
  const arch = describeArchitecture(analysis);
  const components = generateComponentList(analysis)
    .map((c) => `- **${c.name}**: ${c.description}`)
    .join("\n");
  const dataModels = generateDataModels(analysis)
    .map((m) => `- **${m}**: Data structure definition`)
    .join("\n");
  const techStack = generateDetailedTechStack(analysis);

  return `# Technical Design Document

## Project: ${featureName}

**Project Name:** ${analysis.name}
**Architecture:** ${analysis.architecture}
**Language:** ${analysis.language}

Generated on: ${new Date().toISOString()}

## Architecture Overview

### System Architecture
${arch}

### Key Components
${components}

### Data Models
${dataModels}

## Implementation Details

### Technology Stack
${techStack}

### Dependencies
${generateDependencySummary(analysis)}

## Interface Specifications

### Module Interfaces
${generateModuleInterfaces(analysis)}

## Configuration

### Environment Variables
${generateEnvVars(analysis)}

### Build Configuration
${generateBuildConfig(analysis)}
`;
}

export async function generateTasksDocument(
  projectPath: string,
  featureName: string,
): Promise<string> {
  const analysis = await analyzeProject(projectPath);
  const tasks = generateImplementationTasks(analysis);

  const section = (
    title: string,
    list: Array<{ title: string; subtasks: string[]; requirements: string }>,
  ) =>
    list
      .map(
        (task, idx) => `- [ ] ${idx + 1}. ${task.title}
  ${task.subtasks.map((s) => `  - ${s}`).join("\n")}
  - _Requirements: ${task.requirements}_`,
      )
      .join("\n\n");

  return `# Implementation Plan (TDD Approach)

## Project: ${featureName}

**Project Name:** ${analysis.name}
**Detected Stack:** ${[analysis.language, analysis.framework || "", analysis.buildTool || ""].filter(Boolean).join(" / ")}
**Test Framework:** ${analysis.testFramework || "Not detected - needs setup"}

Generated on: ${new Date().toISOString()}

**TDD Workflow**: 🔴 RED (Failing Tests) → 🟢 GREEN (Passing Implementation) → 🔵 REFACTOR (Code Quality)

---

## Phase 1: Test Setup (🔴 RED - Write Failing Tests First)

${section("Test Setup", tasks.testSetup)}

## Phase 2: Implementation (🟢 GREEN - Make Tests Pass)

${section("Implementation", tasks.implementation)}

## Phase 3: Refactoring (🔵 REFACTOR - Improve Code Quality)

${section("Refactoring", tasks.refactoring)}

## Phase 4: Integration & Documentation

${section("Integration", tasks.integration)}

---

**Note**: Follow TDD principles strictly. Never write production code without a failing test first.
Refer to \`.spec/steering/tdd-guideline.md\` for detailed TDD guidance.
`;
}

// Helpers derived from TemplateService, reduced and dependency-free
function generateCoreObjective(analysis: any): string {
  if (analysis.dependencies?.includes("@modelcontextprotocol/sdk"))
    return "Provide MCP tools for spec-driven development workflows";
  if (analysis.framework === "Express.js")
    return "Expose REST endpoints and middleware for business logic";
  if (analysis.framework === "React")
    return "Render interactive UI components with state management";
  return "Deliver feature-aligned functionality integrated with existing architecture";
}

function generateAcceptanceCriteria(analysis: any): string[] {
  const criteria = [
    "WHEN invoked THEN it SHALL execute without runtime errors",
    "IF input is invalid THEN it SHALL return meaningful errors",
    "WHILE under typical load IT SHALL meet performance targets",
  ];
  if (analysis.testFramework)
    criteria.push("WHERE tests exist THEY SHALL pass with adequate coverage");
  if (analysis.language === "typescript")
    criteria.push("WHEN type-checking THEN no TypeScript errors SHALL occur");
  return criteria;
}

function generateTechRequirements(analysis: any): string[] {
  const out = ["Integrate with existing build and run scripts"];
  if (analysis.dependencies?.includes("@modelcontextprotocol/sdk"))
    out.push("Expose MCP-compliant tools over stdio");
  if (analysis.buildTool)
    out.push(`Provide build artifacts using ${analysis.buildTool}`);
  return out;
}

function generateQualityRequirements(analysis: any): string[] {
  const out = [
    "Follow project coding conventions",
    "Apply error handling and logging",
  ];
  if (analysis.testFramework)
    out.push(`Include ${analysis.testFramework} tests for new code`);
  return out;
}

function describeArchitecture(analysis: any): string {
  if (analysis.architecture === "Domain-Driven Design (DDD)")
    return "Layered DDD: Domain, Application, Infrastructure, Presentation";
  if (analysis.architecture.includes("API"))
    return "REST API with routing, middleware, services, and data access layers";
  if (analysis.framework === "MCP SDK")
    return "MCP server exposing development tools via stdio protocol";
  return (
    analysis.architecture ||
    "Modular architecture with clear separation of concerns"
  );
}

function generateComponentList(
  analysis: any,
): Array<{ name: string; description: string }> {
  const comps = [] as Array<{ name: string; description: string }>;
  if (analysis.framework === "MCP SDK") {
    comps.push({
      name: "MCPServer",
      description: "Handles stdio transport and tool registry",
    });
    comps.push({
      name: "ToolHandlers",
      description:
        "Implement SDD tools (init, requirements, design, tasks, etc.)",
    });
  }
  if (analysis.architecture.includes("API")) {
    comps.push({ name: "Controllers", description: "HTTP route handlers" });
    comps.push({
      name: "Services",
      description: "Business logic orchestration",
    });
  }
  if (comps.length === 0)
    comps.push({
      name: "CoreModule",
      description: "Primary feature implementation module",
    });
  return comps;
}

function generateDataModels(analysis: any): string[] {
  if (analysis.framework === "MCP SDK") return ["Tool", "Request", "Response"];
  if (analysis.architecture.includes("API"))
    return ["RequestDTO", "ResponseDTO"];
  return ["Entity", "ValueObject"];
}

function generateDetailedTechStack(analysis: any): string {
  const parts = [] as string[];
  parts.push(
    `- Runtime: ${analysis.language === "typescript" ? "Node.js (TypeScript)" : "Node.js (JavaScript)"}`,
  );
  if (analysis.framework) parts.push(`- Framework: ${analysis.framework}`);
  if (analysis.buildTool) parts.push(`- Build: ${analysis.buildTool}`);
  if (analysis.testFramework)
    parts.push(`- Testing: ${analysis.testFramework}`);
  return parts.join("\n");
}

function generateDependencySummary(analysis: any): string {
  const deps = (analysis.dependencies || [])
    .slice(0, 10)
    .map((d: string) => `- ${d}`)
    .join("\n");
  const dev = (analysis.devDependencies || [])
    .slice(0, 10)
    .map((d: string) => `- ${d}`)
    .join("\n");
  return `#### Production\n${deps || "- (none)"}\n\n#### Development\n${dev || "- (none)"}`;
}

function generateModuleInterfaces(analysis: any): string {
  if (analysis.framework === "MCP SDK") {
    return `- registerTool(name: string, handler: (args) => Promise<unknown>)\n- connect(transport): Promise<void>`;
  }
  if (analysis.architecture.includes("API")) {
    return `- handle(request): Response\n- service.process(input): Result`;
  }
  return `- execute(input): Output`;
}

function generateEnvVars(analysis: any): string {
  const envs = ["NODE_ENV", "LOG_LEVEL"];
  if (analysis.framework === "MCP SDK") envs.push("MCP_MODE");
  return envs.map((e) => `- ${e}`).join("\n");
}

function generateBuildConfig(analysis: any): string {
  if (analysis.buildTool)
    return `Use ${analysis.buildTool} to emit production artifacts`;
  return "Use npm scripts (build/test/lint) defined in package.json";
}

function generateImplementationTasks(analysis: any) {
  // Phase 1: Test Setup (RED - Write Failing Tests First)
  const testSetup = [
    {
      title: "Set up test infrastructure",
      subtasks: [
        `Install/configure ${analysis.testFramework || "Jest/pytest/JUnit"} test framework`,
        "Create test directory structure (__tests__, test/, spec/)",
        "Configure test runner and coverage tools",
        "Set up test utilities and helpers",
      ],
      requirements: "NFR-3 (Quality Standards)",
    },
    {
      title: "Write failing tests for core functionality",
      subtasks: [
        "Write unit tests for main feature components",
        "Write integration tests for component interactions",
        "Write edge case and error handling tests",
        "Confirm all tests fail (RED phase) - no implementation yet",
      ],
      requirements: "FR-1 (Core Functionality)",
    },
  ];

  // Phase 2: Implementation (GREEN - Make Tests Pass)
  const implementation = [
    {
      title: "Set up project scaffolding",
      subtasks: [
        "Initialize directories following project structure",
        "Configure build scripts and package.json",
        "Set up environment configuration",
      ],
      requirements: "FR-1, NFR-3",
    },
    {
      title: "Implement minimal code to pass tests",
      subtasks: [
        "Implement core feature logic to satisfy tests",
        "Add necessary dependencies and modules",
        "Ensure all tests pass (GREEN phase)",
        "Do not add extra features beyond test requirements",
      ],
      requirements: "FR-1 (Core Functionality)",
    },
    {
      title: "Verify test coverage",
      subtasks: [
        "Run coverage report (aim for 80%+ coverage)",
        "Identify uncovered code paths",
        "Add tests for uncovered branches",
        "Document any intentionally untested code",
      ],
      requirements: "NFR-3 (Quality Standards)",
    },
  ];

  // Phase 3: Refactoring (REFACTOR - Improve Code Quality)
  const refactoring = [
    {
      title: "Refactor for code quality and maintainability",
      subtasks: [
        "Extract reusable components/functions (DRY principle)",
        "Improve naming (variables, functions, classes)",
        "Remove code duplication",
        "Apply design patterns where appropriate",
        "All tests must still pass after refactoring",
      ],
      requirements: "NFR-3 (Maintainability)",
    },
    {
      title: "Code quality validation",
      subtasks: [
        "Run linter and fix all issues",
        analysis.language === "typescript"
          ? "Run type checker (tsc --noEmit)"
          : "Run static analysis",
        "Apply Linus-style code review principles (see linus-review.md)",
        "Peer review or self-review checklist",
      ],
      requirements: "NFR-3 (Quality Standards)",
    },
  ];

  // Phase 4: Integration & Documentation
  const integration = [
    {
      title: "Integration with existing system",
      subtasks: [
        "Integrate with build system",
        "Update configuration files",
        "Test in development environment",
        "Verify compatibility with existing code",
      ],
      requirements: "FR-2, NFR-2 (Technology Integration, Reliability)",
    },
    {
      title: "Documentation and deployment preparation",
      subtasks: [
        "Update API documentation",
        "Add inline code comments for complex logic",
        "Update README/CHANGELOG if needed",
        "Prepare deployment configuration",
      ],
      requirements: "NFR-3 (Maintainability)",
    },
  ];

  // Tailor tasks based on detected framework/architecture
  if (analysis.framework === "MCP SDK") {
    testSetup.push({
      title: "Write tests for MCP tool handlers",
      subtasks: [
        "Test tool registration and discovery",
        "Test stdio transport communication",
        "Test tool argument validation",
        "Test tool response formatting",
      ],
      requirements: "FR-2 (MCP Integration)",
    });

    implementation.splice(1, 0, {
      title: "Implement MCP tool handlers to pass tests",
      subtasks: [
        "Register MCP tools with server",
        "Handle stdio transport communication",
        "Implement tool argument validation",
        "Format tool responses per MCP spec",
      ],
      requirements: "FR-2 (MCP Integration)",
    });
  }

  if (analysis.architecture.includes("API")) {
    testSetup.push({
      title: "Write tests for HTTP endpoints",
      subtasks: [
        "Test route definitions and HTTP methods",
        "Test request validation and error responses",
        "Test successful response formats",
        "Test authentication/authorization if needed",
      ],
      requirements: "FR-1, FR-2 (API Functionality)",
    });

    implementation.splice(1, 0, {
      title: "Implement HTTP endpoints to pass tests",
      subtasks: [
        "Define routes and HTTP methods",
        "Implement request handlers",
        "Add input validation middleware",
        "Implement error handling middleware",
      ],
      requirements: "FR-1, FR-2 (API Functionality)",
    });
  }

  // Add database tests if database framework detected
  if (
    analysis.dependencies?.some((d: string) =>
      ["mongoose", "sequelize", "typeorm", "prisma"].includes(d),
    )
  ) {
    testSetup.push({
      title: "Write tests for data persistence",
      subtasks: [
        "Set up test database or mocks",
        "Test CRUD operations",
        "Test data validation rules",
        "Test error handling for DB failures",
      ],
      requirements: "FR-2, NFR-2 (Data Integration, Reliability)",
    });
  }

  // Apply governance enforcement to all task arrays
  const governedTestSetup = enforceGovernance(testSetup);
  const governedImplementation = enforceGovernance(implementation);
  const governedRefactoring = enforceGovernance(refactoring);
  const governedIntegration = enforceGovernance(integration);

  return {
    testSetup: governedTestSetup,
    implementation: governedImplementation,
    refactoring: governedRefactoring,
    integration: governedIntegration,
  };
}
