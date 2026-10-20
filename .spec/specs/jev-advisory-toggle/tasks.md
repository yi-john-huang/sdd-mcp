# Tasks: JEV Advisory Toggle

Order: group 1 (pure modules) and tasks 2.1, 2.2, 3.3, and 6.2 are mutually independent and may run concurrently. Groups 3-7 follow the dependency lists. All new tests live under `src/__tests__/unit/jev/` unless stated otherwise. Shared test helpers (tree snapshot, fake ports, temporary project) live in `src/__tests__/unit/jev/helpers.ts` and are created by the first task that needs them.

Required cross-cutting cases and their owning tasks:
- disabled default path: 1.1, 4.1
- enabled-without-key path: 1.1, 4.1
- enabled-with-key with mocked HTTP: 4.2, 4.3, 4.4, 4.5
- timeout and network failure: 2.1, 4.2
- stale sidecar hash ignored: 3.2, 4.2
- no `spec.json` changes (byte-identical before and after): 3.1, 5.2
- zero filesystem side effects when disabled or no-key: 4.1
- RED regex classifier: 1.3, 4.4
- secret redaction: 1.2, 4.2, 4.5

## 1. Pure modules

### 1.1 Resolve JEV activation, key, code opt-in, and timeout settings
**Covers:** FR-1, FR-2, FR-3, NFR-2, D-1
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/JevSettings.ts, src/__tests__/unit/jev/JevSettings.test.ts
**Acceptance criteria:** 1. The disabled default: with `SDD_JEV_ENABLED` unset and no `.spec/sdd-config.json`, `enabled` is false. 2. `1`, `TRUE`, `yes`, and `On` enable JEV, and `0`, `false`, `no`, `off`, and `maybe` disable it, even when the project file has `{"jev":{"enabled":true}}`. 3. Env unset plus project file `true` enables JEV. A missing, invalid-JSON, over-16-KiB, or non-boolean file means no setting. 4. Enabled without a key: an unset, empty, whitespace-only, CR/LF-containing, or over-512-character `SDD_JEV_API_KEY` yields `hasKey === false`, and an `apiKey` field in the project file is ignored. 5. `SDD_JEV_ALLOW_CODE` follows the same truthy set and has no file fallback. 6. `SDD_JEV_TIMEOUT_MS` values: unset gives 5000, `500` gives 1000, `20000` gives 15000, `7000` gives 7000, `7.5` or `abc` gives 5000. 7. `JSON.stringify(settings)` and `String(settings)` do not contain the key.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevSettings.test.ts`, then `npm run typecheck`.

### 1.2 Redact secrets from every JEV state string
**Covers:** FR-15, D-11
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/JevRedaction.ts, src/__tests__/unit/jev/JevRedaction.test.ts
**Acceptance criteria:** 1. One test per pattern (PEM private key block, `AKIA` key id, `ghp_`/`gho_`/`ghs_`/`github_pat_` tokens, `xoxb-` Slack token, JWT, `Bearer` token, and `api_key=`/`apikey:`/`secret=`/`token:`/`password=`/`passwd=` assignments): the secret value is absent from the output and `[REDACTED]` is present. 2. For assignments, the name and operator are kept (`password=[REDACTED]`). 3. `redactState` walks nested objects and arrays and returns the total count. 4. Text without secrets is returned unchanged with count 0. 5. A 100 KB adversarial input completes in under 200 ms.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevRedaction.test.ts`.

### 1.3 Classify RED evidence locally
**Covers:** FR-10, D-8
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/RedEvidenceClassifier.ts, src/__tests__/unit/jev/RedEvidenceClassifier.test.ts
**Acceptance criteria:** 1. Each setup pattern (`Cannot find module`, `Module not found`, `ERR_MODULE_NOT_FOUND`, `SyntaxError`, `TS2304`, `ENOENT`, `ReferenceError: x is not defined`, `command not found`) yields `setup` with its stable pattern name. 2. `AssertionError`, `Expected: 1 ... Received: 2`, and `expect(` evidence yields `assertion`. 3. Evidence with both a setup and an assertion match yields `setup`. 4. Evidence with neither yields `ambiguous`. 5. `TS12` (fewer than 4 digits) and `ENOENTITY` do not match setup.
**Verification:** Run `npx jest src/__tests__/unit/jev/RedEvidenceClassifier.test.ts`.

