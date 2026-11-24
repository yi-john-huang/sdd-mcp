# Design: Workflow Trust Hardening

## Overview

This design moves the controls from the approved requirements to the strongest feasible layer:

- **Engine (Layer 1, Structure):** `WorkflowEngineService` rejects setup-RED-to-GREEN, GREEN with a different command or an unchanged tree, unmatched observed artifacts, and completion with a command other than the project verify command. `EvidenceRunner` rejects inline-eval commands.
- **Machine checks (Layer 2):** CI runs typecheck and lint, TypeScript runs in strict mode, and a per-file, per-rule lint baseline blocks new warnings.
- **Run and verify (Layer 3):** every task action binds to a content-addressed working-tree fingerprint, and `sdd-status` reports drift after the last verification.
- **Minimal text (Layer 4):** rules shrink to project-specific guidance, paper hooks go, and Skills keep only judgment calls: worktree isolation, the stop-list, the retry budget, honest reporting, and the new `sdd-correct` Skill.
- **Human review (Layer 5):** approval gates do not change. Drift is shown at commit time, and the human decides.

No MCP tool is added. Tool schemas only relax (`sdd-spec-impl` `complete` without `run`, `sdd-jev-check` `red` without `evidence`). `spec.json` stays schema version 5 with optional additive fields.

## Requirements Traceability

| Requirement | Decisions |
|---|---|
| FR-1 | D-1, D-10 |
| FR-2 | D-2, D-3 |
| FR-3 | D-4, D-10 |
| FR-4 | D-5, D-10 |
| FR-5 | D-6 |
| FR-6 | D-7, D-10 |
| FR-7 | D-8, D-10 |
| FR-8 | D-9 |
| FR-9 | D-11 |
| FR-10 | D-12 |
| FR-11 | D-13 |
| FR-12 | D-14 |
| FR-13 | D-15 |
| FR-14 | D-15 |
| FR-15 | D-16 |
| FR-16 | D-17 |
| FR-17 | D-18 |
| FR-18 | D-19 |
| FR-19 | D-15 |
| FR-20 | D-20 |
| FR-21 | D-21 |
| FR-22 | D-22 |
| FR-23 | D-23 |
| NFR-1 | D-3, D-24 |
| NFR-2 | D-10 |
| NFR-3 | D-2 |
| NFR-4 | D-15, D-20 |
| NFR-5 | D-24 |
| NFR-6 | D-2, D-8 |

## Architecture and Data Flow

### Data ownership
- `spec.json` (owned by `WorkflowEngineService`) holds task state, evidence, and the new optional tree bindings. Only the engine writes it.
- `.spec/sdd-config.json` (owned by the project maintainer) holds `evidence.verifyCommand`. `EvidenceSettings` reads it.
- Git (owned by the user) is read only, through `GitPort`. The engine never stages, commits, or writes git objects. `git hash-object` without `-w` writes nothing.
- `scripts/lint-baseline.json` (owned by the maintainer) holds lint warning counts. Only `npm run lint:baseline` rewrites it, and only downward.
- `.spec/corrections.md` (owned by the user through `sdd-correct`) holds the correction log. No loader reads it automatically.

### Task action flow (after this feature)

```
sdd-spec-impl(action)
  └─ recordTaskProgress  [evidence-run lock, per feature]
       1. settings = resolveEvidenceSettings(env, config)            (D-7)
       2. effectiveRun = request.run ?? verifyCommand (complete only) (D-7)
       3. tree = observeTree(git, projectRoot)  for start|red|green|complete   (D-2)
       4. [feature lock, read]  assertNoApprovedArtifactDrift
                                assertTransition(spec, request, effectiveRun, tree, settings)
                                  ├─ setup-RED gate              (D-1)
                                  ├─ argv continuity + tree change (D-4)
                                  └─ verify-command match         (D-7)
       5. if effectiveRun: EvidenceRunner.run → allowlist, inline-eval policy (D-8), spawn
       6. [feature lock, write] assertTransition again (current revision)
                                complete → artifact cross-check vs start tree (D-5)
                                persist evidence + working_tree / start_tree (D-3)
```

The tree is observed before the command runs, outside the feature lock and inside the evidence-run lock. The feature lock therefore stays free for status reads during git work and during the command. The commit step repeats every check against the current revision, so a concurrent change between steps 4 and 6 is caught. The artifact cross-check in step 6 needs extra git reads. It runs before the write lock is taken, as part of step 3 for `complete`, and its result is passed in.

### Status flow

```
sdd-status(featureName)
  └─ getFeatureStatus
       [feature lock, read] buildStatus → last completed bound tree, verifyCommand, per-task binding
       [no lock]             observeTree + changedPaths → verificationDrift   (D-6)
```

`listFeatureStatuses` (status without a feature name) skips the git work and reports no drift. This keeps the cost from growing with the number of features.

## Components and Interfaces

