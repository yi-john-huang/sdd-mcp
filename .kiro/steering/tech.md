# Technology Stack

## Architecture
- **Type**: Node.js Application with TypeScript
- **Version**: v1.2.0 (Latest: Kiro workflow alignment with empty project bootstrap)
- **Runtime**: Node.js with ES modules
- **Protocol**: Model Context Protocol (MCP) for AI integration
- **Package Manager**: npm
- **Dependency Injection**: Inversify container with decorators

## Core Dependencies
- **@modelcontextprotocol/sdk** (^1.0.4): MCP protocol implementation
- **inversify** (^6.0.2): Dependency injection container
- **handlebars** (^4.7.8): Template engine for document generation
- **i18next** (^25.5.2): Internationalization framework
- **ajv** (^8.17.1): JSON schema validation
- **TypeScript**: Full type safety with strict configuration

## Code Analysis Stack
- **@babel/parser** (^7.28.4): JavaScript/TypeScript parsing
- **@typescript-eslint/typescript-estree** (^8.43.0): TypeScript AST analysis
- **acorn** (^8.15.0): JavaScript parser for code analysis
- **esprima** (^4.0.1): ECMAScript parsing utilities

## Development Environment
- **Node Version**: >= 18.0.0
- **Package Manager**: npm
- **Module System**: ES modules (type: "module")

## Common Commands
```bash
# Development
npm install          # Install dependencies
npm run build       # Build the project
npm test           # Run tests
npm start          # Start the application

# MCP Server
node mcp-server.js  # Run simple MCP server

# SDD Workflow (via MCP tools)
sdd-init "project description"     # Initialize spec from description (empty projects supported)
sdd-requirements feature-name      # Generate EARS-formatted requirements
sdd-design feature-name           # Create technical design (validates requirements)
sdd-tasks feature-name            # Generate implementation tasks (validates design)
sdd-status feature-name           # Check workflow progress
```

## Environment Variables
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `DEFAULT_LANG`: Default language for generated documents (en, es, fr, etc.)

## Port Configuration
- MCP Server: Uses stdio transport (no ports)
- Application ports: Defined by implementation requirements