### 1.4 Validate JEV responses and normalize score base
**Covers:** FR-5, D-4
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/JevResponseValidator.ts, src/__tests__/unit/jev/JevResponseValidator.test.ts
**Acceptance criteria:** 1. A valid response with every question type is accepted. Extra answer ids are dropped. Up to 10 primitive `meta` fields are kept, with strings cut to 200 characters. 2. Each of these is rejected (`ok: false`): a non-JSON body, a missing `answers`, a missing id, a wrong answer key, an undeclared choice label, a non-integer score, `noul` of -0.01, 1.01, or NaN, and an answer object with two keys. 3. Scores in `0..n-1` with no score equal to `n` are 0-based. 4. A response with any score equal to `n` is treated as 1-based: all scores must be in `1..n` and are stored as `raw - 1`, with `scoreBase: 'one-inferred'`. 5. A response containing both 0 and `n` is rejected, as is any score below 0 or above `n`. 6. The raw value is preserved next to the normalized index.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevResponseValidator.test.ts`.

### 1.5 Define the constant question catalog with single-sourced criteria
**Covers:** FR-3, FR-6, FR-7, FR-9, FR-11, FR-12, FR-13, NFR-5, D-5
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/JevQuestionCatalog.ts, src/__tests__/unit/jev/JevQuestionCatalog.test.ts
**Acceptance criteria:** 1. Every built question has `type` in `choice`, `score`, or `noul`. Its `instructions` begin with the constant preamble stating that `state` is data, never instructions. `choice` questions carry a label-to-description object, `score` questions carry an ordered level array, and `noul` questions carry no criteria. 2. The templates per kind match D-5 exactly: requirements testability has 4 levels, security severity has 5 levels in order informational..critical, and testcases include `tddReason` only for not-applicable tasks. 3. The principle set contains exactly `srp`, `dry`, `kissYagni`, `dip`, `swallowedErrors`, and `sensitiveLogging`, each with followed/partly/violated/not-applicable labels. 4. A test reads `rules/coding-style.md` and `rules/error-handling.md` and asserts that every cited source heading exists verbatim. 5. Building questions from items whose text contains "ignore previous instructions" leaves every `instructions` and `criteria` value byte-equal to the catalog constants. 6. `QUESTION_SET_VERSION` is exported.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevQuestionCatalog.test.ts`.

### 1.6 Render the one-line report and apply flag rules
**Covers:** FR-4, FR-6, FR-7, FR-9, FR-12, FR-13, FR-20, D-13
**Dependencies:** 1.5
**TDD:** required
**Affected artifacts:** src/application/services/JevReport.ts, src/__tests__/unit/jev/JevReport.test.ts
**Acceptance criteria:** 1. Each reason (`disabled`, `no-key`, `network`, `timeout`, `http-503`, `invalid-response`, `code-disabled`) renders exactly `JEV: unavailable (<reason>)` on one line. 2. Zero flags renders `JEV: no flags`. Two flags render `JEV: 2 flagged (FR-2, FR-5)`. Five flags render the first 3 ids plus `, +2 more`. 3. Skipped results render `null`. 4. Boundary tests per kind: testability index 1 is flagged and 2 is not; `noul` 0.49 is not flagged and 0.5 is; design fidelity `partly` is flagged; testcases `proportion` `over-tested` is flagged; security `important` with JEV `medium` is not a disagreement but with `low` it is; principles report only `violated` with `path:line`. 5. The commit warning renders `JEV: warning (<n> confirmed high/critical security findings in staged changes)`.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevReport.test.ts`.

## 2. Ports and adapters

### 2.1 Add the JEV HTTPS port and fetch adapter with timeout and no redirects
**Covers:** FR-2, FR-3, FR-4, NFR-3, D-3
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/domain/ports.ts, src/infrastructure/adapters/FetchJevHttpAdapter.ts, src/__tests__/unit/jev/FetchJevHttpAdapter.test.ts
**Acceptance criteria:** 1. Tests use a local `http.createServer` on 127.0.0.1 reached only through a test constructor URL. A 200 JSON response returns `{status: 200, body}`, and the request carries exactly one `Authorization: Bearer <key>` header and the method `POST`. 2. Timeout: a server that never responds yields `JevTransportError` `kind: 'timeout'` in under 1500 ms with `timeoutMs: 1000`. 3. Network failure: a closed port yields `kind: 'network'`, and the error message does not contain the key. 4. A 302 response returns `status: 302`, and the redirect target handler records 0 hits. 5. A body over 262144 bytes yields `kind: 'too-large'`. 6. The production constant `JEV_DECIDE_URL` equals `https://jevtypesafeai.com/api/v1/decide`, and no env, setting, or tool argument reaches the URL parameter.
**Verification:** Run `npx jest src/__tests__/unit/jev/FetchJevHttpAdapter.test.ts`.

