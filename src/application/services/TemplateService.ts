// Template service for coordinating template operations

import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import type { LoggerPort } from '../../domain/ports.js';
import type { 
  TemplateRendererPort, 
  TemplateManagerPort, 
  FileGeneratorPort,
  Template,
  TemplateCategory,
  TemplateData,
  TemplateContext,
  FileGenerationOptions,
  FileGenerationResult,
  DirectoryStructure,
  DirectoryGenerationResult
} from '../../domain/templates/index.js';
import { TYPES } from '../../infrastructure/di/types.js';
import { Project } from '../../domain/types.js';
import { 
  TemplateEngine, 
  FileSystemPort
} from '../../domain/ports.js';

// Legacy template data interface for backward compatibility
export interface LegacyTemplateData {
  project: Project;
  timestamp: string;
  [key: string]: unknown;
}

export interface TemplateServiceOptions {
  readonly backup?: boolean;
  readonly overwrite?: boolean;
  readonly createDirectories?: boolean;
  readonly permissions?: string;
  readonly atomic?: boolean;
}

@injectable()
export class TemplateService {
  constructor(
    @inject(TYPES.TemplateEngine) private readonly templateEngine: TemplateEngine,
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.TemplateRendererPort) private readonly renderer: TemplateRendererPort,
    @inject(TYPES.TemplateManagerPort) private readonly templateManager: TemplateManagerPort,
    @inject(TYPES.FileGeneratorPort) private readonly fileGenerator: FileGeneratorPort
  ) {
    this.registerCustomHelpers();
  }

  async generateSpecJson(project: Project): Promise<string> {
    const correlationId = uuidv4();
    
    this.logger.info('Generating spec.json', {
      correlationId,
      projectId: project.id
    });

    const template = `{
  "feature_name": "{{project.name}}",
  "created_at": "{{project.metadata.createdAt}}",
  "updated_at": "{{project.metadata.updatedAt}}",
  "language": "{{project.metadata.language}}",
  "phase": "{{project.phase}}",
  "approvals": {
    "requirements": {
      "generated": {{project.metadata.approvals.requirements.generated}},
      "approved": {{project.metadata.approvals.requirements.approved}}
    },
    "design": {
      "generated": {{project.metadata.approvals.design.generated}},
      "approved": {{project.metadata.approvals.design.approved}}
    },
    "tasks": {
      "generated": {{project.metadata.approvals.tasks.generated}},
      "approved": {{project.metadata.approvals.tasks.approved}}
    }
  },
  "ready_for_implementation": {{isReadyForImplementation project}}
}`;

    const data: LegacyTemplateData = {
      project,
      timestamp: new Date().toISOString()
    };

    const content = await this.templateEngine.render(template, data);
    
    this.logger.info('spec.json generated successfully', {
      correlationId,
      projectId: project.id
    });

    return content;
  }

  async generateRequirementsTemplate(project: Project): Promise<string> {
    // Analyze project for real requirements
    const packageJson = await this.getPackageJsonAnalysis(project.path);
    const projectAnalysis = await this.analyzeProjectStructure(project.path);
    
    const template = `# Requirements Document

## Introduction
{{project.name}} - Requirements specification for {{project.metadata.language}} locale.

**Product Description:** ${packageJson.description || 'Product requirements specification'}

Generated on: {{timestamp}}

## Functional Requirements

### FR-1: Core Functionality
**Objective:** ${this.generateCoreObjective(packageJson, projectAnalysis)}

#### Acceptance Criteria
${this.generateAcceptanceCriteria(packageJson, projectAnalysis).map((criteria, index) => `${index + 1}. ${criteria}`).join('\n')}

### FR-2: Technology Integration
**Objective:** Implement robust technology stack integration

#### Acceptance Criteria
${this.generateTechRequirements(packageJson).map((req, index) => `${index + 1}. ${req}`).join('\n')}

### FR-3: Quality Standards
**Objective:** Maintain high code quality and testing standards

#### Acceptance Criteria
${this.generateQualityRequirements(packageJson).map((req, index) => `${index + 1}. ${req}`).join('\n')}

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

    const data: LegacyTemplateData = {
      project,
      timestamp: new Date().toISOString()
    };

    return await this.templateEngine.render(template, data);
  }

  async generateDesignTemplate(project: Project): Promise<string> {
    // Analyze project for real design information
    const packageJson = await this.getPackageJsonAnalysis(project.path);
    const projectAnalysis = await this.analyzeProjectStructure(project.path);
    
    const template = `# Technical Design Document

## Project: {{project.name}}

**Product Description:** ${packageJson.description || 'Technical design specification'}

Generated on: {{timestamp}}

## Architecture Overview

### System Architecture
${this.generateArchitectureDescription(packageJson, projectAnalysis)}

### Key Components
${this.generateComponentDescriptions(projectAnalysis).map(comp => `- **${comp.name}**: ${comp.description}`).join('\n')}

### Data Models
${this.generateDataModels(packageJson, projectAnalysis).map(model => `- **${model}**: Data structure definition`).join('\n')}

## Implementation Details

### Technology Stack
${this.generateDetailedTechStack(packageJson)}

### Design Patterns
${this.generateDesignPatterns(packageJson, projectAnalysis).map(pattern => `- **${pattern}**: Applied for maintainability and scalability`).join('\n')}

### Dependencies
${this.generateDependencyAnalysis(packageJson)}

## Interface Specifications

### API Interfaces
${this.generateAPIInterfaces(packageJson, projectAnalysis)}

### Module Interfaces  
${this.generateModuleInterfaces(projectAnalysis)}

## Configuration

### Environment Variables
${this.generateEnvVarSpecs(packageJson)}

### Build Configuration
${this.generateBuildConfig(packageJson)}
`;

    const data: LegacyTemplateData = {
      project,
      timestamp: new Date().toISOString()
    };

    return await this.templateEngine.render(template, data);
  }

  async generateTasksTemplate(project: Project): Promise<string> {
    // Analyze project for real implementation tasks
    const packageJson = await this.getPackageJsonAnalysis(project.path);
    const projectAnalysis = await this.analyzeProjectStructure(project.path);
    
    const tasks = this.generateImplementationTasks(packageJson, projectAnalysis);
    
    const template = `# Implementation Plan

## Project: {{project.name}}

**Product Description:** ${packageJson.description || 'Implementation task breakdown'}

Generated on: {{timestamp}}

## Development Phase Tasks

${tasks.development.map((task, index) => `- [ ] ${index + 1}. ${task.title}
  ${task.subtasks.map(subtask => `  - ${subtask}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n')}

## Integration Phase Tasks

${tasks.integration.map((task, index) => `- [ ] ${index + 1}. ${task.title}
  ${task.subtasks.map(subtask => `  - ${subtask}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n')}

## Quality Assurance Tasks

${tasks.quality.map((task, index) => `- [ ] ${index + 1}. ${task.title}
  ${task.subtasks.map(subtask => `  - ${subtask}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n')}

## Deployment Tasks

${tasks.deployment.map((task, index) => `- [ ] ${index + 1}. ${task.title}
  ${task.subtasks.map(subtask => `  - ${subtask}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n')}
`;

    const data: LegacyTemplateData = {
      project,
      timestamp: new Date().toISOString()
    };

    return await this.templateEngine.render(template, data);
  }

  async writeProjectFile(
    project: Project, 
    fileName: string, 
    content: string
  ): Promise<void> {
    const correlationId = uuidv4();
    const filePath = `${project.path}/.kiro/specs/${project.name}/${fileName}`;
    
    this.logger.info('Writing project file', {
      correlationId,
      projectId: project.id,
      filePath
    });

    // Ensure directory exists
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!(await this.fileSystem.exists(dirPath))) {
      await this.fileSystem.mkdir(dirPath);
    }

    await this.fileSystem.writeFile(filePath, content);
    
    this.logger.info('Project file written successfully', {
      correlationId,
      projectId: project.id,
      filePath
    });
  }

  // New template system methods
  async renderTemplate(templateId: string, data: TemplateData, context: TemplateContext): Promise<string> {
    const template = await this.templateManager.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    return this.renderer.renderString(template.template, data, context);
  }

  async generateFile(
    templateId: string,
    filePath: string,
    data: TemplateData,
    context: TemplateContext,
    options?: TemplateServiceOptions
  ): Promise<FileGenerationResult> {
    const template = await this.templateManager.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    const fileOptions: FileGenerationOptions = {
      backup: options?.backup ?? true,
      overwrite: options?.overwrite ?? false,
      createDirectories: options?.createDirectories ?? true,
      atomic: options?.atomic ?? true
    };

    if (options?.permissions) {
      (fileOptions as any).permissions = options.permissions;
    }

    return this.fileGenerator.generateFile(
      filePath,
      template.template,
      data,
      context,
      fileOptions
    );
  }

  async generateDirectory(
    dirPath: string,
    structure: DirectoryStructure,
    context: TemplateContext,
    options?: TemplateServiceOptions
  ): Promise<DirectoryGenerationResult> {
    const fileOptions: FileGenerationOptions = {
      backup: options?.backup ?? true,
      overwrite: options?.overwrite ?? false,
      createDirectories: options?.createDirectories ?? true,
      atomic: options?.atomic ?? true
    };

    if (options?.permissions) {
      (fileOptions as any).permissions = options.permissions;
    }

    return this.fileGenerator.generateDirectory(
      dirPath,
      structure,
      context,
      fileOptions
    );
  }

  async getTemplate(templateId: string): Promise<Template | null> {
    return this.templateManager.getTemplate(templateId);
  }

  async getTemplatesByCategory(category: TemplateCategory): Promise<Template[]> {
    return this.templateManager.getTemplatesByCategory(category);
  }

  async searchTemplates(query: string, tags?: string[]): Promise<Template[]> {
    return this.templateManager.searchTemplates(query, tags);
  }

  async getAllTemplates(): Promise<Template[]> {
    return this.templateManager.getAllTemplates();
  }

  async createProjectStructure(
    projectPath: string,
    projectName: string,
    description?: string,
    author?: string
  ): Promise<DirectoryGenerationResult> {
    const project: any = {
      name: projectName,
      id: `${projectName}-${Date.now()}`,
      basePath: projectPath
    };

    if (description) {
      project.description = description;
    }

    const context: TemplateContext = {
      project,
      timestamp: new Date(),
      user: {
        name: author
      },
      metadata: {}
    };

    const structure: DirectoryStructure = {
      files: [
        {
          name: 'spec.json',
          template: await this.getTemplateContent('spec-json'),
          data: {
            name: projectName,
            description,
            author
          }
        }
      ],
      subdirectories: {
        '.kiro': {
          files: [],
          subdirectories: {
            'steering': {
              files: [
                {
                  name: 'product.md',
                  template: await this.getTemplateContent('product-steering'),
                  data: {
                    productName: projectName,
                    vision: `${projectName} vision statement`,
                    goals: ['Define clear product goals', 'Deliver value to users']
                  }
                },
                {
                  name: 'tech.md',
                  template: await this.getTemplateContent('tech-steering'),
                  data: {
                    projectName,
                    techStack: [
                      { category: 'Language', name: 'TypeScript' },
                      { category: 'Runtime', name: 'Node.js' }
                    ],
                    architecture: 'Clean Architecture with Hexagonal pattern'
                  }
                },
                {
                  name: 'structure.md',
                  template: await this.getTemplateContent('structure-steering'),
                  data: {
                    projectName,
                    structure: {
                      directories: [
                        { path: 'src/', purpose: 'Source code' },
                        { path: 'tests/', purpose: 'Test files' },
                        { path: 'docs/', purpose: 'Documentation' }
                      ],
                      fileTypes: [
                        { extension: '.ts', location: 'src/', purpose: 'TypeScript source files' },
                        { extension: '.test.ts', location: 'tests/', purpose: 'Test files' }
                      ]
                    }
                  }
                },
                {
                  name: 'linus-review.md',
                  template: await this.getTemplateContent('linus-review-steering'),
                  data: {
                    projectName
                  }
                }
              ],
              subdirectories: {}
            },
            'specs': {
              files: [],
              subdirectories: {
                [projectName]: {
                  files: [
                    {
                      name: 'requirements.md',
                      template: await this.getTemplateContent('requirements-md'),
                      data: {
                        projectName,
                        requirements: [
                          {
                            title: 'Initial requirement',
                            description: 'Define the first requirement for this project',
                            acceptanceCriteria: ['Criterion 1', 'Criterion 2']
                          }
                        ]
                      }
                    },
                    {
                      name: 'design.md',
                      template: await this.getTemplateContent('design-md'),
                      data: {
                        projectName,
                        architecture: 'System architecture to be defined',
                        components: [
                          {
                            name: 'Core Component',
                            purpose: 'Main application logic',
                            responsibilities: ['Handle business logic', 'Coordinate operations'],
                            interfaces: [{ name: 'API', description: 'External interface' }]
                          }
                        ]
                      }
                    },
                    {
                      name: 'tasks.md',
                      template: await this.getTemplateContent('tasks-md'),
                      data: {
                        projectName,
                        tasks: [
                          {
                            title: 'Setup project foundation',
                            description: 'Initialize project structure and dependencies',
                            completed: false,
                            subtasks: [
                              { title: 'Create project structure', completed: false },
                              { title: 'Install dependencies', completed: false }
                            ],
                            dependencies: [],
                            effort: 4
                          }
                        ]
                      }
                    }
                  ],
                  subdirectories: {}
                }
              }
            }
          }
        }
      }
    };

    return this.generateDirectory(projectPath, structure, context);
  }

  private async getTemplateContent(templateId: string): Promise<string> {
    const template = await this.templateManager.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }
    return template.template;
  }

  async validateTemplateFile(filePath: string): Promise<boolean> {
    try {
      const validation = await this.fileGenerator.validatePath(filePath);
      return validation.isValid;
    } catch {
      return false;
    }
  }

  async backupFile(filePath: string): Promise<string> {
    return this.fileGenerator.backupFile(filePath);
  }

  async restoreBackup(backupPath: string, originalPath: string): Promise<void> {
    return this.fileGenerator.restoreBackup(backupPath, originalPath);
  }

  async cleanupOldBackups(olderThanDays = 30): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    return this.fileGenerator.cleanupBackups(cutoffDate);
  }

  registerTemplateHelper(name: string, helper: (...args: unknown[]) => unknown): void {
    this.renderer.registerHelper(name, helper);
  }

  async registerTemplatePartial(name: string, template: string): Promise<void> {
    return this.renderer.registerPartial(name, template);
  }

  clearTemplateCache(): void {
    this.renderer.clearCache();
  }

  private registerCustomHelpers(): void {
    this.templateEngine.registerHelper('isReadyForImplementation', (project: Project) => {
      const { approvals } = project.metadata;
      return (approvals.requirements.approved && 
             approvals.design.approved && 
             approvals.tasks.approved).toString();
    });

    this.templateEngine.registerHelper('formatDate', (date: Date) => {
      return date.toISOString();
    });
  }

  // Helper methods for project analysis and content generation
  private async getPackageJsonAnalysis(projectPath: string): Promise<any> {
    try {
      const packagePath = `${projectPath}/package.json`;
      if (await this.fileSystem.exists(packagePath)) {
        const content = await this.fileSystem.readFile(packagePath);
        return JSON.parse(content);
      }
    } catch (error) {
      this.logger.warn('Failed to read package.json', { error });
    }
    return {};
  }

  private async analyzeProjectStructure(projectPath: string): Promise<any> {
    try {
      const entries = await this.fileSystem.readdir(projectPath);
      return {
        directories: entries.filter(entry => !entry.includes('.')),
        files: entries.filter(entry => entry.includes('.')),
        hasSource: entries.includes('src'),
        hasTests: entries.includes('test') || entries.includes('__tests__'),
        hasDocs: entries.includes('docs') || entries.includes('documentation')
      };
    } catch (error) {
      this.logger.warn('Failed to analyze project structure', { error });
    }
    return { directories: [], files: [] };
  }

  private generateCoreObjective(packageJson: any, projectAnalysis: any): string {
    if (packageJson.description) {
      return `Deliver ${packageJson.description} with full functionality and reliability`;
    }
    if (packageJson.keywords?.length > 0) {
      return `Implement ${packageJson.keywords.join(', ')} functionality`;
    }
    return 'Deliver core application functionality';
  }

  private generateAcceptanceCriteria(packageJson: any, projectAnalysis: any): string[] {
    const criteria: string[] = [];
    
    if (packageJson.scripts?.test) {
      criteria.push('WHEN tests are run THEN all tests SHALL pass');
    }
    if (packageJson.scripts?.build) {
      criteria.push('WHEN build is executed THEN system SHALL compile without errors');
    }
    if (packageJson.scripts?.lint) {
      criteria.push('WHERE code quality is checked THE system SHALL meet linting standards');
    }
    if (packageJson.main || packageJson.bin) {
      criteria.push('WHEN application starts THEN system SHALL initialize successfully');
    }
    
    criteria.push('IF errors occur THEN system SHALL handle them gracefully');
    return criteria.length > 0 ? criteria : ['System SHALL meet functional requirements'];
  }

  private generateTechRequirements(packageJson: any): string[] {
    const requirements: string[] = [];
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    if (deps?.typescript) {
      requirements.push('System SHALL use TypeScript for type safety');
    }
    if (deps?.express || deps?.fastify) {
      requirements.push('System SHALL implement RESTful API endpoints');
    }
    if (deps?.react || deps?.vue || deps?.angular) {
      requirements.push('System SHALL provide responsive user interface');
    }
    if (deps?.jest || deps?.mocha || deps?.vitest) {
      requirements.push('System SHALL include comprehensive test coverage');
    }
    
    return requirements.length > 0 ? requirements : ['System SHALL integrate required technologies'];
  }

  private generateQualityRequirements(packageJson: any): string[] {
    const requirements: string[] = [];
    
    if (packageJson.scripts?.lint) {
      requirements.push('Code SHALL pass linting checks');
    }
    if (packageJson.scripts?.typecheck) {
      requirements.push('Code SHALL pass type checking');
    }
    if (packageJson.scripts?.test) {
      requirements.push('Code SHALL maintain test coverage standards');
    }
    
    requirements.push('Code SHALL follow established conventions');
    return requirements;
  }

  private generateArchitectureDescription(packageJson: any, projectAnalysis: any): string {
    let description = '';
    
    if (packageJson.type === 'module') {
      description += 'Modern ES Module-based architecture. ';
    }
    
    if (projectAnalysis.hasSource) {
      description += 'Modular source code organization with clear separation of concerns. ';
    }
    
    if (packageJson.dependencies?.express) {
      description += 'RESTful API server architecture using Express.js framework. ';
    }
    
    if (packageJson.dependencies?.typescript || packageJson.devDependencies?.typescript) {
      description += 'Type-safe development with TypeScript compilation. ';
    }
    
    return description || 'Application architecture to be defined based on requirements.';
  }

  private generateComponentDescriptions(projectAnalysis: any): Array<{name: string, description: string}> {
    const components: Array<{name: string, description: string}> = [];
    
    if (projectAnalysis.hasSource) {
      components.push({ name: 'Core Module', description: 'Main application logic and business rules' });
    }
    if (projectAnalysis.hasTests) {
      components.push({ name: 'Test Suite', description: 'Automated testing framework and test cases' });
    }
    if (projectAnalysis.hasDocs) {
      components.push({ name: 'Documentation', description: 'Project documentation and API specifications' });
    }
    
    return components.length > 0 ? components : [
      { name: 'Application Core', description: 'Main application functionality' }
    ];
  }

  private generateDataModels(packageJson: any, projectAnalysis: any): string[] {
    const models: string[] = [];
    
    if (packageJson.dependencies?.mongoose || packageJson.dependencies?.mongodb) {
      models.push('MongoDB Document Models');
    }
    if (packageJson.dependencies?.sequelize || packageJson.dependencies?.typeorm) {
      models.push('Relational Database Models');
    }
    if (packageJson.dependencies?.graphql) {
      models.push('GraphQL Schema Models');
    }
    
    return models.length > 0 ? models : ['Application Data Models'];
  }

  private generateDetailedTechStack(packageJson: any): string {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const stack: string[] = [];
    
    if (deps?.typescript) stack.push('- **TypeScript**: Type-safe JavaScript development');
    if (deps?.node || packageJson.engines?.node) stack.push(`- **Node.js**: ${packageJson.engines?.node || 'Runtime environment'}`);
    if (deps?.express) stack.push('- **Express.js**: Web application framework');
    if (deps?.react) stack.push('- **React**: User interface library');
    if (deps?.vue) stack.push('- **Vue.js**: Progressive frontend framework');
    if (deps?.jest) stack.push('- **Jest**: Testing framework');
    
    return stack.length > 0 ? stack.join('\n') : '- Technology stack to be defined';
  }

  private generateDesignPatterns(packageJson: any, projectAnalysis: any): string[] {
    const patterns: string[] = [];
    
    if (packageJson.dependencies?.inversify) {
      patterns.push('Dependency Injection');
    }
    if (projectAnalysis.hasSource) {
      patterns.push('Modular Architecture');
    }
    if (packageJson.dependencies?.express || packageJson.dependencies?.fastify) {
      patterns.push('MVC Pattern');
    }
    
    return patterns.length > 0 ? patterns : ['Standard Design Patterns'];
  }

  private generateDependencyAnalysis(packageJson: any): string {
    const production = Object.keys(packageJson.dependencies || {});
    const development = Object.keys(packageJson.devDependencies || {});
    
    let analysis = '';
    if (production.length > 0) {
      analysis += `**Production Dependencies:** ${production.length} packages\n`;
      analysis += production.slice(0, 5).map(dep => `- ${dep}`).join('\n');
      if (production.length > 5) analysis += `\n- ... and ${production.length - 5} more`;
    }
    
    if (development.length > 0) {
      analysis += `\n\n**Development Dependencies:** ${development.length} packages\n`;
      analysis += development.slice(0, 5).map(dep => `- ${dep}`).join('\n');
      if (development.length > 5) analysis += `\n- ... and ${development.length - 5} more`;
    }
    
    return analysis || 'Dependencies to be analyzed';
  }

  private generateAPIInterfaces(packageJson: any, projectAnalysis: any): string {
    if (packageJson.dependencies?.express || packageJson.dependencies?.fastify) {
      return `RESTful API endpoints following OpenAPI specification:
- GET /api/health - Health check endpoint
- Authentication and authorization middleware
- Request/response validation
- Error handling middleware`;
    }
    return 'Interface specifications to be defined';
  }

  private generateModuleInterfaces(projectAnalysis: any): string {
    if (projectAnalysis.hasSource) {
      return `Internal module interfaces:
- Clear module boundaries and exports
- Consistent API patterns across modules
- Type definitions for all public interfaces`;
    }
    return 'Module interfaces to be defined';
  }

  private generateEnvVarSpecs(packageJson: any): string {
    const envVars: string[] = [];
    
    if (packageJson.dependencies?.express || packageJson.dependencies?.fastify) {
      envVars.push('- `PORT`: Server port (default: 3000)');
      envVars.push('- `NODE_ENV`: Environment mode (development/production)');
    }
    
    envVars.push('- `LOG_LEVEL`: Logging level (debug/info/warn/error)');
    
    return envVars.join('\n');
  }

  private generateBuildConfig(packageJson: any): string {
    let config = '';
    
    if (packageJson.scripts?.build) {
      config += `Build process: \`${packageJson.scripts.build}\`\n`;
    }
    if (packageJson.scripts?.start) {
      config += `Start command: \`${packageJson.scripts.start}\`\n`;
    }
    if (packageJson.type === 'module') {
      config += 'Module type: ES Modules\n';
    }
    
    return config || 'Build configuration to be defined';
  }

  private generateImplementationTasks(packageJson: any, projectAnalysis: any): any {
    const tasks = {
      development: [],
      integration: [],
      quality: [],
      deployment: []
    };

    // Development tasks
    if (projectAnalysis.hasSource) {
      (tasks.development as any).push({
        title: 'Implement Core Modules',
        subtasks: ['Set up module structure', 'Implement business logic', 'Add error handling'],
        requirements: 'FR-1, FR-2'
      });
    }

    if (packageJson.dependencies?.express) {
      (tasks.development as any).push({
        title: 'Develop API Endpoints',
        subtasks: ['Create route handlers', 'Add middleware', 'Implement validation'],
        requirements: 'FR-2'
      });
    }

    // Integration tasks
    if (packageJson.dependencies?.mongodb || packageJson.dependencies?.mongoose) {
      (tasks.integration as any).push({
        title: 'Database Integration',
        subtasks: ['Set up database connection', 'Create data models', 'Implement queries'],
        requirements: 'NFR-2'
      });
    }

    // Quality tasks
    if (packageJson.scripts?.test) {
      (tasks.quality as any).push({
        title: 'Test Implementation',
        subtasks: ['Write unit tests', 'Add integration tests', 'Ensure test coverage'],
        requirements: 'FR-3, NFR-3'
      });
    }

    if (packageJson.scripts?.lint) {
      (tasks.quality as any).push({
        title: 'Code Quality Assurance',
        subtasks: ['Run linting checks', 'Fix code style issues', 'Add documentation'],
        requirements: 'NFR-3'
      });
    }

    // Deployment tasks
    if (packageJson.scripts?.build) {
      (tasks.deployment as any).push({
        title: 'Build and Package',
        subtasks: ['Run build process', 'Optimize for production', 'Create deployment artifacts'],
        requirements: 'NFR-1'
      });
    }

    (tasks.deployment as any).push({
      title: 'Deployment Configuration',
      subtasks: ['Set up environment variables', 'Configure production settings', 'Deploy to target environment'],
      requirements: 'NFR-1, NFR-2'
    });

    return tasks;
  }
}