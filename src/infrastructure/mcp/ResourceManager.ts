import { injectable, inject } from 'inversify';
import { 
  Resource, 
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ResourceContents,
  TextResourceContents,
  BlobResourceContents
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../di/types.js';
import { FileSystemPort, LoggerPort } from '../../domain/ports.js';
import { ProjectService } from '../../application/services/ProjectService.js';

@injectable()
export class ResourceManager {
  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.ProjectService) private readonly projectService: ProjectService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  async listResources(): Promise<Resource[]> {
    const correlationId = uuidv4();
    
    this.logger.info('Listing available resources', { correlationId });

    const projects = await this.projectService.listProjects();
    const resources: Resource[] = [];

    // Add project-specific resources
    for (const project of projects) {
      const baseUri = `sdd://project/${project.id}`;
      
      resources.push(
        {
          uri: `${baseUri}/spec.json`,
          name: `${project.name} - Project Specification`,
          description: 'Project metadata and workflow status',
          mimeType: 'application/json'
        },
        {
          uri: `${baseUri}/requirements.md`,
          name: `${project.name} - Requirements`,
          description: 'Project requirements document',
          mimeType: 'text/markdown'
        },
        {
          uri: `${baseUri}/design.md`,
          name: `${project.name} - Design`,
          description: 'Technical design document',
          mimeType: 'text/markdown'
        },
        {
          uri: `${baseUri}/tasks.md`,
          name: `${project.name} - Tasks`,
          description: 'Implementation task list',
          mimeType: 'text/markdown'
        }
      );
    }

    // Add global resources
    resources.push(
      {
        uri: 'sdd://templates/spec.json',
        name: 'SDD Project Specification Template',
        description: 'Template for project spec.json files',
        mimeType: 'application/json'
      },
      {
        uri: 'sdd://templates/requirements.md',
        name: 'SDD Requirements Template',
        description: 'Template for requirements documents',
        mimeType: 'text/markdown'
      },
      {
        uri: 'sdd://steering/linus-review.md',
        name: 'Linus-style Code Review Guidelines',
        description: 'Code quality and review guidelines',
        mimeType: 'text/markdown'
      }
    );

    this.logger.info('Resource listing completed', {
      correlationId,
      resourceCount: resources.length
    });

    return resources;
  }

  async readResource(uri: string): Promise<ResourceContents> {
    const correlationId = uuidv4();
    
    this.logger.info('Reading resource', { correlationId, uri });

    try {
      if (uri.startsWith('sdd://project/')) {
        return await this.readProjectResource(uri);
      } else if (uri.startsWith('sdd://templates/')) {
        return await this.readTemplateResource(uri);
      } else if (uri.startsWith('sdd://steering/')) {
        return await this.readSteeringResource(uri);
      } else {
        throw new Error(`Unsupported resource URI: ${uri}`);
      }
    } catch (error) {
      this.logger.error('Failed to read resource', error as Error, {
        correlationId,
        uri
      });
      throw error;
    }
  }

  private async readProjectResource(uri: string): Promise<ResourceContents> {
    const match = uri.match(/^sdd:\/\/project\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error('Invalid project resource URI format');
    }

    const [, projectId, fileName] = match;
    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const filePath = `${project.path}/.spec/specs/${project.name}/${fileName}`;
    
    try {
      if (await this.fileSystem.exists(filePath)) {
        const content = await this.fileSystem.readFile(filePath);
        return {
          uri,
          mimeType: fileName.endsWith('.json') ? 'application/json' : 'text/markdown',
          text: content
        } as TextResourceContents;
      } else {
        // Return template if file doesn't exist yet
        return await this.generateProjectResourceTemplate(project, fileName, uri);
      }
    } catch (error) {
      throw new Error(`Failed to read project resource: ${(error as Error).message}`);
    }
  }

  private async readTemplateResource(uri: string): Promise<ResourceContents> {
    const templates: Record<string, string> = {
      'sdd://templates/spec.json': JSON.stringify({
        feature_name: "{{project.name}}",
        created_at: "{{timestamp}}",
        updated_at: "{{timestamp}}",
        language: "{{project.metadata.language}}",
        phase: "{{project.phase}}",
        approvals: {
          requirements: { generated: false, approved: false },
          design: { generated: false, approved: false },
          tasks: { generated: false, approved: false }
        },
        ready_for_implementation: false
      }, null, 2),
      'sdd://templates/requirements.md': `# Requirements Document

## Introduction
{{project.name}} - Requirements specification

## Requirements

### Requirement 1: [Title]
**Objective:** [Objective statement]

#### Acceptance Criteria
1. WHEN [condition] THEN [expected behavior]
2. WHERE [context] THE system SHALL [requirement]
3. IF [condition] THEN [expected result]
`
    };

    const content = templates[uri];
    if (!content) {
      throw new Error(`Template not found: ${uri}`);
    }

    return {
      uri,
      mimeType: uri.endsWith('.json') ? 'application/json' : 'text/markdown',
      text: content
    } as TextResourceContents;
  }

  private async readSteeringResource(uri: string): Promise<ResourceContents> {
    if (uri === 'sdd://steering/linus-review.md') {
      const steeringPath = '.spec/steering/linus-review.md';
      
      if (await this.fileSystem.exists(steeringPath)) {
        const content = await this.fileSystem.readFile(steeringPath);
        return {
          uri,
          mimeType: 'text/markdown',
          text: content
        } as TextResourceContents;
      }
    }

    throw new Error(`Steering resource not found: ${uri}`);
  }

  private async generateProjectResourceTemplate(
    project: any,
    fileName: string,
    uri: string
  ): Promise<ResourceContents> {
    let content: string;

    switch (fileName) {
      case 'spec.json':
        content = JSON.stringify({
          feature_name: project.name,
          created_at: project.metadata.createdAt,
          updated_at: project.metadata.updatedAt,
          language: project.metadata.language,
          phase: project.phase,
          approvals: project.metadata.approvals,
          ready_for_implementation: project.phase === 'implementation-ready'
        }, null, 2);
        break;
      
      case 'requirements.md':
        content = `# Requirements Document\n\n## Introduction\n${project.name} - Requirements specification\n\n## Requirements\n\n[Requirements to be defined...]`;
        break;
      
      case 'design.md':
        content = `# Technical Design Document\n\n## Project: ${project.name}\n\n[Design to be defined...]`;
        break;
      
      case 'tasks.md':
        content = `# Implementation Plan\n\n[Tasks to be defined...]`;
        break;
      
      default:
        throw new Error(`Unknown resource file: ${fileName}`);
    }

    return {
      uri,
      mimeType: fileName.endsWith('.json') ? 'application/json' : 'text/markdown',
      text: content
    } as TextResourceContents;
  }
}