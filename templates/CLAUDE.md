# CLAUDE.md — Spec-Driven Development

This project uses `sdd-mcp-server` with manual-only Skills and its hidden governed runtime.

## Start

After installation, reload Claude Code and accept the project MCP trust prompt. Invoke `/simple-task` for a small feature, bug fix, or focused enhancement.

For formal work, invoke only the phase Skills:

```text
/sdd-requirements <feature-name> → explicit approval → /sdd-design → explicit approval → /sdd-tasks → optional explicit test review → explicit approval → /sdd-implement
```

Each Skill restores durable status and approved compact context, performs validation and persistence internally, and asks for any required human decision. Do not ask the user to call MCP tools or paste workflow JSON. A cloned project still requires the host's project trust; organization or project deny rules may override local permissions.

## Model execution

Claude applies the routed model to the current skill turn: Opus for requirements, design, review, and security; Sonnet for implementation and TDD. Execute in this turn and do not spawn a second specialist merely to switch models. Commit work remains in the current turn.

## Installed components

The installer appends only selected components and their effective paths. Detailed rules and references load on demand; path-scoped rule bodies are not imported into this root file.

To update untouched generated guidance automatically, rerun the installer. User-modified managed files are preserved. A legacy refresh uses `--refresh-generated` and stores reversible backups under `.sdd-mcp/backups/<timestamp>/claude-code/`.