### 2.2 Add the read-only git port and change-manifest hashing
**Covers:** FR-12, FR-16, FR-18, D-9
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/domain/ports.ts, src/infrastructure/adapters/NodeGitAdapter.ts, src/application/services/JevChangeManifest.ts, src/__tests__/unit/jev/JevChangeManifest.test.ts
**Acceptance criteria:** 1. In a temporary git repository, a review manifest of "one modified tracked file plus one new untracked file" equals the staged manifest after `git add -A`, giving the same `diffSha256`. 2. An extra edit after staging, or a partial stage, gives a different hash. 3. A deleted file is represented as `deleted` in both manifests. 4. The `.git/index` mtime and the `.git/objects` file count are unchanged after building both manifests. 5. A fake failing `GitPort` (non-zero exit or timeout) returns `unavailable` without throwing. 6. An empty manifest is reported as `no-changes`. 7. `baseCommit` is `null` in a repository with no commits.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevChangeManifest.test.ts`.

## 3. Snapshot, sidecars, and excerpts

### 3.1 Add a read-only advisory snapshot to the workflow engine
**Covers:** FR-6, FR-7, FR-9, FR-11, NFR-1, NFR-3, D-6
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/WorkflowEngineService.ts, src/application/services/WorkflowValidationService.ts, src/__tests__/unit/jev/AdvisorySnapshot.test.ts
**Acceptance criteria:** 1. For a passed requirements revision, `readAdvisorySnapshot` returns the revision, the recorded and observed SHA-256 (equal), `validationStatus: 'passed'`, the content, and the feature description. 2. A failed validation and an artifact edited after submission are both reported as not ready by the snapshot fields. 3. No spec.json change: the `spec.json` bytes and the feature directory listing are byte-identical before and after 10 snapshot calls. 4. `parseSections` and `visibleLines` are exported and the existing `WorkflowValidationService` tests still pass unchanged. 5. The implementation snapshot exposes task `status`, `tdd_required`, and the task section's acceptance criteria.
**Verification:** Run `npx jest src/__tests__/unit/jev/AdvisorySnapshot.test.ts src/__tests__/unit/workflow`.

### 3.2 Persist, bind, and read matching sidecars
**Covers:** FR-16, FR-17, NFR-1, D-12
**Dependencies:** 1.4
**TDD:** required
**Affected artifacts:** src/application/services/JevSidecarStore.ts, src/__tests__/unit/jev/JevSidecarStore.test.ts
**Acceptance criteria:** 1. Paths: `jev-requirements-r3.json`, `jev-design-r1.json`, `jev-testcases-r2.json`, and `jev-red-2.1-<12hex>.json` go under `.spec/specs/<feature>/review/`. `jev-review-security-<12hex>.json` and `jev-review-principles-<12hex>.json` go under the feature `review/`, or under `.spec/reviews/` with no feature. 2. A written sidecar contains the binding, answers, raw scores, reason, redaction count, and `excerptSha256`. It does not contain a sample key, a sample excerpt text, or a redacted secret value. 3. Stale sidecar hash ignored: a sidecar whose `artifactSha256`, `caseListSha256`, `evidenceSha256`, `diffSha256`, `inputSha256`, revision, or `questionSetVersion` differs from the current binding is ignored by `readMatching`. 4. Only `answered` sidecars are reusable. An `unavailable(timeout)` sidecar is not. 5. Corrupt JSON, a wrong shape, or a file over 1 MiB is ignored without throwing. 6. A `review/` symlink pointing outside `.spec` causes `persisted: false` and no file outside `.spec`. 7. A write failure (read-only directory) returns `persisted: false` without throwing.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevSidecarStore.test.ts`.