### D-1: Setup-classified RED blocks GREEN
**Covers:** FR-1
**Decision:** `assertEvidenceActionAllowed` gains one check for `record-green`. When `task.evidence.red?.source === 'engine'` and `redClassification === 'setup'`, it throws `GovernanceError('RedSetupFailure', …)`. The check runs in `assertTransition`, before any command runs, and again at commit. The existing `canRecordRed` rule already lets RED be recorded again over a setup or ambiguous engine RED, so the recovery path needs no change. Caller-sourced RED (self-reported mode) is not checked, because its classification comes from agent-typed text.
**Failure behavior:** Rejection happens before the evidence runner is called. Nothing is written, so `spec.json` stays byte-identical.
**Verification:** An engine test records a RED whose fake runner output contains `Cannot find module`, then calls `record-green` and asserts `RedSetupFailure`, an unchanged `spec.json` byte hash, and zero runner calls. A second RED with `Expected: 1 Received: 2` output then allows GREEN. Self-reported and `ambiguous` cases keep passing.

### D-2: Content-addressed working-tree fingerprint
**Covers:** FR-2, NFR-3, NFR-6
**Decision:** Add `src/application/services/WorkingTreeFingerprint.ts` with pure helpers over `GitPort`:

```ts
export type TreeObservation =
  | { status: 'bound'; sha256: string; head: string | null; dirty: ManifestEntry[]; dirtyTruncated: boolean; prefix: string }
  | { status: 'unavailable'; reason: 'not-a-git-repo' | 'git-unavailable' | 'git-failed' | 'timeout' | 'too-many-changes' };

export function observeTree(git: GitPort | undefined, projectRoot: string, deadlineMs = 10_000): Promise<TreeObservation>;
export function changedPaths(git: GitPort, projectRoot: string, from: BoundTree, current: BoundTree): Promise<{ paths: string[] } | { status: 'unavailable' }>;
```

The algorithm builds the full content map that `git add -A` would produce, without writing to the index:
1. `rev-parse --show-prefix` finds the project's subdirectory inside the repository. A failure means `not-a-git-repo`.
2. `rev-parse --verify --quiet HEAD` reads `head`. It is `null` in an unborn repository.
3. `ls-tree -r -z --full-tree HEAD` gives the base map from path to blob or gitlink id. An unborn HEAD gives an empty map.
4. The dirty entries come from `JevChangeManifest`. A new export, `dirtyEntries(git, root)`, wraps the existing `reviewEntries` and returns tracked-modified, deleted, and untracked non-ignored paths with the tokens `git add` would store: blob ids from `hash-object`, symlink blobs, gitlink commits, or `deleted`.
5. The base map is overlaid with the dirty entries (`deleted` removes a path). The map is restricted to the project prefix with the prefix stripped, and paths under `.spec/specs/` are dropped. The result is serialized as sorted `path\0token\n` lines and hashed with SHA-256.

Equal content gives an equal hash whether or not it was committed, because tokens are git object ids of content. HEAD only selects the base. `dirty` keeps at most 200 entries (after the `.spec/specs/` exclusion), so that changed paths can be rebuilt later. Past 200 entries, `dirtyTruncated` is `true` and `dirty` is empty. More than 2,000 dirty paths, which `JevChangeManifest` already reports as unavailable, give `too-many-changes`.

`changedPaths` rebuilds the earlier map from `ls-tree -r -z --full-tree <from.head>` overlaid with `from.dirty`, and diffs it against the current map. It reports `unavailable` when `from.dirtyTruncated` is set or the old HEAD no longer exists.

The whole observation runs under a 10 s deadline (`Promise.race`), and each git call keeps `NodeGitAdapter`'s 3 s timeout. Missing `GitPort` gives `git-unavailable`. `GitPort` becomes an optional constructor dependency of `WorkflowEngineService` (`@inject(TYPES.GitPort) @optional()`), wired in `container.ts`. Paths use forward slashes, as git already reports them on every platform.
**Failure behavior:** Any git failure or deadline yields `unavailable` with a reason. The action proceeds, and checks that need the tree (D-4 tree part, D-5, D-6) are skipped. The fingerprint stores ids and paths only, never file content. Git runs through `execFile`, with no shell.
**Verification:** Unit tests against a temporary git repository check four cases. The hash is stable across a commit of identical content. It changes on edit, add, and delete. It is unchanged by edits under `.spec/specs/` and by ignored files. Paths are prefix-relative when the project is a subdirectory. A stub `GitPort` that never resolves yields `timeout` within the deadline. A stub that fails yields `git-failed`. A timing test on this repository asserts that `observeTree` finishes within 2 s.

### D-3: Persistence of tree bindings
**Covers:** FR-2, NFR-1
**Decision:** `spec.json` gains optional snake_case fields. The schema version stays 5.
- `tasks[n].start_tree`: set on `start` from `pending` only. Resuming from `blocked` keeps the original value.
- `tasks[n].evidence.{red,green,verification}.working_tree`: set on each evidence action.

