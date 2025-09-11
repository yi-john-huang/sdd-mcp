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
- **Feature names**: Auto-generated from descriptions using kebab-case

## Key Architectural Principles
- **Spec-Driven Development**: All features start with requirements and design
- **Phase-Based Workflow**: Structured progression through development phases
- **Quality Gates**: Approval requirements between phases
- **Template-Based Generation**: Consistent document structure and formatting
- **AI-First Design**: Optimized for AI development tool integration