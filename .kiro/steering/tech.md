# Technology Stack

## Architecture
**Type**: Domain-Driven Design (DDD)  
**Language**: TypeScript  
**Module System**: ES Module  
**Framework**: MCP SDK  
**Build Tool**: TypeScript Compiler


### Domain-Driven Design Architecture
The project follows DDD principles with clear separation between:
- **Domain Layer**: Business logic and domain models
- **Application Layer**: Use cases and application services  
- **Infrastructure Layer**: External dependencies and integrations
- **Presentation Layer**: API endpoints or UI components


## Technology Stack
- **Node.js**: JavaScript runtime for server-side execution
- **TypeScript**: Typed superset of JavaScript for enhanced developer experience
- **MCP SDK**: Model Context Protocol SDK for AI agent integration
- **Jest**: Testing framework for unit and integration tests
- **TypeScript Compiler**: Build and bundling tool for production optimization
- **@babel/parser**: Project dependency
- **@babel/types**: Project dependency
- **@modelcontextprotocol/sdk**: MCP SDK for AI tool integration
- **@typescript-eslint/typescript-estree**: Project dependency
- **acorn**: Project dependency

## Development Environment
- **Node Version**: >=18.0.0
- **Package Manager/Build**: npm
- **Language**: TypeScript with type safety
- **Testing**: Jest

## Dependencies Analysis
### Production Dependencies (16)
- `@babel/parser`: Project dependency
- `@babel/types`: Project dependency
- `@modelcontextprotocol/sdk`: MCP SDK for AI tool integration
- `@typescript-eslint/typescript-estree`: Project dependency
- `acorn`: Project dependency
- `ajv`: JSON schema validator
- `ajv-formats`: Project dependency
- `esprima`: Project dependency
- `handlebars`: Template engine
- `i18next`: Internationalization framework
- `i18next-fs-backend`: Project dependency
- `i18next-http-middleware`: Project dependency
- `inversify`: Dependency injection container
- `os-locale`: Project dependency
- `reflect-metadata`: Project dependency

... and 1 more

### Development Dependencies (16)
- `@types/esprima`: Project dependency
- `@types/handlebars`: Project dependency
- `@types/jest`: Project dependency
- `@types/node`: Project dependency
- `@types/sinon`: Project dependency
- `@types/supertest`: Project dependency
- `@types/uuid`: Project dependency
- `@typescript-eslint/eslint-plugin`: Project dependency
- `@typescript-eslint/parser`: Project dependency
- `eslint`: JavaScript linter

... and 6 more

## Development Commands
```bash
npm run dev  # Start development server with hot reload
npm run start  # Start production server
npm run build  # Build project for production
npm run test  # Run test suite
npm run lint  # Check code quality with linter
npm run typecheck  # Validate TypeScript types
npm run test:unit  # jest --testPathPattern=__tests__.*\.test\.ts$ --te...
npm run test:integration  # jest --testPathPattern=integration.*\.test\.ts$
npm run test:e2e  # jest --testPathPattern=e2e.*\.test\.ts$
npm run test:watch  # jest --watch
npm run test:coverage  # jest --coverage
npm run test:ci  # jest --coverage --ci --watchAll=false --passWithNo...
npm run lint:fix  # eslint src --ext .ts --fix
npm run validate  # npm run typecheck && npm run lint && npm run test:...
```

## Quality Assurance
- **Linting**: Automated code quality checks
- **Type Checking**: TypeScript compilation validation

## Deployment Configuration
- **Containerization**: Docker support for consistent deployments
- **Build Process**: `npm run build` for production artifacts
- **Module System**: ES modules for modern JavaScript
