# MCP SDD Server

[![npm version](https://badge.fury.io/js/sdd-mcp-server.svg)](https://www.npmjs.com/package/sdd-mcp-server)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

A Model Context Protocol server and target-native installer for governed Spec-Driven Development (SDD) in Claude Code, Codex, and Oh My Pi (OMP).

> **v5.0.0** — Skill-governed Formal SDD, durable revision-bound approvals and task progress, hidden MCP runtime registration, and managed target-native installation.

## Why sdd-mcp?

Skills own the requirements, design, task-planning, and TDD method plus the user conversation. The MCP runtime stays behind the Skill boundary and owns feature identity, canonical artifact writes, deterministic validation, revision-bound approvals, optional test review, implementation progress, and restart-safe context.

```text
User -> Skill -> MCP -> .spec
```

## New project installation

Use this path when the repository has never had sdd-mcp-generated guidance.

1. Open a terminal at the project root.
2. Choose the host that will execute the workflow.
3. Install the lean profile for the smallest default guidance surface, or choose `full` when the project needs target-native rules, contexts, and agents.

```bash
# Recommended explicit lean installation
npx sdd-mcp-server@5.0.0 install --profile lean --target claude-code
npx sdd-mcp-server@5.0.0 install --profile lean --target codex
npx sdd-mcp-server@5.0.0 install --profile lean --target omp

# Interactive full installation: choose Claude Code, Codex, or OMP
npx sdd-mcp-server@5.0.0 install --profile full
```

Do not use `--refresh-generated` for a new project. A normal installation records package ownership in `.sdd-mcp/install-manifest.json` and registers the hidden project runtime.

After installation, restart or reload the host and accept its project trust prompt. Then invoke the native requirements Skill with a feature name and goal; the Skill initializes or resumes durable state automatically.

A non-interactive install without `--target` retains the compatibility default, `claude-code`, and prints a notice. `--codex` remains a deprecated Codex-only alias. `--all-tools` installs all three native targets plus Antigravity; it does not make Codex artifacts executable by OMP.

## Manual workflow invocation

SDD skills are explicit commands and do not activate implicitly from ordinary prose.

| Path | Claude Code | Codex | Oh My Pi |
|---|---|---|---|
| Small task | `/simple-task` | `$simple-task` | `/skill:simple-task` |
| Formal SDD | `/sdd-requirements` → `/sdd-design` → `/sdd-tasks` → `/sdd-implement` | `$sdd-requirements` → `$sdd-design` → `$sdd-tasks` → `$sdd-implement` | `/skill:sdd-requirements` → `/skill:sdd-design` → `/skill:sdd-tasks` → `/skill:sdd-implement` |

Approvals and optional test-case review are explicit questions inside the relevant Skill flow. Status, context, validation, persistence, and progress recording happen internally.

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

## Upgrade from sdd-mcp 3.x or 4.x

Use this path when the project already contains generated sdd-mcp files from an earlier release.

1. Commit or otherwise preserve the current repository state.
2. Select the v5 target that the host actually uses. Existing Claude Code and Codex projects keep their native target; an OMP project previously using Codex files must select `omp`.
3. Run one reversible refresh:

```bash
# Replace <target> with claude-code, codex, or omp
npx sdd-mcp-server@5.0.0 install \
  --profile full \
  --target <target> \
  --refresh-generated
```

The refresh backs up selected generated files under `.sdd-mcp/backups/<timestamp>/<target>/`, removes recognized obsolete package output, and establishes `.sdd-mcp/install-manifest.json`. Project source, `.spec/specs/`, user steering, unknown files, and modified generated files remain untouched; modified files are reported as conflicts for manual review.

For an OMP migration, Codex TOML agents remain preserved but are not executable OMP agents. The new native files are written under `.omp/`.

After this one-time migration, use a normal install without `--refresh-generated` for subsequent v5 updates. Review conflicts, then reload/restart the host and accept project trust before invoking a native phase Skill.

## Integrator/runtime reference: canonical v5 inventory
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

Feature-scoped tools use `featureName`; v5 payloads bind phase mutations and approvals to exact revisions and artifact hashes. This inventory is for MCP integrators and runtime maintainers—not end-user workflow instructions. Hosts discover installed Skills, and the installer supports `--list`.

## Integrator/runtime reference: compact continuation

The runtime's context API defaults to bounded approved context and supports exact-response ETags. Phase Skills manage fingerprints and draft opt-in internally. Integrators that call the protocol directly must preserve the returned fingerprint for `ifNoneMatch`, request unapproved source only explicitly in full mode, and treat `.spec/specs/<feature>/spec.json` as workflow authority. Compact, standard, and full default bounds are 2,048, 4,096, and 16,384 `estimatedTokens`; full mode never silently truncates raw documents.

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