### 3.3 Build bounded, excluded, redacted code excerpts
**Covers:** FR-14, D-10
**Dependencies:** 1.2
**TDD:** required
**Affected artifacts:** src/application/services/JevCodeExcerpts.ts, src/__tests__/unit/jev/JevCodeExcerpts.test.ts
**Acceptance criteria:** 1. A finding at line 100 of a 300-line file yields exactly lines 85-115. A finding at line 3 yields lines 1-18. 2. When cumulative excerpts would exceed 8192 bytes, the overflowing finding and all later ones get no excerpt and their ids are listed in `droppedFindingIds`. 3. Each excluded path (`.env`, `.env.local`, `cert.pem`, `server.key`, `a.p12`, `a.pfx`, `a.crt`, `id_rsa`, `id_ed25519.pub`, the 8 lockfiles, `dist/x.js`, `build/x.js`, `node_modules/x.js`, `x.min.js`, `.claude/x.md`, `.agents/x.md`, `.codex/x.md`, `.omp/x.md`) yields `excerpt: null`. 4. A symlink to a file outside the project, a file over 1 MiB, a file with NUL bytes, and a missing file each yield `excerpt: null` without throwing. 5. A secret on an excerpted line is redacted and `excerptSha256` is computed over the redacted excerpt.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevCodeExcerpts.test.ts`.

## 4. Advisory service

### 4.1 Orchestrate gates with zero side effects when disabled or keyless
**Covers:** FR-2, FR-4, FR-14, FR-16, NFR-2, D-2
**Dependencies:** 1.1, 1.6, 2.1, 2.2, 3.1, 3.2
**TDD:** required
**Affected artifacts:** src/application/services/JevAdvisoryService.ts, src/__tests__/unit/jev/helpers.ts, src/__tests__/unit/jev/JevAdvisoryService.gates.test.ts
**Acceptance criteria:** 1. Disabled default path: for each of the 7 check kinds, `check()` returns `unavailable(disabled)` (`skipped` with a null line for `commit`) and makes zero calls to the HTTP, git, and filesystem spies apart from one read of `.spec/sdd-config.json`. 2. Enabled-without-key path: every kind returns `unavailable(no-key)` (`skipped` for `commit`) with zero HTTP and git calls. 3. Zero filesystem side effects when disabled or keyless: a full project-tree snapshot (sorted paths, types, SHA-256 of contents) is identical before and after every kind, and no `review/` or `.spec/reviews/` directory exists afterwards. This also holds for a feature name that does not exist. 4. With JEV active and code not allowed, `security` and `principles` return `unavailable(code-disabled)` with zero HTTP calls and write one sidecar with that reason. 5. With JEV active, a nonexistent feature returns `skipped(feature-not-found)` and creates no directory. 6. An internal exception thrown by a fake dependency becomes a result value and `check()` never rejects. 7. A known key string never appears in any result, captured logger call, or written file.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevAdvisoryService.gates.test.ts`.

