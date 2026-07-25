# AGENTS.md — Spec-Driven Development (SDD)

This project uses `sdd-mcp-server` with manual-only Skills and its hidden governed runtime.

## Start

After installation, reload Codex and accept project trust when prompted. Use `$simple-task` for a small feature, bug fix, or focused enhancement.

For formal work, invoke only:

```text
$sdd-requirements <feature-name> → explicit approval → $sdd-design → explicit approval → $sdd-tasks → optional explicit test review → explicit approval → $sdd-implement
```

Each Skill restores durable status and approved compact context, performs validation and persistence internally, and asks for required human decisions. Do not ask the user to call MCP tools or paste workflow JSON.

## Installed Components

Native Codex installs use `.agents/` and `.codex/`; compatibility integrations may reference other effective paths below. Read the referenced files for full details.
