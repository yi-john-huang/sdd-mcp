# Requirements: Workflow Trust Hardening

## Overview

### Problem
A review of `sdd-mcp` 6.0.0 against the five-layer defense model (Structure, Machine Checks, Run & Verify, Minimal Text, Human Review) found gaps where trust depends on prose instead of structure:
- `record-green` succeeds after a RED that the engine classified as `setup` (`WorkflowEngineService.assertEvidenceActionAllowed`), so a test that never failed on a real assertion can unlock GREEN.
- Evidence is not bound to the code it verified. Edits after GREEN or after `complete` are invisible, `record-green` may run a different command than `record-red`, and `complete` trusts the caller's `affectedArtifacts`.
- Verified mode accepts inline-eval commands (`node -e`, `python3 -c`) that prove nothing about the project. No project-fixed verification command exists. The RED classifier only recognizes JavaScript and TypeScript output.
- CI runs `build` and `test` only. `tsconfig.json` disables strict mode while `rules/coding-style.md` requires it. Lint has 324 warnings and no guard against new ones. `.spec/steering/tech.md` still describes a 16-tool 5.0.0 server.
- Parallel implementation slices share one working tree. Skills have no stop-list, no retry budget, and no required "could not verify" report. Paper hooks reference flags that do not exist. No workflow turns repeated agent failures into stronger environment checks.

### Goal
Move each identified control to the strongest feasible layer: the engine rejects invalid evidence states, CI blocks type and lint regressions, and skill text keeps only judgment calls. Human approval gates stay unchanged.

### Users
- The implementing agent (Claude Code, Codex, OMP) driving `sdd-implement`, `simple-task`, and the new `sdd-correct` Skill.
- The human reviewer reading `sdd-status`, `sdd-commit` output, and CI results.
- The repository maintainer configuring `.spec/sdd-config.json` and maintaining CI, rules, hooks, and documentation.

### Scope
- P0: setup-RED gate, working-tree fingerprint binding, RED→GREEN continuity, observed-artifact cross-check, post-verification drift reporting, fixed verification command, inline-eval rejection, multi-language RED classification, CI typecheck and lint, TypeScript strict mode, lint no-new-warnings ratchet, steering refresh.
- P1: worktree isolation for parallel slices, stop-list and retry budget, Layer 4 rule pruning, paper-hook retirement, stale Skill wording, `sdd-jev-check` red schema fix, honest verification and review reporting, the new `sdd-correct` Skill.
- P2 (light): a skill blind-test rubric with fixtures, and an optional interface spike in `sdd-design`.
- Documentation updates for every behavior change.

### Out of scope
- Removing legacy root files (`documentGenerator.js`, `specGenerator.js`, `atomicWrite.js`), the `src/utils/moduleLoader.ts` bridge, and splitting `WorkflowEngineService.ts`. These move to a follow-up feature.
- Reducing the 324 pre-existing lint warnings, and linting `src/__tests__/`.
- Running verified evidence inside a git worktree other than the project root.
- Auto-merge, weakening `sdd-approve` or `sdd-review-test-cases`, and any verifier subagent started by default.
- Executing the skill blind-test harness in CI.
- Adding a new MCP tool. The contract stays at 17 tools.

### Assumptions
- `GitPort` (`NodeGitAdapter`) and `JevChangeManifest` already provide bounded, shell-free git reads that the fingerprint can reuse.
- Verified evidence mode is the default, and the engine runs evidence commands at the project root only.
- Strict TypeScript with all strict flags on reports 39 errors in 10 non-test files on the 6.0.0 baseline, so strict mode can be enabled in this feature.
- `npm run lint` exits 0 with 324 warnings in 43 files on the 6.0.0 baseline.

### Dependencies
- `src/application/services/WorkflowEngineService.ts`, `EvidenceRunner.ts`, `EvidenceSettings.ts`, `RedEvidenceClassifier.ts`, `JevAdvisoryService.ts`, `JevChangeManifest.ts`, `WorkflowErrors.ts`.
- `src/infrastructure/mcp/sddToolDefinitions.ts` and `src/infrastructure/adapters/NodeGitAdapter.ts`.
- `.github/workflows/ci.yml`, `tsconfig.json`, `.eslintrc.cjs`, `package.json` scripts.
- Canonical `skills/`, `agents/`, `rules/`, `hooks/`, `.spec/steering/`, and target installers under `src/cli/`.
- Test contracts: `canonical-assets.test.ts`, `skill-delegation.test.ts`, `JevSkillText.test.ts`, `target-installers.test.ts` with `workflow-skill-render-baseline.json`, `message-clarity-bounds.test.ts`, `message-contract.test.ts` with `message-contract-baseline.json`, `documentation-consistency.test.ts`, `JevQuestionCatalog.test.ts`, `governed-workflow.e2e.test.ts`, `sddJevCheckTool.test.ts`.

