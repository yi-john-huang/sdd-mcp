# SDD-MCP Agent Model Routing

This guide describes v4 execution routes for Claude Code, Codex, and Oh My Pi (OMP), including the boundary between native enforcement and guidance.

## Short version

| Work class | Claude Code | Codex | OMP |
|---|---|---|---|
| Requirements, design, review, security | current turn on configured skill model/effort (default Claude Opus 5.5/high) | inline; review/security may use one configured custom agent after a once-per-session choice; parent unchanged | current invoked skill turn on configured model/thinking via project extension |
| Implementation, TDD, simple task | current turn on configured skill model/effort (default Claude Sonnet 5.5/medium) | inline on host-selected parent | current invoked skill turn on configured model/thinking via project extension |
| Explicit advisor | generated subagent has configured role model/effort | generated custom agent has configured role model/effort | one opt-in `.omp/agents` child with configured model/thinking |
| Commit | local/current turn | local/current turn | local/current turn |

OMP does **not** automatically delegate high-level work. The installed `.omp/extensions/sdd-skill-routing.js` selects the configured route in the parent session when a user invokes an SDD skill, then restores the prior model and thinking at agent end. Explicit advisor delegation remains opt-in.

## Role routing

`ROLE_MODEL_ROUTES` owns the defaults; `--model-roles` overrides selected roles at install time:

| Role | Typical skills | Claude Code model / effort | Codex metadata | OMP skill / agent route |
|---|---|---|---|---|
| planner | requirements, tasks, steering | `claude-opus-5-5` / `high` | `gpt-6-sol` / `xhigh` | `openai-codex/gpt-6-sol` / `xhigh` |
| architect | design | `claude-opus-5-5` / `high` | `gpt-6-sol` / `xhigh` | `openai-codex/gpt-6-sol` / `xhigh` |
| reviewer | review | `claude-opus-5-5` / `high` | `gpt-6-sol` / `xhigh` | `openai-codex/gpt-6-sol` / `xhigh` |
| security-auditor | security check | `claude-opus-5-5` / `high` | `gpt-6-sol` / `xhigh` | `openai-codex/gpt-6-sol` / `xhigh` |
| implementer | implementation | `claude-sonnet-5-5` / `medium` | `gpt-6-luna` / `medium` | `openai-codex/gpt-6-luna` / `medium` |
| tdd-guide | test generation | `claude-sonnet-5-5` / `medium` | `gpt-6-luna` / `medium` | `openai-codex/gpt-6-luna` / `medium` |

The OMP xhigh values apply to invoked skills through the routing extension and to opt-in advisor definitions. `/sdd-commit`, `$sdd-commit`, and `/skill:sdd-commit` remain local because commit work depends on the current turn’s complete change and verification context.

## Configure installed model routes

Create a YAML file with `modelRoles` entries keyed by **SDD agent role**, then install with `--model-roles models.yaml`:

```yaml
modelRoles:
  planner: openai-codex/gpt-6-sol:high
  architect: openai-codex/gpt-6-sol:high
  reviewer: openai-codex/gpt-6-sol:xhigh
  security-auditor: openai-codex/gpt-6-sol:xhigh
  implementer: openai-codex/gpt-6-luna:max
  tdd-guide: openai-codex/gpt-6-luna:medium
```

For a host-specific selection, use a mapping instead of a scalar:

```yaml
modelRoles:
  planner:
    codex: openai-codex/gpt-6-sol:high
    omp: xai-oauth/grok-4.7:xhigh
    claudeCode:
      model: claude-opus-5-5
      effort: high
```