The stored shape is `{ status: 'bound', sha256, head, prefix, dirty?: [{path, token}], dirty_truncated? }` or `{ status: 'unavailable', reason }`. Only `start_tree` and `verification.working_tree` store `dirty`, because only D-5 and D-6 rebuild path sets. RED and GREEN store `sha256`, `head`, and `prefix` only. `normalizeV5Evidence` and the task parser (around `WorkflowEngineService.ts` L1390–1420) read and validate these fields. An unknown `status`, a non-hex hash, or a path that fails `assertPersistedArtifactPaths` raises `StateInvariantViolation`, consistent with the existing fields. The serializer writes them back unchanged. Domain types gain `TreeBinding` in `src/domain/types.ts`, and `ExecutionEvidence` gains `workingTree?: TreeBinding`.

`sdd-status` `implementation.tasks[n]` gains `binding: 'bound' | 'unbound'`. A task is `bound` when its latest evidence record (or its `start_tree` if it has no evidence) has `status: 'bound'`.
**Failure behavior:** Missing fields on existing specs read as "no binding". Every check treats "no binding" like `unavailable`, so old specs are never blocked.
**Verification:** Round-trip tests load every `spec.json` under `.spec/specs/` without error. A spec with each new field reloads byte-stable. Malformed new fields raise `StateInvariantViolation`.

### D-4: RED-to-GREEN continuity
**Covers:** FR-3
**Decision:** In verified mode, when the stored RED has `source: 'engine'` and an `argv`, `assertTransition` for `record-green` compares `effectiveRun.argv` with `red.argv` element by element. Any difference throws `EvidenceContinuityViolation` with `details: { reason: 'argv-mismatch', expectedArgv }` before the command runs. When the RED `working_tree` and the newly observed tree are both `bound` and have equal `sha256`, it throws `EvidenceContinuityViolation` with `details: { reason: 'unchanged-tree' }`, also before the run. Self-reported mode skips both checks.
**Failure behavior:** Both rejections happen before the runner starts and write nothing. A RED without `argv` or without a bound tree skips the matching part only.
**Verification:** Engine tests with a fake runner and a stub `GitPort` cover four cases: different argv is rejected with zero runner calls, equal trees are rejected with an unchanged spec hash, a changed tree is accepted, and an unbound RED with equal argv is accepted. An e2e test in `governed-workflow.e2e.test.ts` runs the real flow against a temporary git repository: write a failing test, record RED, edit the source, record GREEN.

### D-5: Observed artifacts cross-checked against git
**Covers:** FR-4
**Decision:** For `complete`, when `task.start_tree` is `bound` and the current tree is `bound`, the engine computes `changedPaths(start_tree, current)` in step 3 of the flow. At commit, every normalized `affectedArtifacts` entry must either equal a changed path or be a directory prefix (`entry + '/'`) of one. Entries under `.spec/specs/` are accepted when `fileSystem.exists` returns true. Unmatched entries throw `ObservedArtifactMismatch` with `details: { unmatched: first20 }`. When `changedPaths` is `unavailable`, or either tree is unbound, the 6.0.0 rule applies: at least one artifact when artifacts are planned. Changes committed after `start` count, because the diff is content-to-content and HEAD only selects the base.
**Failure behavior:** Rejection writes nothing, and the verification command does not run, because the check also runs in the pre-run `assertTransition` with the precomputed path set.
**Verification:** Engine tests against a temporary git repository cover five cases: an unchanged path is rejected with the path listed, changed files and their parent directories are accepted, a change committed mid-task is accepted, a `.spec/specs/` path that exists is accepted, and a task without `start_tree` follows the old rule.

### D-6: Post-verification drift in status and commit
**Covers:** FR-5
**Decision:** `getFeatureStatus` reads, under the feature lock, the completed task whose `verification.observedAt` is latest and whose `verification.working_tree` is `bound`. After releasing the lock, it observes the current tree. When the `sha256` values differ, it calls `changedPaths` and adds `verificationDrift: { taskNumber, changedPaths: first50, pathsTruncated: boolean, pathsUnavailable?: true }` to the status. Status never writes `spec.json`. The `sdd-commit` Skill gains one sentence: "Read status first; when it reports verification drift, show the drift line and label the commit content unverified, then continue." `listFeatureStatuses` does not compute drift.
**Failure behavior:** If the current tree is `unavailable`, status omits `verificationDrift` and adds `verificationBinding: 'unavailable'`, so absence is never read as "verified".
**Verification:** Engine tests against a temporary git repository cover three cases: complete then edit reports the task and the file, complete then commit with no edit reports no drift, and the `spec.json` byte hash is unchanged by a status read. The `canonical-assets.test.ts` regex for `sdd-commit` gains `/verification drift/i`.

### D-7: Project verify command
**Covers:** FR-6
**Decision:** `EvidenceSettings` gains `verifyCommand?: readonly string[]`, resolved from `.spec/sdd-config.json` `evidence.verifyCommand`. A value is valid when it is a non-empty array of strings that passes the exported `validateArgv` (at most 64 arguments, at most 4,096 bytes per argument, no NUL or line break), whose `programName` is in `allowedCommands`, and for which `inlineEvalFlag` (D-8) returns nothing. An invalid value adds one warning to `settings.warnings` and resolves to `undefined`. There is no environment override.

