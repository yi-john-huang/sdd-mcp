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

## New project installation

Use this path when the repository has never had sdd-mcp-generated guidance.

1. Open a terminal at the project root.
2. Choose the host that will execute the workflow.
3. Install the lean profile for the smallest default guidance surface, or choose `full` when the project needs target-native rules, contexts, and agents.

```bash
# Recommended explicit lean installation
npx sdd-mcp-server@4.0.0 install --profile lean --target claude-code
npx sdd-mcp-server@4.0.0 install --profile lean --target codex
npx sdd-mcp-server@4.0.0 install --profile lean --target omp

# Interactive full installation: choose Claude Code, Codex, or OMP
npx sdd-mcp-server@4.0.0 install --profile full
```

Do not use `--refresh-generated` for a new project. There is no legacy generated set to replace, and a normal installation already records package ownership in `.sdd-mcp/install-manifest.json`.

After installation, restart or reload the host if it does not discover new project guidance immediately. Then initialize the first feature with the installed SDD workflow. To run only the MCP server without installing project guidance:

```bash
npx -y sdd-mcp-server@4.0.0
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

## Upgrade from sdd-mcp 3.x

Use this path when the project already contains generated sdd-mcp files from an earlier release.

1. Commit or otherwise preserve the current repository state.
2. Select the v4 target that the host actually uses. Existing Claude Code and Codex projects keep their native target; an OMP project previously using Codex files must select `omp`.
3. Run one reversible refresh:

```bash
# Replace <target> with claude-code, codex, or omp
npx sdd-mcp-server@4.0.0 install \
  --profile full \
  --target <target> \
  --refresh-generated
```

The refresh backs up selected generated files under `.sdd-mcp/backups/<timestamp>/<target>/`, removes recognized obsolete package output, and establishes `.sdd-mcp/install-manifest.json`. Project source, `.spec/specs/`, user steering, unknown files, and modified generated files remain untouched; modified files are reported as conflicts for manual review.

For an OMP migration, Codex TOML agents remain preserved but are not executable OMP agents. The new native files are written under `.omp/`.

After this one-time migration, use a normal install without `--refresh-generated` for subsequent v4 updates. Review any reported conflicts before deleting old target directories.

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