### Success metrics
1. Each P0 bypass (setup RED unlocking GREEN, unchanged code between RED and GREEN, different GREEN command, unlisted observed artifact, inline eval, unflagged post-verification edit) has an automated test that fails on the 6.0.0 code and passes after this feature.
2. CI runs build, typecheck, lint, and test on both the Linux and macOS jobs, and any new type error or new lint warning fails the job.
3. `tsc --noEmit` passes with `strict: true` and `noImplicitReturns: true`, and the lint warning count for every file and rule is at most its committed baseline.
4. Documentation-consistency, skill size-budget, render-baseline, and message-contract tests pass. `sdd-approve` and `sdd-review-test-cases` tests pass unchanged.

## Functional Requirements

### FR-1: Setup-classified RED cannot unlock GREEN
**Objective:** A RED that failed for setup reasons (missing module, syntax, type, or compile error) must not count as proof of missing behavior.
**EARS Specification:** WHEN `sdd-spec-impl` receives `record-green` for a task whose stored RED has `source: "engine"` and `redClassification: "setup"`, the engine SHALL reject the action with a named `GovernanceError`, run no command, and leave `spec.json` byte-identical.
**Acceptance Criteria:** 1. A verified-mode test that records a RED whose output matches a setup pattern and then calls `record-green` receives the named error code, and `spec.json` is byte-identical before and after.
2. The error message has at most 2 sentences of at most 25 words each, starts with an imperative verb, and tells the agent to fix the test setup and record RED again.
3. After a setup RED, `record-red` with output classified `assertion` succeeds, and the following `record-green` succeeds.
4. A RED classified `assertion` or `ambiguous` still allows `record-green`, and RED records with `source: "caller"` (self-reported mode) keep their 6.0.0 behavior.

### FR-2: Content-addressed working-tree fingerprint
**Objective:** Every engine-observed evidence record must identify the exact code it observed.
**EARS Specification:** WHEN the engine records `start`, `record-red`, `record-green`, or `complete` in a git repository, the engine SHALL store a working-tree fingerprint that is a content address of all tracked and untracked non-ignored files, excluding paths under `.spec/specs/`.
**Acceptance Criteria:** 1. Two fingerprints taken with identical file content are equal, including when the content was committed between the two readings.
2. Changing, adding, or deleting one non-ignored file outside `.spec/specs/` changes the fingerprint, and changing only a file under `.spec/specs/` or a git-ignored file does not.
3. Outside a git repository, or when git fails or exceeds its timeout, the record stores a fingerprint status of `unavailable` with a reason, the action proceeds, and `sdd-status` reports the task as `unbound`.
4. The fingerprint stores no file content, and git runs through `GitPort` without a shell.

### FR-3: RED-to-GREEN continuity
**Objective:** GREEN must prove that a code change made the same failing test pass.
**EARS Specification:** WHEN `record-green` runs in verified mode, the engine SHALL reject it IF its `run.argv` differs from the stored RED `argv`, or IF the stored RED fingerprint and the new GREEN fingerprint are both available and equal.
**Acceptance Criteria:** 1. A `record-green` with an `argv` that differs from the RED `argv` in any element is rejected before the command runs, with a named error that names the expected `argv`.
2. A `record-green` with an identical `argv` and no file change since RED is rejected with a named error, and `spec.json` is byte-identical.
3. A `record-green` with an identical `argv` after a source change succeeds.
4. When either fingerprint is `unavailable`, or the RED predates this feature and has no fingerprint, only the `argv` check applies.

