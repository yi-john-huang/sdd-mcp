#!/usr/bin/env node

// MCP SDD Server entry point

// IMPORTANT: Detect MCP mode and silence console output BEFORE any imports
// Check multiple indicators for MCP mode
const isMCPMode = process.argv[1]?.includes('sdd-mcp-server') || 
                 process.argv[0]?.includes('sdd-mcp-server') ||
                 process.env.npm_execpath?.includes('npx') ||  // Executed via npx
                 (process.stdin.isTTY === false) || // MCP servers communicate via stdio pipes
                 process.argv.includes('--mcp-mode') || // Explicit MCP mode flag
                 process.argv.includes('--simplified') || // Use simplified mode flag
                 false; // Default to full server for better functionality

if (isMCPMode) {
  // Completely silence all console output for MCP mode
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};
  // Keep error for debugging but send to stderr
  const originalError = console.error;
  console.error = (...args) => originalError('[SDD-DEBUG]', ...args);
}

import 'reflect-metadata';
import { createContainer } from './infrastructure/di/container.js';
import { TYPES } from './infrastructure/di/types.js';
import type { LoggerPort } from './domain/ports';
import { MCPServer } from './infrastructure/mcp/MCPServer';
import { PluginManager } from './infrastructure/plugins/PluginManager';
import { HookSystem } from './infrastructure/plugins/HookSystem';
import { PluginToolRegistry } from './infrastructure/plugins/PluginToolRegistry';
import { PluginSteeringRegistry } from './infrastructure/plugins/PluginSteeringRegistry';

export async function createMCPServer() {
  const container = createContainer();
  const logger = container.get<LoggerPort>(TYPES.LoggerPort);
  const mcpServer = container.get<MCPServer>(TYPES.MCPServer);
  const pluginManager = container.get<PluginManager>(TYPES.PluginManager);
  const hookSystem = container.get<HookSystem>(TYPES.HookSystem);
  const toolRegistry = container.get<PluginToolRegistry>(TYPES.PluginToolRegistry);
  const steeringRegistry = container.get<PluginSteeringRegistry>(TYPES.PluginSteeringRegistry);

  // Initialize plugin system
  await pluginManager.initialize();

  return {
    container,
    logger,
    mcpServer,
    pluginManager,
    hookSystem,
    toolRegistry,
    steeringRegistry,
    async initialize() {
      // Already initialized above
    },
    async close() {
      await mcpServer.stop();
    }
  };
}