The scalar selector sets both Codex and OMP routes; Claude Code retains its defaults unless `claudeCode` is set. For Claude Code, use a model name (`claudeCode: claude-sonnet-5-5`) or a mapping with `model` and/or `effort`; supported effort values are `low`, `medium`, `high`, `xhigh`, and `max`. Codex agent TOML receives the model name after the provider prefix and `model_reasoning_effort`; OMP agents and the skill-routing extension receive the full provider/model and `thinkingLevel`. Codex and OMP selectors accept `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Host/model support is not validated at install time. Use a host mapping rather than a scalar if a model is only available on one host (for example `xai-oauth/grok-4.7:xhigh` on OMP). Unspecified roles and hosts retain the defaults in the table above.

Valid roles: `planner`, `architect`, `reviewer`, `security-auditor`, `implementer`, `tdd-guide`. Duplicate YAML keys, unknown roles, malformed selectors, and unsupported Claude efforts fail before the installer writes files. The path is resolved from the project directory; the file is read but not installed or modified. Supply `--model-roles models.yaml` on every installation/rerun that should use the overrides, including `--all-tools`. Package-owned, unmodified generated files update on rerun; edits to generated output are preserved as conflicts.

The example OMP host roles `default`, `smol`, `slow`, `plan`, `task`, and `advisor` configure the **host**, not SDD agents. This option controls generated SDD skills/agents only. Codex's per-role selectors apply to generated custom agents, not the inline parent; Claude Code's skill model and effort apply for the invoked turn, and its subagent frontmatter applies when that agent is delegated. OMP's interactive parent route changes only while an SDD skill is invoked and its extension is enabled; generic subagents still require OMP host configuration.

## Generated native metadata

### Claude Code

Skills under `.claude/skills/` receive routed native `model` and `effort` overrides. Claude Code applies those overrides to the current invoked skill turn, so the skill says “execute in this turn” and does not create a redundant specialist. The matching `.claude/agents/*.md` definitions receive the same model and effort for explicit delegation. Claude Code 2.1.198 or newer supports the v4 manual-invocation and path-scoped loading guarantees, but the pinned defaults require **2.1.284 or newer** for Sonnet 5.5 (Opus 5.5 requires 2.1.280). Older versions cannot run both default routes; update Claude Code or override the models at install time. See [Claude Code model requirements](https://code.claude.com/docs/en/model-config#available-models).

### Codex

Codex manual-only skills live under `.agents/skills/` and include `agents/openai.yaml` with implicit invocation disabled. Review and security skills can use one custom agent from `.codex/agents/*.toml` after the user chooses it:

```toml
model = "gpt-6-sol"
model_reasoning_effort = "xhigh"
sandbox_mode = "read-only"
```

This selection is instruction-driven host orchestration. It is bounded to one child and carries `specialistDepth: 1`; nested same-phase delegation is prohibited. Implementation and TDD stay in the host-selected parent unless genuinely independent slices are dispatched concurrently. Their generated agent definitions still receive configured role metadata when installed.

### Oh My Pi

OMP skills live under `.omp/skills/`, and native advisor definitions live under `.omp/agents/*.md`:

```yaml
model: openai-codex/gpt-6-sol
thinkingLevel: xhigh
tools: [read, grep, glob]
```

Advisor tools omit `task`, and definitions omit `spawns`, so an advisor cannot recursively delegate. The parent invokes an advisor only after the user explicitly opts in. One missing definition, unavailable model, authentication failure, or spawn failure produces one recorded fallback and inline continuation—never a retry or generic child.

OMP does not implement `model` or `thinkingLevel` in `SKILL.md` frontmatter. The installer emits `.omp/extensions/sdd-skill-routing.js` with the resolved routes. Its `before_agent_start` handler recognizes host-generated `/skill:<name>` invocation prompts, selects the authenticated model and thinking level, and its `agent_end` handler restores the parent's settings. If the requested model is absent or has no credentials, the handler notifies and aborts rather than silently running on another model. This requires OMP extension discovery to be enabled and the session to start in the installed project; `--no-extensions` disables routing.

Installation emits the canonical selector without running OMP or resolving an authenticated provider. The install report therefore says model availability is “not verified”; `omp models find gpt-6-sol` is an optional post-install diagnostic. Use the host's catalog identifier (not `chatgpt-6-sol` or `chatgpt-6-lun`).

## What happens when a skill runs

1. The user manually invokes the host-native command: `/<name>` in Claude Code, `$<name>` in Codex, or `/skill:<name>` in OMP.
2. The skill determines its execution class from the central route policy.
3. Claude runs in the current turn with its installed skill model and effort overrides.
4. Codex runs inline by default; review and security checks may use one custom agent with the generated role's model and reasoning effort after the user chooses it once per session. This does not switch its parent.
5. OMP switches the parent for the invoked skill through the installed extension; a project advisor runs only if the user explicitly opts in.
6. The parent integrates a compact result containing decisions, affected artifacts, verification evidence, and unresolved blockers.
7. Failure to start an allowed advisor is recorded once, then work continues inline.
8. The skill reports the execution mode, agents started, parallelism, configured model/effort, and any fallback.

The repository cannot force a model switch when Codex or an unavailable OMP route cannot honor generated metadata. Claude skill model/effort and OMP extension model/thinking selection are host-enforced when loaded; Codex child selection and fallback remain instruction-driven. Static configuration cannot inspect the active parent model or prove that a child executed.

## Execution mode and reporting

SDD "advisors" are project subagents under `.claude/agents`, `.codex/agents`, or `.omp/agents`. They are separate from the Claude Code `/advisor` tool, which pairs the main model with a stronger server-side model.

| Skill | Asks inline vs. project agent? |
|---|---|
| `sdd-review`, `sdd-security-check` | Once per session, only if project agents are installed |
| `sdd-implement`, `sdd-test-gen`, `simple-task` | Once per session, only if project agents are installed and at least two independent slices exist; never split work to justify agents |
| requirements, design, tasks, steering | Never; inline |
| `sdd-commit` | Never; local |

The answer is reused for the rest of the conversation and is not persisted in `spec.json`; a new session asks again. Without installed agents (Claude Code/Codex `lean`) nothing is asked and work stays inline.

Each executing skill ends with an execution report: mode (inline or project-agent; asked, reused, or not offered), agents started and whether they ran in parallel, configured model/effort per agent, and any fallback to the parent. Model/effort in the report are configured values unless the host exposes them; a skill cannot observe the effective effort.

To verify independently:

- **Claude Code** (v2.1.242 or later): run `/tasks` to see running subagents with their model and, when the agent or skill sets `effort`, the effort level. Press Enter on a row to open its transcript. Subagent transcripts are stored at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl` (removed after `cleanupPeriodDays`, 30 days by default); the main session transcript records the parent's per-message `model`. `/usage` shows per-model usage. To keep a record, add `SubagentStart`/`SubagentStop` hooks in `settings.json`. As of v2.1.198 `/agents` no longer lists live subagents; inspect `.claude/agents/` directly.
- **Codex and OMP**: rely on the skill's execution report and the host's own session tooling. This repository does not document a host command that proves a child ran, and static configuration cannot inspect the active parent model.

## Parallel implementation rule

Implementation, TDD, and simple tasks do not create a serial child just to repeat parent work. Delegation is justified only when at least two independent slices can run concurrently, they are dispatched in one batch, and the parent continues a separate slice. A lone child followed by an idle wait is prohibited.

## Cost and context implications

Delegation can consume more **total tokens** and cost than inline work because it creates a separate request, child reasoning/output, a handoff, and result integration. Compact handoffs reduce duplicated context but do not remove that cost. This is why OMP high-level work changed to an inline default.

The packaged reporter separates:

- exact repository static bytes;
- repository dynamic/invoked payload;
- provider-reported input, output, cache, reasoning-normalization, and cost;
- unobservable host payload.

`estimatedTokens` is `ceil(characters / 4)` for deterministic budgets; it is not a provider tokenizer count. Positive provider cost is compared only for the same provider/model/billing mode. Otherwise, an adapter-verified non-double-counting token normalization is required.

Fresh full-install static reductions from v3.5.1 were **74.37% Codex**, **83.21% OMP**, and **95.64% Claude Code**. Comparable provider-reported median costs across three fresh runs improved **6.83% simple**, **11.79% medium**, **14.09% requirements**, **9.12% design**, **1.74% security**, and **1.87% repeated context**. All task-quality checks passed.

These outcomes are different metrics: static reductions must not be marketed as provider token or cost savings.

## Installation and rerun behavior

```bash
npx sdd-mcp-server install --profile full --target claude-code --model-roles models.yaml
npx sdd-mcp-server install --profile full --target codex --model-roles models.yaml
npx sdd-mcp-server install --target omp --model-roles models.yaml
```

OMP lean already includes agents and the skill-routing extension, so explicit advisors are available without becoming automatic. Generated route files are tracked in `.sdd-mcp/install-manifest.json`; untouched files update automatically and modified files remain user-owned. Use `--refresh-generated` for a backed-up legacy cutover. Restart OMP after installing or changing the extension.

## Source of truth

`ROLE_MODEL_ROUTES` and `SKILL_AGENT_ROUTES` define default model metadata and skill-role mapping; `loadModelRoutes` validates and applies optional per-install YAML overrides. Execution classes beside those tables decide inline, optional-advisor, parallel-only, and local behavior. Target renderers translate resolved policy into native syntax but may not invent a second route.
