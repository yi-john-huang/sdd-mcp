# SDD-MCP Installation Guide

Use one-time personal setup for a local user/profile, or the optional project installer for shared repository guidance. Neither invokes a model, inspects authentication, or grants host/project trust.

## One-time personal setup

From any directory with Node.js >=18 and npm available:

```bash
npx -y sdd-mcp-server@latest setup-global
npx -y sdd-mcp-server@latest setup-global --target claude-code
npx -y sdd-mcp-server@latest setup-global --target codex
npx -y sdd-mcp-server@latest setup-global --target omp
```

Without `--target`, setup processes Claude Code, Codex, then OMP. The only option is one `--target` with one of those values; project install flags such as `--all-tools` and `--profile` are not accepted.

The equivalent source-checkout wrapper is `./bootstrap.sh` (POSIX `sh` required only for the wrapper). It delegates to `npx -y "${SDD_MCP_PACKAGE:-sdd-mcp-server@latest}" setup-global "$@"`, preserving arguments and exit status. It needs neither `sudo` nor `npm install -g`. The resolved package's exact version is pinned in all runtime entries.

### Native personal paths

`H` is the user home. `P` is nonempty `CLAUDE_CONFIG_DIR`, otherwise `H/.claude`; `C` is nonempty `CODEX_HOME`, otherwise `H/.codex`; `A` is the discovered/fallback OMP agent directory.

| Host | Runtime configuration | Runtime ownership directory | Skills | Skills ownership directory |
|---|---|---|---|---|
| Claude, no override | `H/.claude.json` | `H/.claude/.sdd-mcp/global-runtime` | `H/.claude/skills/` | `H/.claude/.sdd-mcp/global-skills` |
| Claude, nonempty override | `P/.claude.json` | `P/.sdd-mcp/global-runtime` | `P/skills/` | `P/.sdd-mcp/global-skills` |
| Codex | `C/config.toml` | `C/.sdd-mcp/global-runtime` | `H/.agents/skills/` | `H/.agents/.sdd-mcp/global-skills` |
| OMP | `A/mcp.json` | `A/.sdd-mcp/global-runtime` | `A/skills/` | `A/.sdd-mcp/global-skills` |

Each ownership directory contains `install-manifest.json`, the transient `install.lock`, and any `backups/<timestamp>/<target>/...`. Runtime and Skills ownership use separate stores. `CODEX_HOME` does not move personal Skills. A nonempty Claude override equal to `H/.claude` still selects the override row.

Explicit directory overrides must be absolute after expanding only `~` or `~/...`; spaces are preserved. Relative paths, control characters, escaping destinations, and managed symlink traversal fail rather than selecting the current directory.

### OMP discovery and profiles

For a selected OMP target, setup calls `omp config path` once without a shell. A single absolute output line selects `A`. Missing/unusable discovery prints a fallback notice:

1. A defined `OMP_PROFILE` wins over `PI_PROFILE`, including an explicitly empty value. Empty, whitespace-only, or `default` selects the default profile.
2. The default profile uses nonempty `PI_CODING_AGENT_DIR` when supplied; otherwise `H/<config-dir>/agent`.
3. A named profile uses `H/<config-dir>/profiles/<profile>/agent` and ignores `PI_CODING_AGENT_DIR`. Run setup once per named profile.
4. `<config-dir>` is nonempty `PI_CONFIG_DIR` or `.omp`, relative to home; absolute/escaping config directories and unsafe profile names are rejected.

An unsafe path returned by successful discovery fails; it is not replaced by a guessed fallback.

### Scope, preservation, and verification

Personal setup installs only the runtime and target-rendered, manual-only Skills with supporting references and Codex explicit-invocation policy. It creates no `CLAUDE.md`, `AGENTS.md`, agents, rules, contexts, hooks, steering, `.gitignore`, or project installation files. It neither creates nor changes **any Claude permission settings**, even if an existing settings file is malformed. Existing user/project/managed permission policy continues to apply.

These Skills are local-machine/user-profile assets. Claude cloud/Cowork sessions do not read these local personal Skills. Reload/restart the host and accept its normal trust and tool permission prompts.

Verify from a directory that is not the `sdd-mcp-server` source checkout and does not already contain a same-name project runtime entry:

```text
claude mcp get sdd-mcp
codex mcp get sdd-mcp
# In OMP:
/mcp test sdd-mcp
```

