# MCP SDD Server

[![npm version](https://badge.fury.io/js/sdd-mcp-server.svg)](https://www.npmjs.com/package/sdd-mcp-server)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

A Model Context Protocol server and target-native installer for governed Spec-Driven Development (SDD) in Claude Code, Codex, and Oh My Pi (OMP).

> **v4.0.0** — One 16-tool runtime, native OMP installation, manual-only skills, phase-aware bounded context, and managed generated-file upgrades.

## Why sdd-mcp?

`sdd-mcp` keeps requirements, design, tasks, approvals, optional TDD review, implementation, and continuation state on disk. Skills provide on-demand guidance; MCP tools enforce workflow behavior. This avoids treating a large prompt catalog as workflow state.

```text
sdd-init -> requirements -> approve -> design -> approve -> tasks -> review tests -> approve -> implement
```

## Quick start

Run the MCP server without a global install:

```bash
npx -y sdd-mcp-server@4.0.0
```

Install target-native project guidance:

```bash
# Interactive full install: choose Claude Code, Codex, or Oh My Pi
npx sdd-mcp-server install --profile full

# Explicit automation
npx sdd-mcp-server install --target claude-code
npx sdd-mcp-server install --target codex
npx sdd-mcp-server install --target omp
```

A non-interactive install without `--target` retains the compatibility default, `claude-code`, and prints a notice. `--codex` remains a deprecated Codex-only alias. `--all-tools` installs all three native targets plus Antigravity; it does not make Codex artifacts executable by OMP.

## Manual workflow invocation

SDD skills are explicit commands and do not activate implicitly from ordinary prose.

| Path | Claude Code | Codex | Oh My Pi |
|---|---|---|---|
| Small task | `/simple-task` | `$simple-task` | `/skill:simple-task` |
| Formal SDD | `/sdd-requirements` → `/sdd-design` → `/sdd-tasks` → `/sdd-implement` | `$sdd-requirements` → `$sdd-design` → `$sdd-tasks` → `$sdd-implement` | `/skill:sdd-requirements` → `/skill:sdd-design` → `/skill:sdd-tasks` → `/skill:sdd-implement` |

The phase approvals are MCP operations; command syntax only invokes the relevant guidance.

## Profiles and native paths

| Component | Claude Code | Codex | Oh My Pi |
|---|---|---|---|
| Root guidance | `CLAUDE.md` | `AGENTS.md` | `.omp/AGENTS.md` |
| Skills | `.claude/skills/` | `.agents/skills/` | `.omp/skills/` |
| Agents | `.claude/agents/` | `.codex/agents/` | `.omp/agents/` |
| Rules | `.claude/rules/` | `.codex/guidance/rules/` | `.omp/rules/` |
| Context references | `.claude/contexts/` | `.codex/guidance/contexts/` | `.omp/contexts/` |
| Steering | `.spec/steering/` | `.spec/steering/` | `.spec/steering/` |

Claude Code and Codex lean profiles install skills, steering, and their supported hook guidance. OMP lean installs skills, steering, and agents. Full profiles add rules, contexts, and agents as supported by each host. OMP does not install Markdown as an executable hook; `--target omp --hooks` fails with an explanation.

See [Installation Guide](docs/INSTALL-GUIDE.md) and [Model Routing](docs/MODEL-ROUTING.md).

## Safe generated-file upgrades

The installer records package-owned outputs in `.sdd-mcp/install-manifest.json`. An unchanged managed file upgrades automatically; a user-modified file is preserved and reported as a conflict. To migrate a legacy install:

```bash
npx sdd-mcp-server install --target omp --refresh-generated
```

The refresh command backs up selected generated files under `.sdd-mcp/backups/<timestamp>/<target>/` before rebuilding the package-owned set. It does not overwrite project source, user steering content, or unknown custom files.

## Canonical v4 MCP runtime

Every packaged entrypoint exposes the same 16 tools:

1. `sdd-init`
2. `sdd-requirements`
3. `sdd-design`
4. `sdd-tasks`
5. `sdd-implement`
6. `sdd-status`
7. `sdd-approve`
8. `sdd-review-test-cases`
9. `sdd-quality-check`
10. `sdd-context-load`
11. `sdd-template-render`
12. `sdd-steering`
13. `sdd-steering-custom`
14. `sdd-validate-design`
15. `sdd-validate-gap`
16. `sdd-spec-impl`

Feature-scoped tools use `featureName`; v4 removes public `projectId` locators. `sdd-list-skills` is not a runtime tool because hosts already discover installed skills and the installer supports `--list`.

## Compact continuation and ETags

Context loading defaults to compact mode and uses the latest approved phase:

```json
{ "featureName": "checkout", "mode": "compact" }
```

Save the returned `fingerprint`. On the next unchanged load, send it as `ifNoneMatch`:

```json
{ "featureName": "checkout", "mode": "compact", "ifNoneMatch": "<fingerprint>" }
```

A matching exact response fingerprint returns a short `not-modified` envelope without duplicate context. Compact, standard, and full default bounds are 2,048, 4,096, and 16,384 `estimatedTokens`. Full mode never silently truncates raw documents.

## Context and usage measurement

Run the packaged offline reporter:

```bash
npx sdd-mcp-server context-report
npx sdd-mcp-server context-report --before ./baseline-sessions --after ./v4-sessions
npx sdd-mcp-server context-report --json
```

The deterministic repository estimate is `ceil(characters / 4)` and is always labeled `estimatedTokens`; it is not an actual GPT or Claude tokenizer count. Reports keep repository static payload, invoked/dynamic payload, provider-reported usage, and unobservable host payload separate. Provider input, output, cache, reasoning-normalization, and monetary cost are only compared when the adapters and billing data are comparable.

Fresh full-install static payload measurements versus the v3.5.1 baseline fell by **74.37% for Codex**, **83.21% for OMP**, and **95.64% for Claude Code**. These are byte-derived repository static reductions, not provider token or cost claims.

Three-run fresh-session A/B comparisons used comparable provider-reported median cost. v4 improved simple task by **6.83%**, medium implementation by **11.79%**, requirements by **14.09%**, design by **9.12%**, security by **1.74%**, and repeated context by **1.87%**. All task-quality checks passed. Static and observed measurements are reported separately because installed bytes cannot predict hidden host prompts, caching, reasoning, or orchestration cost.

## Routing summary

Claude executes a skill in the current turn with its routed Opus or Sonnet model override. Codex may request one generated Sol/xhigh custom advisor for high-level work. OMP runs high-level work inline on the Sol/medium parent by default: real A/B showed automatic Sol/xhigh child requests increased median cost. OMP’s `.omp/agents` Sol/xhigh advisors are explicit opt-in only, allow one child, and cannot nest or retry. Implementation, TDD, and simple tasks remain inline on Sol/medium unless genuinely independent parallel slices justify delegation.

See [docs/MODEL-ROUTING.md](docs/MODEL-ROUTING.md) for enforcement and fallback boundaries.

## Project guidance sources

- **Design Principles**: `rules/coding-style.md`
- **TDD Methodology**: `agents/tdd-guide.md`
- **Security Guidance**: `rules/security.md`
- **Workflow**: [docs/WORKFLOW.md](docs/WORKFLOW.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)

## Development

```bash
git clone https://github.com/yi-john-huang/sdd-mcp.git
cd sdd-mcp
npm install
npm run build
npm test
```

MIT licensed. See [CHANGELOG.md](CHANGELOG.md) for release history.
