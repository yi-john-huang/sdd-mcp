#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from 'fs/promises';
import path from 'path';
import { 
  analyzeProject, 
  generateProductDocument, 
  generateTechDocument, 
  generateStructureDocument 
} from './documentGenerator.js';

// Resolve version dynamically from package.json when possible
async function resolveVersion() {
  try {
    const pkgUrl = new URL('./package.json', import.meta.url);
    const pkgText = await fs.readFile(pkgUrl, 'utf8');
    const pkg = JSON.parse(pkgText);
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const server = new McpServer({
  name: 'sdd-mcp-server',
  version: await resolveVersion()
}, {
  instructions: 'Use this server for spec-driven development workflows'
});

// Helper functions for file operations
async function createKiroDirectory(projectPath) {
  const kiroPath = path.join(projectPath, '.kiro');
  const specsPath = path.join(kiroPath, 'specs');
  const steeringPath = path.join(kiroPath, 'steering');
  
  await fs.mkdir(kiroPath, { recursive: true });
  await fs.mkdir(specsPath, { recursive: true });
  await fs.mkdir(steeringPath, { recursive: true });
  
  return { kiroPath, specsPath, steeringPath };
}

async function generateFeatureName(description) {
  // Simple feature name generation from description
  return description.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

async function getCurrentTimestamp() {
  return new Date().toISOString();
}

// Register all SDD tools matching README and kiro command templates

// 1. sdd-init - Initialize new SDD project
server.registerTool("sdd-init", {
  title: "Initialize SDD Project",
  description: "Initialize a new SDD project",
  inputSchema: {
    projectName: z.string().describe('The name of the project to initialize'),
    description: z.string().optional().describe('Optional project description')
  },
}, async ({ projectName, description = '' }) => {
  try {
    const currentPath = process.cwd();
    
    // Create .kiro directory structure in current directory (not in a subdirectory)
    const { specsPath, steeringPath } = await createKiroDirectory(currentPath);
    
    // Generate feature name from description
    const featureName = await generateFeatureName(description || projectName);
    const featurePath = path.join(specsPath, featureName);
    await fs.mkdir(featurePath, { recursive: true });
    
    // Create spec.json
    const specJson = {
      "feature_name": featureName,
      "created_at": await getCurrentTimestamp(),
      "updated_at": await getCurrentTimestamp(),
      "language": "en",
      "phase": "initialized",
      "approvals": {
        "requirements": {
          "generated": false,
          "approved": false
        },
        "design": {
          "generated": false,
          "approved": false
        },
        "tasks": {
          "generated": false,
          "approved": false
        }
      },
      "ready_for_implementation": false
    };
    
    await fs.writeFile(path.join(featurePath, 'spec.json'), JSON.stringify(specJson, null, 2));
    
    // Create requirements.md template
    const requirementsTemplate = `# Requirements Document\n\n## Project Description (Input)\n${description}\n\n## Requirements\n<!-- Will be generated in /kiro:spec-requirements phase -->`;
    await fs.writeFile(path.join(featurePath, 'requirements.md'), requirementsTemplate);
    
    // Ensure AGENTS.md exists based on CLAUDE.md (static exception)
    const agentsPath = path.join(currentPath, 'AGENTS.md');
    const claudePath = path.join(currentPath, 'CLAUDE.md');
    const agentsExists = await fs.access(agentsPath).then(() => true).catch(() => false);
    if (!agentsExists) {
      let agentsContent = '';
      const claudeExists = await fs.access(claudePath).then(() => true).catch(() => false);
      if (claudeExists) {
        const claude = await fs.readFile(claudePath, 'utf8');
        agentsContent = claude
          .replace(/# Claude Code Spec-Driven Development/g, '# AI Agent Spec-Driven Development')
          .replace(/Claude Code/g, 'AI Agent')
          .replace(/claude code/g, 'ai agent')
          .replace(/Claude/g, 'AI Agent')
          .replace(/claude/g, 'ai agent');
      } else {
        agentsContent = '# AI Agent Spec-Driven Development\n\nKiro-style Spec Driven Development implementation for AI agents across different CLIs and IDEs.';
      }
      await fs.writeFile(agentsPath, agentsContent);
    }
    
    return {
      content: [{
        type: 'text',
        text: `## Spec Initialization Complete\n\n**Generated Feature Name**: ${featureName}\n**Project Name**: ${projectName}\n**Project Description**: ${description}\n\n**Created Files**:\n- \`.kiro/specs/${featureName}/spec.json\` - Metadata and approval tracking\n- \`.kiro/specs/${featureName}/requirements.md\` - Requirements template\n\n**Next Step**: Use \`sdd-requirements ${featureName}\` to generate comprehensive requirements\n\nThe spec has been initialized following stage-by-stage development principles.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error initializing SDD project: ${error.message}`
      }]
    };
  }
});

// 2. sdd-requirements - Generate requirements doc
server.registerTool("sdd-requirements", {
  title: "Generate Requirements Document",
  description: "Generate requirements doc",
  inputSchema: {
    featureName: z.string().describe('Feature name from spec initialization')
  },
}, async ({ featureName }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    
    // Check if spec exists
    const specPath = path.join(featurePath, 'spec.json');
    const specExists = await fs.access(specPath).then(() => true).catch(() => false);
    if (!specExists) {
      return {
        content: [{
          type: 'text',
          text: `Error: Spec not found for feature "${featureName}". Use sdd-init first.`
        }]
      };
    }
    
    // Read existing spec
    const specContent = await fs.readFile(specPath, 'utf8');
    const spec = JSON.parse(specContent);
    
    // Generate EARS-format requirements
    const requirementsContent = `# Requirements Document\n\n## Introduction\nThis feature delivers comprehensive spec-driven development workflow capabilities to AI development teams.\n\n## Requirements\n\n### Requirement 1: Project Initialization\n**Objective:** As a developer, I want to initialize SDD projects with proper structure, so that I can follow structured development workflows\n\n#### Acceptance Criteria\n1. WHEN a user runs sdd-init THEN the system SHALL create .kiro directory structure\n2. WHEN initialization occurs THEN the system SHALL generate spec.json with metadata\n3. WHEN project is created THEN the system SHALL create requirements.md template\n4. WHERE .kiro directory exists THE system SHALL track project state and approvals\n\n### Requirement 2: Requirements Generation\n**Objective:** As a developer, I want to generate comprehensive requirements, so that I can clearly define project scope\n\n1. WHEN requirements are requested THEN the system SHALL generate EARS-format acceptance criteria\n2. IF project description exists THEN the system SHALL incorporate it into requirements\n3. WHILE requirements are being generated THE system SHALL follow structured documentation patterns\n\n### Requirement 3: Workflow Phase Management\n**Objective:** As a developer, I want phase-based workflow control, so that I can ensure proper development progression\n\n1. WHEN each phase completes THEN the system SHALL require approval before proceeding\n2. IF approvals are missing THEN the system SHALL block phase transitions\n3. WHERE workflow violations occur THE system SHALL provide clear guidance`;
    
    await fs.writeFile(path.join(featurePath, 'requirements.md'), requirementsContent);
    
    // Update spec.json
    spec.phase = "requirements-generated";
    spec.approvals.requirements.generated = true;
    spec.updated_at = await getCurrentTimestamp();
    
    await fs.writeFile(specPath, JSON.stringify(spec, null, 2));
    
    return {
      content: [{
        type: 'text',
        text: `## Requirements Generated\n\nRequirements document generated for feature: **${featureName}**\n\n**Generated**: .kiro/specs/${featureName}/requirements.md\n**Status**: Requirements phase completed\n\n**Next Step**: Review the requirements, then use \`sdd-design\` to proceed to design phase`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error generating requirements: ${error.message}`
      }]
    };
  }
});

// 3. sdd-design - Create design specifications
server.registerTool("sdd-design", {
  title: "Create Design Specifications",
  description: "Create design specifications",
  inputSchema: {
    featureName: z.string().describe('Feature name from spec initialization')
  },
}, async ({ featureName }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    const specPath = path.join(featurePath, 'spec.json');
    
    // Read and validate spec
    const specContent = await fs.readFile(specPath, 'utf8');
    const spec = JSON.parse(specContent);
    
    if (!spec.approvals.requirements.generated) {
      return {
        content: [{
          type: 'text',
          text: `Error: Requirements must be generated before design. Run \`sdd-requirements ${featureName}\` first.`
        }]
      };
    }
    
    // Generate design document
    const designContent = `# Technical Design Document\n\n## Overview\n\n**Purpose**: This feature delivers comprehensive MCP server capabilities for spec-driven development workflows to AI development teams.\n\n**Users**: AI developers and development teams will utilize this for structured project development.\n\n**Impact**: Transforms ad-hoc development into systematic, phase-based workflows with quality gates.\n\n### Goals\n- Provide complete SDD workflow automation\n- Ensure quality through Linus-style code review\n- Enable multi-language development support\n- Integrate seamlessly with AI development tools\n\n### Non-Goals\n- Real-time collaboration features\n- Deployment automation\n- Version control integration\n\n## Architecture\n\n### High-Level Architecture\n\n\`\`\`mermaid\ngraph TB\n    A[AI Client] --> B[MCP Server]\n    B --> C[SDD Workflow Engine]\n    C --> D[Project Management]\n    C --> E[Template System]\n    C --> F[Quality Analysis]\n    D --> G[File System]\n    E --> G\n    F --> G\n\`\`\`\n\n### Technology Stack\n\n**Runtime**: Node.js with ES modules\n**Protocol**: Model Context Protocol (MCP)\n**Templates**: Handlebars-based generation\n**Quality**: AST-based code analysis\n**Storage**: File-based project persistence\n\n### Key Design Decisions\n\n**Decision**: Use MCP protocol for AI tool integration\n**Context**: Need seamless integration with Claude Code and other AI development tools\n**Alternatives**: REST API, GraphQL, custom protocol\n**Selected Approach**: MCP provides standardized AI tool integration\n**Rationale**: Direct integration with AI development workflows\n**Trade-offs**: Protocol-specific but optimized for AI use cases\n\n## Components and Interfaces\n\n### SDD Workflow Engine\n\n**Responsibility**: Manages 5-phase workflow state transitions\n**Domain Boundary**: Workflow orchestration and validation\n**Data Ownership**: Phase state, approval tracking, transition rules\n\n**Contract Definition**:\n\`\`\`typescript\ninterface SDDWorkflowEngine {\n  initializeProject(name: string, description: string): ProjectSpec;\n  generateRequirements(featureName: string): RequirementsDoc;\n  generateDesign(featureName: string): DesignDoc;\n  generateTasks(featureName: string): TasksDoc;\n  checkQuality(code: string): QualityReport;\n}\n\`\`\`\n\n### Template System\n\n**Responsibility**: Generate structured documents from templates\n**Domain Boundary**: Document generation and formatting\n**Data Ownership**: Template definitions, generated content\n\n### Quality Analysis Engine\n\n**Responsibility**: Perform Linus-style 5-layer code review\n**Domain Boundary**: Code quality assessment\n**Data Ownership**: Quality metrics, review reports\n\n## Data Models\n\n### Project Specification\n\`\`\`json\n{\n  "feature_name": "string",\n  "created_at": "ISO8601",\n  "updated_at": "ISO8601",\n  "language": "en",\n  "phase": "initialized|requirements-generated|design-generated|tasks-generated|implementation",\n  "approvals": {\n    "requirements": { "generated": boolean, "approved": boolean },\n    "design": { "generated": boolean, "approved": boolean },\n    "tasks": { "generated": boolean, "approved": boolean }\n  },\n  "ready_for_implementation": boolean\n}\n\`\`\`\n\n## Error Handling\n\n### Error Strategy\n- Phase validation with clear error messages\n- Graceful degradation for missing dependencies\n- Detailed logging for debugging\n\n### Error Categories\n**User Errors**: Invalid phase transitions → workflow guidance\n**System Errors**: File system failures → graceful error handling\n**Business Logic Errors**: Missing approvals → phase requirement messages\n\n## Testing Strategy\n\n- Unit Tests: SDD workflow engine methods\n- Integration Tests: MCP protocol communication\n- E2E Tests: Complete workflow execution\n- Performance Tests: Large project handling`;
    
    await fs.writeFile(path.join(featurePath, 'design.md'), designContent);
    
    // Update spec.json
    spec.phase = "design-generated";
    spec.approvals.design.generated = true;
    spec.updated_at = await getCurrentTimestamp();
    
    await fs.writeFile(specPath, JSON.stringify(spec, null, 2));
    
    return {
      content: [{
        type: 'text',
        text: `## Design Generated\n\nTechnical design document generated for feature: **${featureName}**\n\n**Generated**: .kiro/specs/${featureName}/design.md\n**Status**: Design phase completed\n\n**Next Step**: Review the design document, then use \`sdd-tasks\` to proceed to task planning phase`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error generating design: ${error.message}`
      }]
    };
  }
});

// 4. sdd-tasks - Generate task breakdown
server.registerTool("sdd-tasks", {
  title: "Generate Task Breakdown",
  description: "Generate task breakdown",
  inputSchema: {
    featureName: z.string().describe('Feature name from spec initialization')
  },
}, async ({ featureName }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    const specPath = path.join(featurePath, 'spec.json');
    
    // Read and validate spec
    const specContent = await fs.readFile(specPath, 'utf8');
    const spec = JSON.parse(specContent);
    
    if (!spec.approvals.design.generated) {
      return {
        content: [{
          type: 'text',
          text: `Error: Design must be generated before tasks. Run \`sdd-design ${featureName}\` first.`
        }]
      };
    }
    
    // Generate tasks document
    const tasksContent = `# Implementation Plan\n\n- [ ] 1. Set up MCP server foundation and infrastructure\n  - Initialize Node.js project with MCP SDK dependencies\n  - Configure server infrastructure and request handling\n  - Establish project directory structure and file operations\n  - Set up configuration and environment management\n  - _Requirements: All requirements need foundational setup_\n\n- [ ] 2. Build core SDD workflow engine\n- [ ] 2.1 Implement project initialization functionality\n  - Set up .kiro directory structure creation\n  - Implement spec.json metadata generation\n  - Build requirements template creation logic\n  - Add project state tracking mechanisms\n  - _Requirements: 1.1, 1.2, 1.3_\n\n- [ ] 2.2 Enable workflow phase management\n  - Implement phase transition validation logic\n  - Build approval tracking system\n  - Create workflow state persistence\n  - Develop phase progression controls\n  - _Requirements: 3.1, 3.2, 3.3_\n\n- [ ] 3. Implement document generation system\n- [ ] 3.1 Build requirements generation capabilities\n  - Implement EARS-format requirements generation\n  - Build project description integration\n  - Create structured documentation patterns\n  - Add requirements validation logic\n  - _Requirements: 2.1, 2.2, 2.3_\n\n- [ ] 3.2 Create design document generation\n  - Implement technical design template generation\n  - Build architecture diagram integration\n  - Create component specification logic\n  - Add design validation and approval tracking\n  - _Requirements: Design workflow requirements_\n\n- [ ] 3.3 Develop task breakdown functionality\n  - Implement task generation from design specifications\n  - Build sequential task numbering system\n  - Create requirements traceability mapping\n  - Add task completion tracking\n  - _Requirements: Task management requirements_\n\n- [ ] 4. Integrate quality analysis and review system\n- [ ] 4.1 Implement Linus-style code review engine\n  - Build 5-layer code analysis framework\n  - Implement AST-based code quality assessment\n  - Create quality report generation\n  - Add review criteria and scoring system\n  - _Requirements: Quality management requirements_\n\n- [ ] 5. Build MCP protocol integration\n- [ ] 5.1 Implement complete MCP tool registration\n  - Register all 10 SDD tools with proper schemas\n  - Implement tool execution handlers\n  - Build error handling and validation\n  - Add protocol compliance and communication\n  - _Requirements: All tool integration requirements_\n\n- [ ] 6. Add testing and validation\n- [ ] 6.1 Create comprehensive test suite\n  - Build unit tests for workflow engine\n  - Implement integration tests for MCP communication\n  - Create end-to-end workflow validation tests\n  - Add performance and reliability testing\n  - _Requirements: Testing and validation requirements_`;
    
    await fs.writeFile(path.join(featurePath, 'tasks.md'), tasksContent);
    
    // Update spec.json
    spec.phase = "tasks-generated";
    spec.approvals.tasks.generated = true;
    spec.ready_for_implementation = true;
    spec.updated_at = await getCurrentTimestamp();
    
    await fs.writeFile(specPath, JSON.stringify(spec, null, 2));
    
    return {
      content: [{
        type: 'text',
        text: `## Implementation Tasks Generated\n\nImplementation tasks document generated for feature: **${featureName}**\n\n**Generated**: .kiro/specs/${featureName}/tasks.md\n**Status**: Tasks phase completed\n**Ready for Implementation**: Yes\n\n**Next Step**: Review tasks, then use \`sdd-implement\` to begin implementation or \`sdd-status\` to check progress`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error generating tasks: ${error.message}`
      }]
    };
  }
});

// 5. sdd-implement - Implementation guidelines
server.registerTool("sdd-implement", {
  title: "Implementation Guidelines",
  description: "Implementation guidelines",
  inputSchema: {
    featureName: z.string().describe('Feature name from spec initialization')
  },
}, async ({ featureName }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    const specPath = path.join(featurePath, 'spec.json');
    
    // Read spec
    const specContent = await fs.readFile(specPath, 'utf8');
    const spec = JSON.parse(specContent);
    
    if (!spec.ready_for_implementation) {
      return {
        content: [{
          type: 'text',
          text: `Error: Project not ready for implementation. Complete requirements, design, and tasks phases first.`
        }]
      };
    }
    
    return {
      content: [{
        type: 'text',
        text: `## Implementation Guidelines for ${featureName}\n\n**Project Status**: Ready for implementation\n**Current Phase**: ${spec.phase}\n\n**Implementation Instructions**:\n1. Work through tasks sequentially as defined in tasks.md\n2. Follow the technical design specifications in design.md\n3. Ensure all requirements from requirements.md are satisfied\n4. Use \`sdd-quality-check\` to validate code quality\n5. Mark tasks as completed in tasks.md as you progress\n\n**Key Principles**:\n- Follow established coding patterns and conventions\n- Implement comprehensive error handling\n- Add appropriate logging and monitoring\n- Write tests for each component\n- Validate against requirements at each step\n\n**Next Steps**:\n- Begin with Task 1: Set up MCP server foundation\n- Use the design document as your implementation guide\n- Run quality checks regularly during development`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error getting implementation guidelines: ${error.message}`
      }]
    };
  }
});

// 6. sdd-status - Check workflow progress
server.registerTool("sdd-status", {
  title: "Check Workflow Progress",
  description: "Check workflow progress",
  inputSchema: {
    featureName: z.string().optional().describe('Feature name (optional - shows all if not provided)')
  },
}, async ({ featureName }) => {
  try {
    const currentPath = process.cwd();
    const kiroPath = path.join(currentPath, '.kiro');
    
    // Check if .kiro directory exists
    const kiroExists = await fs.access(kiroPath).then(() => true).catch(() => false);
    if (!kiroExists) {
      return {
        content: [{
          type: 'text',
          text: 'SDD project status: No active project found. Use sdd-init to create a new project.'
        }]
      };
    }
    
    const specsPath = path.join(kiroPath, 'specs');
    
    if (featureName) {
      // Show status for specific feature
      const featurePath = path.join(specsPath, featureName);
      const specPath = path.join(featurePath, 'spec.json');
      
      const specExists = await fs.access(specPath).then(() => true).catch(() => false);
      if (!specExists) {
        return {
          content: [{
            type: 'text',
            text: `Feature "${featureName}" not found. Use sdd-init to create it.`
          }]
        };
      }
      
      const specContent = await fs.readFile(specPath, 'utf8');
      const spec = JSON.parse(specContent);
      
      let status = `## SDD Project Status: ${spec.feature_name}\n\n`;
      status += `**Current Phase**: ${spec.phase}\n`;
      status += `**Language**: ${spec.language}\n`;
      status += `**Created**: ${spec.created_at}\n`;
      status += `**Updated**: ${spec.updated_at}\n\n`;
      
      status += `**Phase Progress**:\n`;
      status += `- Requirements: ${spec.approvals.requirements.generated ? '✅ Generated' : '❌ Not Generated'}${spec.approvals.requirements.approved ? ', ✅ Approved' : ', ❌ Not Approved'}\n`;
      status += `- Design: ${spec.approvals.design.generated ? '✅ Generated' : '❌ Not Generated'}${spec.approvals.design.approved ? ', ✅ Approved' : ', ❌ Not Approved'}\n`;
      status += `- Tasks: ${spec.approvals.tasks.generated ? '✅ Generated' : '❌ Not Generated'}${spec.approvals.tasks.approved ? ', ✅ Approved' : ', ❌ Not Approved'}\n\n`;
      
      status += `**Ready for Implementation**: ${spec.ready_for_implementation ? '✅ Yes' : '❌ No'}\n\n`;
      
      // Suggest next steps
      if (!spec.approvals.requirements.generated) {
        status += `**Next Step**: Run \`sdd-requirements ${featureName}\``;
      } else if (!spec.approvals.design.generated) {
        status += `**Next Step**: Run \`sdd-design ${featureName}\``;
      } else if (!spec.approvals.tasks.generated) {
        status += `**Next Step**: Run \`sdd-tasks ${featureName}\``;
      } else {
        status += `**Next Step**: Run \`sdd-implement ${featureName}\` to begin implementation`;
      }
      
      return {
        content: [{
          type: 'text',
          text: status
        }]
      };
    } else {
      // Show all features
      const features = await fs.readdir(specsPath).catch(() => []);
      
      if (features.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No SDD features found. Use sdd-init to create a new project.'
          }]
        };
      }
      
      let status = `## SDD Project Status - All Features\n\n`;
      
      for (const feature of features) {
        const specPath = path.join(specsPath, feature, 'spec.json');
        const specExists = await fs.access(specPath).then(() => true).catch(() => false);
        
        if (specExists) {
          const specContent = await fs.readFile(specPath, 'utf8');
          const spec = JSON.parse(specContent);
          
          status += `**${spec.feature_name}**:\n`;
          status += `- Phase: ${spec.phase}\n`;
          status += `- Requirements: ${spec.approvals.requirements.generated ? '✅' : '❌'}\n`;
          status += `- Design: ${spec.approvals.design.generated ? '✅' : '❌'}\n`;
          status += `- Tasks: ${spec.approvals.tasks.generated ? '✅' : '❌'}\n`;
          status += `- Ready: ${spec.ready_for_implementation ? '✅' : '❌'}\n\n`;
        }
      }
      
      return {
        content: [{
          type: 'text',
          text: status
        }]
      };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error checking status: ${error.message}`
      }]
    };
  }
});

// 7. sdd-approve - Approve workflow phases
server.registerTool("sdd-approve", {
  title: "Approve Workflow Phases",
  description: "Approve workflow phases",
  inputSchema: {
    featureName: z.string().describe('Feature name from spec initialization'),
    phase: z.enum(['requirements', 'design', 'tasks']).describe('Phase to approve')
  },
}, async ({ featureName, phase }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    const specPath = path.join(featurePath, 'spec.json');
    
    // Read spec
    const specContent = await fs.readFile(specPath, 'utf8');
    const spec = JSON.parse(specContent);
    
    if (!spec.approvals[phase].generated) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${phase} must be generated before approval. Run sdd-${phase} ${featureName} first.`
        }]
      };
    }
    
    // Approve the phase
    spec.approvals[phase].approved = true;
    spec.updated_at = await getCurrentTimestamp();
    
    await fs.writeFile(specPath, JSON.stringify(spec, null, 2));
    
    return {
      content: [{
        type: 'text',
        text: `## Phase Approved\n\n**Feature**: ${featureName}\n**Phase**: ${phase}\n**Status**: ✅ Approved\n\nPhase has been marked as approved and workflow can proceed to the next phase.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error approving phase: ${error.message}`
      }]
    };
  }
});