`setup-global` can succeed and the host can still fail to connect. Two checks explain that:

1. Project registration wins. `install` in a repository writes `.mcp.json`, `.codex/config.toml`, or `.omp/mcp.json`. Remove only that project's `sdd-mcp` entry, preserving other entries and settings. Review an owned Codex marked block before removing it. Setup does not scan repositories or perform this migration. Do not run the project installer in the source checkout as a substitute for personal setup; that is what creates the shadowing entry.
2. The pinned runtime command is `npx -y sdd-mcp-server@<version>`. When the host working directory is this package checkout, npm 11 resolves that name to the local tree and exits with `sh: sdd-mcp-server: command not found` (`CONNECTION_CLOSED` in Claude). `npm install` does not link this package's own bin. After building the checkout, create `node_modules/.bin/sdd-mcp-server` as a `node ./sdd-entry.js` shim, then reload the host. Other project directories do not need the shim. A user server named `sdd` with command `sdd-mcp-server` is a different, broken entry; remove it with `claude mcp remove sdd -s user`.

Runtime scope precedence is not Skill precedence: Skill-name collisions follow each host's own discovery rules; inspect the Skill source rather than assuming a runtime switch selects a different Skill copy.

Rerunning setup upgrades unmodified owned runtime entries and Skills. User-modified/unknown conflicting content is preserved under **Preserved conflicts**; malformed configuration, unsafe paths, or I/O/state errors appear under **Failures**. Either category yields exit status 1, while independent hosts continue. **Installed / unchanged** lists retained results, not rolled-back attempts. A Skills failure does not remove an already committed runtime; fix the reported path and rerun explicitly. Concurrent setup versions hold the runtime lock through the nested Skills pass.

Workflow state stays project-local: a nonempty `CLAUDE_PROJECT_DIR` selects the project; otherwise the runtime uses its process working directory. A supplied invalid root fails instead of falling back.

### Packed-package and host acceptance

For local release testing, use an absolute npm **file spec**, not a bare archive path:

```bash
npm run build
npm pack --pack-destination /absolute/temp
SDD_MCP_PACKAGE=file:/absolute/temp/sdd-mcp-server-5.1.1.tgz ./bootstrap.sh
# Independent cross-platform path, without the wrapper:
npx -y file:/absolute/temp/sdd-mcp-server-5.1.1.tgz setup-global
```

Use fresh, distinct temporary home/config/project directories for each path; pass `HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and the OMP profile/agent settings to the child process. Control `omp` discovery on `PATH` so an unrelated installed host cannot select real user state. Rerun both commands, check pinned entries/rendered references and unchanged Claude settings, then exercise conflicts and Skills failures. Native npm 11.12.1 attempts to execute a bare `/absolute/package.tgz` (exit 126); the explicit `file:` syntax is the verified package-resolution path.

Release acceptance exercised Claude Code 2.1.181 (`claude mcp get`: user scope, connected), Codex 0.147.0 (`codex mcp get`: pinned stdio entry), and OMP 18.3.0 (`/mcp test`: connected). The isolated Claude check specifically confirmed `<CLAUDE_CONFIG_DIR>/.claude.json`; file existence alone is not this host-discovery check. Revalidate native discovery when releasing against different host versions.

Upstream references: [Claude MCP](https://code.claude.com/docs/en/mcp), [Claude Skills](https://code.claude.com/docs/en/skills), [Claude environment variables](https://code.claude.com/docs/en/env-vars), [Codex MCP](https://developers.openai.com/codex/mcp/), [Codex Skills](https://developers.openai.com/codex/skills), [Codex advanced configuration](https://developers.openai.com/codex/config-advanced/), [OMP MCP configuration](https://github.com/can1357/oh-my-pi/blob/main/docs/mcp-config.md), [OMP Skills](https://github.com/can1357/oh-my-pi/blob/main/docs/skills.md), and [OMP configuration discovery](https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage.md).

## New project installation
The following project-scoped path is optional. Use it for team/repository guidance; it is not required after personal setup.


Use this procedure when the repository does not contain guidance generated by an earlier sdd-mcp release:

1. Start in the project root.
2. Choose the host target explicitly in automation.
3. Keep the default lean profile for the smallest guidance surface, or select `full` for additional target-native rules, contexts, and agents. Runtime registration is mandatory in both profiles and the `install-skills` alias.
4. Restart or reload the host and accept project trust. Claude `ask`/`deny` or organization policy may still override the installed allow rule.
5. Invoke the native requirements Skill with a feature name and goal. The Skill initializes/resumes state, submits artifacts, presents validation, and asks for approval internally.

Do not use `--refresh-generated` for a new project. A normal installation creates generated files, runtime registration, and the `.sdd-mcp/install-manifest.json` ownership record.

**Source checkout exception:** Do not treat `node ./sdd-entry.js install` as personal setup. That command writes project runtime files in this checkout and hides `setup-global`. The pinned `npx` runtime also fails here with `sh: sdd-mcp-server: command not found` until `node_modules/.bin/sdd-mcp-server` runs `node ./sdd-entry.js`. Use the local entrypoint only to install project guidance into this checkout on purpose. In another project, use `npx` from that project's root as shown below.

### Choose a target

In an interactive terminal, a full install presents three choices:

```bash
npx sdd-mcp-server install --profile full
```

```text
Choose the primary LLM agent target:
  1) Claude Code
  2) Codex
  3) Oh My Pi
