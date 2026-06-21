# CLAUDE.md — Spec-Driven Development (SDD)

This project uses the SDD workflow powered by `sdd-mcp-server`.

## Two Development Paths

### Path A: Simple Task (`/simple-task`)
For small features, bug fixes, and quick enhancements.

### Path B: Full SDD Workflow
For complex features requiring formal specification.

```
sdd-init → /sdd-requirements → /sdd-design → /sdd-tasks → /sdd-implement
```

Each phase requires human approval before proceeding.

## Installed Components

### Skills (`.claude/skills/`)
On-demand guidance invoked via slash commands:

| Skill | Purpose |
|-------|---------|
| `/simple-task` | Quick implementation with best practices |
| `/sdd-requirements` | EARS-formatted requirements generation |
| `/sdd-design` | Architecture design with quality principles |
| `/sdd-tasks` | TDD task breakdown with test pyramid |
| `/sdd-implement` | Implementation guidelines (SOLID, security, TDD) |
| `/sdd-steering` | Create/update project steering documents |
| `/sdd-steering-custom` | Custom steering for specialized contexts |
| `/sdd-commit` | Commit message and PR guidelines |
| `/sdd-review` | Code review skill |
| `/sdd-security-check` | Security audit skill |
| `/sdd-test-gen` | Test generation skill |

### Rules (`.claude/rules/`)
Always-active coding standards: coding style, error handling, git workflow, SDD workflow, security, testing.

### Contexts (`.claude/contexts/`)
Switchable modes: dev, planning, research, review, security audit.

### Agents (`.claude/agents/`)
Specialized roles: architect, implementer, planner, reviewer, security auditor, TDD guide.

### Hooks (`.claude/hooks/`)
Lifecycle events: session start/end, pre/post tool use.

### Steering (`.spec/steering/`)
Project-specific context documents. Edit these to describe your project:

- `product.md` — Product context and business objectives
- `tech.md` — Technology stack and decisions
- `structure.md` — File organization and patterns

## MCP Tools

| Tool | Description |
|------|-------------|
| `sdd-init` | Initialize new SDD spec |
| `sdd-status` | Check workflow progress |
| `sdd-approve` | Approve workflow phases |
| `sdd-quality-check` | Code quality analysis |
| `sdd-context-load` | Load project context |
| `sdd-validate-design` | Design quality validation |
| `sdd-validate-gap` | Implementation gap analysis |
| `sdd-spec-impl` | Execute tasks with TDD |

## Workflow

1. **Setup**: `npx sdd-mcp-server install --all` (already done)
2. **Steering** (optional): `/sdd-steering` to generate project-specific docs
3. **Specify**: `sdd-init` → `/sdd-requirements` → `/sdd-design` → `/sdd-tasks` (approve each phase)
4. **Implement**: `/sdd-implement` or `sdd-spec-impl`
5. **Review**: `sdd-quality-check`
6. **Commit**: `/sdd-commit`
