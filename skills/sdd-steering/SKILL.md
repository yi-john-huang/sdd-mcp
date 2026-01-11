---
name: sdd-steering
description: Create project-specific steering documents for SDD workflow. Use when setting up project context, documenting technology stack, or establishing project conventions. Invoked via /sdd-steering.
---

# SDD Steering Document Generation

Generate project-specific steering documents that provide context and guidance for AI-assisted development.

## What Are Steering Documents?

Steering documents are markdown files in `.spec/steering/` that provide project-specific context to guide AI interactions. They describe YOUR project's unique characteristics.

## Document Types

| Document | Purpose | Content |
|----------|---------|---------|
| `product.md` | Product context | Vision, users, features, goals |
| `tech.md` | Technology stack | Languages, frameworks, tools, architecture |
| `structure.md` | Project conventions | Directory structure, naming, patterns |
| `custom-*.md` | Custom guidance | Specialized rules for specific contexts |

## Workflow

### Step 1: Analyze Project

Gather information from:
1. **Project manifest** - Dependencies and metadata (e.g., `package.json`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `go.mod`)
2. **Directory structure** - Folder organization
3. **Existing code patterns** - Naming conventions, architecture
4. **Documentation** - README, existing docs
5. **Build configuration** - Build tools, scripts, CI/CD

### Step 2: Generate Product Steering

Create `.spec/steering/product.md`:

```markdown
# Product Overview

## Description
{Project description from manifest or analysis}

## Vision
{Long-term product vision}

## Target Users
- **Primary:** {Main user persona}
- **Secondary:** {Other user types}

## Core Features
1. {Feature 1} - {Brief description}
2. {Feature 2} - {Brief description}

## Key Value Propositions
- {Value 1}
- {Value 2}

## Success Metrics
- {Metric 1}: {Target}
- {Metric 2}: {Target}
```

### Step 3: Generate Tech Steering

Create `.spec/steering/tech.md`:

```markdown
# Technology Overview

## Stack

### Language
- **Primary:** {e.g., TypeScript, Python, Go, Rust, Java}
- **Version:** {e.g., 5.x, 3.11, 1.21}
- **Runtime:** {if applicable, e.g., Node.js, JVM, .NET}

### Frameworks
- {Framework 1}: {Purpose}
- {Framework 2}: {Purpose}

### Key Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| {dep1} | {version} | {why used} |

## Architecture

### Pattern
{e.g., Clean Architecture, MVC, Microservices, Hexagonal}

### Layers
```
┌─────────────────┐
│   Presentation  │  Controllers, CLI, UI
├─────────────────┤
│   Application   │  Services, Use Cases
├─────────────────┤
│     Domain      │  Entities, Business Logic
├─────────────────┤
│ Infrastructure  │  Database, External APIs
└─────────────────┘
```

## Development Environment

### Prerequisites
- {Language runtime and version}
- {Package manager} (e.g., npm, pip, cargo, go mod, maven)

### Setup
```bash
# Clone and install dependencies
{package manager install command}

# Run development server
{dev server command}
```

### Common Commands
| Command | Purpose |
|---------|---------|
| `{install}` | Install dependencies |
| `{dev}` | Development server |
| `{build}` | Production build |
| `{test}` | Run tests |
| `{lint}` | Code linting |

## Quality Standards
- Test coverage: >= 80%
- Linting: {language-appropriate linter}
- Type checking: {if applicable}
```

### Step 4: Generate Structure Steering

Create `.spec/steering/structure.md`:

```markdown
# Project Structure

## Directory Layout

```
project-root/
├── src/                    # Source code
│   ├── domain/            # Business logic
│   ├── application/       # Use cases
│   ├── infrastructure/    # External adapters
│   └── {entry point}      # Main entry point
├── tests/                 # Test files
├── docs/                  # Documentation
└── {project manifest}     # Dependencies/config
```

## Naming Conventions

### Files
| Type | Convention | Example |
|------|------------|---------|
| Components | {project convention} | `UserProfile.{ext}` |
| Services | {project convention} | `AuthService.{ext}` |
| Utilities | {project convention} | `format_date.{ext}` |
| Tests | {test convention} | `auth_test.{ext}` |
| Types/Interfaces | {project convention} | `user_types.{ext}` |

### Code
| Element | Convention | Example |
|---------|------------|---------|
| Classes/Types | PascalCase | `UserService` |
| Functions/Methods | {language convention} | `get_user_by_id` or `getUserById` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Variables | {language convention} | `user_name` or `userName` |
| Interfaces | {project convention} | `UserRepository` or `IUserRepository` |

## Module Organization

### Import Order
1. Standard library / built-ins
2. External packages / dependencies
3. Internal modules (absolute paths)
4. Relative imports
5. Type/interface imports (if language separates them)

### Export Pattern
- Use barrel exports / index files where appropriate
- Named exports preferred over default (language-dependent)
- Public API exposed from domain layer

## Patterns

### Dependency Injection
{DI approach used, e.g., Inversify, manual}

### Error Handling
{Error handling pattern, e.g., Result types, exceptions}

### Logging
{Logging approach, e.g., structured logging}
```

### Step 5: Create Directory

Ensure `.spec/steering/` directory exists and save documents.

## MCP Tool Integration

This skill generates documents manually. For automated analysis, the `sdd-init` MCP tool creates basic steering during project initialization.

## Quality Checklist

- [ ] Product description is clear and specific
- [ ] Target users are well-defined
- [ ] Technology stack is accurately documented
- [ ] Directory structure matches actual project
- [ ] Naming conventions are consistent
- [ ] Development setup instructions are complete
- [ ] Key patterns are documented

## Notes

- Steering documents are **project-specific** - they describe YOUR project
- Keep them updated as the project evolves
- Use custom steering for domain-specific rules
- Reference from AGENTS.md or CLAUDE.md in project root