### FR-4: Observed artifacts match git changes
**Objective:** The artifacts a task claims to have changed must be changes git can see.
**EARS Specification:** WHEN `complete` runs in a git repository with an available `start` fingerprint, the engine SHALL reject it IF any normalized `affectedArtifacts` path is neither a path changed since the task's `start` (committed, staged, unstaged, or untracked) nor a directory that contains such a path.
**Acceptance Criteria:** 1. A `complete` that names a path with no change since `start` is rejected with a named error listing at most 20 unmatched paths, and `spec.json` is byte-identical.
2. A `complete` that names only changed files, or directories that contain changed files, succeeds, including when the changes were committed after `start`.
3. A path under `.spec/specs/` is accepted when it exists, without a git change check.
4. Outside a git repository, or without a `start` fingerprint, the 6.0.0 artifact rules apply unchanged.

### FR-5: Post-verification drift reporting
**Objective:** Reviewers must see when the delivered code differs from the code that was last verified.
**EARS Specification:** WHEN `sdd-status` is read for a feature with at least one completed task in a git repository, the system SHALL compare the current fingerprint with the most recent `complete` fingerprint and report `verificationDrift` with the task number and at most 50 changed paths IF they differ.
**Acceptance Criteria:** 1. After a task completes and one source file is edited, `sdd-status` reports `verificationDrift` naming that task and that file.
2. After a task completes and its exact content is committed with no further edits, `sdd-status` reports no drift.
3. The `sdd-commit` Skill reads status before committing, and when drift exists it shows the drift line and labels the commit content as unverified, without blocking the commit.
4. Drift reporting never mutates `spec.json` and never changes task state.

### FR-6: Project-fixed verification command
**Objective:** Completion must run one project-owned verification entrypoint instead of a command the agent invents per task.
**EARS Specification:** WHERE `.spec/sdd-config.json` defines a valid `evidence.verifyCommand` argv array in verified mode, WHEN `complete` runs, the engine SHALL run that command when `run` is omitted and SHALL reject a `run.argv` that differs from it.
**Acceptance Criteria:** 1. With `verifyCommand` set, `complete` without `run` runs the configured command and records its observed exit code.
2. With `verifyCommand` set, `complete` with a different `run.argv` is rejected with a named error that names the configured command.
3. A `verifyCommand` that is not a non-empty string array, uses a program outside the allowlist, or uses an inline-eval form (FR-7) is ignored with one warning in the tool result, and `complete` behaves as in 6.0.0.
4. `sdd-status` and the implementation handoff report the resolved verify command so the agent can reuse it.
5. Without `verifyCommand`, `complete` behaves as in 6.0.0.

### FR-7: Inline-eval commands are rejected in verified mode
**Objective:** Evidence must come from project tests, not from code typed into the command line.
**EARS Specification:** WHEN verified mode receives a `run.argv` whose program is `node` or `bun` with `-e`, `-p`, `--eval`, or `--print` (including `=` forms), or `python` or `python3` with `-c` alone or inside a short-option cluster, or `npx` or `npm exec` with `-c` or `--call`, the engine SHALL reject it before starting a process.
**Acceptance Criteria:** 1. Each listed form, including Windows `.exe` and `.cmd` program suffixes and directory-qualified programs, is rejected with a named error that names the flag, and no process starts.
2. `node --test path`, `python3 -m pytest path`, `npx jest path`, and `npm test` are accepted.
3. Self-reported mode is unaffected.
4. `governed-workflow.e2e.test.ts` stops using `node -e` for verified evidence and runs a fixture test file instead.

### FR-8: Multi-language RED classification
**Objective:** Setup and assertion failures from non-JavaScript test runners must be classified correctly.
**EARS Specification:** WHEN the RED classifier receives output from Python (pytest, unittest), Go, Rust (cargo test), JVM (Maven, Gradle, JUnit), or .NET (dotnet test), the classifier SHALL return `setup` for import, module, syntax, and compile failures and `assertion` for assertion failures, with setup taking precedence.
**Acceptance Criteria:** 1. A fixture corpus holds at least 2 setup samples and 2 assertion samples for each of the 5 ecosystems, and every sample receives its expected classification.
2. Setup samples include `ModuleNotFoundError`, `ImportError`, pytest collection errors, Go `undefined:` and `[build failed]`, Rust `error[E` codes and `could not compile`, Java `cannot find symbol` and `COMPILATION ERROR`, and .NET `error CS` codes.
3. Assertion samples include pytest `assert` failures, Go `--- FAIL:` with a `_test.go:` location, Rust `assertion` panics, JUnit `AssertionFailedError` or `expected:<...> but was:<...>`, and xUnit or NUnit `Assert` failures.
4. All existing JavaScript and TypeScript classifier tests pass unchanged.

