# Requirements Document

## Introduction
This document specifies the requirements for creating a self-contained MCP server that provides exactly the same tools and workflow as the custom commands in `.claude/commands/kiro/`. The MCP server should be a complete, independent package that replicates all kiro workflow functionality through MCP tools, accessible via simple npx installation.

## Requirements

### Requirement 1: Import Path Resolution
**Objective:** As a developer, I want the MCP server to correctly import and use the document generator, so that steering document generation functions properly

#### Acceptance Criteria
1. WHEN the sdd-steering tool is invoked THEN the MCP server SHALL correctly import documentGenerator.js from the proper path
2. IF the documentGenerator import fails THEN the system SHALL provide clear error messages indicating the correct path
3. WHEN the simplified MCP mode is active THEN the system SHALL use './utils/documentGenerator.js' instead of '../documentGenerator.js'
4. WHERE compilation occurs THE system SHALL maintain consistent import paths between TypeScript source and JavaScript output

### Requirement 2: Dynamic Project Analysis Integration
**Objective:** As a user, I want the MCP server to perform the same sophisticated project analysis as custom commands, so that generated steering documents are accurate and comprehensive

#### Acceptance Criteria
1. WHEN sdd-steering is called THEN the system SHALL analyze the project using the same analyzeProject function as custom commands
2. IF project analysis succeeds THEN the system SHALL generate product.md, tech.md, and structure.md with codebase-specific content
3. WHEN analyzing dependencies THEN the system SHALL detect frameworks, languages, build tools, and architectural patterns
4. WHERE project structure exists THE system SHALL identify directories, test frameworks, and development patterns
5. WHILE maintaining consistency THE system SHALL use the same generateProductDocument, generateTechDocument, and generateStructureDocument functions

### Requirement 3: Error Handling and Diagnostics
**Objective:** As a developer, I want clear error reporting when steering document generation fails, so that I can quickly diagnose and fix issues

#### Acceptance Criteria
1. WHEN import paths are incorrect THEN the system SHALL report the specific missing module and expected location
2. IF documentGenerator functions are unavailable THEN the system SHALL fall back to basic templates with clear warnings
3. WHEN file system operations fail THEN the system SHALL provide detailed error messages with file paths and permissions
4. WHERE debugging is needed THE system SHALL log the attempted import paths and resolution attempts

### Requirement 4: Complete Kiro Workflow Replication
**Objective:** As a user, I want the MCP server to provide exactly the same tools and workflow as all custom commands in .claude/commands/kiro/, so that I get identical functionality through MCP interface

#### Acceptance Criteria
1. WHEN MCP server starts THEN it SHALL provide MCP tools for all 10 custom commands: spec-design, spec-impl, spec-init, spec-requirements, spec-status, spec-tasks, steering-custom, steering, validate-design, validate-gap
2. IF I use sdd-steering THEN the output SHALL be identical to /kiro:steering custom command
3. WHEN I use sdd-init THEN the behavior SHALL match /kiro:spec-init exactly
4. WHERE any custom command exists THE corresponding MCP tool SHALL replicate its exact functionality
5. WHILE maintaining MCP compliance THE system SHALL preserve all kiro workflow phases, file structures, and validation logic

### Requirement 5: Service Integration Options
**Objective:** As a developer, I want the option to use the sophisticated SteeringDocumentService in simple MCP mode, so that advanced steering features are available

#### Acceptance Criteria
1. WHEN enhanced steering is needed THEN the system SHALL optionally integrate SteeringDocumentService into simple MCP mode
2. IF SteeringDocumentService is used THEN the system SHALL maintain plugin compatibility and document validation
3. WHEN switching between approaches THEN the system SHALL preserve functional compatibility and not break existing workflows
4. WHERE performance is critical THE system SHALL maintain the lightweight nature of simple MCP mode while adding functionality

### Requirement 6: Multi-LLM Agent Compatibility and Easy Installation
**Objective:** As a user with any LLM agent (Claude, Cursor, ChatGPT, etc.), I want to easily install and use the MCP server via npx, so that SDD workflow tools are universally accessible

#### Acceptance Criteria
1. WHEN any LLM agent supports MCP THEN the server SHALL work seamlessly with that agent
2. IF a user runs "npx -y sdd-mcp-server@latest" THEN the system SHALL start immediately without additional setup
3. WHEN the MCP server is published to npm THEN it SHALL be properly packaged with all dependencies
4. WHERE different LLM agents have MCP variations THE server SHALL handle common MCP protocol differences gracefully
5. WHILE maintaining compatibility THE system SHALL use standard MCP SDK patterns that work across agent implementations

### Requirement 7: AGENTS.md Generation and Multi-Agent Documentation
**Objective:** As a user, I want the system to properly generate AGENTS.md as general agent guidance, so that the SDD workflow is available across different AI agent platforms

#### Acceptance Criteria
1. WHEN sdd-init is called THEN the system SHALL generate or update AGENTS.md with universal agent instructions
2. IF CLAUDE.md exists THEN the system SHALL derive AGENTS.md content from it by replacing Claude-specific references
3. WHEN AGENTS.md is created THEN it SHALL contain AI-agent-agnostic SDD workflow instructions
4. WHERE agent-specific content exists THE system SHALL generalize it for universal compatibility (Claude Code → AI Agent, etc.)
5. WHILE maintaining functionality THE system SHALL ensure AGENTS.md works as guidance for any MCP-compatible AI agent