# Technology Stack

## Architecture Overview
Clean Architecture implementation with clear separation of concerns:
- **Domain Layer**: Core business logic and entities
- **Application Layer**: Use cases and service orchestration
- **Infrastructure Layer**: External adapters, repositories, and I/O
- **Adapters Layer**: Protocol handlers, CLI interfaces, and platform integration

## Core Technology Stack

### Runtime & Language
- **Node.js**: >=18.0.0 (ES2022 features)
- **TypeScript**: ^5.9.2 with ESNext modules
- **Module System**: ES Modules (type: "module")

### Protocol & Communication
- **MCP SDK**: @modelcontextprotocol/sdk ^1.0.4 (stdio transport)
- **JSON-RPC**: MCP protocol implementation with capability negotiation
- **Session Management**: Persistent client connections with state tracking

### Core Dependencies
- **Dependency Injection**: inversify ^6.0.2 with reflect-metadata
- **Template Engine**: handlebars ^4.7.8 for file generation
- **Internationalization**: i18next ^25.5.2 with fs-backend
- **Validation**: ajv ^8.17.1 with ajv-formats for JSON schema validation
- **AST Analysis**: @babel/parser, @typescript-eslint/typescript-estree, acorn, esprima
- **UUID Generation**: uuid ^10.0.0 for unique identifiers

### Development Environment

#### Build & Development Tools
```bash
# Core build
npm run build          # TypeScript compilation
npm run dev           # Development with hot reload (tsx watch)
npm start             # Production server start

# Quality assurance
npm run typecheck     # TypeScript type checking
npm run lint          # ESLint with TypeScript rules
npm run lint:fix      # Auto-fix ESLint issues
npm run validate      # Full validation: typecheck + lint + test
```

#### Testing Framework
```bash
# Test execution
npm run test              # All tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:e2e         # End-to-end tests
npm run test:coverage    # Coverage report
npm run test:ci          # CI-optimized testing
```

### Testing Stack
- **Framework**: Jest ^29.7.0 with ts-jest ^29.4.1
- **Mocking**: sinon ^21.0.0 for sophisticated test doubles
- **HTTP Testing**: supertest ^7.1.4 for API endpoint testing
- **Coverage**: Istanbul integration via Jest

### Code Quality & Standards
- **Linting**: ESLint ^8.57.0 with @typescript-eslint parser
- **Type Safety**: Strict TypeScript configuration (with pragmatic exceptions)
- **Code Analysis**: Multiple AST parsers for deep code structure analysis

## Development Commands

### Standard Workflow
```bash
# Development setup
npm install
npm run build
npm run validate      # Ensure everything works

# Development cycle
npm run dev          # Hot reload development
npm run test:watch   # Test-driven development

# Pre-commit checks
npm run validate     # Full quality gate
```

### Production Deployment
```bash
# Global installation (recommended)
npm install -g sdd-mcp-server@latest
sdd-mcp-server

# Docker deployment
docker build --target production -t sdd-mcp-server .
docker run -p 3000:3000 sdd-mcp-server
```

## Environment Configuration

### Core Environment Variables
```bash
# Basic operation
LOG_LEVEL=info          # debug, info, warn, error
DEFAULT_LANG=en         # en, es, fr, de, it, pt, ru, ja, zh, ko

# Advanced configuration
PLUGIN_DIR=/path/to/plugins      # Custom plugin directory
TEMPLATE_DIR=/path/to/templates  # Custom template directory
MAX_PLUGINS=50                   # Plugin system limits
HOOK_TIMEOUT=10000              # Hook execution timeout (ms)
```

### Port Configuration
- **Default Port**: 3000 (Docker deployment)
- **MCP Protocol**: stdio transport (no network ports for CLI integration)
- **Development**: tsx watch on file changes

## Security & Deployment

### Container Security
- **Base Image**: gcr.io/distroless/nodejs18-debian11 (minimal attack surface)
- **User**: Non-root (UID 1001, no privilege escalation)
- **Filesystem**: Read-only with tmpfs for necessary writes
- **Capabilities**: All Linux capabilities dropped except essential
- **Security Options**: no-new-privileges prevents privilege escalation

### Installation Security
- **Global Installation**: Recommended over npx for security and reliability
- **Package Verification**: npm package with proper file filtering
- **Dependency Auditing**: Regular security audits of dependencies

## Integration Points

### MCP Client Configuration
```json
{
  "mcpServers": {
    "sdd": {
      "command": "sdd-mcp-server",
      "args": [],
      "env": {
        "LOG_LEVEL": "info",
        "DEFAULT_LANG": "en"
      }
    }
  }
}
```

### Supported Clients
- **Claude Code**: Primary target with specialized integration
- **Cursor IDE**: Full MCP protocol support
- **Generic MCP Clients**: Standard stdio transport compatibility

## Architectural Principles

### Clean Architecture Compliance
- **Dependency Direction**: All dependencies point inward toward domain
- **Interface Segregation**: Small, focused interfaces for each layer
- **Dependency Injection**: All external dependencies injected via container
- **Testability**: Pure functions and injected dependencies enable comprehensive testing

### Linus Torvalds Quality Standards
- **Simplicity First**: Complex solutions are wrong solutions
- **Data Structure Focus**: Good data structures make algorithms obvious
- **No Special Cases**: General solutions that handle edge cases naturally
- **Backward Compatibility**: Never break existing functionality

### Performance Considerations
- **Minimal Dependencies**: Only essential libraries included
- **Memory Efficiency**: Careful memory management for long-running sessions
- **Startup Time**: Fast initialization for CLI responsiveness
- **Plugin Architecture**: Lazy loading for optional functionality