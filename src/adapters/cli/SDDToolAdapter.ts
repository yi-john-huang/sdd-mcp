// Adapter layer for integrating SDD tools with MCP protocol

import { injectable, inject } from 'inversify';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TYPES } from '../../infrastructure/di/types.js';
import { ProjectService } from '../../application/services/ProjectService.js';
import { WorkflowService } from '../../application/services/WorkflowService.js';
import { TemplateService } from '../../application/services/TemplateService.js';
import { QualityService } from '../../application/services/QualityService.js';
import { SteeringDocumentService } from '../../application/services/SteeringDocumentService.js';
import { CodebaseAnalysisService } from '../../application/services/CodebaseAnalysisService.js';
import { LoggerPort } from '../../domain/ports.js';
import { WorkflowPhase } from '../../domain/types.js';

export interface SDDToolHandler {
  name: string;
  tool: Tool;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

@injectable()
export class SDDToolAdapter {
  constructor(
    @inject(TYPES.ProjectService) private readonly projectService: ProjectService,
    @inject(TYPES.WorkflowService) private readonly workflowService: WorkflowService,
    @inject(TYPES.TemplateService) private readonly templateService: TemplateService,
    @inject(TYPES.QualityService) private readonly qualityService: QualityService,
    @inject(TYPES.SteeringDocumentService) private readonly steeringService: SteeringDocumentService,
    @inject(TYPES.CodebaseAnalysisService) private readonly codebaseAnalysisService: CodebaseAnalysisService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  getSDDTools(): SDDToolHandler[] {
    return [
      {
        name: 'sdd-init',
        tool: {
          name: 'sdd-init',
          description: 'Initialize a new SDD project from description',
          inputSchema: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Detailed project description' }
            },
            required: ['description']
          }
        },
        handler: this.handleProjectInit.bind(this)
      },
      {
        name: 'sdd-status',
        tool: {
          name: 'sdd-status',
          description: 'Get current project status and workflow phase information',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID' },
              projectPath: { type: 'string', description: 'Project path (alternative to ID)' }
            }
          }
        },
        handler: this.handleProjectStatus.bind(this)
      },
      {
        name: 'sdd-requirements',
        tool: {
          name: 'sdd-requirements',
          description: 'Generate requirements doc',
          inputSchema: {
            type: 'object',
            properties: {
              featureName: { type: 'string', description: 'Feature name' }
            },
            required: ['featureName']
          }
        },
        handler: this.handleRequirements.bind(this)
      },
      {
        name: 'sdd-design',
        tool: {
          name: 'sdd-design',
          description: 'Create design specifications',
          inputSchema: {
            type: 'object',
            properties: {
              featureName: { type: 'string', description: 'Feature name' }
            },
            required: ['featureName']
          }
        },
        handler: this.handleDesign.bind(this)
      },
      {
        name: 'sdd-tasks',
        tool: {
          name: 'sdd-tasks',
          description: 'Generate task breakdown',
          inputSchema: {
            type: 'object',
            properties: {
              featureName: { type: 'string', description: 'Feature name' }
            },
            required: ['featureName']
          }
        },
        handler: this.handleTasks.bind(this)
      },
      {
        name: 'sdd-quality-check',
        tool: {
          name: 'sdd-quality-check',
          description: 'Perform Linus-style code quality analysis',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Code to analyze' },
              language: { type: 'string', description: 'Programming language' }
            },
            required: ['code']
          }
        },
        handler: this.handleQualityCheck.bind(this)
      },
      {
        name: 'sdd-steering',
        tool: {
          name: 'sdd-steering',
          description: 'Create/update steering documents with project-specific analysis',
          inputSchema: {
            type: 'object',
            properties: {
              updateMode: { type: 'string', enum: ['create', 'update'], description: 'Whether to create new or update existing documents' }
            }
          }
        },
        handler: this.handleSteering.bind(this)
      },
      {
        name: 'sdd-steering-custom',
        tool: {
          name: 'sdd-steering-custom',
          description: 'Create custom steering documents for specialized contexts',
          inputSchema: {
            type: 'object',
            properties: {
              fileName: { type: 'string', description: 'Filename for the custom steering document' },
              topic: { type: 'string', description: 'Topic/purpose of the custom steering document' },
              inclusionMode: { type: 'string', enum: ['always', 'conditional', 'manual'], description: 'How this steering document should be included' },
              filePattern: { type: 'string', description: 'File pattern for conditional inclusion' }
            },
            required: ['fileName', 'topic', 'inclusionMode']
          }
        },
        handler: this.handleSteeringCustom.bind(this)
      }
    ];
  }

  private async handleProjectInit(args: Record<string, unknown>): Promise<string> {
    const { name, path, language = 'en' } = args;
    
    if (typeof name !== 'string' || typeof path !== 'string') {
      throw new Error('Invalid arguments: name and path must be strings');
    }

    const project = await this.projectService.createProject(
      name, 
      path, 
      language as string
    );

    // Generate initial spec.json
    const specContent = await this.templateService.generateSpecJson(project);
    await this.templateService.writeProjectFile(project, 'spec.json', specContent);

    // Create AGENTS.md if it doesn't exist
    await this.createAgentsFile(path);

    return `Project "${name}" initialized successfully at ${path}\nProject ID: ${project.id}`;
  }

  private async handleProjectStatus(args: Record<string, unknown>): Promise<string> {
    const { projectId, projectPath } = args;
    
    let project;
    if (projectId && typeof projectId === 'string') {
      project = await this.projectService.getProject(projectId);
    } else if (projectPath && typeof projectPath === 'string') {
      project = await this.projectService.getProjectByPath(projectPath);
    } else {
      throw new Error('Either projectId or projectPath must be provided');
    }

    if (!project) {
      return 'Project not found';
    }

    const status = await this.workflowService.getWorkflowStatus(project.id);
    if (!status) {
      return 'Unable to get workflow status';
    }

    let output = `Project: ${project.name}\n`;
    output += `Current Phase: ${status.currentPhase}\n`;
    output += `Next Phase: ${status.nextPhase ?? 'Complete'}\n`;
    output += `Can Progress: ${status.canProgress ? 'Yes' : 'No'}\n`;
    
    if (status.blockers && status.blockers.length > 0) {
      output += `Blockers:\n`;
      for (const blocker of status.blockers) {
        output += `- ${blocker}\n`;
      }
    }

    return output;
  }

  private async handleRequirements(args: Record<string, unknown>): Promise<string> {
    const { projectId } = args;
    
    if (typeof projectId !== 'string') {
      throw new Error('Invalid argument: projectId must be a string');
    }

    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if can transition to requirements phase
    const validation = await this.workflowService.validatePhaseTransition(
      projectId, 
      WorkflowPhase.REQUIREMENTS
    );

    if (!validation.canProgress) {
      throw new Error(`Cannot generate requirements: ${validation.reason}`);
    }

    // Generate requirements template
    const content = await this.templateService.generateRequirementsTemplate(project);
    await this.templateService.writeProjectFile(project, 'requirements.md', content);

    // Update project phase and approval status
    await this.projectService.updateProjectPhase(projectId, WorkflowPhase.REQUIREMENTS);
    await this.projectService.updateApprovalStatus(projectId, 'requirements', { 
      generated: true, 
      approved: false 
    });

    return `Requirements document generated for project "${project.name}"`;
  }

  private async handleDesign(args: Record<string, unknown>): Promise<string> {
    const { projectId } = args;
    
    if (typeof projectId !== 'string') {
      throw new Error('Invalid argument: projectId must be a string');
    }

    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if can transition to design phase
    const validation = await this.workflowService.validatePhaseTransition(
      projectId, 
      WorkflowPhase.DESIGN
    );

    if (!validation.canProgress) {
      throw new Error(`Cannot generate design: ${validation.reason}`);
    }

    // Generate design template
    const content = await this.templateService.generateDesignTemplate(project);
    await this.templateService.writeProjectFile(project, 'design.md', content);

    // Update project phase and approval status
    await this.projectService.updateProjectPhase(projectId, WorkflowPhase.DESIGN);
    await this.projectService.updateApprovalStatus(projectId, 'design', { 
      generated: true, 
      approved: false 
    });

    return `Design document generated for project "${project.name}"`;
  }

  private async handleTasks(args: Record<string, unknown>): Promise<string> {
    const { projectId } = args;
    
    if (typeof projectId !== 'string') {
      throw new Error('Invalid argument: projectId must be a string');
    }

    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if can transition to tasks phase
    const validation = await this.workflowService.validatePhaseTransition(
      projectId, 
      WorkflowPhase.TASKS
    );

    if (!validation.canProgress) {
      throw new Error(`Cannot generate tasks: ${validation.reason}`);
    }

    // Generate tasks template
    const content = await this.templateService.generateTasksTemplate(project);
    await this.templateService.writeProjectFile(project, 'tasks.md', content);

    // Update project phase and approval status
    await this.projectService.updateProjectPhase(projectId, WorkflowPhase.TASKS);
    await this.projectService.updateApprovalStatus(projectId, 'tasks', { 
      generated: true, 
      approved: false 
    });

    return `Tasks document generated for project "${project.name}"`;
  }

  private async handleQualityCheck(args: Record<string, unknown>): Promise<string> {
    const { code, language = 'typescript' } = args;
    
    if (typeof code !== 'string') {
      throw new Error('Invalid argument: code must be a string');
    }

    const report = await this.qualityService.performQualityCheck({
      code,
      language: language as string
    });

    return this.qualityService.formatQualityReport(report);
  }

  private async handleSteering(args: Record<string, unknown>): Promise<string> {
    const { updateMode = 'update' } = args;
    const projectPath = process.cwd();
    
    try {
      // Analyze the project
      const analysis = await this.codebaseAnalysisService.analyzeCodebase(projectPath);
      
      // Generate steering documents based on project analysis
      const productContent = await this.generateProductSteering(analysis);
      const techContent = await this.generateTechSteering(analysis);
      const structureContent = await this.generateStructureSteering(analysis);
      
      // Create steering documents
      await this.steeringService.createSteeringDocument(projectPath, {
        name: 'product.md',
        type: 'PRODUCT' as any,
        mode: 'ALWAYS' as any,
        content: productContent
      });
      
      await this.steeringService.createSteeringDocument(projectPath, {
        name: 'tech.md',
        type: 'TECHNICAL' as any,
        mode: 'ALWAYS' as any,
        content: techContent
      });
      
      await this.steeringService.createSteeringDocument(projectPath, {
        name: 'structure.md',
        type: 'STRUCTURE' as any,
        mode: 'ALWAYS' as any,
        content: structureContent
      });

      // Create static steering documents if they don't exist
      await this.createStaticSteeringDocuments(projectPath);
      
      // Create AGENTS.md if it doesn't exist
      await this.createAgentsFile(projectPath);

      // Get project info from package.json
      let packageJson: any = {};
      try {
        const fs = await import('fs');
        const path = await import('path');
        const packagePath = path.join(projectPath, 'package.json');
        if (fs.existsSync(packagePath)) {
          const packageContent = fs.readFileSync(packagePath, 'utf8');
          packageJson = JSON.parse(packageContent);
        }
      } catch (error) {
        // Ignore errors
      }

      return `## Steering Documents Updated

**Project**: ${packageJson.name || 'Unknown'}
**Mode**: ${updateMode}

**Updated Files**:
- \`.kiro/steering/product.md\` - Product overview and business context
- \`.kiro/steering/tech.md\` - Technology stack and development environment  
- \`.kiro/steering/structure.md\` - Project organization and architectural decisions

**Analysis**:
- Technology stack: ${Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).length} dependencies detected
- Project type: ${packageJson.type || 'Unknown'}
- Existing steering: Updated preserving customizations

These steering documents provide consistent project context for all AI interactions and spec-driven development workflows.`;

    } catch (error) {
      this.logger.error('Failed to generate steering documents', error as Error);
      throw new Error(`Failed to generate steering documents: ${(error as Error).message}`);
    }
  }

  private async handleSteeringCustom(args: Record<string, unknown>): Promise<string> {
    const { fileName, topic, inclusionMode, filePattern } = args;
    const projectPath = process.cwd();
    
    if (typeof fileName !== 'string' || typeof topic !== 'string' || typeof inclusionMode !== 'string') {
      throw new Error('Invalid arguments: fileName, topic, and inclusionMode must be strings');
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
Mode: ${inclusionMode}${filePattern ? `
Pattern: ${filePattern}` : ''}

Generated on: ${new Date().toISOString()}
`;

    await this.steeringService.createSteeringDocument(projectPath, {
      name: fileName,
      type: 'CUSTOM' as any,
      mode: inclusionMode.toUpperCase() as any,
      patterns: filePattern ? [filePattern as string] : [],
      content
    });

    return `Custom steering document "${fileName}" created successfully with ${inclusionMode} inclusion mode.`;
  }

  private async generateProductSteering(analysis: any): Promise<string> {
    // Try to read package.json for project info
    let packageJson: any = {};
    try {
      const fs = await import('fs');
      const path = await import('path');
      const packagePath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore errors
    }
    
    return `# Product Overview
    
## Product Description
${packageJson.description || 'No description available'}

## Core Features
${this.extractFeatures(packageJson, analysis).map((feature: string) => `- ${feature}`).join('\n')}

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
      const fs = await import('fs');
      const path = await import('path');
      const packagePath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore errors
    }
    
    return `# Technology Overview

## Technology Stack
${this.generateTechStack(packageJson, analysis)}

## Development Environment
- Node.js: ${packageJson.engines?.node || 'Unknown'}
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
      if (packageJson.scripts.test) features.push('Testing framework');
      if (packageJson.scripts.build) features.push('Build system');
      if (packageJson.scripts.dev || packageJson.scripts.start) features.push('Development server');
      if (packageJson.scripts.lint) features.push('Code linting');
      if (packageJson.scripts.typecheck) features.push('Type checking');
    }
    
    // Extract features from dependencies
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps?.express || deps?.fastify || deps?.koa) features.push('Web server');
    if (deps?.react || deps?.vue || deps?.angular) features.push('Frontend framework');
    if (deps?.typescript) features.push('TypeScript support');
    if (deps?.jest || deps?.mocha || deps?.vitest) features.push('Unit testing');
    if (deps?.eslint) features.push('Code quality enforcement');
    
    return features.length > 0 ? features : ['Core functionality to be defined'];
  }

  private generateTargetUseCase(packageJson: any): string {
    if (packageJson.keywords) {
      return `This product is designed for ${packageJson.keywords.join(', ')} use cases.`;
    }
    return 'Target use cases to be defined based on project requirements.';
  }

  private generateValueProposition(packageJson: any, analysis: any): string {
    const features = this.extractFeatures(packageJson, analysis);
    
    return features.map(feature => `- **${feature}**: Enhanced development experience`).join('\n');
  }

  private generateTargetUsers(packageJson: any): string {
    if (packageJson.keywords?.includes('cli')) {
      return '- Command-line tool users\n- Developers and system administrators';
    }
    if (packageJson.keywords?.includes('api')) {
      return '- API consumers\n- Third-party integrators';
    }
    return '- Primary user persona\n- Secondary user persona';
  }

  private generateTechStack(packageJson: any, analysis: any): string {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    const stack: string[] = [];
    if (deps?.typescript) stack.push('TypeScript');
    if (deps?.node || packageJson.engines?.node) stack.push('Node.js');
    if (deps?.express) stack.push('Express.js');
    if (deps?.react) stack.push('React');
    if (deps?.vue) stack.push('Vue.js');
    
    return stack.length > 0 ? stack.join(', ') : 'Technology stack to be defined';
  }

  private generateDependencyList(packageJson: any): string {
    const production = Object.keys(packageJson.dependencies || {});
    const development = Object.keys(packageJson.devDependencies || {});
    
    let list = '';
    if (production.length > 0) {
      list += '### Production Dependencies\n';
      list += production.slice(0, 10).map((dep: string) => `- ${dep}`).join('\n');
    }
    if (development.length > 0) {
      list += '\n### Development Dependencies\n';
      list += development.slice(0, 10).map((dep: string) => `- ${dep}`).join('\n');
    }
    
    return list || 'Dependencies to be analyzed';
  }

  private generateArchitecturePatterns(analysis: any): string {
    const patterns: string[] = [];
    
    // Try to analyze directory structure from filesystem
    try {
      const fs = require('fs');
      const projectPath = process.cwd();
      const items = fs.readdirSync(projectPath, { withFileTypes: true });
      const directories = items
        .filter((item: any) => item.isDirectory())
        .map((item: any) => item.name);
      
      if (directories.includes('src')) patterns.push('Source code organization');
      if (directories.includes('test') || directories.includes('__tests__')) patterns.push('Test-driven development');
      if (directories.includes('dist') || directories.includes('build')) patterns.push('Build artifact separation');
    } catch (error) {
      // Ignore filesystem errors
    }
    
    return patterns.length > 0 ? patterns.map(p => `- ${p}`).join('\n') : '- Patterns to be defined';
  }

  private generateQualityStandards(packageJson: any): string {
    const standards: string[] = [];
    
    if (packageJson.scripts?.lint) standards.push('Code linting with ESLint');
    if (packageJson.scripts?.typecheck) standards.push('Type checking with TypeScript');
    if (packageJson.scripts?.test) standards.push('Unit testing required');
    
    return standards.length > 0 ? standards.map(s => `- ${s}`).join('\n') : '- Quality standards to be defined';
  }

  private generateDirectoryStructure(analysis: any): string {
    // Try to get directory structure from filesystem
    try {
      const fs = require('fs');
      const projectPath = process.cwd();
      const items = fs.readdirSync(projectPath, { withFileTypes: true });
      const directories = items
        .filter((item: any) => item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules')
        .map((item: any) => `- ${item.name}/`)
        .join('\n');
      
      return directories || 'Directory structure to be analyzed';
    } catch (error) {
      return 'Directory structure to be analyzed';
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
      const fs = require('fs');
      const path = require('path');
      const packagePath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore errors
    }
    
    const scripts = packageJson.scripts || {};
    
    let workflow = '## Development Commands\n';
    if (scripts.dev) workflow += `- \`npm run dev\` - Start development server\n`;
    if (scripts.build) workflow += `- \`npm run build\` - Build for production\n`;
    if (scripts.test) workflow += `- \`npm run test\` - Run tests\n`;
    if (scripts.lint) workflow += `- \`npm run lint\` - Check code quality\n`;
    
    return workflow;
  }

  private async createStaticSteeringDocuments(projectPath: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    // Check if linus-review.md exists, if not create it
    const linusReviewPath = path.join(projectPath, '.kiro', 'steering', 'linus-review.md');
    if (!fs.existsSync(linusReviewPath)) {
      const linusReviewContent = `# Linus Torvalds Code Review Steering Document

## Role Definition

You are channeling Linus Torvalds, creator and chief architect of the Linux kernel. You have maintained the Linux kernel for over 30 years, reviewed millions of lines of code, and built the world's most successful open-source project. Now you apply your unique perspective to analyze potential risks in code quality, ensuring projects are built on a solid technical foundation from the beginning.

## Core Philosophy

**1. "Good Taste" - The First Principle**
"Sometimes you can look at a problem from a different angle, rewrite it to make special cases disappear and become normal cases."
- Classic example: Linked list deletion, optimized from 10 lines with if statements to 4 lines without conditional branches
- Good taste is an intuition that requires accumulated experience
- Eliminating edge cases is always better than adding conditional checks

**2. "Never break userspace" - The Iron Rule**
"We do not break userspace!"
- Any change that crashes existing programs is a bug, no matter how "theoretically correct"
- The kernel's duty is to serve users, not educate them
- Backward compatibility is sacred and inviolable

**3. Pragmatism - The Belief**
"I'm a damn pragmatist."
- Solve actual problems, not imagined threats
- Reject "theoretically perfect" but practically complex solutions like microkernels
- Code should serve reality, not papers

**4. Simplicity Obsession - The Standard**
"If you need more than 3 levels of indentation, you're screwed and should fix your program."
- Functions must be short and focused, do one thing and do it well
- C is a Spartan language, naming should be too
- Complexity is the root of all evil

## Communication Principles

### Basic Communication Standards

- **Expression Style**: Direct, sharp, zero nonsense. If code is garbage, call it garbage and explain why.
- **Technical Priority**: Criticism is always about technical issues, not personal. Don't blur technical judgment for "niceness."

### Requirements Confirmation Process

When analyzing any code or technical need, follow these steps:

#### 0. **Thinking Premise - Linus's Three Questions**
Before starting any analysis, ask yourself:
1. "Is this a real problem or imagined?" - Reject over-engineering
2. "Is there a simpler way?" - Always seek the simplest solution
3. "Will it break anything?" - Backward compatibility is the iron rule

#### 1. **Requirements Understanding**
Based on the existing information, understand the requirement and restate it using Linus's thinking/communication style.

#### 2. **Linus-style Problem Decomposition Thinking**

**First Layer: Data Structure Analysis**
"Bad programmers worry about the code. Good programmers worry about data structures."

- What is the core data? How do they relate?
- Where does data flow? Who owns it? Who modifies it?
- Is there unnecessary data copying or transformation?

**Second Layer: Special Case Identification**
"Good code has no special cases"

- Find all if/else branches
- Which are real business logic? Which are patches for bad design?
- Can we redesign data structures to eliminate these branches?

**Third Layer: Complexity Review**
"If implementation needs more than 3 levels of indentation, redesign it"

- What's the essence of this feature? (Explain in one sentence)
- How many concepts does the current solution use?
- Can it be reduced by half? Half again?

**Fourth Layer: Breaking Change Analysis**
"Never break userspace" - Backward compatibility is the iron rule

- List all existing features that might be affected
- Which dependencies will break?
- How to improve without breaking anything?

**Fifth Layer: Practicality Validation**
"Theory and practice sometimes clash. Theory loses. Every single time."

- Does this problem really exist in production?
- How many users actually encounter this problem?
- Does the solution's complexity match the problem's severity?

## Decision Output Pattern

After the above 5 layers of thinking, output must include:

\`\`\`
【Core Judgment】
✅ Worth doing: [reason] / ❌ Not worth doing: [reason]

【Key Insights】
- Data structure: [most critical data relationships]
- Complexity: [complexity that can be eliminated]
- Risk points: [biggest breaking risk]

【Linus-style Solution】
If worth doing:
1. First step is always simplifying data structures
2. Eliminate all special cases
3. Implement in the dumbest but clearest way
4. Ensure zero breaking changes

If not worth doing:
"This is solving a non-existent problem. The real problem is [XXX]."
\`\`\`

## Code Review Output

When reviewing code, immediately make three-level judgment:

\`\`\`
【Taste Score】
🟢 Good taste / 🟡 Passable / 🔴 Garbage

【Fatal Issues】
- [If any, directly point out the worst parts]

【Improvement Direction】
"Eliminate this special case"
"These 10 lines can become 3 lines"
"Data structure is wrong, should be..."
\`\`\`

## Integration with SDD Workflow

### Requirements Phase
Apply Linus's 5-layer thinking to validate if requirements solve real problems and can be implemented simply.

### Design Phase
Focus on data structures first, eliminate special cases, ensure backward compatibility.

### Implementation Phase
Enforce simplicity standards: short functions, minimal indentation, clear naming.

### Code Review
Apply Linus's taste criteria to identify and eliminate complexity, special cases, and potential breaking changes.

## Usage in SDD Commands

This steering document is applied when:
- Generating requirements: Validate problem reality and simplicity
- Creating technical design: Data-first approach, eliminate edge cases
- Implementation guidance: Enforce simplicity and compatibility
- Code review: Apply taste scoring and improvement recommendations

Remember: "Good taste" comes from experience. Question everything. Simplify ruthlessly. Never break userspace.
`;
      
      await this.steeringService.createSteeringDocument(projectPath, {
        name: 'linus-review.md',
        type: 'LINUS_REVIEW' as any,
        mode: 'ALWAYS' as any,
        content: linusReviewContent
      });
    }

    // Check if commit.md exists, if not create it
    const commitPath = path.join(projectPath, '.kiro', 'steering', 'commit.md');
    if (!fs.existsSync(commitPath)) {
      const commitContent = `# Commit Message Guidelines

Commit messages should follow a consistent format to improve readability and provide clear context about changes. Each commit message should start with a type prefix that indicates the nature of the change.

## Format

\`\`\`
<type>(<scope>): <subject>

<body>

<footer>
\`\`\`

## Type Prefixes

All commit messages must begin with one of these type prefixes:

- **docs**: Documentation changes (README, comments, etc.)
- **chore**: Maintenance tasks, dependency updates, etc.
- **feat**: New features or enhancements
- **fix**: Bug fixes
- **refactor**: Code changes that neither fix bugs nor add features
- **test**: Adding or modifying tests
- **style**: Changes that don't affect code functionality (formatting, whitespace)
- **perf**: Performance improvements
- **ci**: Changes to CI/CD configuration files and scripts

## Scope (Optional)

The scope provides additional context about which part of the codebase is affected:

- **cluster**: Changes to EKS cluster configuration
- **db**: Database-related changes
- **iam**: Identity and access management changes
- **net**: Networking changes (VPC, security groups, etc.)
- **k8s**: Kubernetes resource changes
- **module**: Changes to reusable Terraform modules

## Examples

\`\`\`
feat(cluster): add node autoscaling for billing namespace
fix(db): correct MySQL parameter group settings
docs(k8s): update network policy documentation
chore: update terraform provider versions
refactor(module): simplify EKS node group module
\`\`\`

## Best Practices

1. Keep the subject line under 72 characters
2. Use imperative mood in the subject line ("add" not "added")
3. Don't end the subject line with a period
4. Separate subject from body with a blank line
5. Use the body to explain what and why, not how
6. Reference issues and pull requests in the footer

These guidelines help maintain a clean and useful git history that makes it easier to track changes and understand the project's evolution.
`;
      
      await this.steeringService.createSteeringDocument(projectPath, {
        name: 'commit.md',
        type: 'CUSTOM' as any,
        mode: 'ALWAYS' as any,
        content: commitContent
      });
    }
  }

  private async createAgentsFile(projectPath: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    // Check if AGENTS.md exists, if not create it based on CLAUDE.md
    const agentsPath = path.join(projectPath, 'AGENTS.md');
    if (!fs.existsSync(agentsPath)) {
      // Try to read CLAUDE.md to use as template
      const claudePath = path.join(projectPath, 'CLAUDE.md');
      let agentsContent = '';
      
      if (fs.existsSync(claudePath)) {
        // Read CLAUDE.md and adapt it for general agents
        const claudeContent = fs.readFileSync(claudePath, 'utf8');
        agentsContent = claudeContent
          .replace(/# Claude Code Spec-Driven Development/g, '# AI Agent Spec-Driven Development')
          .replace(/Claude Code/g, 'AI Agent')
          .replace(/claude code/g, 'ai agent')
          .replace(/Claude/g, 'AI Agent')
          .replace(/claude/g, 'ai agent');
      } else {
        // Fallback to basic template if CLAUDE.md doesn't exist
        agentsContent = `# AI Agent Spec-Driven Development

Kiro-style Spec Driven Development implementation for AI agents across different CLIs and IDEs.

## Project Context

### Paths
- Steering: \`.kiro/steering/\`
- Specs: \`.kiro/specs/\`
- Commands: Agent-specific command structure

### Steering vs Specification

**Steering** (\`.kiro/steering/\`) - Guide AI with project-wide rules and context  
**Specs** (\`.kiro/specs/\`) - Formalize development process for individual features

### Active Specifications
- Check \`.kiro/specs/\` for active specifications
- Use agent-specific status commands to check progress

**Current Specifications:**
- \`mcp-sdd-server\`: MCP server for spec-driven development across AI-agent CLIs and IDEs

## Development Guidelines
- Think in English, generate responses in English

## Workflow

### Phase 0: Steering (Optional)
Agent steering commands - Create/update steering documents  
Agent steering-custom commands - Create custom steering for specialized contexts

Note: Optional for new features or small additions. You can proceed directly to spec-init.

### Phase 1: Specification Creation
1. Agent spec-init commands - Initialize spec with detailed project description
2. Agent spec-requirements commands - Generate requirements document
3. Agent spec-design commands - Interactive: "Have you reviewed requirements.md? [y/N]"
4. Agent spec-tasks commands - Interactive: Confirms both requirements and design review

### Phase 2: Progress Tracking
Agent spec-status commands - Check current progress and phases

## Development Rules
1. **Consider steering**: Run steering commands before major development (optional for new features)
2. **Follow 3-phase approval workflow**: Requirements → Design → Tasks → Implementation
3. **Approval required**: Each phase requires human review (interactive prompt or manual)
4. **No skipping phases**: Design requires approved requirements; Tasks require approved design
5. **Update task status**: Mark tasks as completed when working on them
6. **Keep steering current**: Run steering commands after significant changes
7. **Check spec compliance**: Use status commands to verify alignment

## Steering Configuration

### Current Steering Files
Managed by agent steering commands. Updates here reflect command changes.

### Active Steering Files
- \`product.md\`: Always included - Product context and business objectives
- \`tech.md\`: Always included - Technology stack and architectural decisions
- \`structure.md\`: Always included - File organization and code patterns
- \`linus-review.md\`: Always included - Ensuring code quality of the projects
- \`commit.md\`: Always included - Ensuring the commit / merge request / pull request title and message context.

### Custom Steering Files
<!-- Added by agent steering-custom commands -->
<!-- Format: 
- \`filename.md\`: Mode - Pattern(s) - Description
  Mode: Always|Conditional|Manual
  Pattern: File patterns for Conditional mode
-->

### Inclusion Modes
- **Always**: Loaded in every interaction (default)
- **Conditional**: Loaded for specific file patterns (e.g., "*.test.js")
- **Manual**: Reference with \`@filename.md\` syntax

Generated on: ${new Date().toISOString()}
`;
      }
      
      fs.writeFileSync(agentsPath, agentsContent);
    }
  }
}