# SDD-MCP Agent Model Routing

This guide describes v4 execution routes for Claude Code, Codex, and Oh My Pi (OMP). It also describes the boundary between native enforcement and guidance.

## Short version

| Work class | Claude Code | Codex | OMP |
|---|---|---|---|
| Requirements, design, review, security | current turn on configured skill model/effort (default Claude Opus 5.5/high) | inline; review/security may use one configured custom agent after a once-per-session choice; parent unchanged | current invoked skill turn on configured model/thinking via project extension |
| Implementation, TDD, simple task | current turn on configured skill model/effort (default Claude Sonnet 5.5/medium) | inline on host-selected parent | current invoked skill turn on configured model/thinking via project extension |
| Explicit advisor | generated subagent has configured role model/effort | generated custom agent has configured role model/effort | one opt-in `.omp/agents` child with configured model/thinking |
| Commit | local/current turn | local/current turn | local/current turn |

OMP does **not** automatically delegate high-level work. When a user invokes an SDD skill, the installed `.omp/extensions/sdd-skill-routing.js` selects the configured route in the parent session. At agent end, it restores the prior model and thinking. Explicit advisor delegation stays opt-in.

## Role routing

`ROLE_MODEL_ROUTES` owns the defaults. `--model-roles` overrides selected roles at install time:

| Role | Typical skills | Claude Code model / effort | Codex metadata | OMP skill / agent route |
|---|---|---|---|---|
| planner | requirements, tasks, steering | `claude-opus-5-5` / `high` | `gpt-6-sol` / `xhigh` | `openai-codex/gpt-6-sol` / `xhigh` |
| architect | design | `claude-opus-5-5` / `high` | `gpt-6-sol` / `xhigh` | `openai-codex/gpt-6-sol` / `xhigh` |
| reviewer | review | `claude-opus-5-5` / `high` | `gpt-6-sol` / `xhigh` | `openai-codex/gpt-6-sol` / `xhigh` |
| security-auditor | security check | `claude-opus-5-5` / `high` | `gpt-6-sol` / `xhigh` | `openai-codex/gpt-6-sol` / `xhigh` |
| implementer | implementation | `claude-sonnet-5-5` / `medium` | `gpt-6-luna` / `medium` | `openai-codex/gpt-6-luna` / `medium` |
| tdd-guide | test generation | `claude-sonnet-5-5` / `medium` | `gpt-6-luna` / `medium` | `openai-codex/gpt-6-luna` / `medium` |

The OMP xhigh values apply to invoked skills through the routing extension. They also apply to opt-in advisor definitions. `/sdd-commit`, `$sdd-commit`, and `/skill:sdd-commit` stay local. Commit work depends on the complete change and verification context of the current turn.

## Configure installed model routes

Create a YAML file with `modelRoles` entries keyed by **SDD agent role**. Then install with `--model-roles models.yaml`:

```yaml
modelRoles:
  planner: openai-codex/gpt-6-sol:high
  architect: openai-codex/gpt-6-sol:high
  reviewer: openai-codex/gpt-6-sol:xhigh
  security-auditor: openai-codex/gpt-6-sol:xhigh
  implementer: openai-codex/gpt-6-luna:max
  tdd-guide: openai-codex/gpt-6-luna:medium
```

For a host-specific selection, use a mapping, not a scalar:

```yaml
modelRoles:
  planner:
    codex: openai-codex/gpt-6-sol:high
    omp: xai-oauth/grok-4.7:xhigh
    claudeCode:
      model: claude-opus-5-5
      effort: high
```

