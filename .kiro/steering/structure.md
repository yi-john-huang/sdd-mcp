# Project Structure

## Root Directory Organization

```
sdd-mcp/
├── src/                    # Source code (Clean Architecture layers)
├── .kiro/                  # SDD workflow files and steering
├── node_modules/           # Dependencies (auto-generated)
├── dist/                   # Compiled output (auto-generated)
├── __tests__/              # Test files (structured by type)
├── package.json            # Node.js project configuration
├── tsconfig.json           # TypeScript configuration
├── jest.config.js          # Jest testing configuration
├── Dockerfile              # Container build definition
├── docker-compose.yml      # Multi-container orchestration
├── minimal-working-server.js # Lightweight MCP server entry point
├── local-mcp-server.js     # Development MCP server
├── mcp-server.js           # Standard MCP server
├── README.md               # Project documentation
├── DEPLOYMENT.md           # Deployment and operations guide
├── CLAUDE.md               # Claude Code specific instructions
└── LICENSE                 # MIT license
```

## Source Code Architecture (`/src`)

### Clean Architecture Layer Structure
```
src/
├── domain/                 # Core business logic (innermost layer)
│   ├── context/           # Project context entities
│   ├── quality/           # Quality assessment domain logic
│   ├── workflow/          # Workflow state machine
│   ├── templates/         # Template domain models
│   ├── plugins/           # Plugin system contracts
│   ├── i18n/             # Internationalization domain
│   ├── services/          # Domain services
│   ├── types.ts           # Core type definitions
│   └── ports.ts           # Port interfaces (dependency inversion)
│
├── application/           # Use cases and application logic
│   └── services/          # Application services (orchestration)
│       ├── WorkflowEngineService.ts      # Core workflow orchestration
│       ├── ProjectService.ts              # Project management
│       ├── QualityGateService.ts         # Quality enforcement
│       ├── SteeringDocumentService.ts    # Steering management
│       ├── ProjectContextService.ts      # Context persistence
│       ├── CodebaseAnalysisService.ts    # Code analysis
│       ├── TemplateService.ts            # Template processing
│       └── LocalizationService.ts        # I18n management
│
├── infrastructure/        # External concerns and adapters
│   ├── adapters/          # Infrastructure adapters
│   ├── di/               # Dependency injection container
│   ├── mcp/              # MCP protocol implementation
│   ├── plugins/          # Plugin system implementation
│   ├── repositories/     # Data persistence
│   ├── templates/        # Template engine implementation
│   ├── quality/          # Quality analysis tools
│   ├── schemas/          # JSON schema validation
│   ├── platform/         # Platform-specific adapters
│   └── i18n/            # Internationalization implementation
│
└── adapters/             # External interface adapters
    └── cli/              # Command-line interface adapters
        └── SDDToolAdapter.ts  # MCP tool registration
```

## Testing Structure (`/src/__tests__`)

### Test Organization by Type
```
src/__tests__/
├── setup.ts                          # Test environment configuration
├── test-helpers/                     # Shared testing utilities
│   └── mock-factories.ts            # Mock object factories
├── unit/                            # Unit tests (single class/function)
│   ├── application/services/        # Application service tests
│   ├── infrastructure/plugins/      # Plugin system tests
│   └── infrastructure/mcp/          # MCP protocol tests
├── integration/                     # Integration tests (multiple components)
│   └── workflow-integration.test.ts # End-to-end workflow testing
├── e2e/                            # End-to-end tests (full system)
│   └── mcp-sdd-workflow.test.ts    # Complete MCP workflow validation
└── validation/                      # System validation tests
    ├── system-validation.test.ts    # System integrity checks
    └── basic-system.test.ts         # Basic functionality validation
```

## Key Architectural Principles

### Clean Architecture Implementation
- **Dependency Direction**: All dependencies point inward (domain ← application ← infrastructure)
- **Interface Segregation**: Each layer defines its own interfaces in `ports.ts`
- **Dependency Injection**: All external dependencies injected via inversify container
- **Testability**: Pure domain logic with injected dependencies enables comprehensive testing

### File Naming Conventions

#### Source Files
- **Services**: `[Domain]Service.ts` (e.g., `WorkflowEngineService.ts`)
- **Adapters**: `[Technology][Purpose]Adapter.ts` (e.g., `NodeFileSystemAdapter.ts`)
- **Interfaces**: `[Purpose].ts` in domain ports (e.g., `IProjectRepository`)
- **Types**: `types.ts` for domain types, `[layer].types.ts` for layer-specific types