### FR-9: CI enforces typecheck and lint
**Objective:** Type and lint regressions must fail CI instead of relying on rule text.
**EARS Specification:** WHEN CI runs the `test-linux` or `test-macos` job, the job SHALL run build, `npm run typecheck`, `npm run lint`, and `npm test`, and SHALL fail when any of them exits non-zero.
**Acceptance Criteria:** 1. `.github/workflows/ci.yml` runs `npm run typecheck` and `npm run lint` before `npm test` in both jobs.
2. A deliberate type error or a new lint warning on a branch fails both jobs.

### FR-10: TypeScript strict mode
**Objective:** The compiler must enforce the strictness that the coding rules claim.
**EARS Specification:** The TypeScript configuration SHALL enable `strict`, `noImplicitReturns`, and `noEmitOnError`, and `npm run typecheck` and `npm run build` SHALL exit 0 under it.
**Acceptance Criteria:** 1. `tsconfig.json` sets `strict: true`, `noImplicitReturns: true`, and `noEmitOnError: true`, and sets no individual strict-family flag to `false`.
2. `npm run typecheck` and `npm run build` exit 0, and fixes for the 39 baseline errors change no tested behavior.

### FR-11: Lint no-new-warnings ratchet
**Objective:** New lint warnings must be blocked without requiring the 324 legacy warnings to be fixed first.
**EARS Specification:** WHEN `npm run lint` runs, the system SHALL fail IF the warning count for any file and rule exceeds the committed baseline, and SHALL print each regression as `file`, `rule`, baseline count, current count, and a remediation line.
**Acceptance Criteria:** 1. A committed baseline records per-file, per-rule warning counts for the 324 baseline warnings.
2. Adding one warning to any file, including a file absent from the baseline, makes `npm run lint` exit non-zero with the regression printed.
3. Removing warnings passes, and the output tells the maintainer how to lower the baseline. The lowering command never raises any count.
4. Lint errors still fail as in 6.0.0.

### FR-12: Steering matches the shipped server
**Objective:** Steering documents must describe the current server, and drift must be caught automatically.
**EARS Specification:** The `.spec/steering/` documents SHALL state the current MCP tool count and the `package.json` version, and `documentation-consistency.test.ts` SHALL fail when `.spec/steering/tech.md` disagrees with either.
**Acceptance Criteria:** 1. `.spec/steering/tech.md` states 17 tools, the current `package.json` version, verified execution evidence, and JEV.
2. Each other `.spec/steering/*.md` file is checked, and every stale tool count or version is corrected.
3. Changing the version in `package.json` without updating `tech.md` fails the documentation-consistency test.

### FR-13: Isolated workspaces for parallel slices
**Objective:** Parallel implementation slices must not share a working tree.
**EARS Specification:** WHEN `sdd-implement` would run two or more slices in parallel, the Skill SHALL require one separate git worktree per slice, and SHALL NOT offer parallel project-agent mode while evidence mode is `verified`.
**Acceptance Criteria:** 1. `skills/sdd-implement/SKILL.md` states the one-worktree-per-slice requirement and the verified-mode restriction.
2. `agents/implementer.md` requires the slice to run only in its assigned worktree and to return a blocker if none is assigned.
3. `simple-task` and `sdd-test-gen` contain no text that permits parallel slices in one working tree.
4. `docs/WORKFLOW.md` and `docs/MODEL-ROUTING.md` describe the restriction.

### FR-14: Stop-list and retry budget
**Objective:** Agents must stop before high-cost or irreversible actions and before unbounded retry loops.
**EARS Specification:** The `sdd-implement` Skill and the `implementer` agent SHALL require explicit user confirmation in the current turn before deploying or publishing, deleting data outside the task's artifacts, force-pushing or rewriting shared history, sending external messages, or changing credentials, and SHALL require a recorded blocker after 3 failed GREEN attempts on one task or before changes outside the task's planned artifacts.
**Acceptance Criteria:** 1. Both files list the five stop-list actions and the retry and scope limits.
2. `canonical-assets.test.ts` asserts that the stop-list and the retry limit are present in both files.

