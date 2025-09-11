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
          description: 'Initialize a new SDD project with directory structure and spec files',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Project name' },
              path: { type: 'string', description: 'Project path' },
              language: { type: 'string', enum: ['en', 'ja', 'zh-TW'], default: 'en' }
            },
            required: ['name', 'path']
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
          description: 'Generate requirements document template',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID' }
            },
            required: ['projectId']
          }
        },
        handler: this.handleRequirements.bind(this)
      },
      {
        name: 'sdd-design',
        tool: {
          name: 'sdd-design',
          description: 'Generate design document template',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID' }
            },
            required: ['projectId']
          }
        },
        handler: this.handleDesign.bind(this)
      },
      {
        name: 'sdd-tasks',
        tool: {
          name: 'sdd-tasks',
          description: 'Generate implementation tasks document',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID' }
            },
            required: ['projectId']
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
}