The scalar selector sets both Codex and OMP routes. Claude Code keeps its defaults unless `claudeCode` is set. For Claude Code, use a model name (`claudeCode: claude-sonnet-5-5`). You can also use a mapping with `model` and/or `effort`. Supported effort values are `low`, `medium`, `high`, `xhigh`, and `max`. Codex agent TOML receives the model name after the provider prefix, and `model_reasoning_effort`. OMP agents and the skill-routing extension receive the full provider/model and `thinkingLevel`. Codex and OMP selectors accept `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. The installer does not validate host or model support. If a model is available on only one host, use a host mapping, not a scalar. An example is `xai-oauth/grok-4.7:xhigh` on OMP. Unspecified roles and hosts keep the defaults in the table above.

Valid roles: `planner`, `architect`, `reviewer`, `security-auditor`, `implementer`, `tdd-guide`. These inputs fail before the installer writes files: duplicate YAML keys, unknown roles, malformed selectors, and unsupported Claude efforts. The installer resolves the path from the project directory. It reads the file. It does not install or modify it. Supply `--model-roles models.yaml` on every installation or rerun that should use the overrides, including `--all-tools`. A rerun updates package-owned, unmodified generated files. The installer preserves edits to generated output as conflicts.

The example OMP host roles `default`, `smol`, `slow`, `plan`, `task`, and `advisor` configure the **host**, not SDD agents. This option controls generated SDD skills and agents only. Codex's per-role selectors apply to generated custom agents, not to the inline parent. Claude Code's skill model and effort apply for the invoked turn. Its subagent frontmatter applies when that agent is delegated. OMP's interactive parent route changes only while an SDD skill is invoked and its extension is enabled. Generic subagents still require OMP host configuration.

## Generated native metadata

### Claude Code

Skills under `.claude/skills/` receive routed native `model` and `effort` overrides. Claude Code applies those overrides to the current invoked skill turn. So the skill says “execute in this turn” and does not create a redundant specialist. The matching `.claude/agents/*.md` definitions receive the same model and effort for explicit delegation. Claude Code 2.1.198 or newer supports the v4 manual-invocation and path-scoped loading guarantees. The pinned defaults need more: **2.1.284 or newer** for Sonnet 5.5 (Opus 5.5 requires 2.1.280). Older versions cannot run both default routes. Update Claude Code, or override the models at install time. See [Claude Code model requirements](https://code.claude.com/docs/en/model-config#available-models).

### Codex

Codex skills live under `.agents/skills/` and include `agents/openai.yaml`. Workflow skills disable implicit invocation. `output-clarity-ladder` is the only skill that allows it, and it has no model route. Review and security skills can use one custom agent from `.codex/agents/*.toml`. The user must choose it first:

```toml
model = "gpt-6-sol"
model_reasoning_effort = "xhigh"
sandbox_mode = "read-only"
```

This selection is instruction-driven host orchestration. It is limited to one child and carries `specialistDepth: 1`. Nested same-phase delegation is prohibited. Implementation and TDD stay in the host-selected parent. They change only when genuinely independent slices are dispatched concurrently. Their generated agent definitions still receive configured role metadata when installed.

### Oh My Pi

OMP skills live under `.omp/skills/`. Native advisor definitions live under `.omp/agents/*.md`:

```yaml
model: openai-codex/gpt-6-sol
thinkingLevel: xhigh
tools: [read, grep, glob]
```

Advisor tools omit `task`, and definitions omit `spawns`. So an advisor cannot recursively delegate. The parent invokes an advisor only after the user explicitly opts in. One missing definition, unavailable model, authentication failure, or spawn failure produces one recorded fallback. Work then continues inline. There is never a retry or a generic child.

OMP does not implement `model` or `thinkingLevel` in `SKILL.md` frontmatter. The installer emits `.omp/extensions/sdd-skill-routing.js` with the resolved routes. Its `before_agent_start` handler recognizes host-generated `/skill:<name>` invocation prompts. It selects the authenticated model and thinking level. Its `agent_end` handler restores the parent's settings. If the requested model is absent or has no credentials, the handler notifies and aborts. It does not silently run on another model. Routing needs OMP extension discovery to be enabled. The session must also start in the installed project. `--no-extensions` disables routing.

Installation emits the canonical selector. It does not run OMP or resolve an authenticated provider. So the install report says model availability is “not verified”. `omp models find gpt-6-sol` is an optional post-install diagnostic. Use the host's catalog identifier, not `chatgpt-6-sol` or `chatgpt-6-lun`.

## What happens when a skill runs

1. The user manually invokes the host-native command: `/<name>` in Claude Code, `$<name>` in Codex, or `/skill:<name>` in OMP.
2. The skill determines its execution class from the central route policy.
3. Claude runs in the current turn with its installed skill model and effort overrides.
4. Codex runs inline by default. Review and security checks may use one custom agent with the generated role's model and reasoning effort. The user must choose it once per session first. This does not switch the Codex parent.
5. OMP switches the parent for the invoked skill through the installed extension. A project advisor runs only if the user explicitly opts in.
6. The parent integrates a compact result. The result contains decisions, affected artifacts, verification evidence, and unresolved blockers.
7. If an allowed advisor fails to start, the skill records that once. Work then continues inline.
8. The skill reports the execution mode, agents started, parallelism, configured model/effort, and any fallback.

The repository cannot force a model switch when Codex or an unavailable OMP route cannot honor generated metadata. The host enforces Claude skill model/effort and OMP extension model/thinking selection when loaded. Codex child selection and fallback stay instruction-driven. Static configuration cannot inspect the active parent model. It cannot prove that a child executed.

## Execution mode and reporting

SDD "advisors" are project subagents under `.claude/agents`, `.codex/agents`, or `.omp/agents`. They are separate from the Claude Code `/advisor` tool. That tool pairs the main model with a stronger server-side model.

| Skill | Asks inline vs. project agent? |
|---|---|
| `sdd-review`, `sdd-security-check` | Once per session, only if project agents are installed |
| `sdd-implement`, `sdd-test-gen`, `simple-task` | Once per session, only if project agents are installed and at least two independent slices exist; never split work to justify agents |
| requirements, design, tasks, steering | Never; inline |
| `sdd-commit` | Never; local |

The skill reuses the answer for the rest of the conversation. It does not persist the answer in `spec.json`. A new session asks again. Without installed agents (Claude Code/Codex `lean`), the skill asks nothing and work stays inline.

Each executing skill ends with an execution report. The report lists these items: mode (inline or project-agent; asked, reused, or not offered), agents started and whether they ran in parallel, configured model/effort per agent, and any fallback to the parent. Model/effort in the report are configured values unless the host exposes them. A skill cannot observe the effective effort.

To verify independently:

- **Claude Code** (v2.1.242 or later): run `/tasks` to see running subagents with their model. When the agent or skill sets `effort`, it also shows the effort level. Press Enter on a row to open its transcript. Subagent transcripts are stored at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`. Claude Code removes them after `cleanupPeriodDays` (30 days by default). The main session transcript records the parent's per-message `model`. `/usage` shows per-model usage. To keep a record, add `SubagentStart`/`SubagentStop` hooks in `settings.json`. As of v2.1.198, `/agents` no longer lists live subagents. Inspect `.claude/agents/` directly.
- **Codex and OMP**: rely on the skill's execution report and the host's own session tooling. This repository does not document a host command that proves a child ran. Static configuration cannot inspect the active parent model.

## Parallel implementation rule

Implementation, TDD, and simple tasks do not create a serial child only to repeat parent work. Delegation is justified only when three conditions hold. At least two independent slices can run concurrently. They are dispatched in one batch. The parent continues a separate slice. A lone child followed by an idle wait is prohibited.

## Cost and context implications

Delegation can use more **total tokens** and cost more than inline work. It creates a separate request, child reasoning/output, a handoff, and result integration. Compact handoffs reduce duplicated context. They do not remove that cost. This is why OMP high-level work changed to an inline default.

The packaged reporter separates:

- exact repository static bytes;
- repository dynamic/invoked payload;
- provider-reported input, output, cache, reasoning-normalization, and cost;
- unobservable host payload.

`estimatedTokens` is `ceil(characters / 4)` for deterministic budgets. It is not a provider tokenizer count. The reporter compares positive provider cost only for the same provider/model/billing mode. Otherwise, it requires an adapter-verified non-double-counting token normalization.

Fresh full-install static reductions from v3.5.1 were **74.37% Codex**, **83.21% OMP**, and **95.64% Claude Code**. Comparable provider-reported median costs across three fresh runs improved **6.83% simple**, **11.79% medium**, **14.09% requirements**, **9.12% design**, **1.74% security**, and **1.87% repeated context**. All task-quality checks passed.

These outcomes are different metrics. Do not market static reductions as provider token or cost savings.

## Installation and rerun behavior

```bash
npx sdd-mcp-server install --profile full --target claude-code --model-roles models.yaml
npx sdd-mcp-server install --profile full --target codex --model-roles models.yaml
npx sdd-mcp-server install --target omp --model-roles models.yaml
```

OMP lean already includes agents and the skill-routing extension. So explicit advisors are available, but they do not become automatic. `.sdd-mcp/install-manifest.json` tracks generated route files. Untouched files update automatically. Modified files stay user-owned. Use `--refresh-generated` for a backed-up legacy cutover. Restart OMP after installing or changing the extension.

## Source of truth

`ROLE_MODEL_ROUTES` and `SKILL_AGENT_ROUTES` define default model metadata and skill-role mapping. `loadModelRoutes` validates and applies optional per-install YAML overrides. Execution classes beside those tables decide inline, optional-advisor, parallel-only, and local behavior. Target renderers translate resolved policy into native syntax. They may not invent a second route.
