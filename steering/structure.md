# Project Structure

## Directory Organization
```
├── src/                    # Source code
│   ├── components/        # UI components (if applicable)
│   ├── services/          # Business logic services
│   ├── models/            # Data models
│   ├── utils/             # Utility functions
│   └── index.ts           # Entry point
├── tests/                  # Test files
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── dist/                   # Build output
├── docs/                   # Documentation
├── .spec/                  # SDD workflow files
│   ├── steering/          # Project steering documents
│   └── specs/             # Feature specifications
├── package.json            # Project configuration
├── tsconfig.json           # TypeScript configuration (if applicable)
└── README.md               # Project documentation
```

## Key Directories
- **src/**: Main source code directory
- **tests/**: Test files organized by type
- **dist/**: Compiled/built output for production
- **docs/**: Project documentation

## Code Organization Patterns
<!-- Describe how code is organized -->
- Pattern 1
- Pattern 2

## File Naming Conventions
<!-- Define naming conventions for different file types -->
- **Source files**: <!-- e.g., kebab-case.ts -->
- **Test files**: <!-- e.g., *.test.ts or *.spec.ts -->
- **Configuration**: <!-- e.g., .json or .config.js -->
- **Constants**: UPPER_SNAKE_CASE
- **Functions/Variables**: camelCase
- **Classes/Types**: PascalCase

## Module Organization
<!-- Describe how modules are organized -->

## Architectural Principles
- **Separation of Concerns**: Each module handles a specific responsibility
- **Type Safety**: Use strong typing where applicable
- **Dependency Inversion**: Depend on abstractions, not concrete implementations

## Testing Structure
- **Unit tests**: Test individual functions/components in isolation
- **Integration tests**: Test interactions between modules
- **E2E tests**: Test complete user workflows

## Build Output
- **Command**: <!-- e.g., npm run build -->
- **Output directory**: <!-- e.g., dist/ -->
- **Artifacts**: <!-- What gets generated -->
