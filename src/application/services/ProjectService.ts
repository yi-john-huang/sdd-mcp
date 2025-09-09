import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { 
  Project, 
  WorkflowPhase, 
  ProjectMetadata, 
  PhaseApprovals 
} from '../../domain/types.js';
import { 
  ProjectRepository, 
  FileSystemPort, 
  ValidationPort, 
  LoggerPort 
} from '../../domain/ports.js';
import { projectSchema } from '../../infrastructure/schemas/project.schema.js';

@injectable()
export class ProjectService {
  constructor(
    @inject(TYPES.ProjectRepository) private readonly projectRepository: ProjectRepository,
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.ValidationPort) private readonly validation: ValidationPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  async createProject(name: string, path: string, language = 'en'): Promise<Project> {
    const correlationId = uuidv4();
    
    this.logger.info('Creating new project', {
      correlationId,
      name,
      path,
      language
    });

    const project: Project = {
      id: uuidv4(),
      name,
      path,
      phase: WorkflowPhase.INIT,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        language,
        approvals: {
          requirements: { generated: false, approved: false },
          design: { generated: false, approved: false },
          tasks: { generated: false, approved: false }
        }
      }
    };

    // Validate project data
    await this.validation.validate(project, projectSchema);

    // Create project directory structure
    await this.createProjectStructure(project.path);

    // Save project
    await this.projectRepository.save(project);

    this.logger.info('Project created successfully', {
      correlationId,
      projectId: project.id
    });

    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    return await this.projectRepository.findById(id);
  }

  async getProjectByPath(path: string): Promise<Project | null> {
    return await this.projectRepository.findByPath(path);
  }

  async listProjects(): Promise<Project[]> {
    return await this.projectRepository.list();
  }

  async updateProjectPhase(projectId: string, phase: WorkflowPhase): Promise<Project> {
    const correlationId = uuidv4();
    
    this.logger.info('Updating project phase', {
      correlationId,
      projectId,
      phase
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const updatedProject: Project = {
      ...project,
      phase,
      metadata: {
        ...project.metadata,
        updatedAt: new Date()
      }
    };

    await this.validation.validate(updatedProject, projectSchema);
    await this.projectRepository.save(updatedProject);

    this.logger.info('Project phase updated successfully', {
      correlationId,
      projectId,
      phase
    });

    return updatedProject;
  }

  async updateApprovalStatus(
    projectId: string, 
    phaseType: keyof PhaseApprovals, 
    status: Partial<{ generated: boolean; approved: boolean }>
  ): Promise<Project> {
    const correlationId = uuidv4();
    
    this.logger.info('Updating approval status', {
      correlationId,
      projectId,
      phaseType,
      status
    });

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const updatedProject: Project = {
      ...project,
      metadata: {
        ...project.metadata,
        updatedAt: new Date(),
        approvals: {
          ...project.metadata.approvals,
          [phaseType]: {
            ...project.metadata.approvals[phaseType],
            ...status
          }
        }
      }
    };

    await this.validation.validate(updatedProject, projectSchema);
    await this.projectRepository.save(updatedProject);

    this.logger.info('Approval status updated successfully', {
      correlationId,
      projectId,
      phaseType
    });

    return updatedProject;
  }

  private async createProjectStructure(basePath: string): Promise<void> {
    const directories = [
      `${basePath}/.kiro/specs`,
      `${basePath}/.kiro/steering`,
      `${basePath}/.claude/commands`
    ];

    for (const dir of directories) {
      if (!(await this.fileSystem.exists(dir))) {
        await this.fileSystem.mkdir(dir);
      }
    }
  }
}