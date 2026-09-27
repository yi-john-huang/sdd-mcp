# Tasks: sdd-workflows

## Overview

Implement the approved global user/profile setup design without changing workflow phases or project-install defaults. This plan covers all 15 requirements and all nine design decisions, including the corrected typed distinction between preserved runtime ownership conflicts and operational failures.

**Upstream:** [requirements.md](requirements.md), [design.md](design.md), and retained [plan.md](plan.md).
**Test-case review:** Required, explicitly selected by the user. Review of the concrete cases below is a separate checkpoint before implementation-task approval. Neither checkpoint authorizes implementation by itself.
**Current scope:** Planning only. No task is started, no implementation tests have run, and no production code changes are part of this artifact.

## Implementation Rules

- Each behavioral task owns a vertical RED → GREEN → REFACTOR slice. Run its meaningful failing case before changing the corresponding behavior; record actual failure and success evidence. Do not manufacture a failure when behavior already exists: document existing coverage and concentrate RED on the uncovered boundary.
- Retain tests for observable behavior, preservation, ownership transitions, precedence, and real error boundaries. Do not assert source text, forwarding alone, incidental prose, or mock echoes.
- Use real temporary files for writer/config behavior; inject only environment/home lookup, OMP command execution, and narrowly controlled failure/lease synchronization. No test writes to a developer's actual user configuration.
- Reuse current managers, rendering, JSONC/TOML preservation, leases, manifests, and atomic writers. No new installer framework, dependency, CLI compatibility alias, retry system, or generated host-tree edits.
- Coverage remains at the repository's configured 80% global threshold; do not lower it or pad cases to hit a count. Run focused checks during TDD, then the project-wide validation once after integration.
- The planned test pyramid has 30 distinct scenario groups: 21 component/unit groups, six integration groups, and three end-to-end groups (70/20/10). A group can need multiple assertions or platform fixtures; these are planning weights, not a quota for new test functions. Reuse existing cases where they already protect the contract.
- Estimated effort labels are relative sizing only: S = one small boundary; M = a few related boundaries. No task is an unbounded implementation placeholder.

## Test Cases for Explicit Review

### Component and unit scenarios

| Case | Concrete behavior and expected outcome | Owning task |
|---|---|---|
| U01 | Use a custom state directory, commit managed files, rerun, and find ownership only in that namespace; a default writer still uses .sdd-mcp. | 1.1 |
| U02 | Reject escaping/root-equal/symlinked state destinations before protected files change; another namespace and its manifest remain intact. | 1.1 |
| U03 | Prune an obsolete unmodified managed file under a custom namespace and recover its backup from that namespace; concurrent manifest edits remain protected. | 1.1 |
| U04 | Global Claude registration with permission configuration disabled succeeds with absent settings and with existing malformed settings; settings stay absent or byte-identical. | 1.2 |
| U05 | Existing project registration without new options retains Claude permissions, exact-version entries, and conditional rollback behavior. | 1.2 |
| U06 | Conflicting unmanaged or user-modified JSONC entries produce a typed ownership refusal with exact path/reason and unchanged bytes, not a parse or I/O failure. | 1.3 |
| U07 | Codex unmarked same-name entries, changed owned regions, and nonmatching unowned regions produce their specified typed conflict reasons; exact owned entries still rerun successfully. | 1.3 |
| U08 | Malformed JSONC/TOML, duplicate properties/ambiguous markers, I/O errors, and detected concurrent commit edits are failures, never ownership-conflict errors. | 1.3 |
| U09 | Files-only session installs target-rendered Skills and supporting assets, commits ownership, and creates no runtime, permission, root-guidance, or unrelated component files. | 1.4 |
| U10 | Files-only rerun retains a seeded registration record and unselected root ownership; modified Skills remain unchanged and reported as conflicts. | 1.4 |
| U11 | Files-only finalization failure rolls back only known uncommitted managed writes; unknown concurrent bytes survive. Registration-enabled complete without paths fails in a controlled way. | 1.4 |
| U12 | Missing/repeated/unsupported target values, positional input, and unknown options return usage failure with zero installation writes and zero OMP discovery calls. | 2.1 |
| U13 | Claude unset/empty override uses home .claude.json; a nonempty override uses personal .claude.json, with the required Skills/state roots, even when the override equals the default personal directory. | 2.1 |
| U14 | CODEX_HOME relocates config/state only; Skills remain in home .agents. Literal supported tilde expansion, spaces, and rejected control/escaping/symlink paths obey containment. | 2.1 |
| U15 | A single absolute omp config path result selects the returned agent directory; unselected OMP performs no discovery and selected OMP performs at most one call. | 2.2 |
| U16 | Unavailable/failing command or empty/relative/multiple-line output produces one explicit fallback notice and uses only the fallback directory. | 2.2 |
| U17 | Defined-empty OMP_PROFILE defeats PI_PROFILE; empty/whitespace/default selects default; PI_CODING_AGENT_DIR applies only to default; named profile uses profiles/<name>/agent. | 2.2 |
| U18 | Named-profile separators/traversal/control characters and unsafe fallback/discovered destinations fail before affected writes; unsafe accepted paths are not silently replaced by another profile. | 2.2 |
| U19 | Project-dependent adapter operations use supplied nonempty CLAUDE_PROJECT_DIR rather than a different cwd; unset/empty uses cwd, and an invalid supplied project does not silently fall back. | 3.1 |
| U20 | Actual wrapper execution with a controlled npx records the exact default/override package and original argument boundaries, including spaces/metacharacters, and propagates delegated status. | 3.3 |
| U21 | Actual wrapper execution without npx reports the missing prerequisite and returns nonzero without launching setup. | 3.3 |

