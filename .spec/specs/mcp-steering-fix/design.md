# Technical Design Document

## Overview
This design document specifies the technical implementation approach for creating a complete, self-contained MCP server that replicates exactly the same tools and workflow as the custom commands in `.claude/commands/kiro/`. The server provides all 10 kiro workflow tools through MCP interface, accessible via simple npx installation.

**Purpose**: Create a self-contained MCP server that provides the complete kiro workflow as MCP tools

**Goals**:
- Replicate all 10 custom commands as equivalent MCP tools
- Embed all kiro workflow logic internally for independence
- Provide universal MCP compatibility via npx without prerequisites
- Maintain exact functional parity with custom command behavior

## Architecture

### High-Level Architecture
The system follows a self-contained MCP server architecture with embedded kiro workflow functionality:

- **MCP Protocol Layer**: Standard MCP SDK integration for universal agent compatibility
- **Complete Tool Suite**: 10 MCP tools that replicate all .claude/commands/kiro/ functionality
- **Embedded Workflow Engine**: Built-in spec-driven development workflow state machine
- **Universal Agent Support**: AGENTS.md generation and cross-platform compatibility

### Complete Tool Mapping
The MCP server provides these tools that exactly match custom commands:

| Custom Command | MCP Tool | Functionality |
|----------------|----------|---------------|
| `/kiro:steering` | `sdd-steering` | Create/update steering documents |
| `/kiro:steering-custom` | `sdd-steering-custom` | Create custom steering documents |
| `/kiro:spec-init` | `sdd-init` | Initialize new SDD project |
| `/kiro:spec-requirements` | `sdd-requirements` | Generate requirements document |
| `/kiro:spec-design` | `sdd-design` | Create design specifications |
| `/kiro:spec-tasks` | `sdd-tasks` | Generate task breakdown |
| `/kiro:spec-status` | `sdd-status` | Check workflow progress |
| `/kiro:spec-impl` | `sdd-implement` | Implementation guidelines |
| `/kiro:validate-design` | `sdd-validate-design` | Validate design quality |
| `/kiro:validate-gap` | `sdd-validate-gap` | Validate implementation gap |

### System Flow
1. **NPX Installation**: User runs `npx -y sdd-mcp-server@latest` to start MCP server
2. **MCP Tool Registration**: Server registers all 10 SDD workflow tools with MCP protocol
3. **Tool Invocation**: Agent calls any sdd-* tool (e.g., sdd-steering, sdd-init)
4. **Embedded Processing**: Server uses built-in workflow logic that replicates custom command behavior
5. **Identical Output**: Tool produces exactly the same results as corresponding custom command
6. **Universal Compatibility**: Works with any MCP-compatible AI agent

### Self-Contained Package Structure
```
sdd-mcp-server/
├── src/
│   ├── index.ts                      # Main MCP server entry point
│   ├── tools/                        # All 10 MCP tools
│   │   ├── steering.ts              # sdd-steering (replicates /kiro:steering)
│   │   ├── steering-custom.ts       # sdd-steering-custom
│   │   ├── init.ts                  # sdd-init (replicates /kiro:spec-init)
│   │   ├── requirements.ts          # sdd-requirements
│   │   ├── design.ts                # sdd-design
│   │   ├── tasks.ts                 # sdd-tasks
│   │   ├── status.ts                # sdd-status
│   │   ├── implement.ts             # sdd-implement
│   │   ├── validate-design.ts       # sdd-validate-design
│   │   └── validate-gap.ts          # sdd-validate-gap
│   ├── workflow/                     # SDD workflow engine
│   │   ├── state-machine.ts         # Workflow state management
│   │   ├── phase-validation.ts      # Phase gate validation
│   │   └── spec-management.ts       # .kiro/specs/ management
│   └── utils/
│       ├── documentGenerator.ts     # Embedded document generation
│       ├── projectAnalyzer.ts       # Project analysis logic
│       └── agentCompatibility.ts    # Universal agent support
├── dist/                            # Compiled JavaScript output
├── package.json                     # Complete self-contained package
└── README.md                        # NPX usage instructions
```

## Components and Interfaces

### Core Components

#### Fixed Import Resolution Module
- **Responsibility**: Correct module path resolution for documentGenerator
- **Interface**:
  - `resolveDocumentGenerator(): Promise<DocumentGeneratorModule>`
  - `validateImportPath(path: string): boolean`
- **Implementation**: Fix hardcoded '../documentGenerator.js' to './utils/documentGenerator.js'

#### MCP Tool Wrapper Layer
- **Responsibility**: Thin wrappers around custom command functionality
- **Interface**:
  - `handleSteeringSimplified(args): Promise<MCPResponse>`
  - `handleInitSimplified(args): Promise<MCPResponse>`
  - `delegateToCustomCommand(command: string, args: any): Promise<string>`

#### Universal Agent Documentation Generator
- **Responsibility**: Generate AGENTS.md from CLAUDE.md with universal compatibility
- **Interface**:
  - `generateAgentsMarkdown(claudeContent: string): string`
  - `replaceAgentSpecificReferences(content: string): string`
  - `ensureUniversalCompatibility(content: string): string`