Selection:
```

For automation, select exactly one target:

```bash
npx sdd-mcp-server install --target claude-code
npx sdd-mcp-server install --target codex
npx sdd-mcp-server install --target omp
```

Without a target in non-interactive mode, the compatibility default remains `claude-code` and the installer prints a notice. Deprecated `--codex` means Codex only. `--all-tools` installs native Claude Code, Codex, and OMP trees plus the existing Antigravity integration; generic path overrides are rejected with `--all-tools` because one override cannot safely identify three roots.

## Profiles and components

Profiles are target-aware:

| Target | Lean (default) | Full |
|---|---|---|
| Claude Code | runtime, skills, steering, supported hook guidance | lean + rules, contexts, agents |
| Codex | runtime, skills, steering, supported lifecycle hooks | lean + rules, contexts, agents |
| OMP | runtime, skills, steering, agents | lean + rules, contexts |

OMP has no executable Markdown hook integration. `--target omp --hooks` fails fast instead of installing guidance and calling it a native hook.

Examples:

```bash
npx sdd-mcp-server install --target omp
npx sdd-mcp-server install --profile full --target omp
npx sdd-mcp-server install --target codex --skills --rules --agents
npx sdd-mcp-server install --list
```

`--all` selects every component supported by the chosen target. `install-skills` is an alias for the unified target-aware installer with `--skills`; it uses the same target resolution and recursive renderer.

## Configuring model routes

Pass a project YAML file on each install when the package defaults do not match available models. For example:

```yaml
modelRoles:
  planner:
    claudeCode: { model: opus, effort: high }
    codex: openai-codex/gpt-6-sol:high
    omp: xai-oauth/grok-4.7:xhigh
  reviewer:
    claudeCode: { effort: low }
  implementer: openai-codex/gpt-6-luna:max