In `recordTaskProgress`, for `complete` in verified mode with `verifyCommand` set, `effectiveRun` is `request.run ?? { argv: verifyCommand }`. If `request.run` is present and differs element by element, `assertTransition` throws `VerifyCommandMismatch` with `details: { verifyCommand }`. The `sdd-spec-impl` schema drops `complete` from the "`evidence` or `run` required" rule. The engine still throws `SelfReportedEvidenceRejected` when verified mode has neither `run` nor `verifyCommand`. `sdd-status` gains `verifyCommand` when it resolves. The compact handoff (in `ContextCompactionService`, implementation phase) gains the line `- Verify command: <argv joined by spaces>`. `skills/sdd-implement` says that COMPLETE omits `run` when a verify command is configured.
**Failure behavior:** A config read error behaves as in 6.0.0 (defaults plus a warning). A command that changed between steps 4 and 6 is caught by the commit-time re-check.
**Verification:** Settings tests cover a valid command, a non-array value, a disallowed program, and inline eval, each producing one warning. Engine tests cover `complete` without `run` running the configured argv, a mismatched `run` being rejected with zero runner calls, and an unset command keeping the 6.0.0 behavior. A schema test accepts `complete` without `run` or `evidence`.

### D-8: Inline-eval policy
**Covers:** FR-7, NFR-6
**Decision:** Add a pure function `inlineEvalFlag(argv: readonly string[], platform?): string | undefined` in `src/application/services/EvidenceCommandPolicy.ts`. `EvidenceRunner.run` calls it after the allowlist check, only in verified mode (self-reported mode never reaches the runner). A hit throws `EvidenceCommandInlineEval` with `details: { flag }`. Program names use the existing `programName`, which drops the directory and the `.exe`, `.cmd`, or `.bat` suffix and lowercases on Windows. The rules:
- **`node` and `bun`:** reject any argument before a literal `--` that equals `-e`, `-p`, `-pe`, `-ep`, `--eval`, or `--print`, or starts with `--eval=` or `--print=`. Node value-taking options make a "stop at the first positional" rule unreliable, so all arguments are scanned. A rare false positive (`node script.js -e`) is accepted, and the error tells the user to use a test file.
- **`python` and `python3`:** scan arguments up to the first positional or `-m`, skipping the values of `-W` and `-X`. Reject `-c` or any single-dash cluster that contains `c` (for example `-Bc`).
- **`npx`, and `npm exec` or `npm x`:** scan arguments up to the first positional, skipping the values of `-p` and `--package`. Reject `-c`, `--call`, or `--call=`. If the first positional (after an optional `--`) is `node`, `bun`, `python`, or `python3`, apply that program's rule to the remaining arguments.

The allowlist and the verify command (D-7) remain the primary control. This list is a backstop against known one-line bypasses. It is not a sandbox.
**Failure behavior:** The rejection happens before `ProcessPort.run`, so no process starts. `governed-workflow.e2e.test.ts` (lines 186, 198, 219) switches from `node -e` to a fixture project with a real test file run by `node --test`.
**Verification:** A table-driven unit test covers each rejected form, including `C:\\Program Files\\nodejs\\node.exe -e`, `NODE.EXE --eval=1` on win32, `python3 -Bc`, `npx -c`, `npx node -e`, and `npm exec -- python -c`. It also covers each accepted form: `node --test path`, `python3 -m pytest path`, `npx jest -c jest.config.js`, and `npm test`. A runner test asserts zero `ProcessPort` calls on rejection.

### D-9: Multi-language RED classifier
**Covers:** FR-8
**Decision:** Extend `SETUP_PATTERNS` and `ASSERTION_PATTERNS` in `RedEvidenceClassifier.ts`, keeping the rule that setup wins.

| Ecosystem | Setup patterns | Assertion patterns |
|---|---|---|
| Python | `ModuleNotFoundError`, `ImportError`, `IndentationError`, `ERROR collecting`, `errors? during collection` | existing `AssertionError`, plus `^E\s+assert ` and `FAILED \S+::` |
| Go | `undefined: \w`, `\[build failed\]`, `cannot find package`, `no required module provides package`, `\[setup failed\]` | `--- FAIL:` together with `_test\.go:\d+:` |
| Rust | `error\[E\d{4}\]`, `could not compile` | `assertion .*failed`, `panicked at .*assert` |
| JVM | `cannot find symbol`, `COMPILATION ERROR`, `Compilation failed`, `ClassNotFoundException`, `NoClassDefFoundError` | `AssertionFailedError`, `expected:<.*> but was:<.*>`, `ComparisonFailure` |
| .NET | `error CS\d{4}`, `error MSB\d{4}`, `Build FAILED` | `Assert\.\w+\(\) Failure`, `Expected: .*\n\s*(But was|Actual): ` |

Patterns are named for `matchedPattern`. Fixtures live in `src/__tests__/unit/services/fixtures/red-classifier/<ecosystem>-{setup,assertion}-{1,2}.txt`, at least 2 of each kind per ecosystem, with real runner output trimmed to the relevant lines.
**Failure behavior:** Unmatched output stays `ambiguous`, and `ambiguous` does not block GREEN (FR-1.4).
**Verification:** A fixture-driven test reads every file and asserts the classification named in the file name. Existing classifier tests pass unchanged.

