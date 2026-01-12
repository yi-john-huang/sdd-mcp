import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { 
  Project, 
  WorkflowPhase 
} from '../../domain/types.js';
import { 
  FileSystemPort, 
  ValidationPort, 
  LoggerPort 
} from '../../domain/ports.js';
import { ProjectService } from './ProjectService.js';
import { TemplateService } from './TemplateService.js';

export interface ProjectInitializationOptions {
  name: string;
  path: string;
  language?: 'en' | 'ja' | 'zh-TW';
  description?: string;
  technology?: string;
  template?: 'basic' | 'api' | 'web' | 'library';
}

export interface ProjectDiscoveryResult {
  exists: boolean;
  project?: Project;
  hasValidStructure: boolean;
  missingDirectories?: string[];
  missingFiles?: string[];
}

export interface ProjectValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  recommendations: string[];
}

@injectable()
export class ProjectInitializationService {
  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.ProjectService) private readonly projectService: ProjectService,
    @inject(TYPES.TemplateService) private readonly templateService: TemplateService,
    @inject(TYPES.ValidationPort) private readonly validation: ValidationPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  async initializeProject(options: ProjectInitializationOptions): Promise<{
    success: boolean;
    project?: Project;
    message: string;
    createdFiles: string[];
  }> {
    const correlationId = uuidv4();
    
    this.logger.info('Initializing new SDD project', {
      correlationId,
      name: options.name,
      path: options.path,
      language: options.language,
      template: options.template
    });

    const createdFiles: string[] = [];

    try {
      // Validate options
      await this.validateInitializationOptions(options);

      // Check if project already exists
      const discovery = await this.discoverExistingProject(options.path);
      if (discovery.exists && discovery.project) {
        return {
          success: false,
          message: `Project already exists at ${options.path}`,
          createdFiles: []
        };
      }

      // Create project directory structure
      const directories = await this.createDirectoryStructure(options.path);
      
      // Create new project
      const project = await this.projectService.createProject(
        options.name,
        options.path,
        options.language || 'en'
      );

      // Generate initial project files
      const generatedFiles = await this.generateInitialFiles(project, options);
      createdFiles.push(...directories, ...generatedFiles);

      // Validate project setup
      const validation = await this.validateProjectSetup(project);
      if (!validation.isValid) {
        this.logger.warn('Project validation issues found', {
          correlationId,
          projectId: project.id,
          issues: validation.issues
        });
      }

      this.logger.info('Project initialization completed successfully', {
        correlationId,
        projectId: project.id,
        filesCreated: createdFiles.length
      });

      return {
        success: true,
        project,
        message: `Project "${options.name}" initialized successfully`,
        createdFiles
      };

    } catch (error) {
      this.logger.error('Project initialization failed', error as Error, {
        correlationId,
        name: options.name,
        path: options.path
      });

      return {
        success: false,
        message: `Failed to initialize project: ${(error as Error).message}`,
        createdFiles
      };
    }
  }

  async discoverExistingProject(projectPath: string): Promise<ProjectDiscoveryResult> {
    const correlationId = uuidv4();
    
    this.logger.debug('Discovering existing project', {
      correlationId,
      projectPath
    });

    try {
      // Check for existing project by path
      const existingProject = await this.projectService.getProjectByPath(projectPath);
      
      // Check directory structure
      const requiredDirectories = [
        `${projectPath}/.spec`,
        `${projectPath}/.spec/specs`,
        `${projectPath}/.spec/steering`
      ];

      const missingDirectories: string[] = [];
      const hasValidStructure = await this.checkDirectoryStructure(
        requiredDirectories, 
        missingDirectories
      );

      // Check for required files
      const requiredFiles = [
        `${projectPath}/.spec/specs/spec.json`
      ];

      const missingFiles: string[] = [];
      for (const file of requiredFiles) {
        if (!(await this.fileSystem.exists(file))) {
          missingFiles.push(file);
        }
      }

      const result: ProjectDiscoveryResult = {
        exists: !!existingProject,
        hasValidStructure
      };

      if (existingProject) {
        result.project = existingProject;
      }
      if (missingDirectories.length > 0) {
        result.missingDirectories = missingDirectories;
      }
      if (missingFiles.length > 0) {
        result.missingFiles = missingFiles;
      }

      this.logger.debug('Project discovery completed', {
        correlationId,
        projectPath,
        exists: result.exists,
        hasValidStructure: result.hasValidStructure
      });

      return result;

    } catch (error) {
      this.logger.error('Project discovery failed', error as Error, {
        correlationId,
        projectPath
      });

      return {
        exists: false,
        hasValidStructure: false,
        missingDirectories: ['Unable to check directories'],
        missingFiles: ['Unable to check files']
      };
    }
  }

  async validateProjectSetup(project: Project): Promise<ProjectValidationResult> {
    const correlationId = uuidv4();
    
    this.logger.debug('Validating project setup', {
      correlationId,
      projectId: project.id
    });

    const issues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check directory structure
      const requiredDirectories = [
        `${project.path}/.spec`,
        `${project.path}/.spec/specs`,
        `${project.path}/.spec/specs/${project.name}`,
        `${project.path}/.spec/steering`
      ];

      for (const dir of requiredDirectories) {
        if (!(await this.fileSystem.exists(dir))) {
          issues.push(`Missing required directory: ${dir}`);
        }
      }

      // Check required files
      const specJsonPath = `${project.path}/.spec/specs/${project.name}/spec.json`;
      if (!(await this.fileSystem.exists(specJsonPath))) {
        issues.push(`Missing spec.json file: ${specJsonPath}`);
      } else {
        try {
          const specContent = await this.fileSystem.readFile(specJsonPath);
          JSON.parse(specContent); // Validate JSON format
        } catch {
          issues.push(`Invalid JSON format in spec.json: ${specJsonPath}`);
        }
      }

      // Check for steering files
      const steeringFiles = [
        `${project.path}/.spec/steering/product.md`,
        `${project.path}/.spec/steering/tech.md`,
        `${project.path}/.spec/steering/structure.md`
      ];

      let steeringCount = 0;
      for (const file of steeringFiles) {
        if (await this.fileSystem.exists(file)) {
          steeringCount++;
        }
      }

      if (steeringCount === 0) {
        warnings.push('No steering documents found - consider creating them for better AI guidance');
        recommendations.push('Run steering document generation tools to create project guidance');
      }

      // Check project metadata consistency
      if (project.phase !== WorkflowPhase.INIT) {
        warnings.push(`Project phase is ${project.phase} but should be INIT for new projects`);
      }

      const { approvals } = project.metadata;
      if (approvals.requirements.generated || approvals.design.generated || approvals.tasks.generated) {
        warnings.push('New project has pre-existing approval flags - this may indicate data inconsistency');
      }

      // Recommendations for new projects
      if (issues.length === 0) {
        recommendations.push('Project setup is valid - ready to begin requirements phase');
        recommendations.push('Consider adding a README.md file to document project purpose');
        recommendations.push('Set up version control (git) if not already configured');
      }

      this.logger.debug('Project validation completed', {
        correlationId,
        projectId: project.id,
        issueCount: issues.length,
        warningCount: warnings.length
      });

      return {
        isValid: issues.length === 0,
        issues,
        warnings,
        recommendations
      };

    } catch (error) {
      this.logger.error('Project validation failed', error as Error, {
        correlationId,
        projectId: project.id
      });

      return {
        isValid: false,
        issues: [`Validation error: ${(error as Error).message}`],
        warnings: [],
        recommendations: []
      };
    }
  }

  async repairProjectStructure(
    project: Project, 
    issues: string[]
  ): Promise<{
    success: boolean;
    repairedItems: string[];
    remainingIssues: string[];
  }> {
    const correlationId = uuidv4();
    
    this.logger.info('Repairing project structure', {
      correlationId,
      projectId: project.id,
      issueCount: issues.length
    });

    const repairedItems: string[] = [];
    const remainingIssues: string[] = [];

    for (const issue of issues) {
      try {
        if (issue.includes('Missing required directory:')) {
          const dirPath = issue.split(': ')[1];
          if (dirPath) {
            await this.fileSystem.mkdir(dirPath);
            repairedItems.push(`Created directory: ${dirPath}`);
          } else {
            remainingIssues.push(issue);
          }
        } else if (issue.includes('Missing spec.json file:')) {
          const specContent = await this.templateService.generateSpecJson(project);
          await this.templateService.writeProjectFile(project, 'spec.json', specContent);
          repairedItems.push('Created spec.json file');
        } else {
          remainingIssues.push(issue);
        }
      } catch (error) {
        this.logger.error('Failed to repair issue', error as Error, {
          correlationId,
          issue
        });
        remainingIssues.push(issue);
      }
    }

    this.logger.info('Project structure repair completed', {
      correlationId,
      projectId: project.id,
      repairedCount: repairedItems.length,
      remainingCount: remainingIssues.length
    });

    return {
      success: remainingIssues.length < issues.length,
      repairedItems,
      remainingIssues
    };
  }

  async getProjectStatus(projectPath: string): Promise<{
    discovery: ProjectDiscoveryResult;
    validation?: ProjectValidationResult;
    recommendations: string[];
  }> {
    const discovery = await this.discoverExistingProject(projectPath);
    let validation: ProjectValidationResult | undefined;
    const recommendations: string[] = [];

    if (discovery.project) {
      validation = await this.validateProjectSetup(discovery.project);
      recommendations.push(...validation.recommendations);
    } else if (discovery.hasValidStructure) {
      recommendations.push('Project structure exists but no project metadata found');
      recommendations.push('Consider running project initialization to restore metadata');
    } else {
      recommendations.push('No SDD project found at this path');
      recommendations.push('Run sdd-init to initialize a new SDD project');
    }

    const result: { discovery: ProjectDiscoveryResult; validation?: ProjectValidationResult; recommendations: string[] } = {
      discovery,
      recommendations
    };

    if (validation) {
      result.validation = validation;
    }

    return result;
  }

  private async validateInitializationOptions(options: ProjectInitializationOptions): Promise<void> {
    if (!options.name || options.name.trim() === '') {
      throw new Error('Project name is required');
    }

    if (!options.path || options.path.trim() === '') {
      throw new Error('Project path is required');
    }

    // Validate name format (basic validation)
    if (!/^[a-zA-Z0-9_-]+$/.test(options.name)) {
      throw new Error('Project name can only contain letters, numbers, underscores, and hyphens');
    }

    // Validate language
    if (options.language && !['en', 'ja', 'zh-TW'].includes(options.language)) {
      throw new Error('Language must be one of: en, ja, zh-TW');
    }

    // Validate template
    if (options.template && !['basic', 'api', 'web', 'library'].includes(options.template)) {
      throw new Error('Template must be one of: basic, api, web, library');
    }
  }

  private async createDirectoryStructure(projectPath: string): Promise<string[]> {
    const directories = [
      `${projectPath}/.spec`,
      `${projectPath}/.spec/specs`,
      `${projectPath}/.spec/steering`,
      `${projectPath}/.claude`,
      `${projectPath}/.claude/commands`
    ];

    const createdDirectories: string[] = [];

    for (const dir of directories) {
      if (!(await this.fileSystem.exists(dir))) {
        await this.fileSystem.mkdir(dir);
        createdDirectories.push(dir);
      }
    }

    return createdDirectories;
  }

  private async generateInitialFiles(
    project: Project, 
    options: ProjectInitializationOptions
  ): Promise<string[]> {
    const generatedFiles: string[] = [];

    // Generate spec.json
    const specContent = await this.templateService.generateSpecJson(project);
    await this.templateService.writeProjectFile(project, 'spec.json', specContent);
    generatedFiles.push(`${project.path}/.spec/specs/${project.name}/spec.json`);

    // Generate README template if requested
    if (options.template && options.template !== 'basic') {
      const readmeContent = this.generateReadmeTemplate(project, options);
      await this.fileSystem.writeFile(`${project.path}/README.md`, readmeContent);
      generatedFiles.push(`${project.path}/README.md`);
    }

    // Generate basic steering documents if template specified
    if (options.template && options.template !== 'basic') {
      const steeringFiles = await this.generateBasicSteeringDocuments(project, options);
      generatedFiles.push(...steeringFiles);
    }

    return generatedFiles;
  }

  private generateReadmeTemplate(
    project: Project, 
    options: ProjectInitializationOptions
  ): string {
    return `# ${project.name}

${options.description || 'Project description goes here.'}

## Technology Stack

${options.technology || 'Technology stack to be defined.'}

## Development Workflow

This project follows Spec-Driven Development (SDD) methodology:

1. **Requirements** - Define project requirements using EARS format
2. **Design** - Create technical design and architecture
3. **Tasks** - Break down implementation into manageable tasks
4. **Implementation** - Execute tasks with quality gates

## Getting Started

1. Review requirements: \`.spec/specs/${project.name}/requirements.md\`
2. Check design: \`.spec/specs/${project.name}/design.md\`
3. Follow tasks: \`.spec/specs/${project.name}/tasks.md\`

## SDD Commands

- \`sdd-status\` - Check current project phase
- \`sdd-requirements\` - Generate/update requirements
- \`sdd-design\` - Generate/update design
- \`sdd-tasks\` - Generate/update tasks
- \`sdd-quality-check\` - Perform code quality review

Generated on: ${new Date().toISOString()}
`;
  }

  private async generateBasicSteeringDocuments(
    project: Project, 
    options: ProjectInitializationOptions
  ): Promise<string[]> {
    const generatedFiles: string[] = [];

    // Basic product steering
    const productContent = `# Product Steering Document

## Project: ${project.name}

${options.description || 'Product description and objectives to be defined.'}

## Target Users

- User persona 1
- User persona 2

## Success Metrics

- Metric 1
- Metric 2

Generated on: ${new Date().toISOString()}
`;

    await this.fileSystem.writeFile(`${project.path}/.spec/steering/product.md`, productContent);
    generatedFiles.push(`${project.path}/.spec/steering/product.md`);

    // Basic tech steering
    const techContent = `# Technology Steering Document

## Project: ${project.name}

## Technology Stack

${options.technology || 'Technology decisions to be defined.'}

## Architecture Principles

- Principle 1
- Principle 2

## Quality Standards

- Code quality requirements
- Testing requirements
- Performance requirements

Generated on: ${new Date().toISOString()}
`;

    await this.fileSystem.writeFile(`${project.path}/.spec/steering/tech.md`, techContent);
    generatedFiles.push(`${project.path}/.spec/steering/tech.md`);

    return generatedFiles;
  }

  private async checkDirectoryStructure(
    requiredDirectories: string[], 
    missingDirectories: string[]
  ): Promise<boolean> {
    let allExist = true;

    for (const dir of requiredDirectories) {
      if (!(await this.fileSystem.exists(dir))) {
        missingDirectories.push(dir);
        allExist = false;
      }
    }

    return allExist;
  }
}