### FR-15: Prune Layer 4 rule text
**Objective:** Always-active rules must contain only project-specific guidance that changes decisions.
**EARS Specification:** The four files in `rules/` SHALL total at most 6,000 bytes, SHALL keep the headings asserted by `JevQuestionCatalog.test.ts`, and SHALL contain no statement that contradicts the repository's configuration or conventions.
**Acceptance Criteria:** 1. `rules/coding-style.md`, `rules/error-handling.md`, `rules/security.md`, and `rules/testing.md` together are at most 6,000 bytes (down from 10,759).
2. `JevQuestionCatalog.test.ts` passes unchanged.
3. No rule states a convention the repository does not follow, such as kebab-case source file names.
4. A unit test asserts the 6,000-byte total.

### FR-16: Retire paper hooks
**Objective:** Hook files must not describe enforcement that does not exist.
**EARS Specification:** The canonical `hooks/` directory SHALL NOT contain `pre-tool-use/validate-sdd-workflow.md` or `pre-tool-use/check-test-coverage.md`, and no remaining hook SHALL reference `--skip-validation`, `SDD_TDD_STRICT`, or a removed hook.
**Acceptance Criteria:** 1. Both files are removed from `hooks/`, and a Claude Code reinstall removes previously installed managed copies.
2. `hooks/session-end/remind-uncommitted-changes.md` no longer references `validate-sdd-workflow`.
3. A unit test fails if any canonical hook contains `--skip-validation` or `SDD_TDD_STRICT`.

### FR-17: Correct stale Skill wording
**Objective:** Skill text must match what the validator accepts.
**EARS Specification:** The `sdd-requirements` Skill SHALL describe Acceptance Criteria as a numbered list that may start on the label line or on the following lines.
**Acceptance Criteria:** 1. `skills/sdd-requirements/SKILL.md` no longer says "at least one numbered item on the same line".
2. A test confirms the validator accepts both the same-line and the next-line forms.

### FR-18: `sdd-jev-check` red evidence is optional when engine RED exists
**Objective:** The tool schema must not demand data the service ignores.
**EARS Specification:** WHEN `sdd-jev-check` receives `check: "red"` without `evidence`, the system SHALL use the task's engine-observed RED when one exists, and SHALL reject the request with a named error that asks for `evidence` when none exists.
**Acceptance Criteria:** 1. The `red` schema requires `featureName`, `taskNumber`, and `testName`, but not `evidence`.
2. `check: "red"` without `evidence` succeeds for a task with engine RED.
3. `check: "red"` without `evidence` and without engine RED returns the named error, and `sddJevCheckTool.test.ts` asserts this case.

### FR-19: Honest verification and review reporting
**Objective:** Reports must state what was not verified, and review findings must be reproducible.
**EARS Specification:** The `sdd-implement` and `simple-task` Skills SHALL require an "Unverified / Could Not Run" report section listing each check not run with its reason, or `None`, and the `sdd-review` Skill SHALL require each behavioral finding to cite a reproducible command or test, or be labeled unconfirmed.
**Acceptance Criteria:** 1. The two implementation Skills name the "Unverified / Could Not Run" section in their output contract.
2. `sdd-implement` requires a decision log in its report when a run covers 2 or more tasks.
3. `sdd-review` contains the reproducible-proof requirement and the unconfirmed label.
4. `canonical-assets.test.ts` asserts these phrases.

### FR-20: Environment-correction Skill
**Objective:** Repeated agent failures must become stronger environment checks instead of more prose.
**EARS Specification:** WHEN a user invokes `/sdd-correct` with a failure description, the Skill SHALL log the failure with its occurrence count, choose the strongest feasible tier in the order structure, lint/type/CI, test/verification, rule text, add rule text only on the second occurrence unless the failure is irreversible or security-relevant, and list rules made obsolete by the fix for deletion.
**Acceptance Criteria:** 1. `skills/sdd-correct/SKILL.md` exists with `disable-model-invocation: true`, at most 4,000 bytes, the Execution report line, and the four tiers in order.
2. The correction log lives at `.spec/corrections.md`, which steering and context loading never include automatically.
3. The Skill requires explicit user approval before it adds or deletes rule text.
4. Claude Code, Codex, and OMP installs render the Skill, and the render baseline and Skill counts in tests and documentation are updated.

### FR-21: Skill blind-test rubric
**Objective:** Structural Skill edits must be checked against agent behavior on realistic tasks, not only against bytes.
**EARS Specification:** The repository SHALL provide a blind-test kit with at least 3 realistic task fixtures and a transcript inspection checklist, and the contributor documentation SHALL require running it before merging a structural Skill edit.
**Acceptance Criteria:** 1. Each fixture names the target Skill, a task prompt, and at least 3 observable checklist items.
2. A unit test validates the fixture format.
3. `docs/WORKFLOW.md` or contributor documentation describes how to run the kit and record the result.

