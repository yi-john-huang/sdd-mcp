# Requirements: Target-Aware LLM Optimization

## Overview

The SDD component installer currently installs a Claude Code-oriented full profile and adds Codex support as an optional secondary integration. This feature makes the target AI agent explicit so that a developer can install native files for either Codex or Claude Code without loading irrelevant guidance. It assigns high-capability models to planning, review, and security work while making `gpt-5.6-luna` with maximum reasoning the default for implementation and TDD work.

## Primary User Goal

As an engineer using SDD with Codex or Claude Code, I want the installer to generate only the native files and model-routed agents for my selected tool so that the workflow is usable without unnecessary context or token cost.

## Target Users

- Engineers installing SDD components into repositories used with Codex.
- Engineers installing SDD components into repositories used with Claude Code.
- Maintainers and automation authors who require deterministic, non-interactive installation.

## Functional Requirements

### FR-1: Explicit Target Option

**Objective:** As an automation author, I want to select the target agent explicitly so that installation is deterministic.

**EARS Specification:**

WHEN a user supplies `--target codex` or `--target claude-code` to the unified installer
THEN the installer SHALL select the named target without displaying an interactive target prompt.

**Acceptance Criteria:**

1. The installer accepts exactly `codex` and `claude-code` as target values.
2. The target option is accepted with `--profile full` and with explicit component-selection flags.
3. An unsupported or missing `--target` value produces a clear error, exits with a non-zero status, and creates or modifies no installation files.
4. Installer help and examples document both supported target values.

### FR-2: Interactive Full-Profile Selection

**Objective:** As an interactive CLI user, I want to choose my AI agent when installing the full profile so that I do not need to remember an option.

**EARS Specification:**

WHEN a user runs `npx sdd-mcp-server install --profile full` in an interactive terminal without an explicit target
THEN the installer SHALL prompt the user to choose either Codex or Claude Code before writing installation files.

**Acceptance Criteria:**

1. The prompt presents exactly two choices: `codex` and `claude-code`.
2. The selected target is displayed in the installation summary.
3. Cancelling the prompt exits without creating or modifying installation files.
4. Component installation does not start until a valid target is resolved.

### FR-3: Non-Interactive Compatibility

**Objective:** As an existing automation user, I want full-profile installation to remain usable after the target feature is introduced so that upgrades do not unexpectedly break CI.

**EARS Specification:**

WHEN the full-profile installer runs without an explicit target and standard input is not interactive
THEN the installer SHALL use `claude-code` as the backward-compatible target and emit a notice recommending an explicit `--target` value.

**Acceptance Criteria:**

1. Existing non-interactive full-profile commands continue to complete without waiting for input.
2. The notice identifies the selected default and both explicit target values.
3. An explicit target always takes precedence over the non-interactive default.
4. The legacy `--codex` option remains accepted as a deprecated alias for selecting the Codex target.
5. IF `--codex` conflicts with an explicit non-Codex target THEN the installer SHALL reject the command before writing files.

### FR-4: Claude Code-Native Full Installation

**Objective:** As a Claude Code user, I want native Claude Code files so that its discovery and delegation mechanisms work directly.

**EARS Specification:**

WHEN the resolved target is `claude-code`
THEN the installer SHALL generate the selected profile components using Claude Code-native locations and formats.

**Acceptance Criteria:**

1. Full-profile skills are installed under `.claude/skills/`.
2. Full-profile agents are installed under `.claude/agents/` as Markdown files with valid YAML frontmatter.
3. Rules, contexts, and hooks are installed under their existing `.claude/rules/`, `.claude/contexts/`, and `.claude/hooks/` locations.
4. The installer creates `CLAUDE.md` only when it does not already exist.
5. A Claude Code target installation does not create `AGENTS.md`, `.agents/`, or `.codex/` artifacts unless a separate, explicit integration option requires them.

### FR-5: Codex-Native Full Installation

