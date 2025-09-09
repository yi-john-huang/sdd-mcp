// Adapter layer for integrating SDD tools with MCP protocol

import { injectable, inject } from 'inversify';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TYPES } from '../../infrastructure/di/types.js';
import { ProjectService } from '../../application/services/ProjectService.js';
import { WorkflowService } from '../../application/services/WorkflowService.js';
import { TemplateService } from '../../application/services/TemplateService.js';
import { QualityService } from '../../application/services/QualityService.js';
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
}