### Integration scenarios

| Case | Concrete behavior and expected outcome | Owning task |
|---|---|---|
| I01 | Real orchestrator/writer/session installs all three hosts into temporary roots with correct native configs, reference files, Codex policy metadata, exact package version, and no project artifacts; a selected target leaves other roots untouched. | 2.3 |
| I02 | Registration precedes Skills; an ownership refusal or malformed runtime config leaves that host's Skills uninstalled while independent hosts finish. | 2.3, 2.4 |
| I03 | Seed a real runtime ownership conflict and a modified Skill: output and typed reports classify them only as preserved conflicts. Malformed config and injected I/O errors appear only as failures; both classes yield nonzero status and exact paths. | 2.4 |
| I04 | A Skills-stage failure after runtime commit leaves that committed registration in place, reports partial failure accurately, and does not count rolled-back writes as installed; successful independent hosts survive. | 2.4 |
| I05 | Identical reruns produce one entry/block and no duplicate Skills; upgrading from an owned old-version fixture updates unmodified assets together, preserving unrelated bytes and reporting any customized files. | 2.5 |
| I06 | Deterministically interleave two setup versions targeting the same host: runtime-before-Skills lock ordering prevents a successful final mixed-version pair. Failed/unknown-byte commits retain the writer's existing protections. | 2.5 |

### End-to-end scenarios

| Case | Concrete behavior and expected outcome | Owning task |
|---|---|---|
| E01 | Execute the compiled package dispatcher for global setup and invalid argv; verify exit behavior and output categories, then retain existing project-installer and governed-workflow journeys. | 3.2, 4.3 |
| E02 | Build/pack the real package and verify executable bootstrap inclusion. In separate isolated environments, run both the wrapper and direct npx -y <absolute-packed-tarball> setup-global twice. The direct run starts outside the checkout, uses npm/npx bin resolution rather than node sdd-entry.js, and requires no bootstrap invocation or user-provided POSIX shell. Both paths produce pinned native config/Skills, preserve seeded bytes/settings, and honor target filtering and documented host locations. | 4.1 |
| E03 | Launch the packed/compiled stdio runtime from a config directory with a distinct CLAUDE_PROJECT_DIR; init/status/context use only the selected project, with no .spec under config roots. Unset/empty cases use cwd. | 3.1, 4.1 |

The Claude override-path combination is a release check, not an assumed success: use an isolated supported Claude host to confirm it reads <CLAUDE_CONFIG_DIR>/.claude.json. If the host is unavailable, record the unverified gate and block release acceptance; if it disagrees, return to requirements/design review rather than silently changing paths.

## Task Groups

## Installer Foundations

### 1.1 Isolate configurable writer ownership namespaces
**Covers:** FR-7, FR-9, NFR-1, NFR-3, D-3
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/cli/utils/preserving-writer.ts, src/__tests__/unit/cli/preserving-writer.test.ts
**Acceptance criteria:** 1. A custom contained stateDirectory controls lock/manifest/backup placement without changing managed-file relativity or the manifest schema; omitted options preserve .sdd-mcp; unsafe state destinations leave protected content unchanged.
**Verification:** U01–U03; focused preserving-writer tests covering both new namespaces and existing ownership/rollback behavior.
**Type:** Component/unit → implementation
**Estimated Effort:** M

1. RED: Exercise a custom state namespace with a real write/finalize/rerun and obsolete-file backup. Verify rejected escapes, root-equal state path, and symlinked state destinations without changing existing data. Keep the current default-writer regression cases.
2. GREEN: Add PreservingWriterOptions and the optional constructor argument; resolve one state directory and route install.lock, install-manifest.json, and backups through it. Reuse containment checks before/after directory creation and mutation. Retain schema normalization and file paths relative to writer root.
3. REFACTOR: Remove repeated .sdd-mcp path construction for those state artifacts; do not rename the writer's root contract or migrate project namespaces.