### 4.2 Run requirements and design checks with mocked HTTP, failures, and reuse
**Covers:** FR-3, FR-4, FR-5, FR-6, FR-7, FR-15, FR-17, NFR-3, D-6, D-13
**Dependencies:** 1.2, 1.4, 1.5, 4.1
**TDD:** required
**Affected artifacts:** src/application/services/JevAdvisoryService.ts, src/__tests__/unit/jev/JevAdvisoryService.phases.test.ts
**Acceptance criteria:** 1. Enabled with key and mocked HTTP: a scripted valid response for a passed requirements revision returns `answered`, flags the expected FR ids, writes `jev-requirements-r<rev>.json`, and makes exactly 1 POST to `JEV_DECIDE_URL` whose body has only `state` and `questions`. 2. The design check flags a D-N with `fidelity: partly` and an NFR with `mechanism: none`. 3. Timeout and network failure: a never-resolving fake with a 1000 ms timeout returns `unavailable(timeout)` in under 1500 ms, and a rejecting fake returns `unavailable(network)`. Each makes exactly 1 attempt and writes a sidecar with that reason. 4. HTTP 503 gives `unavailable(http-503)`, and a malformed body gives `unavailable(invalid-response)`. 5. Stale sidecar hash ignored: after the artifact is resubmitted (new SHA), the earlier sidecar is ignored and a new POST happens. A second call at the same binding reuses the sidecar with 0 POSTs. 6. Failed validation returns `skipped(not-ready)` with 0 POSTs. 7. Secret redaction: a requirement containing `ghp_` followed by 36 characters is sent as `[REDACTED]`. 8. A requirements document over 32768 bytes of state is truncated by whole sections, with `truncated: true` and omitted ids recorded.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevAdvisoryService.phases.test.ts`.

### 4.3 Run the A1 test-case adequacy check without touching the checkpoint
**Covers:** FR-8, FR-9, D-7
**Dependencies:** 4.2
**TDD:** required
**Affected artifacts:** src/application/services/JevAdvisoryService.ts, src/__tests__/unit/jev/JevAdvisoryService.testcases.test.ts
**Acceptance criteria:** 1. With JEV active and no `cases`, the check returns `skipped(cases-required)` with 0 POSTs. 2. Enabled with key and mocked HTTP: valid cases for a passed tasks revision produce one POST. Its state includes each TDD-required task's Covers, acceptance criteria, covered EARS lines, and cases, and not-applicable tasks with their reason. Flagged tasks are first in `details`. 3. The same case list gives the same `caseListSha256`. A reordered or edited list gives a different hash, and the earlier sidecar is ignored. 4. Unknown `taskId` cases are reported as `unknownTask` and not sent. 5. The `spec.json` checkpoint bytes are identical before and after an `answered` check with flagged tasks. `reviewTestCases` still throws when review is off and still requires an explicit call when review is on.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevAdvisoryService.testcases.test.ts src/__tests__/unit/workflow/TestCaseReviewCheckpoint.test.ts`.

### 4.4 Run the A2 RED validity check with the local classifier first
**Covers:** FR-10, FR-11, D-8
**Dependencies:** 1.3, 4.1
**TDD:** required
**Affected artifacts:** src/application/services/JevAdvisoryService.ts, src/__tests__/unit/jev/JevAdvisoryService.red.test.ts
**Acceptance criteria:** 1. With JEV active, `TS2304` evidence returns `answered` with `classification: 'setup'`, `matchedPattern: 'typescript'`, the task flagged, 0 POSTs, and a `jev-red-<task>-<12hex>.json` sidecar with `source: 'local'`. 2. `AssertionError` evidence returns `assertion`, no flags, and 0 POSTs. 3. Enabled with key and mocked HTTP: ambiguous evidence makes exactly 1 POST whose state contains the evidence command, summary, test name, and acceptance criteria, and no source file content. A `setup-error` answer flags the task. 4. Without a key, setup evidence still returns `unavailable(no-key)` with no files written. 5. A task that is not `in-progress` or not TDD-required returns `skipped(not-ready)`. 6. `record-red` with identical evidence produces an identical task state after `setup`, `missing-behavior`, and `unavailable` results.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevAdvisoryService.red.test.ts`.

### 4.5 Run B1 security triage and B2 principle checks on bounded code
**Covers:** FR-12, FR-13, FR-14, FR-15, D-9, D-10
**Dependencies:** 2.2, 3.3, 4.2
**TDD:** required
**Affected artifacts:** src/application/services/JevAdvisoryService.ts, src/__tests__/unit/jev/JevAdvisoryService.review.test.ts
**Acceptance criteria:** 1. Enabled with key, code allowed, and mocked HTTP: the security check sends findings with redacted ±15-line excerpts (total ≤ 8192 bytes) and returns per-finding classification, unified severity, exploitability, remediation, and disagreement. The model severity `important` with JEV `low` is flagged as a disagreement. 2. The principles check reports only `violated` answers with `path:line`. Followed, partly, and not-applicable answers are stored in the sidecar but not returned. 3. The sidecar `jev-review-security-<diffSha12>.json` stores base commit, `diffSha256`, finding id, location, and `excerptSha256`, and contains no excerpt text. 4. A failing fake git returns answers with `persisted: false`. 5. Secret redaction: a code line `const apiKey = "sk_live_123456789"` is never present in the serialized request. 6. With no feature, sidecars go to `.spec/reviews/`.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevAdvisoryService.review.test.ts`.