### D-10: Error codes and message contract
**Covers:** FR-1, FR-3, FR-4, FR-6, FR-7, NFR-2
**Decision:** Add five codes to `GovernanceErrorCode` and `PUBLIC_ERROR_CODES` in `WorkflowErrors.ts`:

| Code | Raised by | Message |
|---|---|---|
| `RedSetupFailure` | engine | "Fix the test setup so the test fails on an assertion. Record RED again before recording GREEN." |
| `EvidenceContinuityViolation` (argv) | engine | "Run GREEN with the same run.argv that RED used. Record RED again first if the test command must change." |
| `EvidenceContinuityViolation` (tree) | engine | "Change the implementation before recording GREEN. The working tree matches the tree RED observed." |
| `ObservedArtifactMismatch` | engine | "Name only artifacts that changed since the task started. Remove the listed paths or make the change first." |
| `VerifyCommandMismatch` | engine | "Omit run, or pass the project verify command for completion. The configured command is in details.verifyCommand." |
| `EvidenceCommandInlineEval` | runner | "Run a project test file instead of inline code. Remove the flag named in details.flag." |

Each message has at most 2 sentences of at most 25 words and starts with a verb from the `ACTION_VERBS` list. "Omit" is added to that list. The four engine codes are added to `RECOVERABLE_ENGINE_CODES` in `message-clarity-bounds.test.ts`. `scripts/generate-message-baseline.ts` regenerates `message-contract-baseline.json`.
**Failure behavior:** None. These are static strings.
**Verification:** `message-clarity-bounds.test.ts` and `message-contract.test.ts` pass with the refreshed baseline. A test asserts every new code is in `PUBLIC_ERROR_CODES`.

### D-11: CI runs typecheck and lint
**Covers:** FR-9
**Decision:** In `.github/workflows/ci.yml`, the `test-linux` container command becomes `node --version && id && npm ci && npm run build && npm run typecheck && npm run lint && npm test`. `test-macos` gains `- run: npm run typecheck` and `- run: npm run lint` steps between build and test.
**Failure behavior:** A non-zero exit fails the job. `sh -c` with `&&` already propagates the failure.
**Verification:** A unit test reads `ci.yml` and asserts both jobs run `typecheck` and `lint` before `test`. A throwaway branch with one deliberate type error and one new warning shows both jobs failing, and the result is recorded in the PR description.

### D-12: TypeScript strict mode
**Covers:** FR-10
**Decision:** In `tsconfig.json`, set `strict: true`, `noImplicitReturns: true`, and `noEmitOnError: true`. Delete the explicit `noImplicitAny`, `strictNullChecks`, and `strictFunctionTypes` `false` entries. Leave `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noFallthroughCasesInSwitch` as they are, because they are outside the strict family. Fix the 39 baseline errors in their 10 files with type annotations, explicit returns, and null guards. Use no `any` and no non-null assertion where a guard is possible. The ts-jest inline tsconfig in `jest.config.js` does not change, so test compilation is unaffected.
**Failure behavior:** `noEmitOnError` keeps `npm run build` from producing `dist/` output from code with type errors.
**Verification:** `npm run typecheck` and `npm run build` exit 0. The full test suite passes with no test changes caused by the type fixes. A unit test asserts the tsconfig flags.

### D-13: Lint no-new-warnings ratchet
**Covers:** FR-11
**Decision:** Add `scripts/lint-ratchet.mjs`. It uses the ESLint Node API with the existing `.eslintrc.cjs` over `src/**/*.ts` and builds counts keyed by `<posix-relative-file>|<ruleId>`. It compares them with `scripts/lint-baseline.json`, a sorted object keyed the same way. A file or key missing from the baseline counts as 0. The script exports the pure functions `countWarnings(results)`, `compare(baseline, current)`, and `lower(baseline, current)`.
- `npm run lint` runs `node scripts/lint-ratchet.mjs`. It exits 1 on any ESLint error, the same as 6.0.0. It also exits 1 on any key where current is greater than baseline, printing `file  rule  baseline → current` and the remediation line `Fix the new warning, or run npm run lint:baseline after removing warnings.`
- `npm run lint:baseline` runs `node scripts/lint-ratchet.mjs --lower`. It writes `min(baseline, current)` per key and drops zero counts, so it never raises a count. A key that is absent from the baseline stays absent, which means 0.

The first baseline is created once by a bootstrap flag `--init`, used only in this feature's task and documented as maintainer-only.
**Failure behavior:** An unreadable or malformed baseline exits 2 with a message naming the file. A missing baseline exits 2 and tells the maintainer to run `--init`.
**Verification:** A unit test in `src/__tests__/unit/scripts/lint-ratchet.test.ts` imports the `.mjs` the same way `context-usage-report.test.ts` does. It checks that an increase fails with the line printed, a new file with one warning fails, a decrease passes, and `lower` never raises a count or adds a key. The baseline totals 324 warnings when created.