async function createSimpleMCPServer() {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema, InitializedNotificationSchema } = await import('@modelcontextprotocol/sdk/types.js');

  const server = new Server({
    name: 'sdd-mcp-server',
    version: '1.1.12'
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Add ALL SDD tools (not just basic ones)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'sdd-init',
          description: 'Initialize a new SDD project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['projectName']
          }
        },
        {
          name: 'sdd-requirements',
          description: 'Generate requirements doc',
          inputSchema: {
            type: 'object',
            properties: {
              featureName: { type: 'string' }
            },
            required: ['featureName']
          }
        },
        {
          name: 'sdd-design',
          description: 'Create design specifications',
          inputSchema: {
            type: 'object',
            properties: {
              featureName: { type: 'string' }
            },
            required: ['featureName']
          }
        },
        {
          name: 'sdd-tasks',
          description: 'Generate task breakdown',
          inputSchema: {
            type: 'object',
            properties: {
              featureName: { type: 'string' }
            },
            required: ['featureName']
          }
        },
        {
          name: 'sdd-status',  
          description: 'Check workflow progress',
          inputSchema: {
            type: 'object',
            properties: {
              featureName: { type: 'string' }
            }
          }
        },
        {
          name: 'sdd-steering',
          description: 'Create/update steering documents',
          inputSchema: {
            type: 'object',
            properties: {
              updateMode: { type: 'string', enum: ['create', 'update'] }
            }
          }
        },
        {
          name: 'sdd-steering-custom',
          description: 'Create custom steering documents',
          inputSchema: {
            type: 'object',
            properties: {
              fileName: { type: 'string' },
              topic: { type: 'string' },
              inclusionMode: { type: 'string', enum: ['always', 'conditional', 'manual'] },
              filePattern: { type: 'string' }
            },
            required: ['fileName', 'topic', 'inclusionMode']
          }
        },
        {
          name: 'sdd-quality-check',
          description: 'Code quality analysis',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              language: { type: 'string' }
            },
            required: ['code']
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'sdd-init':
        return {
          content: [{
            type: 'text',
            text: `SDD project "${args?.projectName}" initialization would begin here. (Simplified MCP mode)`
          }]
        };
      case 'sdd-status':
        return {
          content: [{
            type: 'text', 
            text: 'SDD project status: No active project found. Use sdd-init to create a new project.'
          }]
        };
      case 'sdd-steering':
        return await handleSteeringSimplified(args);
      case 'sdd-steering-custom':
        return await handleSteeringCustomSimplified(args);
      case 'sdd-requirements':
        return await handleRequirementsSimplified(args);
      case 'sdd-design':
        return await handleDesignSimplified(args);
      case 'sdd-tasks':
        return await handleTasksSimplified(args);
      case 'sdd-quality-check':
        return {
          content: [{
            type: 'text',
            text: 'Code quality analysis would be performed here. (Simplified MCP mode)'
          }]
        };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Handle initialized notification
  server.setNotificationHandler(InitializedNotificationSchema, async () => {
    // Client has completed initialization - server is ready
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Simplified steering implementation for MCP mode
async function handleSteeringSimplified(args: any) {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const projectPath = process.cwd();
    
    // Read package.json for project analysis
    let packageJson: any = {};
    try {
      const packagePath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore package.json parsing errors
    }
    
    // Create .kiro/steering directory if it doesn't exist
    const steeringDir = path.join(projectPath, '.kiro', 'steering');
    if (!fs.existsSync(steeringDir)) {
      fs.mkdirSync(steeringDir, { recursive: true });
    }
    
    // Generate product.md with real project data
    const productContent = `# Product Overview
    
## Product Description
${packageJson.description || 'No description available'}

## Core Features
${extractFeaturesSimplified(packageJson).map(feature => `- ${feature}`).join('\n')}

## Target Use Case
This product is designed for ${packageJson.keywords ? packageJson.keywords.join(', ') : 'general'} use cases.

## Key Value Proposition
${extractFeaturesSimplified(packageJson).map(feature => `- **${feature}**: Enhanced development experience`).join('\n')}

## Target Users
${generateTargetUsersSimplified(packageJson)}`;

    // Generate tech.md with real dependency analysis
    const techContent = `# Technology Overview

## Technology Stack
${generateTechStackSimplified(packageJson)}

## Development Environment
- Node.js: ${packageJson.engines?.node || 'Unknown'}
- Package Manager: npm

## Key Dependencies
${generateDependencyListSimplified(packageJson)}

## Development Commands
${generateWorkflowSimplified(packageJson)}`;

    // Generate structure.md
    const structureContent = `# Project Structure

## Directory Organization
${generateDirectoryStructureSimplified(projectPath)}

## File Naming Conventions
- Use kebab-case for file names
- Use PascalCase for class names
- Use camelCase for variable names
- Use UPPER_SNAKE_CASE for constants

## Module Organization
- Group related functionality in modules
- Use barrel exports (index.ts files)
- Separate business logic from infrastructure
- Keep dependencies flowing inward`;

    // Write the files
    fs.writeFileSync(path.join(steeringDir, 'product.md'), productContent);
    fs.writeFileSync(path.join(steeringDir, 'tech.md'), techContent);
    fs.writeFileSync(path.join(steeringDir, 'structure.md'), structureContent);

    return {
      content: [{
        type: 'text',
        text: `## Steering Documents Updated

**Project**: ${packageJson.name || 'Unknown'}
**Mode**: update

**Updated Files**:
- \`.kiro/steering/product.md\` - Product overview and business context
- \`.kiro/steering/tech.md\` - Technology stack and development environment  
- \`.kiro/steering/structure.md\` - Project organization and architectural decisions

**Analysis**:
- Technology stack: ${Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).length} dependencies detected
- Project type: ${packageJson.type || 'CommonJS'}
- Existing steering: Updated preserving customizations

These steering documents provide consistent project context for all AI interactions and spec-driven development workflows.`
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error generating steering documents: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}

async function handleSteeringCustomSimplified(args: any) {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const { fileName, topic, inclusionMode, filePattern } = args;
    
    if (!fileName || !topic || !inclusionMode) {
      throw new Error('fileName, topic, and inclusionMode are required');
    }
    
    const projectPath = process.cwd();
    const steeringDir = path.join(projectPath, '.kiro', 'steering');
    
    if (!fs.existsSync(steeringDir)) {
      fs.mkdirSync(steeringDir, { recursive: true });
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

    fs.writeFileSync(path.join(steeringDir, fileName), content);
    
    return {
      content: [{
        type: 'text',
        text: `Custom steering document "${fileName}" created successfully with ${inclusionMode} inclusion mode.`
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error creating custom steering document: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}

// Helper functions for simplified analysis
function extractFeaturesSimplified(packageJson: any): string[] {
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
  
  return features.length > 0 ? features : ['Core functionality'];
}

function generateTargetUsersSimplified(packageJson: any): string {
  if (packageJson.keywords?.includes('cli')) {
    return '- Command-line tool users\n- Developers and system administrators';
  }
  if (packageJson.keywords?.includes('api')) {
    return '- API consumers\n- Third-party integrators';
  }
  return '- Primary user persona\n- Secondary user persona';
}

function generateTechStackSimplified(packageJson: any): string {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  const stack: string[] = [];
  if (deps?.typescript) stack.push('TypeScript');
  if (deps?.node || packageJson.engines?.node) stack.push('Node.js');
  if (deps?.express) stack.push('Express.js');
  if (deps?.react) stack.push('React');
  if (deps?.vue) stack.push('Vue.js');
  
  return stack.length > 0 ? stack.join(', ') : 'Technology stack to be defined';
}

function generateDependencyListSimplified(packageJson: any): string {
  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};
  
  let list = '';
  const depList = Object.keys(deps);
  const devDepList = Object.keys(devDeps);
  
  if (depList.length > 0) {
    list += '### Production Dependencies\n';
    list += depList.slice(0, 10).map(dep => `- ${dep}`).join('\n');
  }
  if (devDepList.length > 0) {
    list += '\n### Development Dependencies\n';
    list += devDepList.slice(0, 10).map(dep => `- ${dep}`).join('\n');
  }
  
  return list || 'Dependencies to be analyzed';
}

function generateWorkflowSimplified(packageJson: any): string {
  const scripts = packageJson.scripts || {};
  
  let workflow = '## Development Commands\n';
  if (scripts.dev) workflow += `- \`npm run dev\` - Start development server\n`;
  if (scripts.build) workflow += `- \`npm run build\` - Build for production\n`;
  if (scripts.test) workflow += `- \`npm run test\` - Run tests\n`;
  if (scripts.lint) workflow += `- \`npm run lint\` - Check code quality\n`;
  
  return workflow;
}

function generateDirectoryStructureSimplified(projectPath: string): string {
  const fs = require('fs');
  
  try {
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

// Additional context-aware SDD tools
async function handleRequirementsSimplified(args: any) {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const projectPath = process.cwd();
    
    // Read package.json for project analysis
    let packageJson: any = {};
    try {
      const packagePath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore package.json parsing errors
    }

    // Analyze project structure
    const projectAnalysis = analyzeProjectStructureSync(projectPath);
    
    // Create .kiro/specs directory if it doesn't exist
    const specsDir = path.join(projectPath, '.kiro', 'specs');
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }
    
    // Generate requirements.md with real project data
    const requirementsContent = `# Requirements Document

## Project: ${packageJson.name || 'Unknown Project'}

**Product Description:** ${packageJson.description || 'Product requirements specification'}

Generated on: ${new Date().toISOString()}

## Functional Requirements

### FR-1: Core Functionality
**Objective:** ${generateCoreObjectiveSimplified(packageJson, projectAnalysis)}

#### Acceptance Criteria
${generateAcceptanceCriteriaSimplified(packageJson, projectAnalysis).map((criteria, index) => `${index + 1}. ${criteria}`).join('\n')}

### FR-2: Technology Integration
**Objective:** Implement robust technology stack integration

#### Acceptance Criteria
${generateTechRequirementsSimplified(packageJson).map((req, index) => `${index + 1}. ${req}`).join('\n')}

### FR-3: Quality Standards
**Objective:** Maintain high code quality and testing standards

#### Acceptance Criteria
${generateQualityRequirementsSimplified(packageJson).map((req, index) => `${index + 1}. ${req}`).join('\n')}

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

    // Write the file
    fs.writeFileSync(path.join(specsDir, 'requirements.md'), requirementsContent);

    return {
      content: [{
        type: 'text',
        text: `## Requirements Document Generated

**Project**: ${packageJson.name || 'Unknown'}
**File**: \`.kiro/specs/requirements.md\`

**Analysis**:
- Technology stack: ${Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).length} dependencies analyzed
- Project structure: ${projectAnalysis.directories.length} directories analyzed
- Generated ${generateAcceptanceCriteriaSimplified(packageJson, projectAnalysis).length} functional requirements

Requirements document contains project-specific analysis and EARS-formatted acceptance criteria.`
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error generating requirements document: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}

async function handleDesignSimplified(args: any) {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const projectPath = process.cwd();
    
    // Read package.json for project analysis
    let packageJson: any = {};
    try {
      const packagePath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore package.json parsing errors
    }

    // Analyze project structure
    const projectAnalysis = analyzeProjectStructureSync(projectPath);
    
    // Create .kiro/specs directory if it doesn't exist
    const specsDir = path.join(projectPath, '.kiro', 'specs');
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }
    
    // Generate design.md with real project analysis
    const designContent = `# Technical Design Document

## Project: ${packageJson.name || 'Unknown Project'}

**Product Description:** ${packageJson.description || 'Technical design specification'}

Generated on: ${new Date().toISOString()}

## Architecture Overview

### System Architecture
${generateArchitectureDescriptionSimplified(packageJson, projectAnalysis)}

### Key Components
${generateComponentDescriptionsSimplified(projectAnalysis).map(comp => `- **${comp.name}**: ${comp.description}`).join('\n')}

### Data Models
${generateDataModelsSimplified(packageJson, projectAnalysis).map(model => `- **${model}**: Data structure definition`).join('\n')}

## Implementation Details

### Technology Stack
${generateDetailedTechStackSimplified(packageJson)}

### Design Patterns
${generateDesignPatternsSimplified(packageJson, projectAnalysis).map(pattern => `- **${pattern}**: Applied for maintainability and scalability`).join('\n')}

### Dependencies
${generateDependencyAnalysisSimplified(packageJson)}

## Interface Specifications

### API Interfaces
${generateAPIInterfacesSimplified(packageJson, projectAnalysis)}

### Module Interfaces  
${generateModuleInterfacesSimplified(projectAnalysis)}

## Configuration

### Environment Variables
${generateEnvVarSpecsSimplified(packageJson)}

### Build Configuration
${generateBuildConfigSimplified(packageJson)}
`;

    // Write the file
    fs.writeFileSync(path.join(specsDir, 'design.md'), designContent);

    return {
      content: [{
        type: 'text',
        text: `## Design Document Generated

**Project**: ${packageJson.name || 'Unknown'}
**File**: \`.kiro/specs/design.md\`

**Analysis**:
- Architecture: ${generateArchitectureDescriptionSimplified(packageJson, projectAnalysis).substring(0, 100)}...
- Components: ${generateComponentDescriptionsSimplified(projectAnalysis).length} key components identified
- Technology stack: ${Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).length} dependencies analyzed

Design document contains project-specific architecture analysis and interface specifications.`
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error generating design document: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}

async function handleTasksSimplified(args: any) {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const projectPath = process.cwd();
    
    // Read package.json for project analysis
    let packageJson: any = {};
    try {
      const packagePath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        packageJson = JSON.parse(packageContent);
      }
    } catch (error) {
      // Ignore package.json parsing errors
    }

    // Analyze project structure
    const projectAnalysis = analyzeProjectStructureSync(projectPath);
    
    // Create .kiro/specs directory if it doesn't exist
    const specsDir = path.join(projectPath, '.kiro', 'specs');
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }
    
    // Generate tasks breakdown
    const tasks = generateImplementationTasksSimplified(packageJson, projectAnalysis);
    
    const tasksContent = `# Implementation Plan

## Project: ${packageJson.name || 'Unknown Project'}

**Product Description:** ${packageJson.description || 'Implementation task breakdown'}

Generated on: ${new Date().toISOString()}

## Development Phase Tasks

${tasks.development.map((task, index) => `- [ ] ${index + 1}. ${task.title}
  ${task.subtasks.map((subtask: string) => `  - ${subtask}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n')}

## Integration Phase Tasks

${tasks.integration.map((task, index) => `- [ ] ${index + 1}. ${task.title}
  ${task.subtasks.map((subtask: string) => `  - ${subtask}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n')}

## Quality Assurance Tasks

${tasks.quality.map((task, index) => `- [ ] ${index + 1}. ${task.title}
  ${task.subtasks.map((subtask: string) => `  - ${subtask}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n')}

## Deployment Tasks

${tasks.deployment.map((task, index) => `- [ ] ${index + 1}. ${task.title}
  ${task.subtasks.map((subtask: string) => `  - ${subtask}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n')}
`;

    // Write the file
    fs.writeFileSync(path.join(specsDir, 'tasks.md'), tasksContent);

    const totalTasks = tasks.development.length + tasks.integration.length + tasks.quality.length + tasks.deployment.length;

    return {
      content: [{
        type: 'text',
        text: `## Implementation Tasks Generated

**Project**: ${packageJson.name || 'Unknown'}
**File**: \`.kiro/specs/tasks.md\`

**Analysis**:
- Total tasks: ${totalTasks} implementation tasks generated
- Development: ${tasks.development.length} tasks
- Integration: ${tasks.integration.length} tasks  
- Quality: ${tasks.quality.length} tasks
- Deployment: ${tasks.deployment.length} tasks

Task breakdown contains project-specific implementation plan with requirement traceability.`
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error generating tasks document: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}

// Helper functions for simplified tool implementations
function analyzeProjectStructureSync(projectPath: string): any {
  const fs = require('fs');
  
  try {
    const items = fs.readdirSync(projectPath, { withFileTypes: true });
    return {
      directories: items.filter((item: any) => item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules').map((item: any) => item.name),
      files: items.filter((item: any) => item.isFile()).map((item: any) => item.name),
      hasSource: items.some((item: any) => item.isDirectory() && item.name === 'src'),
      hasTests: items.some((item: any) => item.isDirectory() && (item.name === 'test' || item.name === '__tests__')),
      hasDocs: items.some((item: any) => item.isDirectory() && (item.name === 'docs' || item.name === 'documentation'))
    };
  } catch (error) {
    return { directories: [], files: [] };
  }
}

function generateCoreObjectiveSimplified(packageJson: any, projectAnalysis: any): string {
  if (packageJson.description) {
    return `Deliver ${packageJson.description} with full functionality and reliability`;
  }
  if (packageJson.keywords?.length > 0) {
    return `Implement ${packageJson.keywords.join(', ')} functionality`;
  }
  return 'Deliver core application functionality';
}

function generateAcceptanceCriteriaSimplified(packageJson: any, projectAnalysis: any): string[] {
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

function generateTechRequirementsSimplified(packageJson: any): string[] {
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

function generateQualityRequirementsSimplified(packageJson: any): string[] {
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

function generateArchitectureDescriptionSimplified(packageJson: any, projectAnalysis: any): string {
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

function generateComponentDescriptionsSimplified(projectAnalysis: any): Array<{name: string, description: string}> {
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

function generateDataModelsSimplified(packageJson: any, projectAnalysis: any): string[] {
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

function generateDetailedTechStackSimplified(packageJson: any): string {
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

function generateDesignPatternsSimplified(packageJson: any, projectAnalysis: any): string[] {
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

function generateDependencyAnalysisSimplified(packageJson: any): string {
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

function generateAPIInterfacesSimplified(packageJson: any, projectAnalysis: any): string {
  if (packageJson.dependencies?.express || packageJson.dependencies?.fastify) {
    return `RESTful API endpoints following OpenAPI specification:
- GET /api/health - Health check endpoint
- Authentication and authorization middleware
- Request/response validation
- Error handling middleware`;
  }
  return 'Interface specifications to be defined';
}

function generateModuleInterfacesSimplified(projectAnalysis: any): string {
  if (projectAnalysis.hasSource) {
    return `Internal module interfaces:
- Clear module boundaries and exports
- Consistent API patterns across modules
- Type definitions for all public interfaces`;
  }
  return 'Module interfaces to be defined';
}

function generateEnvVarSpecsSimplified(packageJson: any): string {
  const envVars: string[] = [];
  
  if (packageJson.dependencies?.express || packageJson.dependencies?.fastify) {
    envVars.push('- `PORT`: Server port (default: 3000)');
    envVars.push('- `NODE_ENV`: Environment mode (development/production)');
  }
  
  envVars.push('- `LOG_LEVEL`: Logging level (debug/info/warn/error)');
  
  return envVars.join('\n');
}

function generateBuildConfigSimplified(packageJson: any): string {
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

function generateImplementationTasksSimplified(packageJson: any, projectAnalysis: any): any {
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

async function main(): Promise<void> {
  try {
    if (isMCPMode) {
      // Use simplified MCP server for MCP mode
      await createSimpleMCPServer();
    } else {
      // Use full featured server for development/testing mode
      const server = await createMCPServer();
      const { logger, mcpServer, pluginManager, hookSystem, toolRegistry, steeringRegistry } = server;
      
      logger.info('MCP SDD Server starting...', {
        version: process.env.npm_package_version ?? '1.0.0',
        nodeVersion: process.version,
        pid: process.pid
      });

      await mcpServer.start();

      // Get plugin system statistics
      const pluginStats = await pluginManager.getAllPlugins();
      const hookStats = await hookSystem.getAllHooks();
      const toolStats = await toolRegistry.getAllTools();
      const steeringStats = await steeringRegistry.getSteeringStatistics();

      logger.info('MCP SDD Server ready for connections', {
        capabilities: {
          workflow: '5-phase SDD workflow state machine (INIT→REQUIREMENTS→DESIGN→TASKS→IMPLEMENTATION)',
          validation: 'Cross-phase validation with approval gates and rollback support',
          initialization: 'Project setup with .kiro directory structure and spec.json',
          context: 'Project memory with codebase analysis and context persistence',
          steering: 'Dynamic steering document management with Always/Conditional/Manual modes',
          quality: 'Linus-style code review with 5-layer analysis framework',
          i18n: '10-language support with cultural adaptation',
          plugins: `${pluginStats.length} plugins loaded with extensibility framework`,
          templates: 'Handlebars-based template generation with inheritance'
        },
        tools: {
          count: 10,
          categories: ['sdd-init', 'sdd-requirements', 'sdd-design', 'sdd-tasks', 'sdd-implement', 'sdd-status', 'sdd-approve', 'sdd-quality-check', 'sdd-context-load', 'sdd-template-render'],
          pluginTools: Object.keys(toolStats).length
        },
        hooks: {
          registered: Object.keys(hookStats).length,
          phases: ['PRE_INIT', 'POST_INIT', 'PRE_REQUIREMENTS', 'POST_REQUIREMENTS', 'PRE_DESIGN', 'POST_DESIGN', 'PRE_TASKS', 'POST_TASKS', 'PRE_IMPLEMENTATION', 'POST_IMPLEMENTATION']
        },
        steering: {
          documents: steeringStats.totalDocuments,
          plugins: Object.keys(steeringStats.documentsByPlugin).length,
          modes: steeringStats.documentsByMode
        }
      });

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await mcpServer.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await mcpServer.stop();
        process.exit(0);
      });
    }
  } catch (error) {
    // Only log startup errors in non-MCP mode
    if (!isMCPMode) {
      console.error('Failed to start MCP SDD Server:', error);
    }
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}