**Objective:** As a Codex user, I want native Codex files so that Codex discovers skills, agents, and lifecycle configuration without Claude-specific paths.

**EARS Specification:**

WHEN the resolved target is `codex`
THEN the installer SHALL generate the selected profile components using Codex-native locations and formats.

**Acceptance Criteria:**

1. Full-profile skills are installed under `.agents/skills/`, with one valid `SKILL.md` per skill.
2. Specialized agents are installed as standalone TOML files under `.codex/agents/`.
3. Every Codex agent file defines `name`, `description`, and `developer_instructions` and contains valid TOML.
4. Codex lifecycle configuration is written in a Codex-supported project location such as `.codex/hooks.json` or `.codex/config.toml`.
5. Coding standards and workflow guidance are represented through `AGENTS.md` or referenced guidance, not through `.codex/rules/`, because Codex `.rules` files govern command execution policy.
6. Claude-specific contexts that have no direct Codex file equivalent are represented as Codex skills, agent instructions, or `AGENTS.md` guidance without duplicating their full content in always-on context.
7. The installer creates `AGENTS.md` only when it does not already exist.
8. A Codex target installation does not create `CLAUDE.md` or `.claude/` artifacts unless a separate, explicit integration option requires them.

### FR-6: Target Isolation

**Objective:** As a user concerned with context size, I want only the selected target's artifacts installed so that unused agent guidance is not discovered or loaded.

**EARS Specification:**

WHILE installing components for a resolved target
THE installer SHALL write only the artifacts required by that target and the target-independent `.spec/steering/` documents selected by the profile.

**Acceptance Criteria:**

1. Selecting one target does not delete or rewrite pre-existing artifacts belonging to another target.
2. The installation result reports every created, skipped, and failed target-specific component.
3. Target-independent steering documents retain their existing location and content semantics.
4. Generated root guidance references only paths that exist for the resolved target and selected components.

### FR-7: Codex Model Routing

**Objective:** As a Codex user, I want demanding work assigned to Sol and default implementation work assigned to Luna so that model capability and reasoning effort follow task complexity.

**EARS Specification:**

WHEN the installer generates Codex agent definitions
THEN the installer SHALL assign Codex models and reasoning effort according to each SDD role's task class.

**Acceptance Criteria:**

1. Planner, architect, reviewer, and security-auditor agents use `gpt-5.6-sol`.
2. Sol-backed agents use `model_reasoning_effort = "xhigh"` by default.
3. Implementer and TDD-guide agents use `gpt-5.6-luna`.
4. Luna-backed agents use `model_reasoning_effort = "max"` by default.
5. `gpt-5.6-terra` remains a supported model identifier but is assigned to no default SDD role.
6. Model identifiers and role mappings are defined in one maintainable source of truth rather than repeated independently across generators.

### FR-8: Claude Code Model Routing

**Objective:** As a Claude Code user, I want demanding work assigned to Opus and implementation work assigned to Sonnet so that model cost follows task complexity.

**EARS Specification:**

WHEN the installer generates Claude Code agent definitions
THEN the installer SHALL assign Claude Code model aliases according to each SDD role's task class.

**Acceptance Criteria:**

1. Planner, architect, reviewer, and security-auditor agents declare `model: opus`.
2. Implementer and TDD-guide agents declare `model: sonnet`.
3. Existing agent instructions, descriptions, roles, and expertise are preserved when model metadata is added.
4. Model mappings are defined in one maintainable source of truth rather than repeated independently across generated files.

### FR-9: Phase-to-Agent Delegation

**Objective:** As an SDD user, I want phase skills to use the configured specialist agents so that model routing affects actual work rather than only generating unused metadata.

**EARS Specification:**

WHEN an SDD phase skill is invoked in a target that supports subagent delegation
THEN the skill SHALL direct the host agent to delegate the phase work to the configured specialist role.

**Acceptance Criteria:**

