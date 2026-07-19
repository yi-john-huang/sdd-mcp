# CLAUDE.md — Spec-Driven Development

This project uses `sdd-mcp-server` with manual-only skills and the canonical v4 MCP runtime.

## Development paths

### Simple task

Invoke `/simple-task` for a small feature, bug fix, or focused enhancement.

### Formal SDD

For work requiring approved requirements, design, and TDD tasks:

```text
sdd-init → /sdd-requirements → sdd-approve → /sdd-design → sdd-approve → /sdd-tasks → optional test review → sdd-approve → /sdd-implement
```

Use the installed `sdd-*` MCP tools for state changes and compact context by default. Feature-scoped calls use `featureName`, not `projectId`.

For continuation, call `sdd-context-load` with `featureName`; retain the returned `fingerprint` and send it as `ifNoneMatch` on the next identical request. A `not-modified` result means the prior payload remains current and must not be requested or repeated again.

## Model execution

Claude applies the routed model to the current skill turn: Opus for requirements, design, review, and security; Sonnet for implementation and TDD. Execute in this turn and do not spawn a second specialist merely to switch models. Commit work remains in the current turn.

## Installed components

The installer appends only selected components and their effective paths. Detailed rules and references load on demand; path-scoped rule bodies are not imported into this root file.

To update untouched generated guidance automatically, rerun the installer. User-modified managed files are preserved. A legacy refresh uses `--refresh-generated` and stores reversible backups under `.sdd-mcp/backups/<timestamp>/claude-code/`.
