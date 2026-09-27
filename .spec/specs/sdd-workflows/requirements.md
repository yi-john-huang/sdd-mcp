# Requirements: sdd-workflows

## Overview

Provide one-time local user/profile setup of the SDD workflow-control MCP runtime and host-native, manually invoked Skills for Claude Code, Codex, and Oh My Pi (OMP). Users can start the existing governed workflow in local projects without first installing repository-scoped assets. Existing project installations remain a supported team-scoped alternative.

**Source:** [Original global setup plan](plan.md), extracted unchanged from /tmp/global_sdd_mcp_plan.md. The source plan's implementation proposals and verification commands are retained for later design review; they are not an approved design or task breakdown.

**Primary users:** Engineers using Claude Code, Codex, or OMP locally. Secondary users are maintainers upgrading shared workflow tooling and teams retaining repository-scoped installation.

**Success:** One setup installs the requested hosts' rendered Skills and exact-version runtime registrations into isolated user roots; an identical rerun succeeds without duplication; user edits and unrelated configuration survive; Claude permissions remain unchanged; runtime workflow state belongs to the active project.

## Functional Requirements

### FR-1: Global setup command and target selection
**Objective:** As a local engineer, I want one setup command, so that I can enable SDD in my chosen hosts without per-project installation.
**EARS Specification:** WHEN a user invokes sdd-mcp-server setup-global THEN the system SHALL install all three supported targets unless exactly one valid --target argument selects claude-code, codex, or omp.
**Acceptance Criteria:** 1. Omitting --target selects Claude Code, Codex, and OMP; each valid target selects only that host and leaves unselected hosts untouched.
2. A missing target value, repeated --target, unknown option, or unsupported target fails with a diagnostic and nonzero exit status before any installation write.
3. The command is reachable through both the package entrypoint and the compiled CLI dispatcher.

### FR-2: Runtime registration before native Skills
**Objective:** As a host user, I want matching runtime and native Skills, so that invoking a Skill has its required workflow backend.
**EARS Specification:** WHEN global setup processes a selected target THEN the system SHALL register its runtime successfully before installing only that target's rendered native Skills.
**Acceptance Criteria:** 1. Runtime registration uses the name sdd-mcp and command npx with arguments -y and sdd-mcp-server@<running-package-version>; the installed registration does not use a floating latest version.
2. Runtime registration failure or conflict prevents that target's Skill installation; processing continues for independent targets.
3. Installed Skills use the existing target renderer's invocation and model metadata and retain manual invocation of the governed phase Skills.
4. Global setup installs no root guidance, agents, rules, contexts, hooks, or project steering artifacts and performs no second runtime registration during the Skills-only pass.

### FR-3: Claude Code user locations
**Objective:** As a Claude Code user, I want personal configuration overrides respected, so that setup uses my selected local profile rather than a repository.
**EARS Specification:** WHEN Claude Code is selected THEN the system SHALL resolve the personal directory from non-empty CLAUDE_CONFIG_DIR or otherwise ~/.claude and install its assets at the corresponding user locations.
**Acceptance Criteria:** 1. Skills are installed under <personal>/skills and their ownership state under <personal>/.sdd-mcp/global-skills.
2. Without a non-empty override, runtime registration is written to ~/.claude.json; with an override, registration is written to <personal>/.claude.json.
3. Runtime ownership state is stored under <personal>/.sdd-mcp/global-runtime in both cases.

### FR-4: Codex user locations
**Objective:** As a Codex user, I want personal Skills and runtime settings in their native locations, so that all local projects can discover them.
**EARS Specification:** WHEN Codex is selected THEN the system SHALL install Skills under ~/.agents/skills and register the runtime in config.toml under non-empty CODEX_HOME or otherwise ~/.codex.
**Acceptance Criteria:** 1. Skill ownership state is stored under ~/.agents/.sdd-mcp/global-skills independently of CODEX_HOME.
2. Runtime ownership state is stored under <resolved-codex-home>/.sdd-mcp/global-runtime.
3. Setting CODEX_HOME relocates runtime configuration and state without relocating the Skills directory.