1. Requirements, planning, and task-breakdown work delegates to the planner role.
2. Technical design work delegates to the architect role.
3. Implementation and simple-task work delegates to the implementer role.
4. Test generation and TDD coaching delegate to the TDD-guide role.
5. Code review delegates to the reviewer role.
6. Security assessment delegates to the security-auditor role.
7. IF the selected host or account cannot use the configured subagent or model THEN the skill SHALL continue with the current agent only after clearly reporting the fallback.
8. Delegated work consumes compact handoff context by default and loads full specification context only when the task requires it.

### FR-10: Generated Artifact Ignore Rules

**Objective:** As a repository maintainer, I want generated local agent artifacts ignored so that installation does not pollute source control.

**EARS Specification:**

WHEN the installer creates target-specific local artifacts
THEN the installer SHALL update the consuming project's `.gitignore` with the applicable generated-directory entries.

**Acceptance Criteria:**

1. A Claude Code installation adds `.claude/` when an equivalent ignore rule is not already present.
2. A Codex installation adds `.agents/` and `.codex/` when equivalent ignore rules are not already present.
3. The installer preserves all existing `.gitignore` content and line ordering outside its managed block.
4. Repeated installations do not duplicate the managed block or any managed entry.
5. IF `.gitignore` does not exist THEN the installer SHALL create it with only the required managed header and target-specific entries.
6. Root `CLAUDE.md`, root `AGENTS.md`, and `.spec/steering/` remain trackable by default.

### FR-11: Existing File Protection and Idempotency

**Objective:** As a user with customized agent files, I want installation to preserve my changes so that rerunning the installer is safe.

**EARS Specification:**

IF a destination file already exists
THEN the installer SHALL preserve it unless the user has invoked an existing explicit overwrite mechanism.

**Acceptance Criteria:**

1. The installer reports existing protected files as skipped.
2. The installer does not truncate, partially replace, or silently merge user-authored root guidance or agent configuration.
3. Running the same command twice with unchanged inputs produces no additional content changes after the first successful run.
4. `.gitignore` changes use an atomic or failure-safe write strategy so that an interrupted update does not destroy the original file.
5. Switching targets installs the newly selected artifacts without deleting artifacts from the prior target.

### FR-12: Documentation and Discoverability

**Objective:** As a user, I want accurate installation and model-routing documentation so that I can predict generated files and token-cost behavior.

**EARS Specification:**

WHEN target-aware installation is released
THEN the project SHALL document target selection, generated paths, model routing, compatibility behavior, and model-access constraints.

**Acceptance Criteria:**

1. The README shows interactive and explicit target-selection examples.
2. The installation guide contains a target-to-output-path table.
3. Documentation lists the default Codex and Claude Code role-to-model mappings.
4. Documentation states that GPT-5.6 preview model access depends on the user's eligible Codex workspace or API organization.
5. Documentation explains that compact handoffs remain the default and that subagent delegation can consume more total tokens than a single-agent run.
6. Deprecated behavior, including the legacy `--codex` alias, is identified with its compatibility behavior.

## Non-Functional Requirements

### NFR-1: Token Efficiency

**EARS Specification:**

The installer SHALL minimize always-on context for both targets.

**Acceptance Criteria:**

1. Generated root guidance summarizes or references installed components instead of embedding complete copies of every skill, agent, rule, context, and hook.
2. Skills remain on-demand and are not injected in full before invocation.
3. Compact handoff loading remains the default for phase continuation.
4. Target selection does not install the unselected target's discoverable guidance directories.

### NFR-2: Performance and Offline Operation

**EARS Specification:**

The installer SHALL resolve targets and generate local artifacts without making network or model API requests.

**Acceptance Criteria:**

1. Installation uses only files packaged with `sdd-mcp-server` and the consuming project's filesystem.
2. Target resolution adds no network dependency to interactive or automated installation.
3. Full-profile generation completes in time proportional to the number and size of packaged component files.
4. The installer does not attempt to verify model entitlement during installation.

### NFR-3: Security

**EARS Specification:**

