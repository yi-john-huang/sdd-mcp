import { injectable, inject } from 'inversify';
import { 
  Prompt, 
  PromptMessage,
  TextContent,
  ImageContent
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../di/types.js';
import { LoggerPort } from '../../domain/ports.js';
import { ProjectService } from '../../application/services/ProjectService.js';

@injectable()
export class PromptManager {
  constructor(
    @inject(TYPES.ProjectService) private readonly projectService: ProjectService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  async listPrompts(): Promise<Prompt[]> {
    const correlationId = uuidv4();
    
    this.logger.info('Listing available prompts', { correlationId });

    const prompts: Prompt[] = [
      {
        name: 'sdd-requirements-review',
        description: 'Generate comprehensive requirements review using EARS format',
        arguments: [
          {
            name: 'projectId',
            description: 'Project ID to review',
            required: true
          },
          {
            name: 'focus',
            description: 'Specific focus area (optional)',
            required: false
          }
        ]
      },
      {
        name: 'sdd-design-review',
        description: 'Perform technical design review with architecture analysis',
        arguments: [
          {
            name: 'projectId',
            description: 'Project ID to review',
            required: true
          },
          {
            name: 'component',
            description: 'Specific component to focus on (optional)',
            required: false
          }
        ]
      },
      {
        name: 'sdd-linus-review',
        description: 'Apply Linus-style code review criteria with taste scoring',
        arguments: [
          {
            name: 'code',
            description: 'Code to review',
            required: true
          },
          {
            name: 'language',
            description: 'Programming language',
            required: false
          }
        ]
      },
      {
        name: 'sdd-task-breakdown',
        description: 'Generate detailed task breakdown from design specifications',
        arguments: [
          {
            name: 'projectId',
            description: 'Project ID for task breakdown',
            required: true
          },
          {
            name: 'complexity',
            description: 'Task complexity level (simple|standard|complex)',
            required: false
          }
        ]
      },
      {
        name: 'sdd-quality-gates',
        description: 'Evaluate project readiness for phase progression',
        arguments: [
          {
            name: 'projectId',
            description: 'Project ID to evaluate',
            required: true
          },
          {
            name: 'targetPhase',
            description: 'Target phase for progression',
            required: true
          }
        ]
      }
    ];

    this.logger.info('Prompt listing completed', {
      correlationId,
      promptCount: prompts.length
    });

    return prompts;
  }

  async getPrompt(name: string, arguments_: Record<string, string>): Promise<{
    description?: string;
    messages: PromptMessage[];
  }> {
    const correlationId = uuidv4();
    
    this.logger.info('Getting prompt', { correlationId, name, arguments_ });

    switch (name) {
      case 'sdd-requirements-review':
        return await this.getRequirementsReviewPrompt(arguments_);
      
      case 'sdd-design-review':
        return await this.getDesignReviewPrompt(arguments_);
      
      case 'sdd-linus-review':
        return await this.getLinusReviewPrompt(arguments_);
      
      case 'sdd-task-breakdown':
        return await this.getTaskBreakdownPrompt(arguments_);
      
      case 'sdd-quality-gates':
        return await this.getQualityGatesPrompt(arguments_);
      
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  private async getRequirementsReviewPrompt(args: Record<string, string>): Promise<{
    description?: string;
    messages: PromptMessage[];
  }> {
    const { projectId, focus } = args;
    
    if (!projectId) {
      throw new Error('projectId is required for requirements review');
    }

    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const focusContext = focus ? `with specific focus on: ${focus}` : '';

    return {
      description: `Requirements review for project ${project.name}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please review the requirements for project "${project.name}" ${focusContext}.

Use EARS format validation:
- Each requirement should follow "WHEN/WHERE/IF [condition] THEN [system behavior]"
- Verify acceptance criteria are testable and measurable
- Check for completeness and consistency
- Identify missing edge cases or error conditions
- Ensure requirements are implementation-agnostic

Project Context:
- Name: ${project.name}
- Phase: ${project.phase}
- Language: ${project.metadata.language}

Please provide:
1. Requirements completeness assessment
2. EARS format compliance check
3. Missing requirements identification
4. Acceptance criteria quality review
5. Recommendations for improvement`
          } as TextContent
        }
      ]
    };
  }

  private async getDesignReviewPrompt(args: Record<string, string>): Promise<{
    description?: string;
    messages: PromptMessage[];
  }> {
    const { projectId, component } = args;
    
    if (!projectId) {
      throw new Error('projectId is required for design review');
    }

    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const componentContext = component ? `focusing on component: ${component}` : 'covering all components';

    return {
      description: `Technical design review for project ${project.name}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please review the technical design for project "${project.name}" ${componentContext}.

Evaluate:
1. Architecture pattern appropriateness
2. Component responsibility clarity
3. Interface design quality
4. Data model consistency
5. Scalability considerations
6. Maintainability factors
7. Technology stack alignment

Project Context:
- Name: ${project.name}
- Phase: ${project.phase}
- Language: ${project.metadata.language}

Please provide:
1. Architecture assessment
2. Component design evaluation
3. Interface quality review
4. Data model validation
5. Technology stack analysis
6. Scalability and maintainability review
7. Improvement recommendations`
          } as TextContent
        }
      ]
    };
  }

  private async getLinusReviewPrompt(args: Record<string, string>): Promise<{
    description?: string;
    messages: PromptMessage[];
  }> {
    const { code, language = 'typescript' } = args;
    
    if (!code) {
      throw new Error('code is required for Linus review');
    }

    return {
      description: 'Linus-style code review with taste scoring',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Apply Linus Torvalds code review criteria to analyze this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Use the five-layer analysis framework:

1. **Data Structure Analysis**: "Bad programmers worry about code. Good programmers worry about data structures."
2. **Special Case Identification**: Find and eliminate special cases through better design
3. **Complexity Review**: Check indentation depth (max 3 levels), function length, cyclomatic complexity
4. **Breaking Change Analysis**: Ensure backward compatibility
5. **Practicality Validation**: Verify this solves real problems

Provide output in this format:

【Taste Score】
🟢 Good taste / 🟡 Passable / 🔴 Garbage

【Fatal Issues】
- [List critical problems]

【Improvement Direction】
"Eliminate this special case"
"These 10 lines can become 3 lines"
"Data structure is wrong, should be..."

Apply Linus's core principles:
- Simplicity over complexity
- No special cases
- Data structures over algorithms
- Practical solutions over theoretical perfection`
          } as TextContent
        }
      ]
    };
  }

  private async getTaskBreakdownPrompt(args: Record<string, string>): Promise<{
    description?: string;
    messages: PromptMessage[];
  }> {
    const { projectId, complexity = 'standard' } = args;
    
    if (!projectId) {
      throw new Error('projectId is required for task breakdown');
    }

    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return {
      description: `Task breakdown for project ${project.name}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate detailed implementation tasks for project "${project.name}" with ${complexity} complexity level.

Project Context:
- Name: ${project.name}
- Phase: ${project.phase}
- Language: ${project.metadata.language}

Task breakdown guidelines:
1. Create logical task sequence
2. Ensure each task is testable and measurable
3. Include requirement references for traceability
4. Break complex tasks into manageable subtasks
5. Consider dependencies between tasks
6. Include testing and validation steps

Output format:
- [ ] 1. [Main Task Title]
  - [Subtask description]
  - [Subtask description]
  - _Requirements: [requirement references]_

Please provide:
1. Complete task breakdown
2. Dependency analysis
3. Implementation sequence
4. Testing strategy
5. Quality gates integration`
          } as TextContent
        }
      ]
    };
  }

  private async getQualityGatesPrompt(args: Record<string, string>): Promise<{
    description?: string;
    messages: PromptMessage[];
  }> {
    const { projectId, targetPhase } = args;
    
    if (!projectId || !targetPhase) {
      throw new Error('projectId and targetPhase are required for quality gates evaluation');
    }

    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return {
      description: `Quality gates evaluation for project ${project.name}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Evaluate quality gates for project "${project.name}" progression to ${targetPhase} phase.

Current Project Status:
- Name: ${project.name}
- Current Phase: ${project.phase}
- Target Phase: ${targetPhase}
- Requirements Generated: ${project.metadata.approvals.requirements.generated}
- Requirements Approved: ${project.metadata.approvals.requirements.approved}
- Design Generated: ${project.metadata.approvals.design.generated}
- Design Approved: ${project.metadata.approvals.design.approved}
- Tasks Generated: ${project.metadata.approvals.tasks.generated}
- Tasks Approved: ${project.metadata.approvals.tasks.approved}

Quality gate evaluation criteria:
1. Phase transition requirements
2. Approval status validation
3. Deliverable quality assessment
4. Completeness verification
5. Consistency checks

Please provide:
1. Phase transition readiness assessment
2. Missing approvals or deliverables
3. Quality issues that block progression
4. Recommendations for proceeding
5. Risk assessment for target phase`
          } as TextContent
        }
      ]
    };
  }
}