### FR-5: OMP active-agent directory discovery
**Objective:** As an OMP user, I want setup to honor my active agent directory, so that assets match the profile I actually run.
**EARS Specification:** WHEN OMP is selected THEN the system SHALL first discover its active-agent directory by executing omp config path without a shell and accepting only one absolute directory result.
**Acceptance Criteria:** 1. The command is invoked with an argument array; valid output selects <agent-dir>/skills and <agent-dir>/mcp.json.
2. Skills and runtime state use <agent-dir>/.sdd-mcp/global-skills and <agent-dir>/.sdd-mcp/global-runtime, respectively.
3. An unavailable command, command failure, empty output, relative path, or multiple returned paths triggers the documented fallback instead of using the invalid output.

### FR-6: OMP profile-aware fallback
**Objective:** As an OMP user without working directory discovery, I want a deterministic fallback, so that setup still selects the intended profile safely.
**EARS Specification:** IF OMP directory discovery is unavailable or invalid THEN the system SHALL resolve the directory from the effective profile and documented environment defaults and report the selected fallback path.
**Acceptance Criteria:** 1. A defined OMP_PROFILE takes precedence over PI_PROFILE, including when OMP_PROFILE is empty; PI_PROFILE is used only when OMP_PROFILE is undefined.
2. Empty, whitespace-only, or default effective profile selects the default profile. A non-empty PI_CODING_AGENT_DIR override is used only for that default profile.
3. Without that override, the default directory is ~/<config-dir>/agent, where config-dir is non-empty PI_CONFIG_DIR or .omp.
4. A named profile selects ~/<config-dir>/profiles/<profile>/agent and ignores PI_CODING_AGENT_DIR.
5. A profile containing path separators, traversal, or control characters is rejected before writes to that target; diagnostics identify the rejected profile setting.

### FR-7: Separate preserve-first ownership state
**Objective:** As a maintainer, I want independent global ownership records, so that managing personal Skills cannot corrupt runtime or project-install state.
**EARS Specification:** WHEN global setup writes managed assets THEN the system SHALL maintain separate Skills and runtime lock, manifest, and backup namespaces contained beneath their respective writer roots.
**Acceptance Criteria:** 1. Each host uses the state locations specified in FR-3 through FR-5; global setup does not place ownership state, locks, or backups in the active repository.
2. A Skills-only installation commits managed files without runtime verification or runtime rollback and retains any prior registration record in its manifest.
3. Existing project installations retain their default .sdd-mcp state directory, runtime registration, and verification/rollback behavior.

### FR-8: Preservation and conflict reporting
**Objective:** As a user with customized configuration, I want conflicts preserved, so that upgrading SDD does not destroy my changes.
**EARS Specification:** IF a selected target has malformed configuration, a conflicting same-name runtime registration, or a modified managed Skill THEN the system SHALL preserve the conflicting content, report its exact path, and finish independent targets with an overall nonzero exit status.
**Acceptance Criteria:** 1. Unrelated JSONC/TOML configuration and comments remain intact during successful registration and upgrades.
2. Modified Skills and conflicting runtime entries remain unchanged; setup neither overwrites them nor installs a compatibility alias.
3. Output distinguishes successful targets, preserved conflicts, and failures and identifies actionable file paths.
4. No failed runtime registration causes that target's Skills to be installed; a failure in one host does not stop successful independent hosts.

### FR-9: Idempotent setup and exact-version upgrades
**Objective:** As a returning user, I want safe reruns, so that runtime and copied Skills stay aligned as packages change.
**EARS Specification:** WHEN setup is rerun against unmodified managed assets THEN the system SHALL converge to the running package's rendered Skills and exact-version runtime registration without duplicate managed entries.
**Acceptance Criteria:** 1. Two identical successful runs both exit zero and leave one sdd-mcp runtime entry or block per selected host with no duplicate Skill files.
2. Running a newer package updates owned, unmodified runtime registrations and Skills together to that package version while retaining unrelated configuration.
3. Upgrades continue to preserve user-modified assets under FR-8 rather than silently replacing them.

