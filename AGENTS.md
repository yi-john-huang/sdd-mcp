# SDD-MCP Project Guidance

This repository develops `sdd-mcp-server`, a spec-driven workflow for Claude Code, Codex, and Oh My Pi (OMP).

## Workflow

- Install the chosen host target, reload it, and accept the host's project trust prompt before starting.
- Small fixes: invoke `/skill:simple-task`.
- Formal work: invoke `/skill:sdd-requirements <feature-name>`, then `/skill:sdd-design`, `/skill:sdd-tasks`, and `/skill:sdd-implement` after each explicit approval.
- Never cross an unapproved phase. When configured, test-case review is a separate explicit decision before tasks approval.
- Skills automatically restore durable status and approved compact context. Do not ask users to operate MCP tools or paste workflow JSON.

## Repository layout

- Canonical components: `skills/`, `agents/`, `rules/`, `contexts/`, `hooks/`, `steering/`, `templates/`.
- Implementation: `src/`; focused tests: `src/__tests__/`.
- Specifications and project steering: `.spec/specs/` and `.spec/steering/`.
- Generated native targets are installed under `.claude/`, `.agents/` + `.codex/`, or `.omp/`; do not hand-edit generated files.

## Model routing

Planning, architecture, review, and security run inline on Sol/medium by default in OMP; project Sol/xhigh advisors are explicit opt-in. Claude uses current-turn Opus/Sonnet routing, while Codex may use one configured Sol/xhigh custom advisor.

Run implementation, TDD, simple tasks, and commits in the parent unless at least two genuinely independent implementation slices can run concurrently. If an advisor is explicitly invoked, allow one specialist without nesting; on model, auth, or agent failure, record one fallback and continue in the parent without retrying.

See `docs/MODEL-ROUTING.md` for route details and `docs/WORKFLOW.md` for the complete workflow.
