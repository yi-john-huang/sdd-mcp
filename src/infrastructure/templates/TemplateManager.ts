// Template library and management system implementation

import { injectable, inject } from 'inversify';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  type TemplateManagerPort, 
  type Template, 
  TemplateCategory,
  TemplateVariableType,
  type TemplateVariable,
  type TemplateValidationResult,
  type TemplateValidationError,
  type TemplateValidationWarning,
  type TemplateRendererPort
} from '../../domain/templates/index.js';
import type { LoggerPort } from '../../domain/ports.js';
import { TYPES } from '../di/types.js';

interface TemplateMetadata {
  readonly id: string;
  readonly name: string;
  readonly category: TemplateCategory;
  readonly description: string;
  readonly variables: TemplateVariable[];
  readonly version: string;
  readonly author?: string;
  readonly tags: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

@injectable()
export class TemplateManager implements TemplateManagerPort {
  private readonly templateCache = new Map<string, Template>();
  private readonly templateDirectory: string;
  private cacheInitialized = false;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.TemplateRendererPort) private readonly renderer: TemplateRendererPort
  ) {
    this.templateDirectory = path.resolve('./templates');
  }

  async getTemplate(id: string): Promise<Template | null> {
    await this.ensureCacheInitialized();
    
    const template = this.templateCache.get(id);
    if (template) {
      this.logger.debug('Template retrieved from cache', { id });
      return template;
    }

    // Try to load from disk if not in cache
    try {
      const template = await this.loadTemplateFromDisk(id);
      if (template) {
        this.templateCache.set(id, template);
        this.logger.debug('Template loaded from disk', { id });
        return template;
      }
    } catch (error) {
      this.logger.error('Failed to load template from disk', error instanceof Error ? error : new Error(String(error)), { 
        id
      });
    }

    return null;
  }

  async getTemplatesByCategory(category: TemplateCategory): Promise<Template[]> {
    await this.ensureCacheInitialized();
    
    const templates = Array.from(this.templateCache.values())
      .filter(template => template.category === category)
      .sort((a, b) => a.name.localeCompare(b.name));

    this.logger.debug('Templates retrieved by category', { category, count: templates.length });
    return templates;
  }

  async searchTemplates(query: string, tags?: string[]): Promise<Template[]> {
    await this.ensureCacheInitialized();
    
    const queryLower = query.toLowerCase();
    const templates = Array.from(this.templateCache.values()).filter(template => {
      const matchesQuery = 
        template.name.toLowerCase().includes(queryLower) ||
        template.description.toLowerCase().includes(queryLower) ||
        template.tags.some(tag => tag.toLowerCase().includes(queryLower));

      const matchesTags = !tags || tags.length === 0 || 
        tags.every(tag => template.tags.includes(tag));

      return matchesQuery && matchesTags;
    });

    this.logger.debug('Templates searched', { query, tags, count: templates.length });
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createTemplate(templateData: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<Template> {
    const now = new Date();
    const id = this.generateTemplateId(templateData.name, templateData.category);
    
    const template: Template = {
      ...templateData,
      id,
      createdAt: now,
      updatedAt: now
    };

    // Validate template before saving
    const validation = await this.validateTemplate(template.template, template.variables);
    if (!validation.isValid) {
      throw new Error(`Template validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Save to disk and cache
    await this.saveTemplateToDisk(template);
    this.templateCache.set(id, template);

    this.logger.info('Template created', { id, name: template.name, category: template.category });
    return template;
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template> {
    const existing = await this.getTemplate(id);
    if (!existing) {
      throw new Error(`Template with id '${id}' not found`);
    }

    const updated: Template = {
      ...existing,
      ...updates,
      id, // Ensure ID cannot be changed
      createdAt: existing.createdAt, // Preserve creation date
      updatedAt: new Date()
    };

    // Validate updated template
    const validation = await this.validateTemplate(updated.template, updated.variables);
    if (!validation.isValid) {
      throw new Error(`Template validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Save to disk and update cache
    await this.saveTemplateToDisk(updated);
    this.templateCache.set(id, updated);

    this.logger.info('Template updated', { id, name: updated.name });
    return updated;
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = await this.getTemplate(id);
    if (!template) {
      throw new Error(`Template with id '${id}' not found`);
    }

    // Remove from disk
    const templatePath = this.getTemplatePath(id);
    try {
      await fs.unlink(templatePath);
      this.templateCache.delete(id);
      this.logger.info('Template deleted', { id, name: template.name });
    } catch (error) {
      this.logger.error('Failed to delete template file', error instanceof Error ? error : new Error(String(error)), { 
        id, 
        path: templatePath
      });
      throw new Error(`Failed to delete template: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async validateTemplate(template: string, variables: TemplateVariable[]): Promise<TemplateValidationResult> {
    const errors: TemplateValidationError[] = [];
    const warnings: TemplateValidationWarning[] = [];

    try {
      // Try to compile the template with Handlebars
      await this.renderer.compile(template, 'validation_template');
      
      // Check for required variables
      const templateVariables = this.extractVariablesFromTemplate(template);
      const definedVariables = new Set(variables.map(v => v.name));
      
      // Check for undefined variables
      for (const usedVar of templateVariables) {
        if (!definedVariables.has(usedVar)) {
          warnings.push({
            message: `Variable '${usedVar}' is used in template but not defined in variables`,
            variable: usedVar,
            suggestion: `Add '${usedVar}' to the template variables`
          });
        }
      }
      
      // Check for unused defined variables
      for (const variable of variables) {
        if (!templateVariables.has(variable.name)) {
          warnings.push({
            message: `Variable '${variable.name}' is defined but not used in template`,
            variable: variable.name,
            suggestion: `Remove '${variable.name}' from template variables or use it in the template`
          });
        }
      }

    } catch (error) {
      errors.push({
        message: `Template compilation error: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async getAllTemplates(): Promise<Template[]> {
    await this.ensureCacheInitialized();
    return Array.from(this.templateCache.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async ensureCacheInitialized(): Promise<void> {
    if (this.cacheInitialized) return;

    try {
      await this.loadAllTemplates();
      this.cacheInitialized = true;
      this.logger.debug('Template cache initialized');
    } catch (error) {
      this.logger.error('Failed to initialize template cache', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async loadAllTemplates(): Promise<void> {
    try {
      await fs.mkdir(this.templateDirectory, { recursive: true });
      
      const files = await fs.readdir(this.templateDirectory, { withFileTypes: true });
      const templateFiles = files
        .filter(file => file.isFile() && file.name.endsWith('.json'))
        .map(file => file.name.replace('.json', ''));

      for (const templateId of templateFiles) {
        try {
          const template = await this.loadTemplateFromDisk(templateId);
          if (template) {
            this.templateCache.set(templateId, template);
          }
        } catch (error) {
          this.logger.warn('Failed to load template', { 
            templateId, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }

      this.logger.info('Templates loaded from disk', { count: this.templateCache.size });
    } catch (error) {
      this.logger.error('Failed to scan template directory', error instanceof Error ? error : new Error(String(error)), { 
        directory: this.templateDirectory
      });
      
      // Create built-in templates if directory doesn't exist
      await this.createBuiltInTemplates();
    }
  }

  private async loadTemplateFromDisk(id: string): Promise<Template | null> {
    const templatePath = this.getTemplatePath(id);
    const templateContentPath = this.getTemplateContentPath(id);

    try {
      const [metadataContent, templateContent] = await Promise.all([
        fs.readFile(templatePath, 'utf-8'),
        fs.readFile(templateContentPath, 'utf-8')
      ]);

      const metadata: TemplateMetadata = JSON.parse(metadataContent);
      
      return {
        ...metadata,
        template: templateContent,
        createdAt: new Date(metadata.createdAt),
        updatedAt: new Date(metadata.updatedAt)
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error('Error loading template from disk', error instanceof Error ? error : new Error(String(error)), { 
          id, 
          path: templatePath
        });
      }
      return null;
    }
  }

  private async saveTemplateToDisk(template: Template): Promise<void> {
    const templatePath = this.getTemplatePath(template.id);
    const templateContentPath = this.getTemplateContentPath(template.id);

    const metadata: TemplateMetadata = {
      id: template.id,
      name: template.name,
      category: template.category,
      description: template.description,
      variables: template.variables,
      version: template.version,
      author: template.author,
      tags: template.tags,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    };

    try {
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await Promise.all([
        fs.writeFile(templatePath, JSON.stringify(metadata, null, 2)),
        fs.writeFile(templateContentPath, template.template)
      ]);
    } catch (error) {
      this.logger.error('Failed to save template to disk', error instanceof Error ? error : new Error(String(error)), { 
        id: template.id, 
        path: templatePath
      });
      throw error;
    }
  }

  private getTemplatePath(id: string): string {
    return path.join(this.templateDirectory, `${id}.json`);
  }

  private getTemplateContentPath(id: string): string {
    return path.join(this.templateDirectory, `${id}.hbs`);
  }

  private generateTemplateId(name: string, category: TemplateCategory): string {
    const timestamp = Date.now().toString(36);
    const nameSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    return `${category}-${nameSlug}-${timestamp}`;
  }

  private extractVariablesFromTemplate(template: string): Set<string> {
    const variables = new Set<string>();
    
    // Match Handlebars variables: {{variable}}, {{#each items}}, {{#if condition}}, etc.
    const variableRegex = /\{\{(?:#(?:each|if|unless|with)\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)/g;
    let match;
    
    while ((match = variableRegex.exec(template)) !== null) {
      const variable = match[1].split('.')[0]; // Get root variable name
      if (variable !== 'this' && !variable.startsWith('@')) {
        variables.add(variable);
      }
    }
    
    return variables;
  }

  private async createBuiltInTemplates(): Promise<void> {
    const builtInTemplates = await this.getBuiltInTemplates();
    
    for (const templateData of builtInTemplates) {
      try {
        await this.createTemplate(templateData);
      } catch (error) {
        this.logger.warn('Failed to create built-in template', { 
          name: templateData.name, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  }

  private async getBuiltInTemplates(): Promise<Array<Omit<Template, 'id' | 'createdAt' | 'updatedAt'>>> {
    return [
      {
        name: 'spec-json',
        category: TemplateCategory.SPECIFICATION,
        description: 'SDD specification JSON template',
        template: await this.getSpecJsonTemplate(),
        variables: [
          { name: 'name', type: TemplateVariableType.STRING, description: 'Project name', required: true },
          { name: 'description', type: TemplateVariableType.STRING, description: 'Project description', required: false },
          { name: 'author', type: TemplateVariableType.STRING, description: 'Project author', required: false }
        ],
        version: '1.0.0',
        tags: ['sdd', 'specification', 'json']
      },
      {
        name: 'requirements-md',
        category: TemplateCategory.REQUIREMENTS,
        description: 'SDD requirements document template',
        template: await this.getRequirementsTemplate(),
        variables: [
          { name: 'projectName', type: TemplateVariableType.STRING, description: 'Project name', required: true },
          { name: 'requirements', type: TemplateVariableType.ARRAY, description: 'List of requirements', required: true }
        ],
        version: '1.0.0',
        tags: ['sdd', 'requirements', 'markdown']
      },
      {
        name: 'design-md',
        category: TemplateCategory.DESIGN,
        description: 'SDD design document template',
        template: await this.getDesignTemplate(),
        variables: [
          { name: 'projectName', type: TemplateVariableType.STRING, description: 'Project name', required: true },
          { name: 'architecture', type: TemplateVariableType.STRING, description: 'Architecture description', required: true },
          { name: 'components', type: TemplateVariableType.ARRAY, description: 'System components', required: true }
        ],
        version: '1.0.0',
        tags: ['sdd', 'design', 'markdown']
      },
      {
        name: 'tasks-md',
        category: TemplateCategory.TASKS,
        description: 'SDD tasks document template',
        template: await this.getTasksTemplate(),
        variables: [
          { name: 'projectName', type: TemplateVariableType.STRING, description: 'Project name', required: true },
          { name: 'tasks', type: TemplateVariableType.ARRAY, description: 'List of tasks', required: true }
        ],
        version: '1.0.0',
        tags: ['sdd', 'tasks', 'markdown']
      },
      {
        name: 'product-steering',
        category: TemplateCategory.STEERING,
        description: 'Product steering document template',
        template: await this.getProductSteeringTemplate(),
        variables: [
          { name: 'productName', type: TemplateVariableType.STRING, description: 'Product name', required: true },
          { name: 'vision', type: TemplateVariableType.STRING, description: 'Product vision', required: true },
          { name: 'goals', type: TemplateVariableType.ARRAY, description: 'Product goals', required: true }
        ],
        version: '1.0.0',
        tags: ['steering', 'product', 'markdown']
      },
      {
        name: 'tech-steering',
        category: TemplateCategory.STEERING,
        description: 'Technical steering document template',
        template: await this.getTechSteeringTemplate(),
        variables: [
          { name: 'projectName', type: TemplateVariableType.STRING, description: 'Project name', required: true },
          { name: 'techStack', type: TemplateVariableType.ARRAY, description: 'Technology stack', required: true },
          { name: 'architecture', type: TemplateVariableType.STRING, description: 'Architecture pattern', required: true }
        ],
        version: '1.0.0',
        tags: ['steering', 'technical', 'markdown']
      },
      {
        name: 'structure-steering',
        category: TemplateCategory.STEERING,
        description: 'Structure steering document template',
        template: await this.getStructureSteeringTemplate(),
        variables: [
          { name: 'projectName', type: TemplateVariableType.STRING, description: 'Project name', required: true },
          { name: 'structure', type: TemplateVariableType.OBJECT, description: 'Project structure', required: true }
        ],
        version: '1.0.0',
        tags: ['steering', 'structure', 'markdown']
      },
      {
        name: 'linus-review-steering',
        category: TemplateCategory.STEERING,
        description: 'Linus-style code review steering document template',
        template: await this.getLinusReviewTemplate(),
        variables: [
          { name: 'projectName', type: TemplateVariableType.STRING, description: 'Project name', required: true }
        ],
        version: '1.0.0',
        tags: ['steering', 'code-review', 'linus', 'quality']
      }
    ];
  }

  // Template content methods
  private async getSpecJsonTemplate(): Promise<string> {
    return `{
  "name": "{{name}}",
  "description": "{{#if description}}{{description}}{{else}}{{name}} specification{{/if}}",
  "version": "1.0.0",
  "author": "{{#if author}}{{author}}{{else}}Unknown{{/if}}",
  "createdAt": "{{formatDate context.timestamp}}",
  "phase": "INIT",
  "approved": {
    "requirements": false,
    "design": false,
    "tasks": false
  },
  "metadata": {
    "projectId": "{{generateId}}",
    "basePath": "{{context.project.basePath}}",
    "technology": [],
    "complexity": "moderate"
  }
}`;
  }

  private async getRequirementsTemplate(): Promise<string> {
    return `# {{projectName}} - Requirements

## Overview
This document outlines the requirements for {{projectName}}.

## Functional Requirements
{{#each requirements}}
### {{@index}}. {{title}}
{{description}}

**Acceptance Criteria:**
{{#each acceptanceCriteria}}
- {{this}}
{{/each}}

{{/each}}

## Non-Functional Requirements
- Performance: Response time under 200ms
- Scalability: Support 1000+ concurrent users
- Reliability: 99.9% uptime
- Security: Secure authentication and authorization

## Dependencies
{{#if dependencies}}
{{#each dependencies}}
- {{name}}: {{description}}
{{/each}}
{{else}}
No external dependencies identified.
{{/if}}

## Assumptions
{{#if assumptions}}
{{#each assumptions}}
- {{this}}
{{/each}}
{{else}}
No assumptions documented.
{{/if}}

---
*Generated on {{formatDate context.timestamp}} using SDD MCP Server*`;
  }

  private async getDesignTemplate(): Promise<string> {
    return `# {{projectName}} - Design Document

## Architecture Overview
{{architecture}}

## System Components
{{#each components}}
### {{name}}
**Purpose:** {{purpose}}
**Responsibilities:**
{{#each responsibilities}}
- {{this}}
{{/each}}

**Interfaces:**
{{#each interfaces}}
- {{name}}: {{description}}
{{/each}}

{{/each}}

## Data Models
{{#if dataModels}}
{{#each dataModels}}
### {{name}}
\`\`\`typescript
{{schema}}
\`\`\`
{{/each}}
{{else}}
Data models to be defined during implementation.
{{/if}}

## API Design
{{#if apis}}
{{#each apis}}
### {{name}}
- **Method:** {{method}}
- **Path:** {{path}}
- **Description:** {{description}}
{{/each}}
{{else}}
API design to be defined during implementation.
{{/if}}

## Security Considerations
- Authentication and authorization mechanisms
- Data validation and sanitization
- Secure communication protocols

## Performance Considerations
- Caching strategies
- Database optimization
- Load balancing

---
*Generated on {{formatDate context.timestamp}} using SDD MCP Server*`;
  }

  private async getTasksTemplate(): Promise<string> {
    return `# {{projectName}} - Implementation Tasks

## Task Breakdown
{{#each tasks}}
### {{@index}}. {{title}}
{{taskStatus completed}} **{{title}}**

**Description:** {{description}}

**Subtasks:**
{{#each subtasks}}
- {{taskStatus completed}} {{title}}
{{/each}}

**Dependencies:**
{{#if dependencies}}
{{#each dependencies}}
- Task {{this}}
{{/each}}
{{else}}
None
{{/if}}

**Estimated Effort:** {{effort}} hours

---
{{/each}}

## Progress Summary
- **Total Tasks:** {{length tasks}}
- **Completed:** {{#each tasks}}{{#if completed}}1{{/if}}{{/each}}
- **Remaining:** {{#each tasks}}{{#unless completed}}1{{/unless}}{{/each}}

---
*Generated on {{formatDate context.timestamp}} using SDD MCP Server*`;
  }

  private async getProductSteeringTemplate(): Promise<string> {
    return `# Product Steering - {{productName}}

## Vision
{{vision}}

## Goals
{{#each goals}}
- {{this}}
{{/each}}

## Success Metrics
{{#if metrics}}
{{#each metrics}}
- {{name}}: {{target}}
{{/each}}
{{else}}
Success metrics to be defined.
{{/if}}

## Target Users
{{#if users}}
{{#each users}}
- **{{name}}**: {{description}}
{{/each}}
{{else}}
Target users to be identified.
{{/if}}

## Constraints
{{#if constraints}}
{{#each constraints}}
- {{this}}
{{/each}}
{{else}}
No constraints identified.
{{/if}}

---
*Product steering document for {{productName}}*`;
  }

  private async getTechSteeringTemplate(): Promise<string> {
    return `# Technical Steering - {{projectName}}

## Technology Stack
{{#each techStack}}
- **{{category}}**: {{name}} {{#if version}}({{version}}){{/if}}
{{/each}}

## Architecture Pattern
{{architecture}}

## Development Guidelines
- Follow clean architecture principles
- Implement comprehensive testing
- Use TypeScript for type safety
- Follow SOLID principles

## Code Quality Standards
- ESLint configuration for code consistency
- Prettier for code formatting
- Husky for pre-commit hooks
- Jest for unit testing

## Performance Requirements
- Response time: < 200ms
- Memory usage: < 512MB
- CPU usage: < 80%

---
*Technical steering document for {{projectName}}*`;
  }

  private async getStructureSteeringTemplate(): Promise<string> {
    return `# Structure Steering - {{projectName}}

## Directory Structure
{{#each structure.directories}}
- **{{path}}**: {{purpose}}
{{/each}}

## File Organization
{{#each structure.fileTypes}}
- **{{extension}}**: {{location}} - {{purpose}}
{{/each}}

## Naming Conventions
- Files: kebab-case
- Directories: kebab-case
- Classes: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE

## Import/Export Patterns
- Use absolute imports from src/
- Export interfaces and types explicitly
- Barrel exports for public APIs

---
*Structure steering document for {{projectName}}*`;
  }

  private async getLinusReviewTemplate(): Promise<string> {
    return `# Linus-Style Code Review Standards - {{projectName}}

## Code Review Philosophy
"Good code is not just code that works, but code that is readable, maintainable, and elegant."

## Five-Layer Analysis Framework

### 1. Taste (Good/Passable/Garbage)
- **Good**: Elegant, simple, intuitive
- **Passable**: Functional but could be better
- **Garbage**: Overcomplicated, unclear, problematic

### 2. Complexity Analysis
- Eliminate unnecessary complexity
- Prefer simple solutions over clever ones
- Maximum cyclomatic complexity: 10
- Maximum nesting depth: 4

### 3. Special Cases
- Identify and eliminate special-case handling
- Generalize solutions when possible
- Avoid magic numbers and hard-coded values

### 4. Data Structures
- Choose appropriate data structures
- Optimize for access patterns
- Consider memory usage and performance

### 5. Code Organization
- Single responsibility principle
- Clear separation of concerns
- Intuitive naming and structure

## Review Criteria

### Immediate Rejection
- Code that doesn't compile
- Missing tests for new functionality
- Obvious security vulnerabilities
- Memory leaks or resource leaks

### Strong Criticism
- Overly complex solutions
- Poor error handling
- Inconsistent coding style
- Missing documentation

### Feedback Areas
- Performance optimizations
- Code readability improvements
- Architecture suggestions
- Best practice recommendations

## Standards

### Performance
- O(n) or better for critical paths
- Avoid nested loops when possible
- Profile before optimizing

### Maintainability
- Self-documenting code
- Clear variable and function names
- Minimal cognitive load

### Reliability
- Comprehensive error handling
- Input validation
- Graceful degradation

---
*"The best code is code that doesn't need to be written, but if it must be written, make it beautiful."*

*Linus-style review standards for {{projectName}}*`;
  }
}