The installer SHALL validate all target and destination inputs before performing filesystem writes.

**Acceptance Criteria:**

1. Target values are validated against a fixed allowlist.
2. Generated paths cannot escape the consuming project through target names or generated component names.
3. Installation never evaluates generated Markdown, TOML, JSON, or hook content as code.
4. Error messages do not expose credentials, environment secrets, or unrelated file contents.
5. Existing filesystem permissions are respected, and permission failures are reported without destructive retries.

### NFR-4: Reliability and Compatibility

**EARS Specification:**

The target-aware installer SHALL preserve supported existing installation workflows unless a requirement explicitly changes them.

**Acceptance Criteria:**

1. Node.js 18 and later remain supported.
2. Lean-profile behavior remains compatible when no target-specific behavior is requested.
3. Existing component-selection and custom-path options continue to work with their documented semantics.
4. Antigravity and `--all-tools` integrations continue to behave as documented and are not implicitly selected by `--target`.
5. Failures in one generated component are reported with its target and path and do not masquerade as a successful complete installation.

### NFR-5: Testability and Quality

**EARS Specification:**

The implementation SHALL provide automated verification for every target-dependent branch.

**Acceptance Criteria:**

1. Unit tests cover argument parsing, target resolution, prompt behavior, non-interactive fallback, and conflicting options.
2. Unit tests cover Claude Code and Codex path and format generation.
3. Unit tests verify every default role-to-model mapping.
4. Unit tests cover `.gitignore` creation, preservation, deduplication, and repeated runs.
5. Integration tests verify full-profile output trees for both targets.
6. Type checking, linting, and the project's configured coverage thresholds pass before release.

## Constraints

1. The implementation SHALL use the existing TypeScript, ESM, manager, and installer architecture.
2. The implementation SHALL preserve human approval checkpoints between SDD requirements, design, tasks, and implementation phases.
3. The implementation SHALL use the exact Codex model identifiers `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` where those models are referenced.
4. GPT-5.6 model availability is controlled by OpenAI account and workspace eligibility; the installer cannot grant or verify access.
5. Claude Code agent model values SHALL use supported aliases or full model identifiers accepted by Claude Code.
6. Codex skill and agent outputs SHALL follow the native repository discovery locations supported by Codex.
7. Codex command-execution rules SHALL not be conflated with coding-style or workflow guidance.

## Assumptions

1. In an interactive terminal, omitting `--target` from a full-profile install means the user wants to be prompted.
2. In a non-interactive environment, preserving the prior Claude Code-oriented default is less disruptive than failing the command.
3. `gpt-5.6-sol` is the default for high-level reasoning roles; `gpt-5.6-luna` is the default for implementation and TDD roles; `gpt-5.6-terra` remains supported without a default SDD role.
4. Planner, architect, reviewer, and security-auditor are high-level roles.
5. Implementer and TDD-guide are implementation roles.
6. Generated local agent directories are ignored, while root guidance and project steering documents are intended to be reviewable and trackable.
7. Model routing requires phase skills to request delegation; agent metadata alone does not change the parent conversation's model.
8. Existing target-specific files are user-owned once present and are not removed when the user installs for another target.

## Out of Scope

1. Changing the compact handoff generation algorithm or its token estimation method.
2. Dynamically selecting models based on live pricing, rate limits, or benchmark results.
3. Verifying or provisioning GPT-5.6 preview access.
4. Automatically deleting artifacts created for a previously selected target.

## External Compatibility References

- Codex skills: <https://developers.openai.com/codex/skills/>
- Codex subagents: <https://developers.openai.com/codex/subagents/>
- Codex hooks: <https://developers.openai.com/codex/hooks/>
- Claude Code subagents: <https://code.claude.com/docs/en/sub-agents>
- GPT-5.6 Sol, Terra, and Luna preview: <https://help.openai.com/en/articles/20001325-a-preview-of-gpt-5-6-sol-terra-and-luna>
