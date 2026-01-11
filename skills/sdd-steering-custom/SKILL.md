---
name: sdd-steering-custom
description: Create custom steering documents for specialized contexts. Use when you need domain-specific guidance for particular file types, modules, or workflows. Invoked via /sdd-steering-custom.
---

# SDD Custom Steering Document Creation

Create specialized steering documents that provide context-specific guidance beyond the standard product/tech/structure documents.

## When to Use Custom Steering

Custom steering is useful for:
- **Domain-specific rules**: API design, database conventions
- **File-type guidance**: Test patterns, component standards
- **Workflow processes**: PR reviews, deployment procedures
- **Team conventions**: Code review standards, documentation rules

## Inclusion Modes

Custom steering documents can be loaded in three ways:

| Mode | Behavior | Use Case |
|------|----------|----------|
| **ALWAYS** | Loaded in every AI interaction | Core conventions, critical rules |
| **CONDITIONAL** | Loaded when file patterns match | Test-specific, API-specific rules |
| **MANUAL** | Referenced with `@filename.md` | Rarely needed, specialized contexts |

## Workflow

### Step 1: Identify the Need

Ask yourself:
- What specialized context is missing?
- When should this guidance apply?
- Is this project-wide or context-specific?

### Step 2: Choose Inclusion Mode

```
Is this guidance ALWAYS relevant?
├── YES → Use ALWAYS mode
│
└── NO → Is it relevant for specific file types?
         ├── YES → Use CONDITIONAL mode with patterns
         │         Examples: *.test.ts, src/api/**/*
         │
         └── NO → Use MANUAL mode
                  Reference with @filename.md when needed
```

### Step 3: Create Document

Save to `.spec/steering/{filename}.md`:

```markdown
# {Topic Name}

## Purpose
{Why this steering document exists}

## Scope
{When this guidance applies}

## Guidelines

### Guideline 1: {Name}
{Detailed guidance}

**Do:**
- {Good practice}

**Don't:**
- {Anti-pattern}

### Guideline 2: {Name}
{Detailed guidance}

## Examples

### Good Example
```{language}
{Code showing good practice}
```

### Bad Example
```{language}
// DON'T: {explanation}
{Code showing anti-pattern}
```

## Checklist
- [ ] {Verification item 1}
- [ ] {Verification item 2}

---
<!-- Steering Metadata -->
Inclusion Mode: {ALWAYS | CONDITIONAL | MANUAL}
File Patterns: {patterns for CONDITIONAL mode}
Created: {date}
```

## Common Custom Steering Documents

### API Design Standards
```markdown
# API Design Standards

## Inclusion
Mode: CONDITIONAL
Patterns: src/api/**/*.ts, src/routes/**/*.ts

## Guidelines

### RESTful Conventions
- Use plural nouns for resources: `/users`, not `/user`
- Use HTTP methods correctly: GET (read), POST (create), PUT (update), DELETE (remove)
- Return appropriate status codes

### Request/Response Format
- Use JSON for request/response bodies
- Include `Content-Type: application/json` header
- Wrap responses in consistent envelope
```

### Test Patterns
```markdown
# Test Patterns

## Inclusion
Mode: CONDITIONAL
Patterns: **/*.test.ts, **/*.spec.ts

## Guidelines

### Arrange-Act-Assert
Every test should follow:
1. **Arrange**: Set up test data and mocks
2. **Act**: Execute the code under test
3. **Assert**: Verify the results

### Naming Convention
`describe('{Class/Function}', () => {`
`  it('should {expected behavior} when {condition}', () => {`
```

### Component Standards
```markdown
# Component Standards

## Inclusion
Mode: CONDITIONAL
Patterns: src/components/**/*.tsx

## Guidelines

### Component Structure
1. Imports (external, internal, types)
2. Type definitions
3. Component function
4. Helper functions
5. Exports
```

### Database Conventions
```markdown
# Database Conventions

## Inclusion
Mode: CONDITIONAL
Patterns: src/db/**/*.ts, **/migrations/**/*

## Guidelines

### Table Naming
- Use snake_case: `user_accounts`
- Use plural: `orders`, not `order`
- Prefix with domain: `auth_sessions`

### Column Naming
- Use snake_case: `created_at`
- Foreign keys: `{table}_id`
- Booleans: `is_active`, `has_access`
```

## File Pattern Syntax

Patterns use glob syntax:

| Pattern | Matches |
|---------|---------|
| `*.test.ts` | All test files in current dir |
| `**/*.test.ts` | All test files recursively |
| `src/api/**/*` | All files in api directory tree |
| `*.{ts,tsx}` | TypeScript and TSX files |
| `!node_modules/**` | Exclude node_modules |

## MCP Tool Integration

Custom steering documents are managed manually. After creating:
1. Save to `.spec/steering/{name}.md`
2. Verify file patterns work as expected
3. Reference in AGENTS.md/CLAUDE.md if needed

## Quality Checklist

- [ ] Purpose is clearly stated
- [ ] Inclusion mode is appropriate
- [ ] File patterns are specific (for CONDITIONAL)
- [ ] Guidelines are actionable
- [ ] Examples show good and bad practices
- [ ] Checklist for verification included