// 8. sdd-quality-check - Code quality analysis
server.registerTool("sdd-quality-check", {
  title: "Code Quality Analysis",
  description: "Code quality analysis",
  inputSchema: {
    code: z.string().describe('Code to analyze'),
    language: z.string().optional().describe('Programming language (default: javascript)')
  },
}, async ({ code, language = 'javascript' }) => {
  try {
    // Simple quality analysis (Linus-style 5-layer approach)
    const lines = code.split('\n');
    const issues = [];
    
    // Layer 1: Syntax and Basic Structure
    if (code.includes('console.log')) {
      issues.push('L1: Remove debug console.log statements');
    }
    if (code.includes('var ')) {
      issues.push('L1: Use let/const instead of var');
    }
    
    // Layer 2: Code Style and Conventions
    if (!/^[a-z]/.test(code.split('function ')[1]?.split('(')[0] || '')) {
      if (code.includes('function ')) {
        issues.push('L2: Function names should start with lowercase');
      }
    }
    
    // Layer 3: Logic and Algorithm
    if (code.includes('for') && !code.includes('const')) {
      issues.push('L3: Consider using const in for loops for immutable iteration variables');
    }
    
    // Layer 4: Architecture and Design
    if (lines.length > 50) {
      issues.push('L4: Function/module is too long, consider breaking into smaller parts');
    }
    
    // Layer 5: Business Logic and Requirements
    if (!code.includes('error') && code.includes('try')) {
      issues.push('L5: Missing proper error handling in try block');
    }
    
    const qualityScore = Math.max(0, 100 - (issues.length * 15));
    
    let report = `## Linus-Style Code Quality Analysis\n\n`;
    report += `**Language**: ${language}\n`;
    report += `**Lines of Code**: ${lines.length}\n`;
    report += `**Quality Score**: ${qualityScore}/100\n\n`;
    
    if (issues.length === 0) {
      report += `**Status**: ✅ Code quality is excellent\n\n`;
      report += `**Analysis**: No significant issues found. Code follows good practices.`;
    } else {
      report += `**Issues Found**: ${issues.length}\n\n`;
      report += `**Quality Issues**:\n`;
      for (const issue of issues) {
        report += `- ${issue}\n`;
      }
      report += `\n**Recommendation**: Address the identified issues to improve code quality.`;
    }
    
    return {
      content: [{
        type: 'text',
        text: report
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error analyzing code quality: ${error.message}`
      }]
    };
  }
});

// 9. sdd-context-load - Load project context
server.registerTool("sdd-context-load", {
  title: "Load Project Context",
  description: "Load project context",
  inputSchema: {
    featureName: z.string().describe('Feature name to load context for')
  },
}, async ({ featureName }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    
    // Load all context files
    const files = ['spec.json', 'requirements.md', 'design.md', 'tasks.md'];
    const context = {};
    
    for (const file of files) {
      const filePath = path.join(featurePath, file);
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      
      if (fileExists) {
        const content = await fs.readFile(filePath, 'utf8');
        context[file] = file.endsWith('.json') ? JSON.parse(content) : content;
      }
    }
    
    let contextReport = `## Project Context Loaded: ${featureName}\n\n`;
    
    if (context['spec.json']) {
      const spec = context['spec.json'];
      contextReport += `**Project Metadata**:\n`;
      contextReport += `- Feature: ${spec.feature_name}\n`;
      contextReport += `- Phase: ${spec.phase}\n`;
      contextReport += `- Language: ${spec.language}\n`;
      contextReport += `- Ready for Implementation: ${spec.ready_for_implementation ? 'Yes' : 'No'}\n\n`;
    }
    
    contextReport += `**Available Documents**:\n`;
    for (const [file, content] of Object.entries(context)) {
      if (file !== 'spec.json') {
        const preview = typeof content === 'string' ? content.substring(0, 100) + '...' : 'JSON data';
        contextReport += `- **${file}**: ${preview}\n`;
      }
    }
    
    contextReport += `\n**Context Status**: Project memory restored successfully\n`;
    contextReport += `**Total Files Loaded**: ${Object.keys(context).length}`;
    
    return {
      content: [{
        type: 'text',
        text: contextReport
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error loading project context: ${error.message}`
      }]
    };
  }
});

// 10. sdd-template-render - Render templates
server.registerTool("sdd-template-render", {
  title: "Render Templates",
  description: "Render templates",
  inputSchema: {
    templateType: z.enum(['requirements', 'design', 'tasks', 'custom']).describe('Type of template to render'),
    featureName: z.string().describe('Feature name for template context'),
    customTemplate: z.string().optional().describe('Custom template content (if templateType is custom)')
  },
}, async ({ templateType, featureName, customTemplate }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    const specPath = path.join(featurePath, 'spec.json');
    
    // Load spec for context
    const specExists = await fs.access(specPath).then(() => true).catch(() => false);
    let spec = {};
    if (specExists) {
      const specContent = await fs.readFile(specPath, 'utf8');
      spec = JSON.parse(specContent);
    }
    
    let renderedContent = '';
    
    switch (templateType) {
      case 'requirements':
        renderedContent = `# Requirements Template for ${featureName}\n\n## Project Context\n- Feature: ${spec.feature_name || featureName}\n- Language: ${spec.language || 'en'}\n\n## Requirements Sections\n1. Functional Requirements\n2. Non-Functional Requirements\n3. Business Rules\n4. Acceptance Criteria (EARS format)`;
        break;
        
      case 'design':
        renderedContent = `# Design Template for ${featureName}\n\n## Architecture Overview\n- System Architecture\n- Component Design\n- Data Models\n- Interface Specifications\n\n## Technology Decisions\n- Stack Selection\n- Framework Choices\n- Integration Patterns`;
        break;
        
      case 'tasks':
        renderedContent = `# Tasks Template for ${featureName}\n\n## Implementation Tasks\n\n- [ ] 1. Foundation Setup\n  - Project initialization\n  - Dependencies setup\n  - Basic structure\n\n- [ ] 2. Core Implementation\n  - Main functionality\n  - Business logic\n  - Data handling\n\n- [ ] 3. Integration & Testing\n  - System integration\n  - Testing implementation\n  - Quality validation`;
        break;
        
      case 'custom':
        if (!customTemplate) {
          throw new Error('Custom template content is required for custom template type');
        }
        // Simple template variable replacement
        renderedContent = customTemplate
          .replace(/\{\{featureName\}\}/g, featureName)
          .replace(/\{\{language\}\}/g, spec.language || 'en')
          .replace(/\{\{phase\}\}/g, spec.phase || 'initialized')
          .replace(/\{\{timestamp\}\}/g, new Date().toISOString());
        break;
    }
    
    return {
      content: [{
        type: 'text',
        text: `## Template Rendered: ${templateType}\n\n**Feature**: ${featureName}\n**Template Type**: ${templateType}\n\n**Rendered Content**:\n\`\`\`markdown\n${renderedContent}\n\`\`\`\n\n**Usage**: Copy the rendered content to create your ${templateType} document`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error rendering template: ${error.message}`
      }]
    };
  }
});

// 11. sdd-steering - Create/update steering documents
server.registerTool("sdd-steering", {
  title: "Create/Update Steering Documents",
  description: "Create or update steering documents",
  inputSchema: {
    updateMode: z.enum(['create', 'update']).optional().describe('Whether to create new or update existing documents (auto-detected if not specified)')
  },
}, async ({ updateMode }) => {
  try {
    const currentPath = process.cwd();
    const steeringPath = path.join(currentPath, '.kiro', 'steering');
    
    // Create steering directory if it doesn't exist
    await fs.mkdir(steeringPath, { recursive: true });
    
    // Analyze existing files
    const productExists = await fs.access(path.join(steeringPath, 'product.md')).then(() => true).catch(() => false);
    const techExists = await fs.access(path.join(steeringPath, 'tech.md')).then(() => true).catch(() => false);
    const structureExists = await fs.access(path.join(steeringPath, 'structure.md')).then(() => true).catch(() => false);
    
    // Auto-detect mode if not specified
    if (!updateMode) {
      updateMode = (productExists || techExists || structureExists) ? 'update' : 'create';
    }
    
    // Analyze project structure dynamically
    const projectAnalysis = await analyzeProject(currentPath);
    
    // Generate dynamic documents based on actual project analysis
    const productContent = generateProductDocument(projectAnalysis);
    const techContent = generateTechDocument(projectAnalysis);
    const structureContent = generateStructureDocument(projectAnalysis);
    
    // Write the dynamically generated documents
    await fs.writeFile(path.join(steeringPath, 'product.md'), productContent);
    await fs.writeFile(path.join(steeringPath, 'tech.md'), techContent);
    await fs.writeFile(path.join(steeringPath, 'structure.md'), structureContent);
    
    // Ensure static steering docs exist (exceptions)
    const linusPath = path.join(steeringPath, 'linus-review.md');
    const linusExists = await fs.access(linusPath).then(() => true).catch(() => false);
    if (!linusExists) {
      await fs.writeFile(linusPath, `# Linus Torvalds Code Review Steering Document\n\nFollow Linus-style pragmatism and simplicity. Never break userspace. Keep functions focused, minimize indentation, and eliminate special cases. Apply 5-layer analysis: Data structures, special cases, complexity, breaking changes, practicality.`);
    }
    const commitPath = path.join(steeringPath, 'commit.md');
    const commitExists = await fs.access(commitPath).then(() => true).catch(() => false);
    if (!commitExists) {
      await fs.writeFile(commitPath, `# Commit Message Guidelines\n\nUse conventional type prefixes (docs, chore, feat, fix, refactor, test, style, perf, ci). Format: <type>(<scope>): <subject>\n\nKeep subjects < 72 chars, imperative mood, and add body/footer when needed.`);
    }
    
    const mode = updateMode === 'update' ? 'Updated' : 'Created';
    
    return {
      content: [{
        type: 'text',
        text: `## Steering Documents ${mode}

**Project**: ${projectAnalysis.name}
**Version**: ${projectAnalysis.version}
**Architecture**: ${projectAnalysis.architecture}
**Mode**: ${updateMode}

**${mode} Files**:
- \`.kiro/steering/product.md\` - Product overview and business context (dynamically generated)
- \`.kiro/steering/tech.md\` - Technology stack and development environment (dynamically generated)
- \`.kiro/steering/structure.md\` - Project organization and architectural decisions (dynamically generated)

**Dynamic Analysis Results**:
- **Language**: ${projectAnalysis.language === 'typescript' ? 'TypeScript' : 'JavaScript'}
- **Framework**: ${projectAnalysis.framework || 'None detected'}
- **Dependencies**: ${projectAnalysis.dependencies.length} production, ${projectAnalysis.devDependencies.length} development
- **Test Framework**: ${projectAnalysis.testFramework || 'None detected'}
- **Build Tool**: ${projectAnalysis.buildTool || 'None detected'}
- **Project Structure**: ${projectAnalysis.directories.length} directories analyzed
- **CI/CD**: ${projectAnalysis.hasCI ? 'Configured' : 'Not configured'}
- **Docker**: ${projectAnalysis.hasDocker ? 'Configured' : 'Not configured'}

These steering documents were dynamically generated based on actual project analysis and provide accurate, up-to-date context for AI interactions.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error creating/updating steering documents: ${error.message}`
      }]
    };
  }
});

// 12. sdd-steering-custom - Create custom steering documents
server.registerTool("sdd-steering-custom", {
  title: "Create Custom Steering Document",
  description: "Create custom steering documents",
  inputSchema: {
    fileName: z.string().describe('Filename for the custom steering document (e.g., "api-standards.md")'),
    topic: z.string().describe('Topic/purpose of the custom steering document'),
    inclusionMode: z.enum(['always', 'conditional', 'manual']).describe('How this steering document should be included'),
    filePattern: z.string().optional().describe('File pattern for conditional inclusion (e.g., "*.test.js", "src/api/**/*")')
  },
}, async ({ fileName, topic, inclusionMode, filePattern }) => {
  try {
    const currentPath = process.cwd();
    const steeringPath = path.join(currentPath, '.kiro', 'steering');
    
    // Create steering directory if it doesn't exist
    await fs.mkdir(steeringPath, { recursive: true });
    
    // Ensure filename ends with .md
    if (!fileName.endsWith('.md')) {
      fileName += '.md';
    }
    
    // Generate inclusion mode comment
    let inclusionComment = '<!-- Inclusion Mode: ';
    if (inclusionMode === 'always') {
      inclusionComment += 'Always -->';
    } else if (inclusionMode === 'conditional') {
      inclusionComment += `Conditional: "${filePattern || '**/*'}" -->`;
    } else {
      inclusionComment += 'Manual -->';
    }
    
    // Generate content based on topic
    let content = `${inclusionComment}
    
# ${topic}

## Purpose
This document provides specialized guidance for ${topic.toLowerCase()} within the project context.

## When This Document Applies
${inclusionMode === 'conditional' ? 
  `This guidance applies when working with files matching: \`${filePattern || '**/*'}\`` :
  inclusionMode === 'always' ? 
  'This guidance applies to all development work in this project.' :
  'Reference this document manually using @${fileName} when needed.'}

## Guidelines

### Key Principles
- [Add specific principles for ${topic.toLowerCase()}]
- [Include concrete rules and patterns]
- [Provide rationale for important decisions]

### Implementation Patterns
\`\`\`
// Example code patterns for ${topic.toLowerCase()}
// Include specific examples relevant to your project
\`\`\`

### Best Practices
1. **Practice 1**: Description and rationale
2. **Practice 2**: Description and rationale
3. **Practice 3**: Description and rationale

## Integration Points
- Related to core steering: product.md, tech.md, structure.md
- Dependencies: [List any prerequisites or related documents]
- Conflicts: [Note any potential conflicts with other guidance]

## Examples
\`\`\`
// Concrete examples of correct implementation
// Show both correct patterns and counter-examples if helpful
\`\`\`

## Quality Standards
- [Specific quality criteria for ${topic.toLowerCase()}]
- [Testing requirements]
- [Review checklist items]`;

    const filePath = path.join(steeringPath, fileName);
    await fs.writeFile(filePath, content);
    
    return {
      content: [{
        type: 'text',
        text: `## Custom Steering Document Created

**File**: .kiro/steering/${fileName}
**Topic**: ${topic}
**Inclusion Mode**: ${inclusionMode}${inclusionMode === 'conditional' ? ` (Pattern: "${filePattern}")` : ''}

**Created**: Custom steering document with template structure
**Usage**: ${
  inclusionMode === 'always' ? 'Will be loaded in all AI interactions' :
  inclusionMode === 'conditional' ? `Will be loaded when working with files matching "${filePattern}"` :
  `Reference manually with @${fileName} when needed`
}

The document has been created with a standard template structure. Edit the file to add your specific guidelines, examples, and best practices for ${topic.toLowerCase()}.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error creating custom steering document: ${error.message}`
      }]
    };
  }
});

// 13. sdd-validate-design - Interactive design quality review
server.registerTool("sdd-validate-design", {
  title: "Validate Design Quality",
  description: "Interactive design quality review and validation",
  inputSchema: {
    featureName: z.string().describe('Feature name to validate design for')
  },
}, async ({ featureName }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    const designPath = path.join(featurePath, 'design.md');
    const specPath = path.join(featurePath, 'spec.json');
    
    // Check if design document exists
    const designExists = await fs.access(designPath).then(() => true).catch(() => false);
    if (!designExists) {
      return {
        content: [{
          type: 'text',
          text: `Error: Design document not found. Run \`sdd-design ${featureName}\` first to generate design document.`
        }]
      };
    }
    
    // Load design and spec
    const designContent = await fs.readFile(designPath, 'utf8');
    const specContent = await fs.readFile(specPath, 'utf8');
    const spec = JSON.parse(specContent);
    
    // Analyze design for critical issues
    const issues = [];
    
    // Check for type safety (if TypeScript patterns detected)
    if (designContent.includes('any') || designContent.includes(': any')) {
      issues.push({
        title: "Type Safety Concern",
        concern: "Design mentions 'any' types which compromises type safety",
        impact: "Reduces code reliability and IDE support",
        suggestion: "Define explicit interfaces and types for all data structures"
      });
    }
    
    // Check for architectural patterns
    if (!designContent.includes('Component') && !designContent.includes('Service') && !designContent.includes('Module')) {
      issues.push({
        title: "Architecture Clarity",
        concern: "Design lacks clear component or service boundaries",
        impact: "May lead to monolithic or poorly organized code",
        suggestion: "Define clear components, services, or modules with specific responsibilities"
      });
    }
    
    // Check for error handling
    if (!designContent.includes('error') && !designContent.includes('Error')) {
      issues.push({
        title: "Error Handling Strategy",
        concern: "Design doesn't address error handling patterns",
        impact: "Runtime errors may not be properly managed",
        suggestion: "Add comprehensive error handling strategy and exception management"
      });
    }
    
    // Limit to 3 most critical issues
    const criticalIssues = issues.slice(0, 3);
    
    // Identify design strengths
    const strengths = [];
    if (designContent.includes('mermaid') || designContent.includes('```')) {
      strengths.push("Visual documentation with diagrams and code examples");
    }
    if (designContent.includes('interface') || designContent.includes('Interface')) {
      strengths.push("Clear interface definitions and contracts");
    }
    
    // Make GO/NO-GO decision
    const hasBlockingIssues = criticalIssues.length > 2 || 
      criticalIssues.some(issue => issue.title.includes('Architecture') || issue.title.includes('Type Safety'));
    
    const decision = hasBlockingIssues ? 'NO-GO' : 'GO';
    const nextStep = decision === 'GO' ? 
      `Run \`sdd-tasks ${featureName}\` to generate implementation tasks` :
      `Address critical issues in design document before proceeding`;
    
    let report = `## Design Validation Review: ${featureName}\n\n`;
    report += `**Overall Assessment**: ${decision === 'GO' ? '✅ Design ready for implementation' : '❌ Design needs revision'}\n\n`;
    
    if (criticalIssues.length > 0) {
      report += `### Critical Issues (${criticalIssues.length})\n\n`;
      criticalIssues.forEach((issue, index) => {
        report += `🔴 **Critical Issue ${index + 1}**: ${issue.title}\n`;
        report += `**Concern**: ${issue.concern}\n`;
        report += `**Impact**: ${issue.impact}\n`;
        report += `**Suggestion**: ${issue.suggestion}\n\n`;
      });
    }
    
    if (strengths.length > 0) {
      report += `### Design Strengths\n\n`;
      strengths.forEach(strength => {
        report += `✅ ${strength}\n`;
      });
      report += `\n`;
    }
    
    report += `### Final Assessment\n`;
    report += `**Decision**: ${decision}\n`;
    report += `**Rationale**: ${
      decision === 'GO' ? 
      'Design addresses core requirements with acceptable architectural approach and manageable risks.' :
      'Critical architectural or technical issues need resolution before implementation can proceed safely.'
    }\n`;
    report += `**Next Steps**: ${nextStep}\n\n`;
    
    report += `### Interactive Discussion\n`;
    report += `Questions for design review:\n`;
    report += `1. Do you agree with the identified issues and their severity?\n`;
    report += `2. Are there alternative approaches to address the concerns?\n`;
    report += `3. What are your thoughts on the overall design complexity?\n`;
    report += `4. Are there any design decisions that need clarification?\n`;
    
    return {
      content: [{
        type: 'text',
        text: report
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error validating design: ${error.message}`
      }]
    };
  }
});

// 14. sdd-validate-gap - Analyze implementation gap
server.registerTool("sdd-validate-gap", {
  title: "Validate Implementation Gap",
  description: "Analyze implementation gap between requirements and codebase",
  inputSchema: {
    featureName: z.string().describe('Feature name to analyze implementation gap for')
  },
}, async ({ featureName }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    const requirementsPath = path.join(featurePath, 'requirements.md');
    const specPath = path.join(featurePath, 'spec.json');
    
    // Check if requirements exist
    const requirementsExist = await fs.access(requirementsPath).then(() => true).catch(() => false);
    if (!requirementsExist) {
      return {
        content: [{
          type: 'text',
          text: `Error: Requirements document not found. Run \`sdd-requirements ${featureName}\` first to generate requirements.`
        }]
      };
    }
    
    // Load requirements and spec
    const requirementsContent = await fs.readFile(requirementsPath, 'utf8');
    const specContent = await fs.readFile(specPath, 'utf8');
    const spec = JSON.parse(specContent);
    
    // Analyze current codebase
    const codebaseAnalysis = {
      hasPackageJson: await fs.access('package.json').then(() => true).catch(() => false),
      hasSourceCode: false,
      techStack: [],
      architecture: 'Unknown'
    };
    
    if (codebaseAnalysis.hasPackageJson) {
      const packageContent = await fs.readFile('package.json', 'utf8');
      const packageJson = JSON.parse(packageContent);
      codebaseAnalysis.techStack = Object.keys(packageJson.dependencies || {});
      codebaseAnalysis.architecture = 'Node.js Application';
    }
    
    // Check for source directories
    const srcExists = await fs.access('src').then(() => true).catch(() => false);
    const libExists = await fs.access('lib').then(() => true).catch(() => false);
    codebaseAnalysis.hasSourceCode = srcExists || libExists;
    
    // Extract requirements complexity
    const requirements = requirementsContent.match(/WHEN|IF|WHILE|WHERE/g) || [];
    const complexity = requirements.length > 10 ? 'XL' : 
                      requirements.length > 6 ? 'L' :
                      requirements.length > 3 ? 'M' : 'S';
    
    // Identify gaps and implementation approaches
    const gaps = [];
    if (!codebaseAnalysis.hasSourceCode) {
      gaps.push("No existing source code structure - requires full implementation from scratch");
    }
    if (!codebaseAnalysis.techStack.includes('@modelcontextprotocol/sdk')) {
      gaps.push("MCP SDK integration required for AI tool compatibility");
    }
    if (requirementsContent.includes('database') || requirementsContent.includes('storage')) {
      gaps.push("Data storage layer needs to be designed and implemented");
    }
    
    // Implementation strategy options
    const strategies = [
      {
        approach: "Extension",
        rationale: codebaseAnalysis.hasSourceCode ? 
          "Extend existing codebase with new functionality" : 
          "Not applicable - no existing codebase to extend",
        applicable: codebaseAnalysis.hasSourceCode,
        complexity: codebaseAnalysis.hasSourceCode ? 'M' : 'N/A',
        tradeoffs: codebaseAnalysis.hasSourceCode ? 
          "Pros: Maintains consistency, faster development. Cons: May introduce technical debt" :
          "N/A"
      },
      {
        approach: "New Implementation",
        rationale: "Create new components following established patterns",
        applicable: true,
        complexity: complexity,
        tradeoffs: "Pros: Clean architecture, full control. Cons: More development time, integration complexity"
      },
      {
        approach: "Hybrid",
        rationale: "Combine extension of existing components with new development where needed",
        applicable: codebaseAnalysis.hasSourceCode,
        complexity: codebaseAnalysis.hasSourceCode ? 'L' : 'M',
        tradeoffs: "Pros: Balanced approach, optimal resource usage. Cons: Requires careful integration planning"
      }
    ];
    
    const applicableStrategies = strategies.filter(s => s.applicable);
    const recommendedStrategy = applicableStrategies.find(s => s.approach === 'Hybrid') || 
                              applicableStrategies.find(s => s.approach === 'New Implementation');
    
    let report = `## Implementation Gap Analysis: ${featureName}\n\n`;
    
    report += `### Analysis Summary\n`;
    report += `- **Feature Complexity**: ${complexity} (based on ${requirements.length} requirements)\n`;
    report += `- **Existing Codebase**: ${codebaseAnalysis.hasSourceCode ? 'Source code detected' : 'No source code structure'}\n`;
    report += `- **Technology Stack**: ${codebaseAnalysis.techStack.length} dependencies\n`;
    report += `- **Architecture Type**: ${codebaseAnalysis.architecture}\n\n`;
    
    report += `### Existing Codebase Insights\n`;
    report += `- **Package Management**: ${codebaseAnalysis.hasPackageJson ? 'npm/package.json configured' : 'No package.json found'}\n`;
    report += `- **Source Structure**: ${codebaseAnalysis.hasSourceCode ? 'Established source directories' : 'No conventional source structure'}\n`;
    report += `- **Key Dependencies**: ${codebaseAnalysis.techStack.slice(0, 5).join(', ') || 'None detected'}\n\n`;
    
    if (gaps.length > 0) {
      report += `### Implementation Gaps Identified\n`;
      gaps.forEach(gap => report += `- ${gap}\n`);
      report += `\n`;
    }
    
    report += `### Implementation Strategy Options\n\n`;
    applicableStrategies.forEach(strategy => {
      report += `**${strategy.approach} Approach**:\n`;
      report += `- **Rationale**: ${strategy.rationale}\n`;
      report += `- **Complexity**: ${strategy.complexity}\n`;
      report += `- **Trade-offs**: ${strategy.tradeoffs}\n\n`;
    });
    
    report += `### Technical Research Needs\n`;
    const researchNeeds = [];
    if (!codebaseAnalysis.techStack.includes('@modelcontextprotocol/sdk')) {
      researchNeeds.push("MCP SDK integration patterns and best practices");
    }
    if (requirementsContent.includes('template') || requirementsContent.includes('generation')) {
      researchNeeds.push("Template engine selection and implementation");
    }
    if (requirementsContent.includes('workflow') || requirementsContent.includes('state')) {
      researchNeeds.push("State machine or workflow engine patterns");
    }
    
    if (researchNeeds.length > 0) {
      researchNeeds.forEach(need => report += `- ${need}\n`);
    } else {
      report += `- No significant research dependencies identified\n`;
    }
    report += `\n`;
    
    report += `### Recommendations for Design Phase\n`;
    report += `- **Preferred Approach**: ${recommendedStrategy.approach} (${recommendedStrategy.complexity} complexity)\n`;
    report += `- **Key Decisions**: Architecture patterns, technology integration, component boundaries\n`;
    report += `- **Risk Mitigation**: ${complexity === 'XL' || complexity === 'L' ? 'Consider phased implementation approach' : 'Standard development approach acceptable'}\n`;
    report += `- **Next Step**: Use this analysis to inform technical design decisions\n`;
    
    return {
      content: [{
        type: 'text',
        text: report
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error analyzing implementation gap: ${error.message}`
      }]
    };
  }
});

// 15. sdd-spec-impl - Execute spec tasks using TDD
server.registerTool("sdd-spec-impl", {
  title: "Execute Spec Tasks with TDD",
  description: "Execute spec tasks using TDD methodology",
  inputSchema: {
    featureName: z.string().describe('Feature name to execute tasks for'),
    taskNumbers: z.string().optional().describe('Specific task numbers to execute (e.g., "1.1,2.3" or leave empty for all pending)')
  },
}, async ({ featureName, taskNumbers }) => {
  try {
    const currentPath = process.cwd();
    const featurePath = path.join(currentPath, '.kiro', 'specs', featureName);
    const tasksPath = path.join(featurePath, 'tasks.md');
    const requirementsPath = path.join(featurePath, 'requirements.md');
    const designPath = path.join(featurePath, 'design.md');
    const specPath = path.join(featurePath, 'spec.json');
    
    // Validate required files exist
    const requiredFiles = [
      { path: requirementsPath, name: 'requirements.md' },
      { path: designPath, name: 'design.md' },
      { path: tasksPath, name: 'tasks.md' },
      { path: specPath, name: 'spec.json' }
    ];
    
    for (const file of requiredFiles) {
      const exists = await fs.access(file.path).then(() => true).catch(() => false);
      if (!exists) {
        return {
          content: [{
            type: 'text',
            text: `Error: Required file ${file.name} not found. Complete the full spec workflow first:\n1. sdd-requirements ${featureName}\n2. sdd-design ${featureName}\n3. sdd-tasks ${featureName}`
          }]
        };
      }
    }
    
    // Load all context documents
    const tasksContent = await fs.readFile(tasksPath, 'utf8');
    const specContent = await fs.readFile(specPath, 'utf8');
    const spec = JSON.parse(specContent);
    
    // Parse tasks to find pending ones
    const taskLines = tasksContent.split('\n');
    const tasks = [];
    let currentMajorTask = null;
    
    for (let i = 0; i < taskLines.length; i++) {
      const line = taskLines[i].trim();
      
      // Match major tasks (- [ ] 1. Task name)
      const majorMatch = line.match(/^- \[([ x])\] (\d+)\. (.+)$/);
      if (majorMatch) {
        currentMajorTask = {
          number: majorMatch[2],
          description: majorMatch[3],
          completed: majorMatch[1] === 'x',
          subtasks: []
        };
        tasks.push(currentMajorTask);
        continue;
      }
      
      // Match sub-tasks (- [ ] 1.1 Subtask name)
      const subMatch = line.match(/^- \[([ x])\] (\d+\.\d+) (.+)$/);
      if (subMatch && currentMajorTask) {
        currentMajorTask.subtasks.push({
          number: subMatch[2],
          description: subMatch[3],
          completed: subMatch[1] === 'x'
        });
      }
    }
    
    // Filter tasks based on taskNumbers parameter
    let tasksToExecute = [];
    if (taskNumbers) {
      const requestedNumbers = taskNumbers.split(',').map(n => n.trim());
      for (const task of tasks) {
        if (requestedNumbers.includes(task.number) && !task.completed) {
          tasksToExecute.push({ type: 'major', task });
        }
        for (const subtask of task.subtasks) {
          if (requestedNumbers.includes(subtask.number) && !subtask.completed) {
            tasksToExecute.push({ type: 'subtask', task: subtask, parent: task });
          }
        }
      }
    } else {
      // Get all pending tasks
      for (const task of tasks) {
        if (!task.completed) {
          tasksToExecute.push({ type: 'major', task });
        }
        for (const subtask of task.subtasks) {
          if (!subtask.completed) {
            tasksToExecute.push({ type: 'subtask', task: subtask, parent: task });
          }
        }
      }
    }
    
    if (tasksToExecute.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `## No Pending Tasks Found\n\n**Feature**: ${featureName}\n**Status**: ${taskNumbers ? 'Specified tasks already completed or not found' : 'All tasks already completed'}\n\n${taskNumbers ? `**Requested**: ${taskNumbers}` : '**All tasks**: ✅ Completed'}\n\nUse \`sdd-status ${featureName}\` to check current progress.`
        }]
      };
    }
    
    // Generate TDD implementation guidance for the tasks
    let report = `## TDD Implementation Execution: ${featureName}\n\n`;
    report += `**Tasks to Execute**: ${tasksToExecute.length} pending tasks\n`;
    report += `**TDD Methodology**: Kent Beck's Red → Green → Refactor cycle\n\n`;
    
    report += `### Context Loaded\n`;
    report += `- ✅ Requirements: .kiro/specs/${featureName}/requirements.md\n`;
    report += `- ✅ Design: .kiro/specs/${featureName}/design.md\n`;
    report += `- ✅ Tasks: .kiro/specs/${featureName}/tasks.md\n`;
    report += `- ✅ Metadata: .kiro/specs/${featureName}/spec.json\n\n`;
    
    report += `### TDD Implementation Plan\n\n`;
    
    tasksToExecute.slice(0, 5).forEach((item, index) => {
      const task = item.task;
      const taskNumber = item.type === 'subtask' ? task.number : task.number;
      const taskDesc = task.description;
      
      report += `**Task ${taskNumber}**: ${taskDesc}\n\n`;
      report += `**TDD Cycle for this task**:\n`;
      report += `1. 🔴 **RED**: Write failing tests for "${taskDesc}"\n`;
      report += `   - Define test cases that specify expected behavior\n`;
      report += `   - Ensure tests fail initially (no implementation yet)\n`;
      report += `   - Verify test framework and setup is working\n\n`;
      
      report += `2. 🟢 **GREEN**: Write minimal code to pass tests\n`;
      report += `   - Implement only what's needed to make tests pass\n`;
      report += `   - Focus on making it work, not making it perfect\n`;
      report += `   - Avoid over-engineering at this stage\n\n`;
      
      report += `3. 🔵 **REFACTOR**: Clean up and improve code structure\n`;
      report += `   - Improve code quality while keeping tests green\n`;
      report += `   - Remove duplication and improve naming\n`;
      report += `   - Ensure code follows project conventions\n\n`;
      
      report += `4. ✅ **VERIFY**: Complete task verification\n`;
      report += `   - All tests pass (new and existing)\n`;
      report += `   - Code quality meets standards\n`;
      report += `   - No regressions in existing functionality\n`;
      report += `   - Mark task as completed: \`- [x] ${taskNumber} ${taskDesc}\`\n\n`;
    });
    
    if (tasksToExecute.length > 5) {
      report += `... and ${tasksToExecute.length - 5} more tasks\n\n`;
    }
    
    report += `### Implementation Guidelines\n`;
    report += `- **Follow design specifications**: Implement exactly what's specified in design.md\n`;
    report += `- **Test-first approach**: Always write tests before implementation code\n`;
    report += `- **Incremental progress**: Complete one task fully before moving to next\n`;
    report += `- **Update task status**: Mark checkboxes as completed in tasks.md\n`;
    report += `- **Quality focus**: Maintain code quality and test coverage\n\n`;
    
    report += `### Next Steps\n`;
    report += `1. Start with the first pending task: "${tasksToExecute[0].task.description}"\n`;
    report += `2. Follow the TDD cycle: Red → Green → Refactor → Verify\n`;
    report += `3. Update tasks.md to mark completed tasks with [x]\n`;
    report += `4. Run \`sdd-quality-check\` to validate code quality\n`;
    report += `5. Continue with remaining tasks sequentially\n\n`;
    
    report += `**Remember**: TDD is about building confidence through tests. Write tests that clearly specify the expected behavior, then implement the simplest solution that makes those tests pass.`;
    
    return {
      content: [{
        type: 'text',
        text: report
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error executing spec implementation: ${error.message}`
      }]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