```

```bash
npx sdd-mcp-server install --profile full --target claude-code --model-roles models.yaml
npx sdd-mcp-server install --profile full --target codex --model-roles models.yaml
npx sdd-mcp-server install --target omp --model-roles models.yaml
```

The path is relative to the project root; the installer reads but does not copy or modify the YAML. Valid SDD keys are `planner`, `architect`, `reviewer`, `security-auditor`, `implementer`, and `tdd-guide`. A scalar `provider/model:effort` sets **both Codex and OMP** agents, not Claude Code; use a host mapping when providers differ. `claudeCode` accepts a model name or a `{ model, effort }` mapping with either field optional. Codex/OMP selector efforts: `minimal`, `low`, `medium`, `high`, `xhigh`, `max`; Claude efforts: `low`, `medium`, `high`, `xhigh`, `max`. Unknown roles, duplicate keys, or invalid selectors fail before installation writes. Unspecified roles/hosts use the default route; `--all-tools` uses the same overrides for all targets.

Claude Code lean installs skills with native current-turn model/effort overrides; full (or `--agents`) also installs matching subagents. Codex lean installs skills but **not** agent TOML; use full or `--agents` to install custom agents with model and reasoning effort. OMP lean includes agents. Reinstall with the file after changing overrides: package-owned, unmodified generated files update; user-modified files stay untouched and are reported as conflicts. This option never configures generic host subagents or the interactive parent session. OMP's `default`/`smol`/`slow`/`plan`/`task`/`advisor` roles belong to OMP host settings, not this SDD role map.

## Generated files

| Component | Claude Code | Codex | OMP |
|---|---|---|---|
| Root guidance | `CLAUDE.md` | `AGENTS.md` | `.omp/AGENTS.md` |
| Skills | `.claude/skills/<name>/` | `.agents/skills/<name>/` | `.omp/skills/<name>/` |
| Agents | `.claude/agents/<role>.md` | `.codex/agents/<role>.toml` | `.omp/agents/<role>.md` |
| Rules | `.claude/rules/` with native `paths` | `.codex/guidance/rules/` | `.omp/rules/` with `globs` and `alwaysApply: false` |
| Context references | `.claude/contexts/` | `.codex/guidance/contexts/` | `.omp/contexts/` |
| Steering | `.spec/steering/` | `.spec/steering/` | `.spec/steering/` |
| Runtime registration | `.mcp.json` plus `.claude/settings.json` allow | `.codex/config.toml` | `.omp/mcp.json` |

The installer merges only its `sdd-mcp` entry and preserves unrelated config, comments, and Claude permission rules. A malformed config or conflicting same-name server is preserved byte-for-byte and the installation is incomplete.

After reload/trust, use `/sdd-requirements <feature>` in Claude Code, `$sdd-requirements <feature>` in Codex, or `/skill:sdd-requirements <feature>` in OMP. Continue with the native design, tasks, and implement Skills after each explicit human gate. End users do not call MCP tools or paste workflow JSON.

Manual skill syntax is `/skill:<name>` in OMP, `/<name>` in Claude Code, and `$<name>` in Codex. All SDD skills are manual-only; prose does not activate them implicitly.

### Published-host smoke

This smoke requires `sdd-mcp-server@5.1.1` to be published or otherwise resolvable by `npx`; repository CI cannot substitute a real host trust prompt. In a clean temporary repository, run `npx sdd-mcp-server@5.1.1 install --profile lean --target <claude-code|codex|omp>`, reload the selected host, and accept project trust once. Invoke only the host-native requirements Skill shown above, approve the artifact explicitly, restart the host, then invoke only its design Skill. Verify that `.spec/specs/<feature>/spec.json` retains the requirements revision, hash, and approval, that `requirements.md` contains the Skill-produced content, and that `context/handoff.md` is repairable without any user-facing raw MCP instruction.

## Managed ownership and reruns

The installer stores a merge-safe ownership manifest at `.sdd-mcp/install-manifest.json` and updates only the chosen target record:

- missing output: install it and record its SHA-256;
- unchanged managed output: upgrade it automatically;
- user-modified managed output: preserve it and report a conflict;
- unknown legacy output: preserve it unless it exactly matches a recognized generated asset;
- obsolete unchanged managed output: back it up, then remove it;
- mutable `.spec/steering/` content: record provenance but never auto-replace or tombstone it.

`.sdd-mcp/` and target-generated trees are added to the installer-managed `.gitignore` block without rewriting unrelated entries.

## Upgrade from sdd-mcp 3.x or 4.x

Use this procedure when the repository contains generated guidance from an earlier release. Existing `.spec/specs/` workflow documents are normalized by v5's governed runtime when needed.

### Map the existing installation to a v5 target

| Existing target | v5 target | Guidance |
|---|---|---|
| Claude Code (`.claude/`, `CLAUDE.md`) | `claude-code` | Refresh the Claude-native generated set and register its project runtime. |
| Codex (`.agents/`, `.codex/`, `AGENTS.md`) | `codex` | Refresh the Codex-native generated set and register its project runtime. |
| Native OMP (`.omp/`) | `omp` | Refresh the OMP-native generated set and register its project runtime. |
| OMP previously using Codex files | `omp` | Install native `.omp/` files; preserved Codex TOML agents are not executable by OMP. |

Do not select a target merely because its files already exist: select the host that will execute the workflow after the upgrade.

### Run one reversible migration

1. Commit or otherwise preserve the current repository state.
2. Run one refresh for the selected target and desired profile:

```bash
# Replace <target> with claude-code, codex, or omp
npx sdd-mcp-server@5.1.1 install \
  --profile full \
  --target <target> \
  --refresh-generated