#### NPX Entry Point Handler
- **Responsibility**: Seamless startup via npx command
- **Interface**:
  - `handleNpxStartup(): Promise<void>`
  - `detectMCPMode(): boolean`
  - `initializeUniversalMCPServer(): Promise<MCPServer>`

## Data Models

### Document Generator Module Interface
```typescript
interface DocumentGeneratorModule {
  analyzeProject(projectPath: string): Promise<ProjectAnalysis>;
  generateProductDocument(analysis: ProjectAnalysis): string;
  generateTechDocument(analysis: ProjectAnalysis): string;
  generateStructureDocument(analysis: ProjectAnalysis): string;
}
```

### Project Analysis Model
```typescript
interface ProjectAnalysis {
  name: string;
  version: string;
  framework: string | null;
  architecture: string;
  dependencies: string[];
  devDependencies: string[];
  language: string;
  // ... existing interface from documentGenerator.ts
}
```

### MCP Response Model
```typescript
interface MCPResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
```

## Implementation Strategy

### Phase 1: Fix Import Path Resolution
1. **Update src/index.ts line 354**: Change import path from `'../documentGenerator.js'` to `'./utils/documentGenerator.js'`
2. **Verify build output**: Ensure TypeScript compilation maintains correct relative paths
3. **Add error handling**: Provide clear diagnostics when documentGenerator import fails
4. **Test import resolution**: Validate that analyzeProject and generate* functions are accessible

### Phase 2: Restore Custom Command Delegation
1. **Implement direct delegation**: Use existing custom command logic instead of duplicating functionality
2. **Remove code duplication**: Eliminate simplified analysis functions in favor of documentGenerator
3. **Preserve MCP compliance**: Maintain MCP SDK patterns while delegating to custom commands
4. **Test functional parity**: Ensure MCP tools produce identical output to custom commands

### Phase 3: Universal Agent Compatibility
1. **Enhance NPX entry point**: Improve detection of MCP mode and agent compatibility
2. **Standardize MCP protocol**: Use proven MCP SDK patterns that work across agent implementations
3. **Add protocol variation handling**: Gracefully handle differences between Claude, Cursor, ChatGPT MCP implementations
4. **Optimize for npx usage**: Ensure immediate startup without additional configuration

### Phase 4: AGENTS.md Generation Fix
1. **Fix AGENTS.md creation logic**: Ensure proper generation during sdd-init
2. **Implement CLAUDE.md derivation**: Convert Claude-specific content to universal format
3. **Add content transformation**: Replace "Claude Code" → "AI Agent", "/claude" → "/agent" references
4. **Maintain functional equivalence**: Ensure AGENTS.md provides same guidance as CLAUDE.md

## Error Handling

### Import Resolution Errors
- **Module Not Found**: Clear error with expected vs actual path
- **Function Missing**: Fallback to basic templates with warnings
- **Permission Issues**: Detailed file system error reporting

### MCP Protocol Errors
- **Agent Compatibility**: Graceful degradation for unsupported MCP features
- **Tool Registration**: Clear errors for missing tool definitions
- **Protocol Violations**: Standard MCP error responses

### Document Generation Errors
- **Analysis Failures**: Fallback to minimal templates
- **File System Issues**: Detailed path and permission error reporting
- **Template Errors**: Clear indication of missing or malformed templates

## Testing Strategy

### Unit Tests
- Import path resolution functions
- Document generation wrappers
- AGENTS.md transformation logic
- NPX entry point detection

### Integration Tests
- End-to-end MCP tool invocation
- Custom command delegation accuracy
- Cross-agent compatibility validation
- NPX installation and startup

### Compatibility Tests
- Claude Code MCP integration
- Cursor MCP support validation
- ChatGPT MCP compatibility
- Generic MCP client testing

## Quality Assurance

### Code Quality Requirements
- Maintain existing TypeScript safety
- Preserve MCP SDK compliance patterns
- Follow existing architectural principles
- Minimize code duplication

### Performance Requirements
- Fast startup via npx (< 2 seconds)
- Efficient document generation (< 5 seconds for typical projects)
- Low memory footprint for simple mode
- Responsive MCP protocol handling

### Compatibility Requirements
- Universal MCP agent support
- Backward compatibility with existing workflows
- NPM package integrity for npx usage
- Cross-platform file path handling

## Deployment and NPM Packaging

### NPM Package Configuration
- **Entry Point**: Proper bin configuration for npx usage
- **Dependencies**: Include all required dependencies in package.json
- **Build Artifacts**: Ensure compiled JavaScript and source maps are included
- **Version Management**: Proper semver for @latest tag compatibility

### Cross-Platform Considerations
- **File Paths**: Use path.join() for cross-platform compatibility
- **Import Resolution**: Handle both Windows and Unix path separators
- **NPX Execution**: Ensure proper execution permissions and shebang

### Distribution Strategy
- **NPM Registry**: Publish to public npm registry for global access
- **Version Tags**: Maintain @latest tag for npx usage
- **Documentation**: Update README with npx installation instructions
- **Release Notes**: Document compatibility improvements and fixes

This design ensures the MCP server becomes a reliable, universally compatible tool that properly leverages existing custom command functionality while providing seamless installation and operation across all AI agent platforms.