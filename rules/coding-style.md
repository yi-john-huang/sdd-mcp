---
name: coding-style
description: Enforce consistent TypeScript/JavaScript coding conventions
priority: 100
alwaysActive: true
---

# Coding Style Rules

## TypeScript/JavaScript Guidelines

### Type Safety
- Use explicit types for function parameters and return values
- Avoid `any` type - use `unknown` or proper generics instead
- Enable strict mode in TypeScript configuration
- Use type guards for runtime type checking

### Variable Declarations
- Prefer `const` over `let` where possible
- Never use `var` - always use `const` or `let`
- Use destructuring for object and array access
- Name variables descriptively (no single letters except loop indices)

### Naming Conventions
- **Classes**: PascalCase (e.g., `UserService`, `BaseManager`)
- **Interfaces**: PascalCase with "I" prefix optional (e.g., `UserProfile` or `IUserProfile`)
- **Functions/Methods**: camelCase (e.g., `getUserById`, `parseMetadata`)
- **Variables**: camelCase (e.g., `userName`, `isActive`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`, `API_BASE_URL`)
- **Files**: kebab-case (e.g., `user-service.ts`, `base-manager.ts`)

### Functions
- Keep functions small and focused (single responsibility)
- Limit function parameters to 3-4; use options object for more
- Use early returns to reduce nesting
- Document public functions with JSDoc comments

### Async Code
- Always use `async/await` over raw Promises
- Handle errors with try/catch in async functions
- Avoid mixing callbacks with Promises

### Imports
- Use ES6 module imports (`import`/`export`)
- Group imports: external dependencies first, then internal modules
- Use barrel exports (`index.ts`) for module APIs

## Code Organization

### File Structure
- One class per file (with rare exceptions)
- Keep files under 300 lines when possible
- Related files should be in the same directory

### Comments
- Write self-documenting code - minimize inline comments
- Use JSDoc for public API documentation
- Explain "why" not "what" in comments
