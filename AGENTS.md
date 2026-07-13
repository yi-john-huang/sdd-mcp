# AGENTS.md - Spec-Driven Development (SDD)

This project uses the SDD workflow powered by `sdd-mcp-server`.

## Two Development Paths

### Path A: Simple Task (`/simple-task`)
For small features, bug fixes, and quick enhancements.

### Path B: Full SDD Workflow
For complex features requiring formal specification.

```text
sdd-init -> /sdd-requirements -> /sdd-design -> /sdd-tasks -> /sdd-implement
```

Each phase requires human approval before proceeding.

## Component Sources and Native Targets

The repository ships canonical component sources and renders only the selected agent's native project files:

| Component | Package source | Claude Code target | Codex target |
|-----------|----------------|--------------------|--------------|
| Skills | `skills/` | `.claude/skills/` | `.agents/skills/` |
| Steering | `steering/` | `.spec/steering/` | `.spec/steering/` |
| Rules | `rules/` | `.claude/rules/` | `.codex/guidance/rules/` |
| Contexts | `contexts/` | `.claude/contexts/` | `.codex/guidance/contexts/` |
| Agents | `agents/*.md` | `.claude/agents/*.md` | `.codex/agents/*.toml` |
| Hooks | `hooks/` | `.claude/hooks/` | `.codex/hooks.json` and `.codex/hooks/` |
| Root guidance | `templates/` | `CLAUDE.md` | `AGENTS.md` |

### Skills

On-demand guidance invoked through the target agent:

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

### Steering (`.spec/steering/`)
Project-specific context documents. Edit these to describe your project:

- `product.md` - Product context and business objectives
- `tech.md` - Technology stack and decisions
- `structure.md` - File organization and patterns

## Model Routing

| Work class | Codex | Claude Code |
|------------|-------|-------------|
| Planning, architecture, review, security | `gpt-5.6-sol` with xhigh effort | `opus` |
| Implementation and TDD (default) | `gpt-5.6-luna` with max effort | `sonnet` |

Codex uses `gpt-5.6-luna` as the default model for routed work. High-level advisor roles override that default with `gpt-5.6-sol` at xhigh effort. `gpt-5.6-terra` remains a supported model but is not assigned to a default SDD role. Routed skills use compact specialist handoffs and continue in the current agent when delegation is unavailable.
For the complete role map, generated-file examples, and delegation flow, see [docs/MODEL-ROUTING.md](docs/MODEL-ROUTING.md).

## MCP Tools

| Tool | Description |
|------|-------------|
| `sdd-init` | Initialize new SDD spec |
| `sdd-status` | Check workflow progress |
| `sdd-approve` | Approve workflow phases |
| `sdd-review-test-cases` | Mark optional TDD test-case review complete |
| `sdd-quality-check` | Code quality analysis |
| `sdd-context-load` | Load compact, standard, or full project context |
| `sdd-validate-design` | Design quality validation |
| `sdd-validate-gap` | Implementation gap analysis |
| `sdd-spec-impl` | Execute tasks with TDD |

## Workflow

1. **Setup**: use `npx sdd-mcp-server install --profile full` for an interactive target choice, or pass `--target codex` / `--target claude-code` explicitly for automation.
2. **Steering**: `/sdd-steering` to update project-specific docs when needed.
3. **Specify**: `sdd-init` -> `/sdd-requirements` -> `/sdd-design` -> `/sdd-tasks`, approving each phase.
4. **Context**: use `sdd-context-load` compact mode for routine continuation; use `mode: "full"` only when needed.
5. **Implement**: `/sdd-implement` or `sdd-spec-impl`.
6. **Review**: `sdd-quality-check`.
7. **Commit**: `/sdd-commit`.
