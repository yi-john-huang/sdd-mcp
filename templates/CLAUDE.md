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

The installer appends only the components selected for this target and their effective paths.

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

1. **Setup**: `npx sdd-mcp-server install --profile full --target claude-code` (already done)
2. **Steering** (optional): `/sdd-steering` to generate project-specific docs
3. **Specify**: `sdd-init` → `/sdd-requirements` → `/sdd-design` → `/sdd-tasks` (approve each phase)
4. **Implement**: `/sdd-implement` or `sdd-spec-impl`
5. **Review**: `sdd-quality-check`
6. **Commit**: `/sdd-commit`