### 1.2 Make Claude permission configuration explicitly optional
**Covers:** FR-2, FR-7, NFR-1, NFR-3, D-5
**Dependencies:** 1.1
**TDD:** required
**Affected artifacts:** src/cli/tool-support/mcp-registration.ts, src/cli/utils/preserving-writer.ts, src/__tests__/unit/cli/mcp-registration.test.ts, src/__tests__/unit/cli/preserving-writer.test.ts
**Acceptance criteria:** 1. configureClaudePermissions defaults to true for existing callers; false excludes permission path resolution/read/parse/write/verification/rollback and permission metadata while runtime config/manifest still commit normally.
**Verification:** U04–U05; focused mcp-registration and preserving-writer tests, including malformed existing Claude settings and unchanged bytes.
**Type:** Component/unit → implementation
**Estimated Effort:** M

1. RED: Register Claude runtime with permissions disabled against absent and malformed existing settings and assert successful registration without creating/changing settings. Keep a default-options project case proving current permission behavior and rollback semantics.
2. GREEN: Add RuntimeRegistrationOptions as the final low-level registration argument and the writer runtime-only method's optional argument. Gate the entire permission branch, not merely the final write. Do not remove existing allow rules or configure any other host policy.
3. REFACTOR: Keep one JSONC registration implementation; avoid a global-only serializer or duplicate permission preparation path.

### 1.3 Distinguish runtime ownership refusals with typed errors
**Covers:** FR-8, FR-9, NFR-3, D-1, D-5
**Dependencies:** 1.2
**TDD:** required
**Affected artifacts:** src/cli/tool-support/mcp-registration.ts, src/__tests__/unit/cli/mcp-registration.test.ts
**Acceptance criteria:** 1. RuntimeRegistrationConflictError carries absolute configPath and a RuntimeConflictReason from the approved design; malformed/structural/I/O/commit failures are not this type; all rejected ownership cases preserve existing bytes.
**Verification:** U06–U08; test actual JSONC/TOML fixtures and narrow I/O/commit failure injection, checking typed distinctions and file preservation rather than message substrings.
**Type:** Component/unit → implementation
**Estimated Effort:** M

1. RED: Cover unmanaged JSONC collision, modified owned JSONC entry, Codex unmarked entry (including semantically exact), changed owned region, and differing unowned region. Add negative classification assertions for malformed JSONC/TOML, duplicate/ambiguous structures, and operational errors.
2. GREEN: Export RuntimeConflictReason and RuntimeRegistrationConflictError from mcp-registration.ts. Pass the absolute path into ownership checks and raise the typed refusal at those decision points. Use the exact unmanaged-entry, modified-entry, and unowned-region mapping from D-5.
3. REFACTOR: Preserve the existing Error-compatible project failure flow and config merge algorithms. Do not classify by matching error strings and do not persist report taxonomy in manifests.

### 1.4 Support Skills-only sessions without runtime side effects
**Covers:** FR-2, FR-7, FR-8, NFR-3, D-3, D-4
**Dependencies:** 1.3
**TDD:** required
**Affected artifacts:** src/cli/utils/preserving-writer.ts, src/cli/tool-support/target-installer.ts, src/__tests__/unit/cli/preserving-writer.test.ts, src/__tests__/unit/cli/target-installers.test.ts
**Acceptance criteria:** 1. The default-enabled registration flag is retained per session/target; files-only complete works without paths, preserves prior registrations and unselected root ownership, and performs no runtime registration/verification/rollback; file/manifest protection remains intact.
**Verification:** U09–U11; focused writer/session tests plus existing target-installer behavior.
**Type:** Component/unit → implementation
**Estimated Effort:** M

1. RED: Exercise copySkills/complete without runtime paths for each native target; assert rendered files and reference assets, no runtime/permissions/root guidance, and retained registration/unselected ownership records. Trigger managed-file finalization failure and verify conditional rollback/unknown-byte preservation.
2. GREEN: Add registerRuntime = true as the fifth beginTarget argument and seventh TargetInstallSession constructor argument; make complete(paths?) require paths only in enabled mode. Clear stale per-target runtime settings on begin; omit implicit root selection in files-only mode. Condition runtime result use and retain prior registrations when absent.
3. REFACTOR: Keep a single commit algorithm and existing manifest/error-after-commit semantics. Ensure catch paths do not dereference omitted paths and report the correct Skills/state location.

