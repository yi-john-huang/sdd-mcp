# Project Structure

## Directory Organization
```
├── .kiro/                    # SDD workflow files
│   ├── steering/            # Project steering documents
│   └── specs/              # Feature specifications
├── data/                   # Project directory
├── dist/                   # Build output
├── locales/                   # Project directory
├── plugins/                   # Project directory
├── src/                   # Source code
├── Dockerfile              # Container configuration
├── package.json            # Project configuration
├── package.json            # Project configuration
├── tsconfig.json           # TypeScript configuration
└── README.md               # Project documentation
```

## Key Directories
- **src/**: Main source code directory containing application logic
- **dist/build/**: Compiled output for production deployment

## Code Organization Patterns
- **Domain-Driven Design**: Business logic isolated in domain layer
- **Dependency Injection**: IoC container for managing dependencies

## File Naming Conventions
- TypeScript files: `.ts` extension
- Type definition files: `.d.ts` extension
- Test files: `.test.ts` or `.spec.ts` suffix
- Configuration files: `.json` or `.config.js` format
- Directories: lowercase with hyphens (e.g., `user-service`)
- Constants: UPPER_SNAKE_CASE
- Functions/Variables: camelCase
- Classes/Types: PascalCase

## Module Organization
### Domain-Driven Modules
- Each domain has its own module with models, services, and repositories
- Clear boundaries between different domains
- Dependency flow from infrastructure → application → domain

## Architectural Principles
- **Separation of Concerns**: Each module handles a specific responsibility
- **Type Safety**: Leverage TypeScript for compile-time type checking
- **Dependency Inversion**: Depend on abstractions, not concrete implementations

## Development Patterns
- Hot module replacement for rapid development
- Automated code quality checks on commit
- Strict TypeScript configuration for maximum safety

## Testing Structure
Testing structure to be implemented

## Build Output
### Build Process
- Command: `npm run build`
- Output directory: `dist/`
- Build tool: TypeScript Compiler
- TypeScript compilation to JavaScript
- Source maps for debugging