#### Test Files
- **Unit Tests**: `[ClassUnderTest].test.ts`
- **Integration Tests**: `[feature]-integration.test.ts`
- **E2E Tests**: `[workflow]-e2e.test.ts`
- **Test Helpers**: `[purpose]-[type].ts` (e.g., `mock-factories.ts`)

### Import Organization

#### Layer Import Rules
```typescript
// Domain layer - NO external dependencies
import { Entity } from './entities/Entity';
import { IRepository } from './ports';

// Application layer - Domain only
import { DomainService } from '../domain/services/DomainService';
import { Entity } from '../domain/entities/Entity';

// Infrastructure layer - Domain, Application, and external
import { IRepository } from '../domain/ports';
import { ApplicationService } from '../application/services/ApplicationService';
import { ExternalLibrary } from 'external-package';
```

#### Import Grouping Order
1. **Node.js built-ins** (fs, path, etc.)
2. **External libraries** (inversify, handlebars, etc.)
3. **Internal domain** (../domain/...)
4. **Internal application** (../application/...)
5. **Internal infrastructure** (../infrastructure/...)
6. **Relative imports** (./...)

### Code Organization Patterns

#### Service Pattern
```typescript
// All services follow this pattern:
@injectable()
export class ExampleService {
  constructor(
    @inject(TYPES.IRepository) private repository: IRepository,
    @inject(TYPES.ILogger) private logger: ILogger
  ) {}

  public async execute(input: InputType): Promise<OutputType> {
    // Implementation
  }
}
```

#### Adapter Pattern
```typescript
// All adapters implement domain interfaces:
@injectable()
export class ConcreteAdapter implements IDomainInterface {
  public async method(params: DomainType): Promise<DomainResultType> {
    // Adapter implementation
  }
}
```

## Special Directories

### `.kiro/` - SDD Workflow Management
```
.kiro/
├── steering/              # Project steering documents
│   ├── product.md        # Product context (always included)
│   ├── tech.md          # Technology decisions (always included)
│   ├── structure.md     # Code organization (always included)
│   └── [custom].md      # Custom steering (conditional/manual)
└── specs/               # Feature specifications
    └── [feature-name]/  # Individual feature specs
        ├── requirements.md
        ├── design.md
        └── tasks.md
```

### Infrastructure Subdirectories

#### `/infrastructure/mcp/` - MCP Protocol Layer
- **MCPServer.ts**: Main protocol server implementation
- **ToolRegistry.ts**: MCP tool registration and management
- **SessionManager.ts**: Client session state management
- **ErrorHandler.ts**: Protocol error handling and recovery

#### `/infrastructure/plugins/` - Plugin System
- **PluginManager.ts**: Plugin lifecycle management
- **HookSystem.ts**: Event-driven hook execution
- **PluginSteeringRegistry.ts**: Plugin-based steering integration
- **PluginToolRegistry.ts**: Plugin-contributed tool registration

#### `/infrastructure/di/` - Dependency Injection
- **container.ts**: Inversify container configuration
- **types.ts**: Dependency injection tokens and symbols

## Development Workflow File Patterns

### Entry Points
- **minimal-working-server.js**: Lightweight entry point for npm global installation
- **local-mcp-server.js**: Development entry point with enhanced debugging
- **mcp-server.js**: Standard MCP server for production use
- **dist/index.js**: Compiled TypeScript main entry point

### Configuration Files
- **package.json**: Dependencies, scripts, and npm package configuration
- **tsconfig.json**: TypeScript compilation settings (ESNext modules)
- **jest.config.js**: Test framework configuration with coverage
- **Dockerfile**: Multi-stage build with distroless production image

## Quality Assurance Structure

### Linting and Type Checking
- **ESLint**: TypeScript-specific rules in src/ directory
- **TypeScript**: Strict configuration with pragmatic exceptions
- **Pre-commit**: validate script runs typecheck + lint + test

### Testing Strategy
- **Unit Tests**: Test individual classes and functions in isolation
- **Integration Tests**: Test component interactions within layers
- **E2E Tests**: Test complete workflows through MCP protocol
- **Validation Tests**: System integrity and configuration validation

This structure supports the Linus Torvalds principle of "good data structures make the algorithm obvious" by organizing code based on architectural layers and business domains rather than technical concerns.