---
name: coding-style
description: Enforce consistent TypeScript/JavaScript coding conventions and design principles
priority: 100
alwaysActive: true
---

# Coding Style Rules

## TypeScript/JavaScript Guidelines

### Type Safety
- Use explicit types for function parameters and return values
- Avoid `any` type - use `unknown` or proper generics instead
- Enable strict mode in TypeScript configuration

### Naming Conventions
- **Classes**: PascalCase (e.g., `UserService`)
- **Functions/Methods**: camelCase (e.g., `getUserById`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Files**: kebab-case (e.g., `user-service.ts`)

### Functions
- Keep functions small and focused (single responsibility)
- Limit function parameters to 3-4; use options object for more
- Use early returns to reduce nesting

### Code Organization
- One class per file (with rare exceptions)
- Keep files under 300 lines when possible
- Write self-documenting code - minimize inline comments

---

# Core Design Principles

**Golden Rule**: Always ask "Does this code follow SOLID, DRY, KISS, YAGNI?" before committing.

## SOLID Principles

### S - Single Responsibility Principle (SRP)
A class/module should have one, and only one, reason to change.

### O - Open/Closed Principle (OCP)
Open for extension, closed for modification. Use interfaces/abstractions.

### L - Liskov Substitution Principle (LSP)
Derived classes must be substitutable for their base classes.

### I - Interface Segregation Principle (ISP)
No client should depend on methods it doesn't use. Keep interfaces small.

### D - Dependency Inversion Principle (DIP)
Depend on abstractions, not concrete implementations. Use dependency injection.

## DRY (Don't Repeat Yourself)
Every piece of knowledge should have a single, authoritative representation.

## KISS (Keep It Simple)
Simplicity should be a key goal. Avoid unnecessary complexity.

## YAGNI (You Aren't Gonna Need It)
Don't implement functionality until it's actually needed.

---

## Code Review Checklist

### SOLID
- [ ] Does each class/module have a single responsibility?
- [ ] Can I extend functionality without modifying existing code?
- [ ] Are interfaces small and focused?
- [ ] Do dependencies point toward abstractions?

### DRY
- [ ] Is there any duplicated logic that should be extracted?
- [ ] Are magic numbers/strings extracted to constants?

### KISS
- [ ] Is the solution as simple as possible?
- [ ] Are variable/function names clear without comments?

### YAGNI
- [ ] Is every feature actually needed now?
- [ ] Are there "future-proofing" additions that can be removed?

---

## Common Anti-Patterns to Avoid

| Anti-Pattern | Violates | Fix |
|--------------|----------|-----|
| God Object/Class | SRP | Split into focused classes |
| Copy-Paste Programming | DRY | Extract common logic |
| Premature Optimization | KISS, YAGNI | Optimize when needed |
| Long Parameter List | KISS | Use parameter objects |
| Magic Numbers | DRY | Extract to named constants |