### 1.5 Share the existing package component resolver
**Covers:** FR-11, NFR-3, D-7
**Dependencies:** none
**TDD:** not-applicable — behavior-preserving extraction with existing installer regressions; no new observable contract or forwarding-only test is needed
**Affected artifacts:** src/cli/utils/find-package-root.ts, src/cli/install-skills.ts, src/__tests__/unit/cli/install-skills.test.ts
**Acceptance criteria:** 1. resolvePackageComponentPath owns the existing lookup order/debug behavior; all six InstallSkillsCLI lookups use it; the private duplicate is removed; package-first resolution and existing development fallbacks are preserved.
**Verification:** Existing focused install-skills cases plus package-source discovery exercised by I01 and E02; repair broken meaningful regressions without adding source-text assertions.
**Type:** Refactor
**Estimated Effort:** S

Move the already-reviewed getDefaultPath behavior into find-package-root.ts without widening its accepted inputs or introducing a second resolver. Global setup will instantiate only SkillManager; do not instantiate unused component managers merely to share their source record.

## Global Setup Behavior

### 2.1 Validate command arguments and resolve Claude/Codex locations
**Covers:** FR-1, FR-3, FR-4, NFR-1, NFR-2, D-1, D-2
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/cli/setup-global.ts, src/__tests__/unit/cli/setup-global.test.ts
**Acceptance criteria:** 1. The approved command syntax is parsed fully before any side effect; default selection is the ordered three hosts; valid --target selects one; Claude/Codex writer roots, config, Skills, and state subpaths match D-2; unsafe paths do not silently resolve against cwd.
**Verification:** U12–U14 using injected environment/home lookup and real temporary path fixtures.
**Type:** Component/unit → implementation
**Estimated Effort:** M

1. RED: Reject missing/repeated/unknown/unsupported/positional input with no writes/discovery. Cover Claude absent/empty/nonempty overrides including a resolved default-equivalent override; Codex runtime relocation with fixed home .agents Skills. Exercise tilde, spaces, controls, escapes, and symlink containment.
2. GREEN: Introduce GlobalSetupOptions, GlobalSetupDependencies, GlobalTargetLocations, strict parseArgs, and location helpers in setup-global.ts. Build data from user/profile inputs, never project-install defaults or target prompts. No CLI orchestration no-op or placeholder run implementation is introduced; the runner is added as its own completed behavior in 2.3.
3. REFACTOR: Use the existing InstallTarget/CliUsageError and path checks; keep the resolver local and plain-data driven rather than creating a new DI subsystem.

### 2.2 Resolve OMP discovery and profile fallback safely
**Covers:** FR-5, FR-6, NFR-1, NFR-2, D-2
**Dependencies:** 2.1
**TDD:** required
**Affected artifacts:** src/cli/setup-global.ts, src/__tests__/unit/cli/setup-global.test.ts
**Acceptance criteria:** 1. Selected OMP runs a no-shell argument-array discovery at most once; a single absolute result is validated; invalid/unavailable discovery falls back once with an explicit path notice; profile precedence and unsafe-input behavior match D-2.
**Verification:** U15–U18 with a controlled runner and temporary roots, including defined-empty OMP_PROFILE and PI_CODING_AGENT_DIR ignored for named profiles.
**Type:** Component/unit → implementation
**Estimated Effort:** M

1. RED: Test discovery result shapes and rejected paths, command rejection, zero calls when OMP is unselected, profile precedence, default/whitespace behavior, config-dir containment, and illegal named profiles.
2. GREEN: Add production execFile('omp', ['config', 'path']) with no shell and the injected runner boundary. Implement the approved default/named fallback and propagate an observable fallback notice without retries or alternate path guessing.
3. REFACTOR: Keep discovery parsing, profile selection, and path safety readable; do not add host-version detection or shell execution for command shims.

### 2.3 Install selected hosts using existing runtime and Skill writers
**Covers:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, NFR-1, NFR-2, NFR-3, D-1, D-2, D-3, D-4, D-5
**Dependencies:** 1.4, 1.5, 2.2
**TDD:** required
**Affected artifacts:** src/cli/setup-global.ts, src/__tests__/unit/cli/setup-global.test.ts
**Acceptance criteria:** 1. run installs requested hosts into their two ownership namespaces, registers exact PACKAGE_VERSION before copying native Skills, leaves unselected hosts/project assets untouched, and records runtime refusal/failure without attempting that host's Skills.
**Verification:** I01–I02 using actual writers/session/packaged Skill rendering; assert successful host output files rather than mocked collaborator calls.
**Type:** Integration → implementation
**Estimated Effort:** M

