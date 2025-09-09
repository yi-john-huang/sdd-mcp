import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { Project } from '../../domain/types.js';
import { 
  TemplateEngine, 
  FileSystemPort, 
  LoggerPort 
} from '../../domain/ports.js';

export interface TemplateData {
  project: Project;
  timestamp: string;
  [key: string]: unknown;
}

@injectable()
export class TemplateService {
  constructor(
    @inject(TYPES.TemplateEngine) private readonly templateEngine: TemplateEngine,
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
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

    const data: TemplateData = {
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

    const data: TemplateData = {
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

    const data: TemplateData = {
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

    const data: TemplateData = {
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