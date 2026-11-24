<!-- sdd-context schema=2 phase=implementation source=15487039f968cce0082ec79e1fc9612d45e3a29d969efbd166c555299cacb474 payload=0c5d1b899dfa66d826288f265ec72999b1f1fcc8cc476d4608b9ac53993c8dae -->
# SDD Context: workflow-trust-hardening

## Workflow State
- Effective phase: implementation
- Phase status: approved
- Requirements: approved
- Design: approved
- Tasks: approved
- Test-case review: reviewed

## Implementation Progress
- Revision: 102
- Completed: 26/26
- Active: 0
- Blocked: 0

## Next Action
Implementation is complete.

## Source References
- requirements.md
- design.md
- tasks.md

## Payload Estimate
- Payload estimated tokens: 02043

## Selected Context
- # Requirements: Workflow Trust Hardening
- ## Overview
- ### Problem
- A review of `sdd-mcp` 6.0.0 against the five-layer defense model (Structure, Machine Checks, Run & Verify, Minimal Text, Human Review) found gaps where trust depends on prose instead of structure:
- `record-green` succeeds after a RED that the engine classified as `setup` (`WorkflowEngineService.assertEvidenceActionAllowed`), so a test that never failed on a real assertion can unlock GREEN.
- Evidence is not bound to the code it verified. Edits after GREEN or after `complete` are invisible, `record-green` may run a different command than `record-red`, and `complete` trusts the caller's `affectedArtifacts`.
- Verified mode accepts inline-eval commands (`node -e`, `python3 -c`) that prove nothing about the project. No project-fixed verification command exists. The RED classifier only recognizes JavaScript and TypeScript output.
- CI runs `build` and `test` only. `tsconfig.json` disables strict mode while `rules/coding-style.md` requires it. Lint has 324 warnings and no guard against new ones. `.spec/steering/tech.md` still describes a 16-tool 5.0.0 server.
- Parallel implementation slices share one working tree. Skills have no stop-list, no retry budget, and no required "could not verify" report. Paper hooks reference flags that do not exist. No workflow turns repeated agent failures into stronger environment checks.
- ### Goal
- Move each identified control to the strongest feasible layer: the engine rejects invalid evidence states, CI blocks type and lint regressions, and skill text keeps only judgment calls. Human approval gates stay unchanged.
- ### Users
- The implementing agent (Claude Code, Codex, OMP) driving `sdd-implement`, `simple-task`, and the new `sdd-correct` Skill.
- The human reviewer reading `sdd-status`, `sdd-commit` output, and CI results.
- The repository maintainer configuring `.spec/sdd-config.json` and maintaining CI, rules, hooks, and documentation.
- ### Scope
- P0: setup-RED gate, working-tree fingerprint binding, RED→GREEN continuity, observed-artifact cross-check, post-verification drift reporting, fixed verification command, inline-eval rejection, multi-language RED classification, CI typecheck and lint, TypeScript strict mode, lint no-new-warnings ratchet, steering refres
- P1: worktree isolation for parallel slices, stop-list and retry budget, Layer 4 rule pruning, paper-hook retirement, stale Skill wording, `sdd-jev-check` red schema fix, honest verification and review reporting, the new `sdd-correct` Skill.
- P2 (light): a skill blind-test rubric with fixtures, and an optional interface spike in `sdd-design`.
- Documentation updates for every behavior change.
- ### Out of scope
- Removing legacy root files (`documentGenerator.js`, `specGenerator.js`, `atomicWrite.js`), the `src/utils/moduleLoader.ts` bridge, and splitting `WorkflowEngineService.ts`. These move to a follow-up feature.
- Reducing the 324 pre-existing lint warnings, and linting `src/__tests__/`.
- Running verified evidence inside a git worktree other than the project root.
- Auto-merge, weakening `sdd-approve` or `sdd-review-test-cases`, and any verifier subagent started by default.
- Executing the skill blind-test harness in CI.
- Adding a new MCP tool. The contract stays at 17 tools.
- ### Assumptions
- `GitPort` (`NodeGitAdapter`) and `JevChangeManifest` already provide bounded, shell-free git reads that the fingerprint can reuse.
- Verified evidence mode is the default, and the engine runs evidence commands at the project root only.
- Strict TypeScript with all strict flags on reports 39 errors in 10 non-test files on the 6.0.0 baseline, so strict mode can be enabled in this feature.
- `npm run lint` exits 0 with 324 warnings in 43 files on the 6.0.0 baseline.
- ### Dependencies
- `src/application/services/WorkflowEngineService.ts`, `EvidenceRunner.ts`, `EvidenceSettings.ts`, `RedEvidenceClassifier.ts`, `JevAdvisoryService.ts`, `JevChangeManifest.ts`, `WorkflowErrors.ts`.
- `src/infrastructure/mcp/sddToolDefinitions.ts` and `src/infrastructure/adapters/NodeGitAdapter.ts`.
- `.github/workflows/ci.yml`, `tsconfig.json`, `.eslintrc.cjs`, `package.json` scripts.
- Canonical `skills/`, `agents/`, `rules/`, `hooks/`, `.spec/steering/`, and target installers under `src/cli/`.
- Test contracts: `canonical-assets.test.ts`, `skill-delegation.test.ts`, `JevSkillText.test.ts`, `target-installers.test.ts` with `workflow-skill-render-baseline.json`, `message-clarity-bounds.test.ts`, `message-contract.test.ts` with `message-contract-baseline.json`, `documentation-consistency.test.ts`, `JevQuestionCat
- ### Success metrics
- Each P0 bypass (setup RED unlocking GREEN, unchanged code between RED and GREEN, different GREEN command, unlisted observed artifact, inline eval, unflagged post-verification edit) has an automated test that fails on the 6.0.0 code and passes after this feature.
- CI runs build, typecheck, lint, and test on both the Linux and macOS jobs, and any new type error or new lint warning fails the job.
- `tsc --noEmit` passes with `strict: true` and `noImplicitReturns: true`, and the lint warning count for every file and rule is at most its committed baseline.
- Documentation-consistency, skill size-budget, render-baseline, and message-contract tests pass. `sdd-approve` and `sdd-review-test-cases` tests pass unchanged.
- ## Functional Requirements
- ### FR-1: Setup-classified RED cannot unlock GREEN
- **Objective:** A RED that failed for setup reasons (missing module, syntax, type, or compile error) must not count as proof of missing behavior.
- **EARS Specification:** WHEN `sdd-spec-impl` receives `record-green` for a task whose stored RED has `source: "engine"` and `redClassification: "setup"`, the engine SHALL reject the action with a named `GovernanceError`, run no command, and leave `spec.json` byte-identical.
- **Acceptance Criteria:** 1. A verified-mode test that records a RED whose output matches a setup pattern and then calls `record-green` receives the named error code, and `spec.json` is byte-identical before and after.
- The error message has at most 2 sentences of at most 25 words each, starts with an imperative verb, and tells the agent to fix the test setup and record RED again.
- After a setup RED, `record-red` with output classified `assertion` succeeds, and the following `record-green` succeeds.
- A RED classified `assertion` or `ambiguous` still allows `record-green`, and RED records with `source: "caller"` (self-reported mode) keep their 6.0.0 behavior.
- ### FR-2: Content-addressed working-tree fingerprint
- **Objective:** Every engine-observed evidence record must identify the exact code it observed.
- **EARS Specification:** WHEN the engine records `start`, `record-red`, `record-green`, or `complete` in a git repository, the engine SHALL store a working-tree fingerprint that is a content address of all tracked and untracked non-ignored files, excluding paths under `.spec/specs/`.
- **Acceptance Criteria:** 1. Two fingerprints taken with identical file content are equal, including when the content was committed between the two readings.
- Changing, adding, or deleting one non-ignored file outside `.spec/specs/` changes the fingerprint, and changing only a file under `.spec/specs/` or a git-ignored file does not.
- The fingerprint stores no file content, and git runs through `GitPort` without a shell.
- ### FR-3: RED-to-GREEN continuity
- |---|---|
- | FR-5 | D-6 |