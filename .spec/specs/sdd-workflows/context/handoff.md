<!-- sdd-context schema=2 phase=implementation source=607c02ca0fbedc671b8527fbe8f1edb3afa4b847c08ce9f1ea6f6f6c83be67c4 payload=08d6047f5af2dcb56cf61a6c5122e77c432965bb222f4033e11a3fb09238838e -->
# SDD Context: sdd-workflows

## Workflow State
- Effective phase: implementation
- Phase status: approved
- Requirements: approved
- Design: approved
- Tasks: approved
- Test-case review: reviewed

## Implementation Progress
- Revision: 35
- Completed: 9/16
- Active: 1
- Blocked: 0
- 2.3: in-progress

## Next Action
Continue task 2.3 from in-progress.

## Source References
- requirements.md
- design.md
- tasks.md

## Payload Estimate
- Payload estimated tokens: 02042

## Selected Context
- # Requirements: sdd-workflows
- ## Overview
- Provide one-time local user/profile setup of the SDD workflow-control MCP runtime and host-native, manually invoked Skills for Claude Code, Codex, and Oh My Pi (OMP). Users can start the existing governed workflow in local projects without first installing repository-scoped assets. Existing project installations remain
- **Source:** [Original global setup plan](plan.md), extracted unchanged from /tmp/global_sdd_mcp_plan.md. The source plan's implementation proposals and verification commands are retained for later design review; they are not an approved design or task breakdown.
- **Primary users:** Engineers using Claude Code, Codex, or OMP locally. Secondary users are maintainers upgrading shared workflow tooling and teams retaining repository-scoped installation.
- **Success:** One setup installs the requested hosts' rendered Skills and exact-version runtime registrations into isolated user roots; an identical rerun succeeds without duplication; user edits and unrelated configuration survive; Claude permissions remain unchanged; runtime workflow state belongs to the active projec
- ## Functional Requirements
- ### FR-1: Global setup command and target selection
- **Objective:** As a local engineer, I want one setup command, so that I can enable SDD in my chosen hosts without per-project installation.
- **EARS Specification:** WHEN a user invokes sdd-mcp-server setup-global THEN the system SHALL install all three supported targets unless exactly one valid --target argument selects claude-code, codex, or omp.
- **Acceptance Criteria:** 1. Omitting --target selects Claude Code, Codex, and OMP; each valid target selects only that host and leaves unselected hosts untouched.
- A missing target value, repeated --target, unknown option, or unsupported target fails with a diagnostic and nonzero exit status before any installation write.
- The command is reachable through both the package entrypoint and the compiled CLI dispatcher.
- ### FR-2: Runtime registration before native Skills
- **Objective:** As a host user, I want matching runtime and native Skills, so that invoking a Skill has its required workflow backend.
- **EARS Specification:** WHEN global setup processes a selected target THEN the system SHALL register its runtime successfully before installing only that target's rendered native Skills.
- **Acceptance Criteria:** 1. Runtime registration uses the name sdd-mcp and command npx with arguments -y and sdd-mcp-server@<running-package-version>; the installed registration does not use a floating latest version.
- Runtime registration failure or conflict prevents that target's Skill installation; processing continues for independent targets.
- Installed Skills use the existing target renderer's invocation and model metadata and retain manual invocation of the governed phase Skills.
- Global setup installs no root guidance, agents, rules, contexts, hooks, or project steering artifacts and performs no second runtime registration during the Skills-only pass.
- ### FR-3: Claude Code user locations
- **Objective:** As a Claude Code user, I want personal configuration overrides respected, so that setup uses my selected local profile rather than a repository.
- **EARS Specification:** WHEN Claude Code is selected THEN the system SHALL resolve the personal directory from non-empty CLAUDE_CONFIG_DIR or otherwise ~/.claude and install its assets at the corresponding user locations.
- **Acceptance Criteria:** 1. Skills are installed under <personal>/skills and their ownership state under <personal>/.sdd-mcp/global-skills.
- Without a non-empty override, runtime registration is written to ~/.claude.json; with an override, registration is written to <personal>/.claude.json.
- Runtime ownership state is stored under <personal>/.sdd-mcp/global-runtime in both cases.
- ### FR-4: Codex user locations
- **Objective:** As a Codex user, I want personal Skills and runtime settings in their native locations, so that all local projects can discover them.
- **EARS Specification:** WHEN Codex is selected THEN the system SHALL install Skills under ~/.agents/skills and register the runtime in config.toml under non-empty CODEX_HOME or otherwise ~/.codex.
- **Acceptance Criteria:** 1. Skill ownership state is stored under ~/.agents/.sdd-mcp/global-skills independently of CODEX_HOME.
- Runtime ownership state is stored under <resolved-codex-home>/.sdd-mcp/global-runtime.
- Setting CODEX_HOME relocates runtime configuration and state without relocating the Skills directory.
- ### FR-5: OMP active-agent directory discovery
- **Objective:** As an OMP user, I want setup to honor my active agent directory, so that assets match the profile I actually run.
- **EARS Specification:** WHEN OMP is selected THEN the system SHALL first discover its active-agent directory by executing omp config path without a shell and accepting only one absolute directory result.
- **Acceptance Criteria:** 1. The command is invoked with an argument array; valid output selects <agent-dir>/skills and <agent-dir>/mcp.json.
- Skills and runtime state use <agent-dir>/.sdd-mcp/global-skills and <agent-dir>/.sdd-mcp/global-runtime, respectively.
- An unavailable command, command failure, empty output, relative path, or multiple returned paths triggers the documented fallback instead of using the invalid output.
- ### FR-6: OMP profile-aware fallback
- **Objective:** As an OMP user without working directory discovery, I want a deterministic fallback, so that setup still selects the intended profile safely.
- **EARS Specification:** IF OMP directory discovery is unavailable or invalid THEN the system SHALL resolve the directory from the effective profile and documented environment defaults and report the selected fallback path.
- **Acceptance Criteria:** 1. A defined OMP_PROFILE takes precedence over PI_PROFILE, including when OMP_PROFILE is empty; PI_PROFILE is used only when OMP_PROFILE is undefined.
- Empty, whitespace-only, or default effective profile selects the default profile. A non-empty PI_CODING_AGENT_DIR override is used only for that default profile.
- Without that override, the default directory is ~/<config-dir>/agent, where config-dir is non-empty PI_CONFIG_DIR or .omp.
- A named profile selects ~/<config-dir>/profiles/<profile>/agent and ignores PI_CODING_AGENT_DIR.
- A profile containing path separators, traversal, or control characters is rejected before writes to that target; diagnostics identify the rejected profile setting.
- ### FR-7: Separate preserve-first ownership state
- **Objective:** As a maintainer, I want independent global ownership records, so that managing personal Skills cannot corrupt runtime or project-install state.
- **EARS Specification:** WHEN global setup writes managed assets THEN the system SHALL maintain separate Skills and runtime lock, manifest, and backup namespaces contained beneath their respective writer roots.
- **Acceptance Criteria:** 1. Each host uses the state locations specified in FR-3 through FR-5; global setup does not place ownership state, locks, or backups in the active repository.
- A Skills-only installation commits managed files without runtime verification or runtime rollback and retains any prior registration record in its manifest.
- Existing project installations retain their default .sdd-mcp state directory, runtime registration, and verification/rollback behavior.
- ## Constraints
- |