### FR-10: Active-project runtime binding
**Objective:** As an engineer invoking globally configured SDD, I want project-local workflow state, so that my specifications never land in a host configuration directory by accident.
**EARS Specification:** WHEN the runtime resolves its workspace THEN the system SHALL use non-empty CLAUDE_PROJECT_DIR when supplied and otherwise process.cwd() for all workspace-dependent handlers.
**Acceptance Criteria:** 1. Workflow, context, steering, code-analysis, package-inspection, and template operations share the resolved project root.
2. With the runtime working directory different from CLAUDE_PROJECT_DIR, sdd-init creates .spec/specs/global-root-smoke/spec.json only beneath the selected project.
3. An absent or empty CLAUDE_PROJECT_DIR preserves working-directory behavior for Codex, OMP, and direct stdio launches.
4. The isolated smoke scenario creates no .spec tree beneath HOME or CLAUDE_CONFIG_DIR.

### FR-11: Bootstrap wrapper and package delivery
**Objective:** As a new user, I want a one-command entrypoint, so that installation requires neither sudo nor a globally installed npm package.
**EARS Specification:** WHEN the user executes bootstrap.sh THEN the wrapper SHALL invoke npx -y with the selected package specification, setup-global, and the user's original arguments.
**Acceptance Criteria:** 1. The POSIX sh wrapper defaults to sdd-mcp-server@latest; non-empty SDD_MCP_PACKAGE overrides the package specification for pinned releases or local packed tarballs.
2. Package specifications and user arguments retain their argument boundaries without shell reinterpretation.
3. Missing npx produces a clear diagnostic and nonzero exit status; the wrapper propagates the delegated command's result.
4. The npm package includes executable bootstrap.sh, and the equivalent command npx -y sdd-mcp-server@latest setup-global works without a source checkout or POSIX shell.

### FR-12: Installation and verification guidance
**Objective:** As an engineer setting up a host, I want accurate startup and verification instructions, so that I can distinguish global installation from project overrides.
**EARS Specification:** WHEN users read the installation and workflow documentation THEN the system SHALL present one-time global setup as the primary local-user path and project installation as an optional repository/team-scoped alternative.
**Acceptance Criteria:** 1. README.md, docs/INSTALL-GUIDE.md, and startup instructions in docs/WORKFLOW.md document bootstrap.sh and the equivalent cross-platform npx command, exact user files, and unchanged Claude permissions.
2. Verification instructions show claude mcp get sdd-mcp, codex mcp get sdd-mcp, and OMP /mcp test sdd-mcp from a directory without a shadowing project entry, followed by the existing reload/trust startup steps where required.
3. Documentation explains local-machine/user-profile scope, the absence of local personal Skills in Claude cloud/Cowork sessions, and one setup per OMP named profile.
4. Documentation states that existing project-scoped sdd-mcp definitions take precedence and describes user removal of only the shadowing project entry; global setup itself neither scans nor modifies repositories.
5. CHANGELOG.md gains an Added entry under its existing Unreleased section, and installation guidance links the upstream Claude Code MCP/Skills, Codex MCP/Skills, and OMP MCP-config/Skills references listed in plan.md.

## Non-Functional Requirements

### NFR-1: Least privilege and filesystem safety
**Objective:** As a local user, I want bounded setup authority, so that configuration cannot grant unrequested access or redirect writes outside managed roots.
**EARS Specification:** The system SHALL preserve Claude permission policy and validate global destinations against existing realpath-aware containment protections.
**Acceptance Criteria:** 1. Global setup creates or modifies zero Claude permission settings files and adds zero mcp__sdd-mcp__* allow-list entries; existing permission files remain byte-identical.
2. Only ~ and ~/... receive home expansion; control characters and destinations escaping the authorized writer root, including symlink escapes, are rejected before the affected write.
3. Resolved destinations are canonicalized, and OMP discovery uses no shell interpolation.
4. The setup requires neither sudo nor a global npm package installation. These controls address OWASP injection, broken access control, and security misconfiguration risks relevant to this local installer.

