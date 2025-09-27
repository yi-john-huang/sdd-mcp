import { analyzeProject } from './documentGenerator.js';

export async function generateRequirementsDocument(projectPath: string, featureName: string): Promise<string> {
  const analysis = await analyzeProject(projectPath);
  const desc = analysis.description || 'Feature requirements specification';
  const obj = generateCoreObjective(analysis);
  const acceptance = generateAcceptanceCriteria(analysis)
    .map((c, i) => `${i + 1}. ${c}`)
    .join('\n');

  return `# Requirements Document

## Introduction
${featureName} - Requirements derived from codebase analysis.

**Project**: ${analysis.name}  
**Description**: ${desc}

Generated on: ${new Date().toISOString()}

## Functional Requirements

### FR-1: Core Functionality
**Objective:** ${obj}

#### Acceptance Criteria
${acceptance}

### FR-2: Technology Integration
**Objective:** Integrate with the detected technology stack

#### Acceptance Criteria
${generateTechRequirements(analysis).map((r, i) => `${i + 1}. ${r}`).join('\n')}

### FR-3: Quality Standards
**Objective:** Meet quality, testing, and review standards

#### Acceptance Criteria
${generateQualityRequirements(analysis).map((r, i) => `${i + 1}. ${r}`).join('\n')}

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
}

export async function generateDesignDocument(projectPath: string, featureName: string): Promise<string> {
  const analysis = await analyzeProject(projectPath);
  const arch = describeArchitecture(analysis);
  const components = generateComponentList(analysis).map(c => `- **${c.name}**: ${c.description}`).join('\n');
  const dataModels = generateDataModels(analysis).map(m => `- **${m}**: Data structure definition`).join('\n');
  const techStack = generateDetailedTechStack(analysis);

  return `# Technical Design Document

## Project: ${featureName}

**Project Name:** ${analysis.name}
**Architecture:** ${analysis.architecture}
**Language:** ${analysis.language}

Generated on: ${new Date().toISOString()}

## Architecture Overview

### System Architecture
${arch}

### Key Components
${components}

### Data Models
${dataModels}

## Implementation Details

### Technology Stack
${techStack}

### Dependencies
${generateDependencySummary(analysis)}

## Interface Specifications

### Module Interfaces
${generateModuleInterfaces(analysis)}

## Configuration

### Environment Variables
${generateEnvVars(analysis)}

### Build Configuration
${generateBuildConfig(analysis)}
`;
}

export async function generateTasksDocument(projectPath: string, featureName: string): Promise<string> {
  const analysis = await analyzeProject(projectPath);
  const tasks = generateImplementationTasks(analysis);

  const section = (title: string, list: Array<{ title: string; subtasks: string[]; requirements: string }>) =>
    list.map((task, idx) => `- [ ] ${idx + 1}. ${task.title}
  ${task.subtasks.map(s => `  - ${s}`).join('\n')}
  - _Requirements: ${task.requirements}_`).join('\n\n');

  return `# Implementation Plan

## Project: ${featureName}

**Project Name:** ${analysis.name}
**Detected Stack:** ${[analysis.language, analysis.framework || '', analysis.buildTool || ''].filter(Boolean).join(' / ')}

Generated on: ${new Date().toISOString()}

## Development Phase Tasks

${section('Development', tasks.development)}

## Integration Phase Tasks

${section('Integration', tasks.integration)}

## Quality & Testing Tasks

${section('Quality', tasks.quality)}
`;
}

// Helpers derived from TemplateService, reduced and dependency-free
function generateCoreObjective(analysis: any): string {
  if (analysis.dependencies?.includes('@modelcontextprotocol/sdk')) return 'Provide MCP tools for spec-driven development workflows';
  if (analysis.framework === 'Express.js') return 'Expose REST endpoints and middleware for business logic';
  if (analysis.framework === 'React') return 'Render interactive UI components with state management';
  return 'Deliver feature-aligned functionality integrated with existing architecture';
}

function generateAcceptanceCriteria(analysis: any): string[] {
  const criteria = [
    'WHEN invoked THEN it SHALL execute without runtime errors',
    'IF input is invalid THEN it SHALL return meaningful errors',
    'WHILE under typical load IT SHALL meet performance targets'
  ];
  if (analysis.testFramework) criteria.push('WHERE tests exist THEY SHALL pass with adequate coverage');
  if (analysis.language === 'typescript') criteria.push('WHEN type-checking THEN no TypeScript errors SHALL occur');
  return criteria;
}

function generateTechRequirements(analysis: any): string[] {
  const out = ['Integrate with existing build and run scripts'];
  if (analysis.dependencies?.includes('@modelcontextprotocol/sdk')) out.push('Expose MCP-compliant tools over stdio');
  if (analysis.buildTool) out.push(`Provide build artifacts using ${analysis.buildTool}`);
  return out;
}

function generateQualityRequirements(analysis: any): string[] {
  const out = ['Follow project coding conventions', 'Apply error handling and logging'];
  if (analysis.testFramework) out.push(`Include ${analysis.testFramework} tests for new code`);
  return out;
}

function describeArchitecture(analysis: any): string {
  if (analysis.architecture === 'Domain-Driven Design (DDD)') return 'Layered DDD: Domain, Application, Infrastructure, Presentation';
  if (analysis.architecture.includes('API')) return 'REST API with routing, middleware, services, and data access layers';
  if (analysis.framework === 'MCP SDK') return 'MCP server exposing development tools via stdio protocol';
  return analysis.architecture || 'Modular architecture with clear separation of concerns';
}

function generateComponentList(analysis: any): Array<{ name: string; description: string }> {
  const comps = [] as Array<{ name: string; description: string }>;
  if (analysis.framework === 'MCP SDK') {
    comps.push({ name: 'MCPServer', description: 'Handles stdio transport and tool registry' });
    comps.push({ name: 'ToolHandlers', description: 'Implement SDD tools (init, requirements, design, tasks, etc.)' });
  }
  if (analysis.architecture.includes('API')) {
    comps.push({ name: 'Controllers', description: 'HTTP route handlers' });
    comps.push({ name: 'Services', description: 'Business logic orchestration' });
  }
  if (comps.length === 0) comps.push({ name: 'CoreModule', description: 'Primary feature implementation module' });
  return comps;
}

function generateDataModels(analysis: any): string[] {
  if (analysis.framework === 'MCP SDK') return ['Tool', 'Request', 'Response'];
  if (analysis.architecture.includes('API')) return ['RequestDTO', 'ResponseDTO'];
  return ['Entity', 'ValueObject'];
}

function generateDetailedTechStack(analysis: any): string {
  const parts = [] as string[];
  parts.push(`- Runtime: ${analysis.language === 'typescript' ? 'Node.js (TypeScript)' : 'Node.js (JavaScript)'}`);
  if (analysis.framework) parts.push(`- Framework: ${analysis.framework}`);
  if (analysis.buildTool) parts.push(`- Build: ${analysis.buildTool}`);
  if (analysis.testFramework) parts.push(`- Testing: ${analysis.testFramework}`);
  return parts.join('\n');
}

function generateDependencySummary(analysis: any): string {
  const deps = (analysis.dependencies || []).slice(0, 10).map((d: string) => `- ${d}`).join('\n');
  const dev = (analysis.devDependencies || []).slice(0, 10).map((d: string) => `- ${d}`).join('\n');
  return `#### Production\n${deps || '- (none)'}\n\n#### Development\n${dev || '- (none)'}`;
}

