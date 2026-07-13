# SDD-MCP Installation Guide

The unified installer creates native project files for either Codex or Claude Code. It does not require a global package installation.

## Choose a target

Run a full install from an interactive terminal:

```bash
npx sdd-mcp-server install --profile full
```

The installer asks once:

```text
Choose the primary LLM agent target:
  1) Codex
  2) Claude Code
Selection:
```

For scripts, CI, or any non-interactive run, pass the target explicitly:

```bash
npx sdd-mcp-server install --profile full --target codex
npx sdd-mcp-server install --profile full --target claude-code
```

If no target is supplied in a non-interactive or lean install, the installer keeps backward compatibility by selecting `claude-code` and printing a notice. The old `--codex` flag is supported as a deprecated alias for `--target codex`.

## Profiles and components

The default `lean` profile installs skills, steering, and hooks. The `full` profile installs skills, steering, rules, contexts, agents, and hooks.

```bash
# Lean profile
npx sdd-mcp-server install --target codex

# Full profile
npx sdd-mcp-server install --profile full --target codex

# Selected components
npx sdd-mcp-server install --target codex --skills --rules --agents

# List packaged components without installing
npx sdd-mcp-server install --list
```

`--all` remains an alias for selecting every component. The legacy `install-skills` command still installs skills to its configured path.

## Generated files

| Component | Claude Code | Codex |
|-----------|-------------|-------|
| Root guidance | `CLAUDE.md` | `AGENTS.md` |
| Skills | `.claude/skills/<name>/` | `.agents/skills/<name>/` |
| Steering | `.spec/steering/` | `.spec/steering/` |
| Rules | `.claude/rules/*.md` | `.codex/guidance/rules/*.md` |
| Contexts | `.claude/contexts/*.md` | `.codex/guidance/contexts/*.md` |
| Agents | `.claude/agents/*.md` | `.codex/agents/*.toml` |
| Hooks | `.claude/hooks/<event>/*.md` | `.codex/hooks.json` and `.codex/hooks/sdd-hook-runner.mjs` |

Codex prompt guidance is deliberately kept out of `.codex/rules/`, which is reserved for Codex command policy. Passing a Codex rules override below that directory is rejected before files are written.

## Model routing

Installed agents include model metadata selected by role:

| SDD role | Task class | Codex | Claude Code |
|----------|------------|-------|-------------|
| Planner | High-level advisor | `gpt-5.6-sol`, xhigh effort | `opus` |
| Architect | High-level advisor | `gpt-5.6-sol`, xhigh effort | `opus` |
| Reviewer | High-level advisor | `gpt-5.6-sol`, xhigh effort | `opus` |
| Security auditor | High-level advisor | `gpt-5.6-sol`, xhigh effort | `opus` |
| Implementer | Implementation (default) | `gpt-5.6-luna`, max effort | `sonnet` |
| TDD guide | Implementation (default) | `gpt-5.6-luna`, max effort | `sonnet` |

Codex uses `gpt-5.6-luna` as the default model for routed work. High-level advisor roles override that default with `gpt-5.6-sol` at xhigh effort. `gpt-5.6-terra` remains supported but is not selected by a default SDD role. Phase skills use compact handoffs when asking the matching specialist to work, then wait for and integrate the result. When the host cannot delegate, the skill states the fallback and continues in the current agent.

GPT-5.6 preview access depends on the user's eligible Codex workspace or API organization; generated files do not grant access or bypass host entitlement checks. Specialist delegation can consume more total tokens than a single-agent run because handoffs, specialist work, and result integration add work; compact handoffs reduce but do not eliminate that cost.
See [Model Routing](MODEL-ROUTING.md) for the complete role map, generated Codex/Claude Code examples, delegation flow, and rerun behavior.

## `.gitignore` and reruns

After target artifacts are installed, the installer updates the project's existing `.gitignore` in a managed block:

```gitignore
# BEGIN sdd-mcp generated agent files
.agents/
.codex/
# END sdd-mcp generated agent files
```

Claude Code installs add only `.claude/`. Existing comments, unrelated patterns, newline style, and file mode are preserved. Root guidance and `.spec/steering/` are not ignored.

Installer writes are preserve-first. Existing root guidance, agents, skills, rules, contexts, hooks, and steering documents are reported as skipped and are never overwritten during a normal rerun.

## Custom paths

Each component path can be overridden independently after the target is selected:

```bash
npx sdd-mcp-server install --profile full --target codex \
  --path custom/skills \
  --steering-path custom/steering \
  --rules-path custom/guidance/rules \
  --contexts-path custom/guidance/contexts \
  --agents-path custom/agents \
  --hooks-path custom/hooks
```

## Additional integrations

Antigravity remains opt-in and does not select the primary target:

```bash
npx sdd-mcp-server install --target claude-code --antigravity
npx sdd-mcp-server install --target claude-code --all-tools
```

## Troubleshooting

- Use `--target codex` or `--target claude-code` when input is not a terminal.
- If a file is reported as skipped, edit or remove that user-owned destination explicitly before rerunning; the installer will not replace it.
- If Codex guidance is rejected below `.codex/rules/`, choose `.codex/guidance/rules/` or another prompt-guidance path.
- Restart the target agent after installation so it rediscovers skills, agents, and lifecycle configuration.
