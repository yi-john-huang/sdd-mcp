// Adapter layer for integrating SDD tools with MCP protocol

import { injectable, inject } from "inversify";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { TYPES } from "../../infrastructure/di/types.js";
import { TemplateService } from "../../application/services/TemplateService.js";
import { QualityService } from "../../application/services/QualityService.js";
import { SteeringDocumentService } from "../../application/services/SteeringDocumentService.js";
import { CodebaseAnalysisService } from "../../application/services/CodebaseAnalysisService.js";
import { RequirementsClarificationService } from "../../application/services/RequirementsClarificationService.js";
import { ContextCompactionService, ContextLoadMode } from "../../application/services/ContextCompactionService.js";
import { WorkflowEngineService } from "../../application/services/WorkflowEngineService.js";
import { LoggerPort } from "../../domain/ports.js";
import { Project, ClarificationAnswers } from "../../domain/types.js";
import { ensureStaticSteeringDocuments } from "../../application/services/staticSteering.js";
import {
  SDD_TOOL_DEFINITIONS,
  SDD_TOOL_NAMES,
  SDDToolName,
} from "../../infrastructure/mcp/sddToolDefinitions.js";
export { SDD_TOOL_NAMES };


export interface SDDToolHandler {
  name: string;
  tool: Tool;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

@injectable()
export class SDDToolAdapter {
  constructor(
    @inject(TYPES.TemplateService)
    private readonly templateService: TemplateService,
    @inject(TYPES.QualityService)
    private readonly qualityService: QualityService,
    @inject(TYPES.SteeringDocumentService)
    private readonly steeringService: SteeringDocumentService,
    @inject(TYPES.CodebaseAnalysisService)
    private readonly codebaseAnalysisService: CodebaseAnalysisService,
    @inject(TYPES.RequirementsClarificationService)
    private readonly clarificationService: RequirementsClarificationService,
    @inject(TYPES.ContextCompactionService)
    private readonly contextCompactionService: ContextCompactionService,
    @inject(TYPES.WorkflowEngineService)
    private readonly workflowEngineService: WorkflowEngineService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
  ) { }