### D-14: Steering refresh and drift test
**Covers:** FR-12
**Decision:** Update `.spec/steering/tech.md`: state 17 tools, replace `Current version: 5.0.0` with the `package.json` version, and add verified execution evidence, JEV, strict TypeScript, and the lint ratchet. Review `product.md` and `structure.md`, and fix any stale counts, versions, or paths they contain. Extend `documentation-consistency.test.ts` with a case that reads `package.json` `version` and asserts that `tech.md` contains ``Current version: `<version>` `` and matches the 17-tool pattern.
**Failure behavior:** A version bump without a steering update fails the test, which pushes the release checklist to include steering.
**Verification:** The new test passes. A local trial that changes the version in a copy of the file fails it.

### D-15: Skill and agent text for isolation, stop-list, retry budget, and honest reporting
**Covers:** FR-13, FR-14, FR-19, NFR-4
**Decision:**
- **`skills/sdd-implement/SKILL.md`:**
  - Execution Mode gains: "Parallel slices need one git worktree per slice; while evidence mode is verified, do not offer parallel project-agent mode."
  - Add a `## Stop and Escalate` section: "Get explicit user confirmation in the current turn before deploy or publish, data deletion outside task artifacts, force-push or shared-history rewrite, external messages, or credential changes. After 3 failed GREEN attempts on one task, or before changing files outside the task's planned artifacts, record a blocker and ask."
  - Output requires an `Unverified / Could Not Run` section (each skipped check with its reason, or `None`) and a decision log when the run covers 2 or more tasks.
  - To stay at or below 4,000 bytes, move the REFACTOR detail, the not-applicable-task detail, and the Mandatory Checks list into `skills/sdd-implement/REFERENCE.md`, leaving one pointer line. Keep the regexes required by `canonical-assets.test.ts`, `skill-delegation.test.ts`, and `JevSkillText.test.ts`.
- **`agents/implementer.md`:** "Work only in the assigned worktree; if none is assigned for a parallel slice, return a blocker." It also gets the same stop-list and retry limit, and a fifth result section, `Unverified / Could Not Run`.
- **`skills/simple-task/SKILL.md`:** the output gains `Unverified / Could Not Run`. Confirm that it has no parallel-slice text.
- **`skills/sdd-test-gen/SKILL.md`:** confirm that it has no parallel-slice text, and add nothing if none exists.
- **`skills/sdd-review/SKILL.md`:** "Cite a reproducible command or test for each behavioral finding, or label it unconfirmed."
- **`canonical-assets.test.ts`:** add regexes for `worktree`, `stop` with the five actions, `3 failed GREEN`, `Unverified / Could Not Run`, `decision log`, and `unconfirmed`. Update `implementer.md`'s result-section count.
**Failure behavior:** Text-only. The engine already serializes evidence runs per feature, so a forbidden parallel run in one tree degrades to lock waits rather than corrupt state.
**Verification:** The canonical-asset, delegation, JEV-skill-text, and render-baseline tests pass. Byte budgets hold: each Skill at most 4,000 bytes, and the total at most 40,000 including `sdd-correct`.

### D-16: Prune Layer 4 rules
**Covers:** FR-15
**Decision:** Rewrite the four `rules/*.md` files to at most 6,000 bytes in total. Keep the frontmatter and the headings asserted by `JevQuestionCatalog.test.ts`: `S - Single Responsibility Principle (SRP)`, `D - Dependency Inversion Principle (DIP)`, `DRY (Don't Repeat Yourself)`, `KISS (Keep It Simple)`, `YAGNI (You Aren't Gonna Need It)`, `Try-Catch Best Practices`, and `What NOT to Log`. Under each heading, keep one or two project-specific lines, for example "Domain ports in `src/domain/ports.ts`; services depend on ports via Inversify" or "Throw `GovernanceError` with a public code; messages ≤2 sentences, imperative".

Delete:
- textbook OWASP items that do not apply to a local stdio server (passwords, MFA, rate limiting, SSRF)
- generic code samples
- the AAA template
- the anti-pattern table
- coverage percentages that no tool enforces
- the false conventions: kebab-case file names (the repository uses PascalCase classes) and "enable strict mode" (now enforced by D-12, so it moves to a fact rather than a rule)

Add a unit test asserting a combined size of at most 6,000 bytes.
**Failure behavior:** If a heading is lost, `JevQuestionCatalog.test.ts` fails.
**Verification:** The size test, `JevQuestionCatalog.test.ts`, and the render-baseline tests pass, and the generated `.claude/rules/` copies are refreshed by reinstalling.

### D-17: Retire paper hooks
**Covers:** FR-16
**Decision:** Delete `hooks/pre-tool-use/validate-sdd-workflow.md` and `hooks/pre-tool-use/check-test-coverage.md`. Remove the reference in `hooks/session-end/remind-uncommitted-changes.md`. `preserving-writer.ts` already removes unmodified managed files that are no longer canonical, and reports `obsolete-modified` for edited ones, so no installer change is needed. Add a unit test that scans `hooks/**/*.md` for `--skip-validation`, `SDD_TDD_STRICT`, and the two removed hook names. Update the installer tests that count hooks (7 to 5).
**Failure behavior:** A user-modified installed copy is preserved and reported, which is the existing behavior.
**Verification:** The hook scan test passes. An installer test confirms that reinstalling over a 6.0.0 layout removes both unmodified copies.

