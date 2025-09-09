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
    const template = `# Requirements Document

## Introduction
{{project.name}} - Requirements specification for {{project.metadata.language}} locale.

Generated on: {{timestamp}}

## Requirements

### Requirement 1: [Title]
**Objective:** [Objective statement]

#### Acceptance Criteria
1. WHEN [condition] THEN [expected behavior]
2. WHERE [context] THE system SHALL [requirement]
3. IF [condition] THEN [expected result]

[Additional requirements to be added...]
`;

    const data: LegacyTemplateData = {
      project,
      timestamp: new Date().toISOString()
    };

    return await this.templateEngine.render(template, data);
  }

  async generateDesignTemplate(project: Project): Promise<string> {
    const template = `# Technical Design Document

## Project: {{project.name}}

Generated on: {{timestamp}}

## Architecture Overview

### System Architecture
[Architecture description]

### Key Components
[Component descriptions]

### Data Models
[Data model definitions]

## Implementation Details

### Technology Stack
[Technology decisions]

### Design Patterns
[Pattern choices and rationale]

## Interface Specifications

### API Interfaces
[Interface definitions]

### Data Schemas
[Schema specifications]
`;

    const data: LegacyTemplateData = {
      project,
      timestamp: new Date().toISOString()
    };

    return await this.templateEngine.render(template, data);
  }

  async generateTasksTemplate(project: Project): Promise<string> {
    const template = `# Implementation Plan

Generated on: {{timestamp}}

- [ ] 1. [Main Task Title]
  - [Subtask description]
  - [Subtask description]
  - _Requirements: [requirement references]_

- [ ] 2. [Next Task Title]
  - [Subtask description]
  - [Subtask description]
  - _Requirements: [requirement references]_

[Additional tasks to be added...]
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
      permissions: options?.permissions,
      atomic: options?.atomic ?? true
    };

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
      permissions: options?.permissions,
      atomic: options?.atomic ?? true
    };

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
    const context: TemplateContext = {
      project: {
        name: projectName,
        description,
        id: `${projectName}-${Date.now()}`,
        basePath: projectPath
      },
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
      return approvals.requirements.approved && 
             approvals.design.approved && 
             approvals.tasks.approved;
    });

    this.templateEngine.registerHelper('formatDate', (date: Date) => {
      return date.toISOString();
    });
  }
}