  getSDDTools(): SDDToolHandler[] {
    const handlers: Record<SDDToolName, (args: Record<string, unknown>) => Promise<unknown>> = {
      "sdd-init": this.handleProjectInit.bind(this),
      "sdd-requirements": this.handleRequirements.bind(this),
      "sdd-design": this.handleDesign.bind(this),
      "sdd-tasks": this.handleTasks.bind(this),
      "sdd-implement": this.handleImplement.bind(this),
      "sdd-status": this.handleProjectStatus.bind(this),
      "sdd-approve": this.handleApprove.bind(this),
      "sdd-review-test-cases": this.handleReviewTestCases.bind(this),
      "sdd-quality-check": this.handleQualityCheck.bind(this),
      "sdd-context-load": this.handleContextLoad.bind(this),
      "sdd-template-render": this.handleTemplateRender.bind(this),
      "sdd-steering": this.handleSteering.bind(this),
      "sdd-steering-custom": this.handleSteeringCustom.bind(this),
      "sdd-validate-design": this.handleValidateDesign.bind(this),
      "sdd-validate-gap": this.handleValidateGap.bind(this),
      "sdd-spec-impl": this.handleSpecImplementation.bind(this),
    };

    return SDD_TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      tool,
      handler: handlers[tool.name],
    }));
  }

  private canonicalFeatureName(projectName: string): string {
    const featureName = projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    if (!featureName) {
      throw new Error("Invalid argument: projectName must contain a letter or number");
    }
    return featureName;
  }

  private async handleProjectInit(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const {
      projectName,
      description = "",
      clarificationAnswers,
      reviewTestCases = false,
    } = args;

    if (typeof projectName !== "string") {
      throw new Error("Invalid arguments: projectName must be a string");
    }
    const featureName = this.canonicalFeatureName(projectName);

    const currentPath = process.cwd();

    // FIRST PASS: Analyze description quality
    if (!clarificationAnswers) {
      const result = await this.clarificationService.analyzeDescription(
        description as string,
        currentPath,
      );

      // If clarification needed, BLOCK and return questions
      if (result.needsClarification && result.questions) {
        return this.formatClarificationQuestions(
          result.questions,
          result.analysis!,
        );
      }
    }

    // SECOND PASS: Validate and synthesize enriched description
    let enrichedDescription = description as string;
    if (clarificationAnswers && typeof clarificationAnswers === "object") {
      const result = await this.clarificationService.analyzeDescription(
        description as string,
        currentPath,
      );

      if (result.questions) {
        const validation = this.clarificationService.validateAnswers(
          result.questions,
          clarificationAnswers as ClarificationAnswers,
        );

        if (!validation.valid) {
          throw new Error(
            `Missing required answers: ${validation.missingRequired.join(", ")}`,
          );
        }

        const enriched = this.clarificationService.synthesizeDescription(
          description as string,
          result.questions,
          clarificationAnswers as ClarificationAnswers,
        );

        enrichedDescription = enriched.enriched;
      }
    }

    await this.workflowEngineService.initializeFeature({
      projectRoot: currentPath,
      featureName,
      language: "en",
      reviewTestCases: reviewTestCases === true,
    });

    const clarificationNote = clarificationAnswers
      ? "\n\n✅ Requirements Clarification: Your answers have been incorporated into an enriched project description."
      : "";

    return {
      featureName,
      initialized: true,
      description: enrichedDescription,
      clarificationApplied: Boolean(clarificationAnswers),
      message: `Project "${projectName}" initialized successfully${clarificationNote}`,
    };
  }

  private formatClarificationQuestions(
    questions: any[],
    analysis: any,
  ): string {
    let output = "## Requirements Clarification Needed\n\n";
    output +=
      "Your project description needs more detail to ensure we build the right solution.\n\n";
    output += `**Quality Score**: ${Math.round(analysis.qualityScore)}/100 (need 70+ to proceed)\n\n`;
    output += "### Please answer these questions:\n\n";

    let questionNum = 1;
    for (const q of questions) {
      output += `**${questionNum}. ${q.question}**${q.required ? " *(required)*" : ""}\n`;
      if (q.examples && q.examples.length > 0) {
        output += `   Examples:\n`;
        for (const ex of q.examples) {
          output += `   - ${ex}\n`;
        }
      }
      output += `   Answer ID: \`${q.id}\`\n\n`;
      questionNum++;
    }

    output += "\n### How to Provide Answers\n\n";
    output +=
      "Call sdd-init again with clarificationAnswers parameter containing your answers.\n";

    return output;
  }

  private async requireFeatureProject(featureName: unknown): Promise<Project> {
    return this.workflowEngineService.loadProject({
      projectRoot: process.cwd(),
      featureName: this.requireFeatureName(featureName),
    });
  }
  private requireFeatureName(featureName: unknown): string {
    if (typeof featureName !== "string" || featureName.length === 0) {
      throw new Error("Invalid argument: featureName must be a non-empty string");
    }
    return featureName;
  }


  private async handleProjectStatus(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { featureName } = args;
    if (featureName === undefined) {
      const features = await this.workflowEngineService.listFeatureStatuses({
        projectRoot: process.cwd(),
      });
      return { features };
    }
    return this.workflowEngineService.getFeatureStatus({
      projectRoot: process.cwd(),
      featureName: this.requireFeatureName(featureName),
    });
  }

  private async handleRequirements(
    args: Record<string, unknown>,
  ): Promise<string> {
    return this.workflowEngineService.generatePhase({
      projectRoot: process.cwd(),
      featureName: this.requireFeatureName(args.featureName),
      phase: "requirements",
    });
  }

  private async handleDesign(args: Record<string, unknown>): Promise<string> {
    return this.workflowEngineService.generatePhase({
      projectRoot: process.cwd(),
      featureName: this.requireFeatureName(args.featureName),
      phase: "design",
    });
  }

  private async handleTasks(args: Record<string, unknown>): Promise<string> {
    const reviewTestCases = args.reviewTestCases;
    if (reviewTestCases !== undefined && typeof reviewTestCases !== "boolean") {
      throw new Error("Invalid argument: reviewTestCases must be a boolean");
    }
    return this.workflowEngineService.generatePhase({
      projectRoot: process.cwd(),
      featureName: this.requireFeatureName(args.featureName),
      phase: "tasks",
      reviewTestCases: reviewTestCases as boolean | undefined,
    });
  }

  private async handleImplement(args: Record<string, unknown>): Promise<unknown> {
    return this.workflowEngineService.beginImplementation({
      projectRoot: process.cwd(),
      featureName: this.requireFeatureName(args.featureName),
    });
  }

  private async handleApprove(args: Record<string, unknown>): Promise<unknown> {
    const featureName = this.requireFeatureName(args.featureName);
    const phase = args.phase;
    if (!["requirements", "design", "tasks"].includes(phase as string)) {
      throw new Error("Invalid argument: phase must be requirements, design, or tasks");
    }
    return this.workflowEngineService.approve({
      projectRoot: process.cwd(),
      featureName,
      phase: phase as "requirements" | "design" | "tasks",
    });
  }

  private async handleReviewTestCases(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const featureName = this.requireFeatureName(args.featureName);
    return this.workflowEngineService.reviewTestCases({
      projectRoot: process.cwd(),
      featureName,
    });
  }

  private async handleQualityCheck(
    args: Record<string, unknown>,
  ): Promise<string> {
    const { code, language = "typescript" } = args;

    if (typeof code !== "string") {
      throw new Error("Invalid argument: code must be a string");
    }

    const report = await this.qualityService.performQualityCheck({
      code,
      language: language as string,
    });

    return this.qualityService.formatQualityReport(report);
  }

  private async handleContextLoad(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const featureName = this.requireFeatureName(args.featureName);
    const {
      mode,
      phase,
      maxEstimatedTokens,
      ifNoneMatch,
      includeUnapproved,
    } = args;
    return this.contextCompactionService.loadContext({
      projectRoot: process.cwd(),
      featureName,
      mode: mode as ContextLoadMode | undefined,
      phase: phase as "requirements" | "design" | "tasks" | undefined,
      maxEstimatedTokens: maxEstimatedTokens as number | undefined,
      ifNoneMatch: ifNoneMatch as string | undefined,
      includeUnapproved: includeUnapproved as boolean | undefined,
    });
  }
  private async handleTemplateRender(args: Record<string, unknown>): Promise<unknown> {
    const project = await this.requireFeatureProject(args.featureName);
    const templateType = args.templateType;
    if (args.customTemplate !== undefined) {
      if (typeof args.customTemplate !== "string") {
        throw new Error("Invalid argument: customTemplate must be a string");
      }
      return {
        featureName: project.name,
        templateType,
        content: args.customTemplate,
      };
    }
    let content: string;
    switch (templateType) {
      case "requirements":
        content = await this.templateService.generateRequirementsTemplate(project);
        break;
      case "design":
        content = await this.templateService.generateDesignTemplate(project);
        break;
      case "tasks":
        content = await this.templateService.generateTasksTemplate(project);
        break;
      default:
        throw new Error("Invalid argument: templateType must be requirements, design, or tasks");
    }
    return { featureName: project.name, templateType, content };
  }

  private async handleValidateDesign(args: Record<string, unknown>): Promise<unknown> {
    const project = await this.requireFeatureProject(args.featureName);
    return this.qualityService.validateDesign(project);
  }

  private async handleValidateGap(args: Record<string, unknown>): Promise<unknown> {
    const project = await this.requireFeatureProject(args.featureName);
    return {
      featureName: project.name,
      analysis: await this.codebaseAnalysisService.analyzeCodebase(project.path),
    };
  }

  private async handleSpecImplementation(args: Record<string, unknown>): Promise<unknown> {
    const result = await this.handleImplement(args);
    return { ...(result as Record<string, unknown>), taskNumbers: args.taskNumbers ?? null };
  }


  private async handleSteering(args: Record<string, unknown>): Promise<string> {
    const { updateMode = "update" } = args;
    const projectPath = process.cwd();

    try {
      // Analyze the project
      const analysis =
        await this.codebaseAnalysisService.analyzeCodebase(projectPath);

      // Generate steering documents based on project analysis
      const productContent = await this.generateProductSteering(analysis);
      const techContent = await this.generateTechSteering(analysis);
      const structureContent = await this.generateStructureSteering(analysis);

      // Create steering documents
      await this.steeringService.createSteeringDocument(projectPath, {
        name: "product.md",
        type: "PRODUCT" as any,
        mode: "ALWAYS" as any,
        content: productContent,
      });

      await this.steeringService.createSteeringDocument(projectPath, {
        name: "tech.md",
        type: "TECHNICAL" as any,
        mode: "ALWAYS" as any,
        content: techContent,
      });

      await this.steeringService.createSteeringDocument(projectPath, {
        name: "structure.md",
        type: "STRUCTURE" as any,
        mode: "ALWAYS" as any,
        content: structureContent,
      });

      // Create static steering documents (including AGENTS.md) if they don't exist
      await this.createStaticSteeringDocuments(projectPath);

      // Get project info from package.json
      let packageJson: any = {};
      try {
        const fs = await import("fs");
        const path = await import("path");
        const packagePath = path.join(projectPath, "package.json");
        if (fs.existsSync(packagePath)) {
          const packageContent = fs.readFileSync(packagePath, "utf8");
          packageJson = JSON.parse(packageContent);
        }
      } catch (error) {
        // Ignore errors
      }

      return `## Steering Documents Updated

**Project**: ${packageJson.name || "Unknown"}
**Mode**: ${updateMode}

**Dynamic Documents** (project-specific, generated from analysis):
- \`.spec/steering/product.md\` - Product overview and business context
- \`.spec/steering/tech.md\` - Technology stack and development environment
- \`.spec/steering/structure.md\` - Project organization and architectural decisions

**Static Documents** (best practices, installed from package):
- \`.spec/steering/tdd-guideline.md\` - Test-Driven Development workflow
- \`.spec/steering/principles.md\` - SOLID, DRY, KISS, YAGNI principles
- \`.spec/steering/linus-review.md\` - Code quality review standards
- \`.spec/steering/commit.md\` - Commit message conventions
- \`.spec/steering/owasp-top10-check.md\` - Security checklist

**Analysis**:
- Technology stack: ${Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).length} dependencies detected
- Project type: ${packageJson.type || "Unknown"}
- Existing steering: Updated preserving customizations

**Tip**: For a complete target-native component installation, run:
\`npx sdd-mcp-server install --profile full\`

Choose Codex or Claude Code interactively, or pass \`--target\` explicitly in automation.`;
    } catch (error) {
      this.logger.error(
        "Failed to generate steering documents",
        error as Error,
      );
      throw new Error(
        `Failed to generate steering documents: ${(error as Error).message}`,
      );
    }
  }

  private async handleSteeringCustom(
    args: Record<string, unknown>,
  ): Promise<string> {
    const { fileName, topic, inclusionMode, filePattern } = args;
    const projectPath = process.cwd();

    if (
      typeof fileName !== "string" ||
      typeof topic !== "string" ||
      typeof inclusionMode !== "string"
    ) {
      throw new Error(
        "Invalid arguments: fileName, topic, and inclusionMode must be strings",
      );
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(fileName)) {
      throw new Error("Invalid argument: fileName must be a Markdown basename");
    }
    if (!["always", "conditional", "manual"].includes(inclusionMode)) {
      throw new Error("Invalid argument: inclusionMode must be always, conditional, or manual");
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

    await this.steeringService.createSteeringDocument(projectPath, {
      name: fileName,
      type: "CUSTOM" as any,
      mode: inclusionMode.toUpperCase() as any,
      patterns: filePattern ? [filePattern as string] : [],
      content,
    });

    return `Custom steering document "${fileName}" created successfully with ${inclusionMode} inclusion mode.`;
  }

  private async generateProductSteering(analysis: any): Promise<string> {
    // Try to read package.json for project info
    let packageJson: any = {};
    try {
      const fs = await import("fs");
      const path = await import("path");
      const packagePath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, "utf8");
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore errors
    }

    return `# Product Overview

## Product Description
${packageJson.description || "No description available"}

## Core Features
${this.extractFeatures(packageJson, analysis)
        .map((feature: string) => `- ${feature}`)
        .join("\n")}

## Target Use Case
${this.generateTargetUseCase(packageJson)}

## Key Value Proposition
${this.generateValueProposition(packageJson, analysis)}

## Target Users
${this.generateTargetUsers(packageJson)}`;
  }

  private async generateTechSteering(analysis: any): Promise<string> {
    // Try to read package.json for project info
    let packageJson: any = {};
    try {
      const fs = await import("fs");
      const path = await import("path");
      const packagePath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, "utf8");
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore errors
    }

    return `# Technology Overview

## Technology Stack
${this.generateTechStack(packageJson, analysis)}

## Development Environment
- Node.js: ${packageJson.engines?.node || "Unknown"}
- Package Manager: npm

## Key Dependencies
${this.generateDependencyList(packageJson)}

## Architecture Patterns
${this.generateArchitecturePatterns(analysis)}

## Quality Standards
${this.generateQualityStandards(packageJson)}`;
  }

  private async generateStructureSteering(analysis: any): Promise<string> {
    return `# Project Structure

## Directory Organization
${this.generateDirectoryStructure(analysis)}

## File Naming Conventions
${this.generateNamingConventions(analysis)}

## Module Organization
${this.generateModuleOrganization(analysis)}

## Development Workflow
${this.generateWorkflow(analysis)}`;
  }

  private extractFeatures(packageJson: any, analysis: any): string[] {
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
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    if (deps?.express || deps?.fastify || deps?.koa)
      features.push("Web server");
    if (deps?.react || deps?.vue || deps?.angular)
      features.push("Frontend framework");
    if (deps?.typescript) features.push("TypeScript support");
    if (deps?.jest || deps?.mocha || deps?.vitest)
      features.push("Unit testing");
    if (deps?.eslint) features.push("Code quality enforcement");

    return features.length > 0
      ? features
      : ["Core functionality to be defined"];
  }

  private generateTargetUseCase(packageJson: any): string {
    if (packageJson.keywords) {
      return `This product is designed for ${packageJson.keywords.join(", ")} use cases.`;
    }
    return "Target use cases to be defined based on project requirements.";
  }

  private generateValueProposition(packageJson: any, analysis: any): string {
    const features = this.extractFeatures(packageJson, analysis);

    return features
      .map((feature) => `- **${feature}**: Enhanced development experience`)
      .join("\n");
  }

  private generateTargetUsers(packageJson: any): string {
    if (packageJson.keywords?.includes("cli")) {
      return "- Command-line tool users\n- Developers and system administrators";
    }
    if (packageJson.keywords?.includes("api")) {
      return "- API consumers\n- Third-party integrators";
    }
    return "- Primary user persona\n- Secondary user persona";
  }

  private generateTechStack(packageJson: any, analysis: any): string {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const stack: string[] = [];
    if (deps?.typescript) stack.push("TypeScript");
    if (deps?.node || packageJson.engines?.node) stack.push("Node.js");
    if (deps?.express) stack.push("Express.js");
    if (deps?.react) stack.push("React");
    if (deps?.vue) stack.push("Vue.js");

    return stack.length > 0
      ? stack.join(", ")
      : "Technology stack to be defined";
  }

  private generateDependencyList(packageJson: any): string {
    const production = Object.keys(packageJson.dependencies || {});
    const development = Object.keys(packageJson.devDependencies || {});

    let list = "";
    if (production.length > 0) {
      list += "### Production Dependencies\n";
      list += production
        .slice(0, 10)
        .map((dep: string) => `- ${dep}`)
        .join("\n");
    }
    if (development.length > 0) {
      list += "\n### Development Dependencies\n";
      list += development
        .slice(0, 10)
        .map((dep: string) => `- ${dep}`)
        .join("\n");
    }

    return list || "Dependencies to be analyzed";
  }

  private generateArchitecturePatterns(analysis: any): string {
    const patterns: string[] = [];

    // Try to analyze directory structure from filesystem
    try {
      const fs = require("fs");
      const projectPath = process.cwd();
      const items = fs.readdirSync(projectPath, { withFileTypes: true });
      const directories = items
        .filter((item: any) => item.isDirectory())
        .map((item: any) => item.name);

      if (directories.includes("src"))
        patterns.push("Source code organization");
      if (directories.includes("test") || directories.includes("__tests__"))
        patterns.push("Test-driven development");
      if (directories.includes("dist") || directories.includes("build"))
        patterns.push("Build artifact separation");
    } catch (error) {
      // Ignore filesystem errors
    }

    return patterns.length > 0
      ? patterns.map((p) => `- ${p}`).join("\n")
      : "- Patterns to be defined";
  }

  private generateQualityStandards(packageJson: any): string {
    const standards: string[] = [];

    if (packageJson.scripts?.lint) standards.push("Code linting with ESLint");
    if (packageJson.scripts?.typecheck)
      standards.push("Type checking with TypeScript");
    if (packageJson.scripts?.test) standards.push("Unit testing required");

    return standards.length > 0
      ? standards.map((s) => `- ${s}`).join("\n")
      : "- Quality standards to be defined";
  }

  private generateDirectoryStructure(analysis: any): string {
    // Try to get directory structure from filesystem
    try {
      const fs = require("fs");
      const projectPath = process.cwd();
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

  private generateNamingConventions(analysis: any): string {
    return `- Use kebab-case for file names
- Use PascalCase for class names
- Use camelCase for variable names
- Use UPPER_SNAKE_CASE for constants`;
  }

  private generateModuleOrganization(analysis: any): string {
    return `- Group related functionality in modules
- Use barrel exports (index.ts files)
- Separate business logic from infrastructure
- Keep dependencies flowing inward`;
  }

  private generateWorkflow(analysis: any): string {
    // Try to read package.json for scripts
    let packageJson: any = {};
    try {
      const fs = require("fs");
      const path = require("path");
      const packagePath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, "utf8");
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore errors
    }

    const scripts = packageJson.scripts || {};

    let workflow = "## Development Commands\n";
    if (scripts.dev)
      workflow += `- \`npm run dev\` - Start development server\n`;
    if (scripts.build)
      workflow += `- \`npm run build\` - Build for production\n`;
    if (scripts.test) workflow += `- \`npm run test\` - Run tests\n`;
    if (scripts.lint) workflow += `- \`npm run lint\` - Check code quality\n`;

    return workflow;
  }

  private async createStaticSteeringDocuments(
    projectPath: string,
  ): Promise<void> {
    await ensureStaticSteeringDocuments(projectPath, this.steeringService);
  }
}