### D-18: Requirements Skill wording
**Covers:** FR-17
**Decision:** In `skills/sdd-requirements/SKILL.md`, replace "`**Acceptance Criteria:** 1. ...` with at least one numbered item on the same line." with "`**Acceptance Criteria:**` followed by a numbered list, on the label line or the next lines." The replacement is no longer in bytes, so the Skill stays at or below 4,000. Add a validator test that submits both forms and expects `passed`.
**Failure behavior:** None.
**Verification:** The validator test, `canonical-assets.test.ts`, and the render baseline pass.

### D-19: JEV red evidence optional
**Covers:** FR-18
**Decision:** In `sddToolDefinitions.ts`, `requiredWhenCheck(['red'], ['taskNumber', 'testName', 'evidence'])` becomes `requiredWhenCheck(['red'], ['taskNumber', 'testName'])`. In `JevAdvisoryService.redCheck`, when the task is TDD-required, in `in-progress`, and the request has no `evidence`, it throws `GovernanceError('InvalidParams', 'Record RED through the engine first, or pass evidence for the red check.')`. An engine RED in `red-observed` proceeds without `evidence`, as it does today. Other not-ready states still return the `not-ready` skip line. The `red without evidence` case in `sddJevCheckTool.test.ts` moves from the rejected list to the accepted list, and a new service test covers the `InvalidParams` path.
**Failure behavior:** `InvalidParams` is an existing public code, so the error surfaces through the normal tool error path.
**Verification:** Schema and service tests as described.

### D-20: `sdd-correct` Skill
**Covers:** FR-20, NFR-4
**Decision:** Add `skills/sdd-correct/SKILL.md` (target at most 3,000 bytes, with `disable-model-invocation: true` and the description prefix the canonical test requires) and `skills/sdd-correct/REFERENCE.md` (examples per tier). The method:
1. Restate the failure as an observable symptom and its root cause.
2. Read `.spec/corrections.md` (create it if missing) and find a matching entry by symptom. Append a dated entry or increment its count.
3. Pick the strongest feasible tier: (1) structure, meaning types, data shape, or an engine or runtime gate; (2) lint, type, or CI; (3) a test or verification command; (4) rule or Skill text.
4. Allow tier 4 only when the count is at least 2, or when the failure is irreversible or security-relevant.
5. Implement tiers 1–3 through the `simple-task` loop (test-first).
6. List rule or Skill lines that the fix makes obsolete, and propose deleting them.
7. Ask for explicit approval before adding or deleting any rule or Skill text.

It includes the Execution Mode wording and the `Execution report:` line that `skill-delegation.test.ts` requires. It runs inline and does not offer agents. `.spec/corrections.md` is outside `.spec/steering/` and `.spec/specs/`, so neither `SteeringContextLoader` nor `ContextCompactionService` reads it. A test asserts that context loading for a feature never includes its content. The installers discover Skills from `skills/`, so Claude Code, Codex, and OMP render it with no installer change. Update `workflow-skill-render-baseline.json`, any test that counts Skills (12 to 13), and the documentation Skill lists.
**Failure behavior:** If the log cannot be written, the Skill reports a blocker and makes no rule change.
**Verification:** Canonical-asset, delegation, and render-baseline tests pass, and a context-load test confirms the exclusion.

### D-21: Skill blind-test kit
**Covers:** FR-21
**Decision:** Add `evals/skills/README.md` (how to run the kit, a blinding procedure, and a result template) and `evals/skills/fixtures/*.json`. There are at least 3 fixtures: `sdd-implement` with a setup-RED trap, `simple-task` with an unverifiable-check trap, and `sdd-correct` with a repeated failure. Each has the shape `{ "skill": string, "prompt": string, "setup": string, "checklist": string[≥3] }`. Checklist items are observable in a transcript, for example "re-recorded RED after setup classification". `docs/WORKFLOW.md` gets a "Skill changes" subsection requiring a kit run, with results pasted into the PR, before a structural Skill edit merges. A unit test validates every fixture against the shape and requires at least 3 fixtures. The `evals/` directory is not in the package `files` list.
**Failure behavior:** The kit is not run in CI, which is out of scope.
**Verification:** The fixture-format test passes.

### D-22: Optional interface spike in design
**Covers:** FR-22
**Decision:** Add one sentence to `skills/sdd-design/SKILL.md` Method: "For an unresolved architectural fork, optionally add `## Interface Spike` naming throwaway code under `.spec/specs/<feature>/spike/` and the decision it settled; production code never imports it." Add the details to `REFERENCE.md`. Trim existing wording to stay at or below 4,000 bytes; the Skill has 211 bytes free today. `WorkflowValidationService` already accepts extra headings. A test confirms that a design with the section validates.
**Failure behavior:** None. Approval still requires the explicit human answer.
**Verification:** The design validation test with and without the section, plus canonical-asset and render-baseline tests.