1. RED: Run all-host and single-host installs with isolated homes and real packaged Skills. Assert exact native config content, reference assets and Codex openai.yaml policy, manual invocation metadata, no extra components/root guidance/settings/project files, and no Skills on runtime rejection.
2. GREEN: Add the real GlobalSetupCLI.run implementation and typed GlobalTargetReport/RuntimeInstallConflict orchestration records. Use runtime and Skills writers with the approved state locations; pass configureClaudePermissions false, registerRuntime false, lean profile, and only skills. Process all selected hosts in stable order; capture failures/conflicts for 2.4 presentation.
3. REFACTOR: Reuse source lookup and rendering directly through copySkills. Do not call project target adapters, mutate gitignore, register runtime a second time, or add a cross-host transaction.

### 2.4 Report preserved conflicts separately from operational failures
**Covers:** FR-8, NFR-1, NFR-3, D-1, D-4, D-5
**Dependencies:** 2.3
**TDD:** required
**Affected artifacts:** src/cli/setup-global.ts, src/__tests__/unit/cli/setup-global.test.ts
**Acceptance criteria:** 1. Typed runtime ownership refusals and Skill conflicts appear only under Preserved conflicts; malformed/unsafe/I/O/commit errors appear under Failures; either yields exit 1; independent hosts complete and output distinguishes committed assets from rolled-back attempts.
**Verification:** I03–I04 and I02 failure continuation; inspect returned report classes, observable category output and actual retained bytes, without depending on incidental prose wording.
**Type:** Integration → implementation
**Estimated Effort:** M

1. RED: Seed real runtime conflicts and modified Skills, then separate malformed-config and I/O failure scenarios. Assert exact-path categorization without double counting, nonzero aggregate result, unaffected independent hosts, and no forbidden config contents in diagnostics. Trigger Skills failure after runtime commits and verify retained registration plus accurate partial reporting.
2. GREEN: Catch RuntimeRegistrationConflictError by type, populate GlobalTargetReport.conflicts with its reason/path, and put other exceptions in failed. Implement grouped mainGlobalSetup reporting and aggregate process.exitCode; preserve committed-state warnings and never terminate inside the target loop.
3. REFACTOR: Share formatting only where it removes duplication; no message-string classifier, report alias, new persisted schema, or forced conflict overwrite.

### 2.5 Preserve upgrade ownership and serialize cross-store installs
**Covers:** FR-7, FR-8, FR-9, NFR-3, D-3, D-4, D-5, D-9
**Dependencies:** 2.4
**TDD:** required
**Affected artifacts:** src/cli/setup-global.ts, src/cli/utils/preserving-writer.ts, src/__tests__/unit/cli/setup-global.test.ts, src/__tests__/unit/cli/preserving-writer.test.ts
**Acceptance criteria:** 1. Same-version reruns remain duplicate-free; owned unmodified old-version assets converge to the running package; customized assets remain conflicts; a runtime writer lease is held across the nested Skills pass in runtime-then-Skills order, preventing successful mixed-version completion.
**Verification:** I05–I06 using independent versioned fixture instances and deterministic synchronization, plus relevant existing manifest-CAS/rollback cases.
**Type:** Integration → implementation
**Estimated Effort:** M

1. RED: Create an old-version ownership fixture via existing writer/registration behavior, not fabricated success records. Run an upgrade and identical rerun; assert pinned config, intended Skill bytes, unrelated byte preservation, conflicts for user edits, and one entry. Use controlled barriers rather than sleeps to expose two-version runtime/Skills interleaving.
2. GREEN: Hold runtimeWriter.withInstallLock over registration and the nested skillsWriter.withInstallLock/session pass. Reuse its same-writer active-lease behavior; assert the outer runtime lease before declaring success. Keep independent manifest commit points and preserve committed runtime after Skills failure.
3. REFACTOR: Repair only contract failures found at this boundary; retain existing compare-before-write/conditional rollback guarantees and do not add global lock services, retries, or blanket restore operations.

## Runtime and Public Entry Points

### 3.1 Bind every project-sensitive runtime operation to one root
**Covers:** FR-10, NFR-3, D-6
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/adapters/cli/SDDToolAdapter.ts, src/__tests__/unit/runtime/workspace-root.test.ts, src/__tests__/unit/runtime/entrypoints.stdio.test.ts
**Acceptance criteria:** 1. Nonempty CLAUDE_PROJECT_DIR selects the project for all filesystem-sensitive handlers/helpers; absent/empty selects cwd; supplied invalid roots fail rather than fallback; package-owned template/Skill source discovery is not redirected.
**Verification:** U19 through consumer-visible project operations and E03 through actual compiled stdio init/status/context; rebuild before tests consuming dist.
**Type:** Component/unit and E2E → implementation
**Estimated Effort:** M