### NFR-2: Bounded setup work and isolation
**Objective:** As a local user, I want setup cost independent of my repository collection, so that user-level setup never requires a machine-wide project scan.
**EARS Specification:** The system SHALL restrict setup work to the selected hosts, packaged Skills, and their resolved user configuration and ownership locations.
**Acceptance Criteria:** 1. A default invocation processes exactly three host targets; a targeted invocation processes exactly one.
2. Setup performs zero repository-discovery traversals and writes zero repository installation files.
3. The OMP discovery command is invoked at most once per setup invocation and zero times when OMP is not selected.
4. No wall-clock installation SLA is imposed: npx package download latency depends on the network. Verification measures bounded target/discovery counts and absence of repository traversal instead.

### NFR-3: Compatibility and reproducible verification
**Objective:** As a maintainer, I want isolated, reproducible verification, so that supporting global setup does not break existing project installations or alter a developer's real user configuration.
**EARS Specification:** The system SHALL preserve the existing project-install contract and support verification of all global setup behavior using temporary user and project roots.
**Acceptance Criteria:** 1. Existing project installation continues registering its runtime, rendering the same selected profile, and using its existing default permission behavior.
2. Environment/home lookup and OMP command execution can be supplied independently of the developer machine for path and failure tests.
3. Focused verification covers target filtering, all native path/config shapes, target rendering, preservation, idempotence, upgrades, conflict exit status, permission non-mutation, OMP fallback/profile precedence, bootstrap forwarding, package inclusion, and workspace-root precedence.
4. The built packed-package scenario in plan.md succeeds twice with isolated roots, exact-version runtime entries, all three rendered sdd-requirements/SKILL.md files, preserved seeded configuration, and no Claude settings.json creation or modification.
5. Compiled-entrypoint and governed project-install regression scenarios remain successful on the existing Node.js >=18 ESM runtime baseline.

## Constraints

- Reuse the existing preserve-first writer, target Skill renderers, component managers, JSONC/TOML merge logic, and containment checks; do not introduce a second ownership or rendering convention.
- Retain the source plan's proposed extension points for later design: configurable writer state directories, files-only install sessions with runtime registration enabled by default, and a Claude permission option enabled by default but disabled by global setup.
- Keep sdd-entry.js and the compiled CLI dispatcher as entry boundaries. Reuse package-component discovery rather than copying private lookup logic.
- Global setup covers only local user/profile assets. Organization-managed deployment, remote/cloud provisioning, host installation, authentication setup, and workflow-phase redesign are out of scope.
- Requirements approval is explicit. This extraction does not approve the source plan's implementation design, generate implementation tasks, change production code, or grant Claude tool permissions.

## Assumptions

- Users have a supported Node.js/npm environment and independently install their host applications. npx availability is checked by the wrapper.
- The default OMP fallback is ~/<config-dir>/agent; named profiles insert profiles/<profile>/agent. This makes explicit the source plan's default-profile fallback using the same directory convention.
- Upstream host configuration conventions are those specified in plan.md; design validation will check the linked upstream references before implementation.
- The package running setup supplies the authoritative version for copied Skills and registered runtimes; rerunning the bootstrap performs preserve-first upgrades.
- Existing project-scoped entries can shadow user-level registrations. Removal remains an explicit user action, never an installer migration.

## Traceability and Verification Plan

| Source plan item | Extracted requirements |
|---|---|
| Approach 1: workspace binding | FR-10, NFR-3 |
| Approach 2: preserve-first extensions | FR-7, FR-8, NFR-1, NFR-3 |
| Approach 3: command and sequencing | FR-1, FR-2, FR-8, FR-9 |
| Approach 4: paths and ownership | FR-3, FR-4, FR-5, FR-6, FR-7, NFR-1 |
| Approach 5: bootstrap and package | FR-11 |
| Approach 6: documentation | FR-12 |
| Approach 7 and Verification 1–4 | FR-8, FR-9, FR-10, NFR-2, NFR-3 |

The exact proposed test commands and packed-package smoke procedure remain in [plan.md](plan.md). They are implementation acceptance evidence to execute after approved design/tasks, not claims that the global setup feature already exists. This requirements artifact is validated for structure, traceability, and measurable acceptance before requesting human approval.