### D-23: Documentation
**Covers:** FR-23
**Decision:** Update the following:
- **`docs/WORKFLOW.md`:**
  - each new error code with its cause and remediation, in the existing error table
  - `evidence.verifyCommand` in the config table
  - inline-eval rejection under "Allowed programs"
  - tree binding, continuity, artifact cross-check, and drift in a new "Evidence binding" subsection
  - the parallel-slice restriction
  - `sdd-correct`
  - the Skill blind-test kit
- **`docs/MODEL-ROUTING.md`:** the parallel restriction.
- **`README.md`:** the feature highlights and the Skill list.
- **`ARCHITECTURE.md`:** `WorkingTreeFingerprint`, `EvidenceCommandPolicy`, and the status drift flow.
- **`DEPLOYMENT.md`:** CI steps and the lint baseline maintenance command.
- **`CHANGELOG.md`:** an Unreleased entry covering FR-1 to FR-22 by behavior, stating that the schema version stays 5 and the tool count stays 17.
- **`AGENTS.md`, `templates/CLAUDE.md`, `templates/codex-AGENTS.md`, and `src/cli/tool-support/root-guidance.ts`:** the parallel restriction and `/sdd-correct`, where these files describe workflow or routing.
- **`.spec/steering/tech.md`:** see D-14.
**Failure behavior:** `documentation-consistency.test.ts` blocks inconsistent tool counts and changelog invariants.
**Verification:** `documentation-consistency.test.ts` passes, and the root-guidance render tests pass after updating their expected text.

### D-24: Compatibility and unchanged human gates
**Covers:** NFR-1, NFR-5
**Decision:** All new `spec.json` fields are optional. All checks skip when their inputs are missing. Schemas only relax. No code path in `approvePhase` or `reviewTestCases` changes, and their tests are not edited. `GitPort` is optional in the engine, so existing tests that construct the engine without it see `unavailable` trees and the old behavior.
**Failure behavior:** Any binding gap degrades to 6.0.0 behavior, never to a block.
**Verification:** The full suite passes. A test loads each existing feature in `.spec/specs/` and reads its status. The approval and test-case review test files have no diff.

## Failure Handling

| Situation | Behavior |
|---|---|
| Not a git repository, git missing, git error, 10 s deadline | Tree `unavailable` with reason. The action proceeds. Tree-based checks (D-4 tree part, D-5, D-6) are skipped. Status shows `binding: 'unbound'` or `verificationBinding: 'unavailable'`. |
| More than 200 dirty paths at start or completion | Fingerprint still bound, `dirtyTruncated`. D-5 and D-6 path lists become unavailable. D-5 falls back to the 6.0.0 rule. D-6 still reports drift by hash, with `pathsUnavailable`. |
| Old HEAD garbage-collected or rebased away | `changedPaths` is unavailable, with the same fallback as the truncated case. |
| Setup RED, then GREEN | `RedSetupFailure` before any run. The agent fixes the setup and records RED again. |
| Concurrent edit between tree observation and command run | Evidence binds to the tree observed before the run. A later edit shows up as drift (D-6). |
| Config changes mid-action | The commit-time re-check uses the current settings and rejects a now-mismatched run. |
| Invalid `verifyCommand` | Ignored with one warning. 6.0.0 completion behavior. |
| Inline eval in verified mode | `EvidenceCommandInlineEval` before spawn. |
| Lint baseline missing or malformed | `npm run lint` exits 2 with the file named. |
| User-modified obsolete hook copy | Preserved and reported as `obsolete-modified` by the installer. |

Rollback: every engine change is additive and guarded by optional data. Reverting the release restores the 6.0.0 behavior. The 6.0.0 task and evidence parsers copy only known keys, so they load specs that carry the new fields, and they drop `start_tree` and `working_tree` on the next write without failing. The CHANGELOG states this.

## Verification

- **Engine and services (TDD, unit):** D-1, D-3, D-4, D-5, D-6, and D-7 in `src/__tests__/unit/workflow/`, with a fake `EvidenceRunner` and either a stub `GitPort` or a temporary git repository. D-2 in `src/__tests__/unit/services/WorkingTreeFingerprint.test.ts`. D-8 in `EvidenceCommandPolicy.test.ts`. D-9 with the fixture corpus. D-19 in the JEV tests.
- **E2E:** `governed-workflow.e2e.test.ts` runs a real verified flow against a temporary git repository with a fixture test file. It covers setup RED rejection, the RED to edit to GREEN success, the unchanged-tree rejection, completion through `verifyCommand`, and drift after a post-completion edit.
- **Machine checks:** `npm run typecheck`, `npm run lint` (ratchet), and the CI workflow assertion test.
- **Text and assets:** the canonical-asset, delegation, JEV-skill-text, render-baseline, rules-size, hook-scan, blind-test fixture, and documentation-consistency tests.
- **Bypass proof (success metric 1):** each P0 bypass test is first committed and run against the 6.0.0 engine code to observe failure, as the task's RED, then passes after the change.
- **Performance (NFR-3):** a timing assertion of at most 2 s for `observeTree` on this repository, measured in the fingerprint test suite with a generous CI margin.
- **Final:** `npm run build && npm run typecheck && npm run lint && npm test` exits 0 locally, and both CI jobs pass.