1. RED: Put distinct project metadata/feature state in cwd and the selected project, invoke adapter operations, and assert the selected project's observable result rather than a forwarded argument. Add real stdio init/status/context against a separate config cwd and assert no .spec in user/config roots.
2. GREEN: Add one private workspace resolver and migrate initialization/clarification, status/list/load, phase submission/approval/review, implementation/progress, context, steering/custom steering, analysis, template feature lookup, package inspection, and directory helpers. Resolve once per operation and pass the same root to its subordinate helpers; never process.chdir.
3. REFACTOR: Remove duplicate cwd selection in these operations without changing the MCP tool inventory, pure code quality checks, workflow state/approval rules, or package asset resolution.

### 3.2 Expose global setup through both compiled dispatch boundaries
**Covers:** FR-1, FR-8, NFR-3, D-1, D-9
**Dependencies:** 2.5
**TDD:** required
**Affected artifacts:** sdd-entry.js, src/cli/sdd-mcp-cli.ts, src/__tests__/unit/cli/compiled-cli.e2e.test.ts
**Acceptance criteria:** 1. setup-global reaches mainGlobalSetup through the public package entrypoint and compiled CLI dispatcher with unchanged argv boundaries; help lists it; usage/conflict/failure exits are nonzero; existing commands retain their behavior.
**Verification:** E01 using real child processes and isolated environment roots; compile first and retain existing target-aware CLI journeys.
**Type:** E2E → implementation
**Estimated Effort:** S

1. RED: Execute the new command through both boundaries before adding dispatch, and assert actual selected-target installation/exit semantics rather than import wiring. Exercise invalid argv with zero writes and a real preserved conflict with nonzero status.
2. GREEN: Add setup-global to root routing and the compiled command switch, pass remaining args to mainGlobalSetup, and update top-level help. Preserve the no-command stdio path and existing install/migration routes.
3. REFACTOR: Keep entrypoints thin; do not duplicate parser, installer, or exit aggregation logic.

### 3.3 Deliver an executable POSIX bootstrap wrapper
**Covers:** FR-11, NFR-1, NFR-3, D-7
**Dependencies:** none
**TDD:** required
**Affected artifacts:** bootstrap.sh, package.json, src/__tests__/unit/cli/bootstrap.test.ts
**Acceptance criteria:** 1. The executable wrapper delegates exactly npx -y <package> setup-global plus original args; default and SDD_MCP_PACKAGE override work; missing npx fails clearly; delegated status is preserved; bootstrap.sh is included in package files.
**Verification:** U20–U21 by executing the actual wrapper against a temporary fake npx; executable tarball inclusion is verified in E02, not by source-text inspection.
**Type:** Component/unit boundary → implementation
**Estimated Effort:** S

1. RED: Launch with controlled PATH and a recording npx; cover default/override package, argument boundaries with spaces/metacharacters, delegated nonzero status, and missing executable. Assert captured argument data and process result.
2. GREEN: Add the approved POSIX wrapper using command -v and exec with quoted package/argv, set executable mode, and add bootstrap.sh to package.json files. No sudo, lifecycle hook, global npm install, or shell reinterpretation.
3. REFACTOR: Keep the wrapper minimal; use the direct npx command for platforms without POSIX sh.

## Acceptance and Release Evidence

### 4.1 Exercise the packed package and verify native host paths
**Covers:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, NFR-1, NFR-2, NFR-3, D-1, D-2, D-3, D-4, D-5, D-6, D-7, D-9
**Dependencies:** 3.1, 3.2, 3.3
**TDD:** not-applicable — acceptance execution of the implemented public surface and host interoperability, not a new production behavior or duplicate test suite
**Affected artifacts:** none
**Acceptance criteria:** 1. Both real packed wrapper setup and direct npx setup, plus their reruns, succeed in separate isolated roots with pinned entries/rendered Skills and unchanged seeded config/settings. 2. Direct npx resolves the package binary from an absolute tarball while launched outside the checkout, without invoking bootstrap.sh or relying on a user-provided POSIX shell. 3. Conflicts and failures remain distinguishable; packed stdio state belongs only to its project; supported host checks confirm the documented files, including the Claude override combination.
**Verification:** E02 and packed E03; execute the smoke procedure in design.md plus the direct-npx acceptance path below for FR-11 AC4, capture commands/exit codes/path evidence, and report any unavailable host capability as an unresolved release gate rather than a pass.
**Type:** E2E/manual host acceptance
**Estimated Effort:** M