```

3. Inspect the installer report. Unchanged generated files are upgraded, modified or unknown files are preserved and reported, and selected replaced files are backed up under:

```text
.sdd-mcp/backups/<timestamp>/<target>/...
```

4. Review conflicts before manually removing any old target directory.
5. Restart or reload the host and confirm that it discovers the selected native root guidance and skills.

The refresh rebuilds only the selected package-owned set and removes recognized legacy tombstones after backup. It does not replace project source, `.spec/specs/`, user steering, unknown custom files, or modified generated files.

### v5 behavior changes

- The four Formal SDD phase Skills are the complete public workflow; backend lifecycle is hidden.
- Requirements owns feature initialization and cross-session resume.
- Approvals and optional test review are explicit human decisions inside Skill flows.
- Implementation RED/GREEN/block/final evidence is persisted and resumed.
- Runtime registration is mandatory for every install profile.

### Subsequent v5 updates

After the one-time migration, rerun the same target and profile without `--refresh-generated`:

```bash
npx sdd-mcp-server@5.1.1 install --profile full --target <target>
```

The ownership manifest then upgrades unchanged package files automatically and continues to preserve modified files.

For an update from 5.0.0 to 5.0.1, use the profile and target already installed, review any conflicts, and reload or restart the host so its registered runtime uses 5.0.1. No specification migration is required. Requirements that were rejected because `**Acceptance Criteria:**` was followed by a numbered list on separate lines can be resubmitted through the requirements Skill without rewriting that format.

For an update from 5.0.1 to 5.1.0, rerun the project installer with the same target/profile to upgrade unmodified managed assets and the pinned runtime entry. To choose custom SDD role models, pass `--model-roles models.yaml` on every project install and rerun; otherwise the existing defaults apply. Personal setup is a separate, optional user/profile scope: run `npx -y sdd-mcp-server@5.1.0 setup-global` once per chosen host or profile, then reload and accept host trust. It does not migrate project entries or change Claude permissions. No specification migration is required.

For an update from 5.1.0 to 5.1.1, rerun the same project installer from the destination project's root, or use the built local entrypoint inside this package's source checkout. This release changes documentation and package version only; no specification migration is required.

## Model routing and availability

- Claude Code uses native model **and effort** overrides for the invoked skill turn and installed project subagents. Defaults: Opus/high for high-level roles, Sonnet/medium for implementation/TDD.
- Codex generated custom agents carry model and `model_reasoning_effort` (default Sol/xhigh for advisors, Sol/medium for implementation/TDD). An advisor-class skill may request one child; inline parent turns are not switched by this option.
- OMP uses the parent model inline by default, including high-level work. Generated `.omp/agents` carry configured model/`thinkingLevel`; advisor use is explicit opt-in and limited to one non-nesting, non-retrying child.

The installer emits selectors but does not grant access or verify host/model/effort support. Availability depends on the configured provider and account; the OMP install reports model availability as “not verified” and offers an optional `omp models find <provider/model>` diagnostic. See [MODEL-ROUTING.md](MODEL-ROUTING.md).

## Package context reporter

The reporter is an offline package command, not an MCP tool:

```bash
npx sdd-mcp-server context-report
npx sdd-mcp-server context-report --before ./before --after ./after
npx sdd-mcp-server context-report --json
```

It counts exact UTF-8 bytes for generated target trees and aggregates only usage fields from explicitly supplied OMP session roots. `estimatedTokens` means deterministic `ceil(characters / 4)`, not an actual provider tokenizer result. Provider-reported input, output, cache, reasoning-normalization, and cost remain separate from static installed bytes.

Measured fresh-install static reductions from the v3.5.1 baseline are Codex **74.37%**, OMP **83.21%**, and Claude Code **95.64%**.

## Custom paths and safety

Single-target installs may override component paths. Destinations are validated beneath the chosen project roots; escaping symlinks and out-of-root paths are rejected. Run separate explicit target installs when each target needs a custom root.

## Troubleshooting

- In automation, pass `--target claude-code`, `--target codex`, or `--target omp` explicitly.
- If a managed file is reported as modified, inspect the conflict; normal reruns intentionally preserve it.
- Use `--refresh-generated` only for selected generated assets; recover the prior bytes from `.sdd-mcp/backups/` if needed.
- OMP does not discover Codex TOML agents. Install native `.omp/agents/*.md` instead.
- OMP hook requests fail by design until a native executable hook integration exists.