function generateModuleInterfaces(analysis: any): string {
  if (analysis.framework === 'MCP SDK') {
    return `- registerTool(name: string, handler: (args) => Promise<unknown>)\n- connect(transport): Promise<void>`;
  }
  if (analysis.architecture.includes('API')) {
    return `- handle(request): Response\n- service.process(input): Result`;
  }
  return `- execute(input): Output`;
}

function generateEnvVars(analysis: any): string {
  const envs = ['NODE_ENV', 'LOG_LEVEL'];
  if (analysis.framework === 'MCP SDK') envs.push('MCP_MODE');
  return envs.map(e => `- ${e}`).join('\n');
}

function generateBuildConfig(analysis: any): string {
  if (analysis.buildTool) return `Use ${analysis.buildTool} to emit production artifacts`;
  return 'Use npm scripts (build/test/lint) defined in package.json';
}

function generateImplementationTasks(analysis: any) {
  const dev = [
    { title: 'Set up project scaffolding', subtasks: ['Initialize directories', 'Configure scripts'], requirements: 'FR-1' },
    { title: 'Implement core feature logic', subtasks: ['Add modules', 'Wire integrations'], requirements: 'FR-1' }
  ];
  const integ = [
    { title: 'Integrate with stack', subtasks: ['Validate build', 'Run dev server'], requirements: 'FR-2' }
  ];
  const quality = [
    { title: 'Add tests and quality checks', subtasks: ['Unit tests', 'Lint/typecheck', 'Quality review'], requirements: 'FR-3' }
  ];

  // Tailor tasks if MCP or API
  if (analysis.framework === 'MCP SDK') {
    dev.unshift({ title: 'Expose MCP tools', subtasks: ['Register tools', 'Handle stdio transport'], requirements: 'FR-2' });
  }
  if (analysis.architecture.includes('API')) {
    dev.unshift({ title: 'Add HTTP endpoints', subtasks: ['Define routes', 'Implement handlers'], requirements: 'FR-1' });
  }

  if (analysis.testFramework) {
    quality[0].subtasks.unshift(`Set up ${analysis.testFramework}`);
  }
  if (analysis.language === 'typescript') {
    quality[0].subtasks.push('Ensure type safety (tsc)');
  }

  return { development: dev, integration: integ, quality };
}