### FR-22: Optional interface spike in design
**Objective:** Design may resolve an uncertain architectural fork with code before the design is frozen.
**EARS Specification:** WHERE the design has an unresolved architectural fork, the `sdd-design` Skill SHALL allow an optional "Interface Spike" section that references throwaway code under `.spec/specs/<feature>/spike/` and the decision it resolved, while design approval stays a separate explicit human decision.
**Acceptance Criteria:** 1. `skills/sdd-design/SKILL.md` describes the optional spike, its location, and that spike code is never imported by production code.
2. Design validation accepts a design with or without the section.
3. Approval behavior is unchanged.

### FR-23: Documentation reflects every change
**Objective:** Users and maintainers must find each new behavior and constraint documented.
**EARS Specification:** WHEN this feature ships, `README.md`, `docs/WORKFLOW.md`, `docs/MODEL-ROUTING.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `CHANGELOG.md`, `AGENTS.md`, and `.spec/steering/tech.md` SHALL describe the behaviors of FR-1 to FR-22 that affect their readers.
**Acceptance Criteria:** 1. `docs/WORKFLOW.md` documents each new error code with its cause and remediation, `evidence.verifyCommand`, inline-eval rejection, fingerprints, drift, and `sdd-correct`.
2. `CHANGELOG.md` has an entry listing all FRs by behavior.
3. `documentation-consistency.test.ts` passes, with the tool count still 17.

## Non-Functional Requirements

### NFR-1: Backward compatibility
**Objective:** Existing projects must keep working without migration.
**EARS Specification:** The system SHALL load every existing `spec.json` without migration, and new evidence fields SHALL be optional and additive.
**Acceptance Criteria:** 1. All features under `.spec/specs/` load and report status after the change.
2. Tasks recorded before this feature, without fingerprints, are never blocked by FR-2 to FR-5 checks.
3. MCP tool input schemas only add optional inputs or relax requirements, and the tool count stays 17.

### NFR-2: Actionable error messages
**Objective:** Every new rejection must tell the agent exactly how to recover.
**EARS Specification:** Each new recoverable `GovernanceError` code SHALL have a message of at most 2 sentences of at most 25 words each, starting with an imperative verb.
**Acceptance Criteria:** 1. `message-clarity-bounds.test.ts` and `message-contract.test.ts` pass with `message-contract-baseline.json` updated for the new codes.
2. Each new code is listed in `WorkflowErrors.ts` and documented in `docs/WORKFLOW.md`.

### NFR-3: Bounded overhead
**Objective:** Fingerprinting must not noticeably slow task recording.
**EARS Specification:** Each fingerprint computation SHALL use a git timeout of at most 10 s and SHALL add at most 2 s to a task action on this repository.
**Acceptance Criteria:** 1. A test with a stubbed slow `GitPort` shows that a timeout yields `unavailable` and the action proceeds.
2. A measurement on this repository shows at most 2 s of added time per action.

### NFR-4: Token and text budgets
**Objective:** Hardening must not grow default context.
**EARS Specification:** Each Skill SHALL stay at or below 4,000 bytes, all Skills together SHALL stay at or below 40,000 bytes, and no Skill SHALL start a verifier subagent by default.
**Acceptance Criteria:** 1. `canonical-assets.test.ts` passes with the new `sdd-correct` Skill included.
2. Skill text that no longer fits moves to the Skill's `REFERENCE.md`.

### NFR-5: Human gates unchanged
**Objective:** Explicit human approval remains the final control for high-cost decisions.
**EARS Specification:** The system SHALL keep the behavior of `sdd-approve` and `sdd-review-test-cases` unchanged.
**Acceptance Criteria:** 1. Existing approval and test-case review tests pass without modification.

### NFR-6: Cross-platform behavior
**Objective:** The new checks must behave the same on Linux, macOS, and Windows.
**EARS Specification:** Fingerprints, artifact matching, and inline-eval detection SHALL normalize paths to forward slashes and program names without directory or `.exe`, `.cmd`, or `.bat` suffix.
**Acceptance Criteria:** 1. Unit tests cover Windows-style program paths and artifact paths.
2. The Linux and macOS CI jobs pass.