- Build and npm pack into temporary storage; inspect actual archive contents/mode for bootstrap.sh and source assets.
- Keep HOME, CLAUDE_CONFIG_DIR, CODEX_HOME, OMP agent roots, working directory, and selected project isolated and distinct. Control omp on PATH or make it deliberately unavailable; a real unrelated omp installation must not defeat isolation.
- Seed unrelated JSONC/TOML comments/values and Claude permission files; also exercise absent settings. Run the packed wrapper twice and assert exact-version entries, target-rendered Skills/reference files, separate namespaces, no duplicates, no Claude settings changes, and no repository installation files.
- In a second fresh temporary working directory outside the checkout, with separate isolated user/config roots and controlled OMP discovery, execute the native npx launcher with argv ['-y', absolutePackedTarball, 'setup-global']. Do not call node sdd-entry.js, bootstrap.sh, sh, or a checkout-relative script. Use npx.cmd on Windows through the native command-launch mechanism; no POSIX shell is a prerequisite. Repeat the invocation and assert exit 0, exactly one pinned runtime entry per host, rendered Skills/reference files, preserved seeded config/settings, and no cwd installation artifacts. Also execute the direct command with --target codex in fresh roots and verify the other hosts remain untouched. This deliberately exercises npm/npx package-bin resolution, not merely CLI dispatch.
- Exercise separate ownership-conflict, malformed-config, modified-Skill, and partial-failure scenarios. Preserve exact bytes, category distinction, correct exit status, and independent host success.
- Launch the packed runtime with a distinct CLAUDE_PROJECT_DIR and use a complete sdd-init goal/clarification answers to avoid unrelated clarification blocking. Verify status/context and .spec location. Run empty/unset root cases separately.
- Check claude mcp get sdd-mcp, codex mcp get sdd-mcp, and OMP /mcp test sdd-mcp from isolated non-shadowing contexts when hosts are available. The Claude override-path release check must be confirmed before release; do not substitute installation-file existence for host discovery.
- A host-version discrepancy reopens requirements/design. No path adjustment or scope reduction occurs inside this task without approval. Temporary roots/scripts are removed after evidence capture; no real user configuration is touched.

### 4.2 Publish installation scope and verification documentation
**Covers:** FR-12, NFR-1, D-8
**Dependencies:** 4.1
**TDD:** not-applicable — documentation/release-note updates based on observed runtime evidence; prose wording does not warrant test-first assertions
**Affected artifacts:** README.md, docs/INSTALL-GUIDE.md, docs/WORKFLOW.md, CHANGELOG.md, src/__tests__/unit/cli/documentation-consistency.test.ts
**Acceptance criteria:** 1. Existing docs lead with global bootstrap/direct npx, show precise user/profile paths and checks, preserve the project/team alternative, explain unchanged Claude permissions and scope limitations, and add an Added entry under Unreleased without claiming unverified host behavior.
**Verification:** Compare documented commands/paths with 4.1 evidence; run meaningful existing documentation consistency checks, deleting incidental wording assertions rather than re-pinning them.
**Type:** Documentation
**Estimated Effort:** S

Update the four named files rather than adding another guide. Include target filtering, package pinning/upgrades, per-profile OMP setup, reload/trust, local-only personal Skills and cloud/Cowork limitations, project runtime shadowing and deliberate user removal of only the relevant entry. Distinguish runtime precedence from Skill/desktop exceptions. Link all upstream references from the approved design. Never recommend a blanket Claude allow rule or required project-install follow-up.

### 4.3 Verify integrated quality and record release readiness
**Covers:** FR-8, FR-12, NFR-1, NFR-2, NFR-3, D-8, D-9
**Dependencies:** 4.2
**TDD:** not-applicable — final verification and quality review of completed behavior, with new regression tests only for defects actually found
**Affected artifacts:** none
**Acceptance criteria:** 1. Focused and existing project journeys pass; typecheck/lint/CI tests satisfy current configured coverage thresholds; no generated host trees or temporary smoke artifacts are introduced; code review finds no unresolved correctness/security issue; required host evidence is present.
**Verification:** Run the commands below after all implementation edits settle; review actual contracts, typed conflict classification, containment, permissions, concurrency, rollback and caller migration. Record failures accurately and repair in the owning task before completion.
**Type:** Verification/review
**Estimated Effort:** S

Do not claim success from compilation alone or lower thresholds to make checks pass. Review manifests for no schema fork, writer defaults for compatibility, and all SDDToolAdapter root-sensitive paths for consistent project binding. No commit or pull request is part of this plan unless separately requested.

## Implementation Order and Concurrency

~~~text
1.1 -> 1.2 -> 1.3 -> 1.4 ----+
                            |
1.5 -----------------------+-> 2.3 -> 2.4 -> 2.5 -> 3.2 --+
                            |                             |
2.1 -> 2.2 ----------------+                             |
                                                          +-> 4.1 -> 4.2 -> 4.3
3.1 -----------------------------------------------------+
3.3 -----------------------------------------------------+
~~~