### 4.6 Look up the commit warning from sidecars only
**Covers:** FR-18, D-12
**Dependencies:** 4.5
**TDD:** required
**Affected artifacts:** src/application/services/JevAdvisoryService.ts, src/__tests__/unit/jev/JevAdvisoryService.commit.test.ts
**Acceptance criteria:** 1. With JEV enabled and a confirmed `high` finding in a sidecar matching the full staged hash, `check: commit` returns exactly one warning line, makes 0 HTTP calls, and needs no key. 2. A missing, stale (other hash), corrupt, or only-hardening/low sidecar returns `line: null` without error. 3. With JEV disabled, the result is `skipped` with a null line and 0 git calls. 4. The project tree snapshot is identical before and after every commit lookup.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevAdvisoryService.commit.test.ts`.

## 5. Tool exposure and isolation

### 5.1 Expose `sdd-jev-check` as the 17th MCP tool with DI wiring
**Covers:** FR-4, FR-21, NFR-2, NFR-4, D-2
**Dependencies:** 4.3, 4.4, 4.6
**TDD:** required
**Affected artifacts:** src/infrastructure/mcp/sddToolDefinitions.ts, src/adapters/cli/SDDToolAdapter.ts, src/infrastructure/di/types.ts, src/infrastructure/di/container.ts, src/__tests__/unit/runtime/SDDToolAdapter.inventory.test.ts, src/__tests__/unit/jev/sddJevCheckTool.test.ts
**Acceptance criteria:** 1. `SDD_TOOL_NAMES` has 17 entries in stable order ending with `sdd-jev-check`, and the inventory test expects exactly that list. 2. The schema rejects a missing `featureName` for `requirements`, `design`, `testcases`, and `red`, a missing `findings` for `security`, a missing `units` for `principles`, any extra property, and a `path` containing `..`. 3. The adapter handler returns the service result unchanged. With default env (disabled), the response is `{status: 'unavailable', reason: 'disabled', line: 'JEV: unavailable (disabled)'}`. 4. The container resolves `SDDToolAdapter` with the JEV service, fetch adapter, and git adapter bound. 5. The existing 16 tool schemas are deep-equal to their pre-change snapshot, and `entrypoints.stdio.test.ts` passes.
**Verification:** Run `npx jest src/__tests__/unit/runtime src/__tests__/unit/jev/sddJevCheckTool.test.ts`.

### 5.2 Prove workflow state isolation end to end
**Covers:** NFR-1, NFR-2, D-17
**Dependencies:** 5.1
**TDD:** required
**Affected artifacts:** src/__tests__/unit/jev/JevIsolation.test.ts
**Acceptance criteria:** 1. No spec.json changes: one run with JEV disabled and one run with JEV active, mocked HTTP, and every check executed between steps both perform requirements, design, and tasks submission, test-case review, approvals, `begin`, `start`, and `record-red`. Their `spec.json` bytes are byte-identical after normalizing only the existing timestamp fields. 2. `approvalRequired`, `nextAction`, and `validation` in every tool response are deep-equal between the runs. 3. `sdd-context-load` output and `context/handoff.md` contain no `jev-` text. 4. A sidecar in `review/` after approval does not raise `ArtifactDrift` on the next status and context load. 5. In the disabled run, the project tree after the run equals a third run without any JEV calls.
**Verification:** Run `npx jest src/__tests__/unit/jev/JevIsolation.test.ts`.

## 6. Skills, ignore policy, and documentation

### 6.1 Add JEV steps to seven Skills and narrow the security contact wording
**Covers:** FR-6, FR-7, FR-9, FR-11, FR-12, FR-13, FR-18, FR-19, FR-20, NFR-4, D-14
**Dependencies:** 5.1
**TDD:** required
**Affected artifacts:** skills/sdd-requirements/SKILL.md, skills/sdd-design/SKILL.md, skills/sdd-tasks/SKILL.md, skills/sdd-implement/SKILL.md, skills/sdd-review/SKILL.md, skills/sdd-security-check/SKILL.md, skills/sdd-commit/SKILL.md, agents/security-auditor.md, src/__tests__/unit/cli/canonical-assets.test.ts, src/__tests__/unit/jev/JevSkillText.test.ts
**Acceptance criteria:** 1. Each of the seven Skills contains its D-14 JEV step. None contains `jevtypesafeai`, `SDD_JEV_API_KEY`, a regex, or redaction logic, and none asks the user to operate an MCP tool. 2. `skills/sdd-security-check/SKILL.md` and `agents/security-auditor.md` define forbidden contact as contact with the audited target or its systems, state the single parent-only JEV triage exception, and the auditor still forbids its own network access. 3. Every Skill stays at or under 4,000 bytes, the total stays at or under 40,000 bytes, and every existing `requiredCoreChecks` pattern still matches. The budget values in `canonical-assets.test.ts` are unchanged. 4. The Claude, Codex, and OMP renderer tests show the new wording in each generated target. 5. `sdd-commit` text states that the lookup is local, read-only, and never blocks or adds a question.
**Verification:** Run `npx jest src/__tests__/unit/cli src/__tests__/unit/jev/JevSkillText.test.ts`.

### 6.2 Git-ignore code-review sidecars for every target
**Covers:** FR-16, D-15
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/cli/install-target.ts, .gitignore, src/__tests__/unit/cli/install-target.test.ts
**Acceptance criteria:** 1. `ignoreEntries` for `claude-code`, `codex`, and `omp` each include `.spec/reviews/` and `.spec/specs/*/review/jev-review-*`. 2. A second install adds no lines. 3. Spec-phase sidecar patterns (`jev-requirements-*`, `jev-design-*`, `jev-testcases-*`, `jev-red-*`) are not ignored, as asserted by `git check-ignore` in a temporary repository. 4. The repository `.gitignore` contains the same two entries.
**Verification:** Run `npx jest src/__tests__/unit/cli/install-target.test.ts src/__tests__/unit/cli/gitignore-manager.test.ts`.

### 6.3 Update the 17-tool contract documentation and JEV usage docs
**Covers:** FR-21, D-16
**Dependencies:** 5.1
**TDD:** required
**Affected artifacts:** docs/WORKFLOW.md, README.md, ARCHITECTURE.md, .claude-plugin/plugin.json, CHANGELOG.md, src/__tests__/unit/cli/documentation-consistency.test.ts
**Acceptance criteria:** 1. Every `SDD_TOOL_NAMES` entry appears in `README.md`, `docs/WORKFLOW.md`, `ARCHITECTURE.md`, and `.claude-plugin/plugin.json`, and the `plugin.json` tool names equal `SDD_TOOL_NAMES` as a set, including `sdd-review-test-cases`. 2. The inventory sentences state 17 tools, and no stale "16 tools" inventory statement remains. 3. `docs/WORKFLOW.md` documents `SDD_JEV_ENABLED`, `SDD_JEV_API_KEY`, `SDD_JEV_ALLOW_CODE`, `SDD_JEV_TIMEOUT_MS`, `.spec/sdd-config.json` and its precedence, the data sent per check, the sidecar locations and ignore policy, and the reason codes, and states that JEV never changes approval or `spec.json`. 4. `CHANGELOG.md` has an Unreleased entry. 5. The existing documentation-consistency assertions still pass.
**Verification:** Run `npx jest src/__tests__/unit/cli/documentation-consistency.test.ts src/__tests__/unit/runtime`.

## 7. Release gates

### 7.1 Pass lint, typecheck, build, and the full suite
**Covers:** NFR-2, NFR-6, D-18
**Dependencies:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.2, 6.1, 6.2, 6.3
**TDD:** not-applicable — verification-only gate that runs existing commands and adds no behavior
**Affected artifacts:** none
**Acceptance criteria:** 1. `npm run lint` exits 0 with 0 errors. 2. `npm run typecheck` exits 0. 3. `npm run build` exits 0. 4. `npm test` reports the known "maps interactive cancellation to exit code 130 without writes" failure in `src/__tests__/unit/cli/compiled-cli.e2e.test.ts` as its only failure. 5. A search of `src/__tests__` shows that no test targets `jevtypesafeai.com` other than the constant assertion.
**Verification:** Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test`, and record each exit code and failure list.
