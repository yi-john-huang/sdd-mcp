# SDD-MCP Agent Model Routing

This guide describes v4 execution routes for Claude Code, Codex, and Oh My Pi (OMP), including the boundary between native enforcement and guidance.

## Short version

| Work class | Claude Code | Codex | OMP |
|---|---|---|---|
| Requirements, design, review, security | current turn on Opus | at most one custom Sol/xhigh advisor | inline on Sol/medium by default |
| Implementation, TDD, simple task | current turn on Sonnet | inline on Sol/medium | inline on Sol/medium |
| Explicit advisor | not needed for model switching | generated custom Sol/xhigh agent | one opt-in `.omp/agents` Sol/xhigh child |
| Commit | local/current turn | local/current turn | local/current turn |

OMP does **not** automatically delegate high-level work. Real A/B runs showed that automatic Sol/xhigh child requests increased median cost, so high-level OMP work now remains inline on Sol/medium. Native Sol/xhigh advisors remain available as an explicit user choice only.

## Role routing

The canonical role table still owns native model metadata:

| Role | Typical skills | Claude Code | Codex metadata | OMP advisor metadata |
|---|---|---|---|---|
| planner | requirements, tasks, steering | `opus` | `gpt-5.6-sol` / `xhigh` | `gpt-5.6-sol` / `xhigh` |
| architect | design | `opus` | `gpt-5.6-sol` / `xhigh` | `gpt-5.6-sol` / `xhigh` |
| reviewer | review | `opus` | `gpt-5.6-sol` / `xhigh` | `gpt-5.6-sol` / `xhigh` |
| security-auditor | security check | `opus` | `gpt-5.6-sol` / `xhigh` | `gpt-5.6-sol` / `xhigh` |
| implementer | implementation | `sonnet` | `gpt-5.6-sol` / `medium` | parent `gpt-5.6-sol` / `medium` |
| tdd-guide | test generation | `sonnet` | `gpt-5.6-sol` / `medium` | parent `gpt-5.6-sol` / `medium` |

The OMP xhigh values describe installable, opt-in advisor definitions; they are not the automatic execution path. `/sdd-commit`, `$sdd-commit`, and `/skill:sdd-commit` remain local because commit work depends on the current turn’s complete change and verification context.

## Generated native metadata

### Claude Code

Skills under `.claude/skills/` receive the routed native `model` override. Claude Code applies that override to the current invoked skill turn, so the skill says “execute in this turn” and does not create a redundant specialist. Claude Code 2.1.198 or newer is required for the v4 manual-invocation and path-scoped loading guarantees.

### Codex

Codex manual-only skills live under `.agents/skills/` and include `agents/openai.yaml` with implicit invocation disabled. Advisor-class skills can request one custom agent from `.codex/agents/*.toml`:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "xhigh"
sandbox_mode = "read-only"
```

This selection is instruction-driven host orchestration. It is bounded to one child and carries `specialistDepth: 1`; nested same-phase delegation is prohibited. Implementation and TDD stay in the Sol/medium parent unless genuinely independent slices are dispatched concurrently.

### Oh My Pi

OMP skills live under `.omp/skills/`, and native advisor definitions live under `.omp/agents/*.md`:

```yaml
model: gpt-5.6-sol
thinkingLevel: xhigh
tools: [read, grep, glob]
```

Advisor tools omit `task`, and definitions omit `spawns`, so an advisor cannot recursively delegate. The parent invokes an advisor only after the user explicitly opts in. One missing definition, unavailable model, authentication failure, or spawn failure produces one recorded fallback and inline continuation—never a retry or generic child.

Installation emits the canonical selector without running OMP or resolving an authenticated provider. The install report therefore says model availability is “not verified”; `omp models find gpt-5.6-sol` is an optional post-install diagnostic.

## What happens when a skill runs

1. The user manually invokes the host-native command: `/<name>` in Claude Code, `$<name>` in Codex, or `/skill:<name>` in OMP.
2. The skill determines its execution class from the central route policy.
3. Claude runs in the current turn on its native model override.
4. Codex may request one custom Sol/xhigh advisor for an advisor-class skill.
5. OMP runs inline on Sol/medium unless the user explicitly requests one installed Sol/xhigh advisor.
6. The parent integrates a compact result containing decisions, affected artifacts, verification evidence, and unresolved blockers.
7. Failure to start an allowed advisor is recorded once, then work continues inline.

The repository cannot force a model switch when Codex or an unavailable OMP route cannot honor generated metadata. Claude model overrides and OMP child model/thinking metadata are host-enforced when invoked; Codex child selection and fallback remain instruction-driven. Static configuration cannot inspect the active parent model or prove that a child executed.

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
npx sdd-mcp-server install --profile full --target claude-code
npx sdd-mcp-server install --profile full --target codex
npx sdd-mcp-server install --profile full --target omp
```

OMP lean already includes agents so explicit advisors are available without making them automatic. Generated route files are tracked in `.sdd-mcp/install-manifest.json`; untouched files update automatically and modified files remain user-owned. Use `--refresh-generated` for a backed-up legacy cutover.

## Source of truth

`ROLE_MODEL_ROUTES` and `SKILL_AGENT_ROUTES` define model metadata and skill-role mapping. Execution classes beside those tables decide inline, optional-advisor, parallel-only, and local behavior. Target renderers may translate the policy into native syntax but may not invent a second route.