The 1.1–1.4 foundation chain is intentionally serialized: it mutates shared writer/registration/session contracts. The 2.1–2.5 global CLI chain is serialized in setup-global.ts and its focused test file. These chains can overlap until 2.3 needs completed foundations.

3.1 is independently runnable against SDDToolAdapter and runtime tests; 3.3 owns only wrapper/package/test files; 1.5 is a small parent-owned extraction and does not justify a separate subagent. Concurrency is optional and must preserve explicit file ownership. If agents are used for two or more real independent implementation slices, agents skip validation while concurrent edits are active; the integration owner serializes test/build evidence afterward. No agent is spawned merely to route these tasks.

## Verification Commands

Use focused TDD commands naming the owning test file as work progresses. Build first whenever a check launches dist. The acceptance set supplements the source plan with the session/component/adapter cases needed by this decomposition:

~~~sh
npm run build
npm test -- --runInBand --runTestsByPath src/__tests__/unit/cli/setup-global.test.ts src/__tests__/unit/cli/bootstrap.test.ts src/__tests__/unit/cli/mcp-registration.test.ts src/__tests__/unit/cli/preserving-writer.test.ts src/__tests__/unit/cli/target-installers.test.ts src/__tests__/unit/cli/install-skills.test.ts src/__tests__/unit/runtime/workspace-root.test.ts src/__tests__/unit/runtime/entrypoints.stdio.test.ts src/__tests__/unit/cli/documentation-consistency.test.ts
npm test -- --runInBand --runTestsByPath src/__tests__/unit/cli/compiled-cli.e2e.test.ts src/__tests__/unit/cli/governed-workflow.e2e.test.ts
npm run validate
~~~

Run npm run validate once at final integration, not in each task or parallel agent. Reuse focused runs already completed rather than rerunning unchanged checks solely for ceremony. Keep compiled suite build conventions until their actual behavior requires adjustment. The real packed-package smoke and host checks are additional acceptance evidence, not replaced by Jest. For the direct smoke, invoke the native npx command with the argument vector -y <absolute-packed-tarball> setup-global from an isolated directory outside the checkout; repeat it and exercise --target codex separately. This is the deterministic local-package equivalent of the documented npx -y sdd-mcp-server@latest setup-global path and must not be replaced with a direct node entrypoint or wrapper invocation.

## Traceability Summary

| Requirement/decision | Implementing tasks |
|---|---|
| FR-1 / D-1 | 2.1, 2.3, 2.4, 3.2 |
| FR-2 / D-4 | 1.2, 1.4, 2.3 |
| FR-3 / D-2 | 2.1, 2.3, 4.1 |
| FR-4 | 2.1, 2.3 |
| FR-5, FR-6 | 2.2, 2.3 |
| FR-7 / D-3 | 1.1, 1.4, 2.3, 2.5 |
| FR-8 / D-5 | 1.3, 1.4, 2.4, 2.5 |
| FR-9 | 1.1, 1.3, 2.5 |
| FR-10 / D-6 | 3.1, 4.1 |
| FR-11 / D-7 | 1.5, 3.3, 4.1 |
| FR-12 / D-8 | 4.2, 4.3 |
| NFR-1 | 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.3, 4.1 |
| NFR-2 / D-9 | 2.1, 2.2, 2.3, 4.1, 4.3 |
| NFR-3 | Foundation compatibility, 2.3–2.5, 3.1–3.3, 4.1, 4.3 |

## Definition of Done

- All required behavior, edge cases, failure categories, and path contracts from the approved requirements/design are implemented; no stubs, aliases, or silent scope reductions remain.
- Behavioral tasks have real test-first evidence or an explicit record of already-covered behavior; relevant regression tests remain deterministic, isolated, and full-suite-safe.
- The planned unit/integration/E2E balance remains meaningful; no tests are added merely to satisfy a numerical ratio.
- Source and compiled entrypoints work; both packed wrapper and direct npx setup/rerun paths succeed, including no-checkout native package-bin resolution without a user-provided POSIX shell; packed runtime smoke succeeds; the documented host-location release checks are confirmed or explicitly block release.
- Preserved conflicts are distinguishable from failures without string parsing; both return nonzero status; independent hosts still complete.
- Claude permission files stay untouched; user edits and unrelated config survive; runtime and Skills locks/state remain separate; concurrent successful upgrades do not leave mixed versions.
- All affected callers, existing tests, and documentation are migrated or intentionally unchanged; project-install defaults and workflow approval gates remain intact.
- Typecheck, lint, existing CI tests/coverage, focused checks, and quality review pass; smoke artifacts are removed without touching user work.
- Test-case review and implementation-task approval are explicitly recorded before implementation begins. This document itself grants neither approval nor execution authority.
