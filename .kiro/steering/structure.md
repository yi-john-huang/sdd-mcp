# Project Structure

## Root Directory Organization
```
├── .kiro/                    # SDD workflow files
│   ├── steering/            # Project steering documents
│   └── specs/              # Feature specifications
├── dist/                   # Compiled output (if applicable)
├── src/                    # Source code (if applicable)
├── node_modules/           # npm dependencies
├── package.json           # Project configuration
├── mcp-server.js          # Simple MCP server implementation
└── README.md              # Project documentation
```

## SDD Directory Structure (`.kiro/`)
- **steering/**: Always-loaded project context documents
  - `product.md`: Product overview and business context
  - `tech.md`: Technology stack and development environment
  - `structure.md`: Project organization and architectural decisions
  - Custom steering files for specialized contexts
- **specs/**: Feature-specific specifications
  - `{feature-name}/`: Individual feature directories
    - `spec.json`: Metadata and approval tracking
    - `requirements.md`: EARS-format requirements
    - `design.md`: Technical design document
    - `tasks.md`: Implementation task breakdown

## Code Organization Patterns
- **Modular Structure**: Clear separation between different functional areas
- **Configuration First**: Centralized configuration management
- **Documentation Co-location**: Specs and steering documents alongside code

## File Naming Conventions
- **Steering files**: `kebab-case.md` (e.g., `api-standards.md`)
- **Spec files**: Standard names (`requirements.md`, `design.md`, `tasks.md`)
- **Feature names**: Auto-generated from descriptions using kebab-case (supports empty projects)

## Workflow Phases (v1.2.0)
```
sdd-init → sdd-requirements → sdd-design → sdd-tasks → implementation
    ↓           ↓               ↓            ↓
initialized  requirements-  design-    tasks-generated
             generated      generated   (ready_for_implementation)
```

## Key Architectural Principles
- **Empty Project Bootstrap**: Specs can be generated from project descriptions without existing files
- **Kiro Workflow Alignment**: Complete compatibility with .claude/commands/kiro/ workflow patterns
- **Spec-Driven Development**: All features start with requirements and design
- **Phase-Based Workflow**: Enforced progression through development phases with validation
- **Quality Gates**: Approval requirements and phase validation between workflow stages
- **Context-Aware Generation**: Dynamic content creation from project analysis, not static templates
- **EARS Compliance**: Professional requirements format for acceptance criteria
- **AI-First Design**: Optimized for AI development tool integration via MCP protocol