# Implementation Tasks: jev-committed-diff-review

## Overview

There are two independent tracks:
- Track 1: the zero-based score scale (tasks 1.1 and 1.2).
- Track 2: committed-diff review with `baseRef` (tasks 2.1 to 2.6).

Then come the Skill text and docs (3.1 and 3.2), and the full verification (4.1). Tracks 1 and 2 touch disjoint files, except that 2.6 depends on the version bump in 1.2. They are small, so they run serially in the parent; no parallel agents are needed. The approved `.spec/specs/jev-advisory-toggle/` artifacts are never edited. No commits are made.

## Tasks

### 1.1 Zero-based-only score validation
**Covers:** FR-9, FR-10, D-8
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/JevResponseValidator.ts, src/application/services/JevExchange.ts, src/application/services/JevSidecarStore.ts, src/__tests__/unit/jev/JevResponseValidator.test.ts, src/__tests__/unit/jev/JevSidecarStore.test.ts
**Acceptance criteria:** 1. RED: new tests fail on current code. They show that a response where every score equals its level count is `{ ok: false }`, and that levels, levels+1, -1, 1.5, and `"1"` are rejected, while 0 and levels-1 are accepted with `index === raw`. 2. GREEN: `parseAnswer` checks `0 <= value < criteria.length`. `normalizeScores`, `NormalizedScores`, `JevScoreBase`, and every `scoreBase` field (validator result, exchange outcome, sidecar type, `toStored`) are removed. 3. The old one-based tests are replaced. Sidecar fixtures drop `scoreBase`, and a test asserts that a written sidecar has no `scoreBase` key. 4. REFACTOR: there is no dead score loop in `validateJevResponse`.
**Verification:** `npx vitest run src/__tests__/unit/jev/JevResponseValidator.test.ts src/__tests__/unit/jev/JevSidecarStore.test.ts`, plus an exchange test showing an out-of-range score gives `unavailable / invalid-response`.

### 1.2 Question-set version 3 and text clean-up
**Covers:** FR-10, D-9
**Dependencies:** 1.1
**TDD:** required
**Affected artifacts:** src/application/services/JevQuestionCatalog.ts, src/__tests__/unit/jev/JevQuestionCatalog.test.ts, src/__tests__/unit/jev/JevSidecarStore.test.ts, src/__tests__/unit/cli/documentation-consistency.test.ts
**Acceptance criteria:** 1. RED: the catalog test expects version 3, a store test expects a stored version-2 sidecar to be stale, and a repository-text test expects no `one-inferred` in `src/`, `README.md`, `docs/`, `CHANGELOG.md`, or `skills/`. 2. GREEN: `QUESTION_SET_VERSION = 3`. `SCORE_SCALE_INSTRUCTION` is byte-identical. Its comment states the zero-based scale with no fallback wording. 3. Any test that hard-codes version 2 for a current sidecar is updated to the constant.
**Verification:** `npx vitest run src/__tests__/unit/jev/` passes. Searching the listed paths for `one-inferred` and for "fallback" near "score" returns no match.

### 2.1 baseRef request field, schema, adapter, and pure validation
**Covers:** FR-1, FR-2, FR-8, D-1, D-2
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/JevBaseRef.ts, src/application/services/JevCheckTypes.ts, src/application/services/JevAdvisoryService.ts, src/infrastructure/mcp/sddToolDefinitions.ts, src/adapters/cli/SDDToolAdapter.ts, src/__tests__/unit/jev/JevBaseRef.test.ts, src/__tests__/unit/jev/JevAdvisoryService.gates.test.ts, src/__tests__/unit/jev/sddJevCheckTool.test.ts, src/__tests__/unit/runtime/SDDToolAdapter.inventory.test.ts
**Acceptance criteria:** 1. RED: a table test for `isWellFormedBaseRef` covers a leading `-`, `--output=x`, a space, a tab, a newline, NUL, DEL, `''`, 257 characters (all false), and `origin/develop`, a 40-hex SHA, and `HEAD~2` (all true). 2. RED: service tests use a recording GitPort and HTTP port. Each invalid value on `security` and `principles`, and a valid value on `requirements` and `commit`, gives `skipped / invalid-base-ref` with zero git calls, zero HTTP calls, and no new `.spec` files. 3. Disabled and no-key with a `baseRef` still return their existing results with zero git calls. 4. GREEN: implement the D-2 order, add `'invalid-base-ref'` to `JevSkipReason`, add the schema property (`minLength` 1, `maxLength` 256), and add the adapter pass-through. Schema tests assert the property, its bounds, `additionalProperties: false`, and the unchanged required set.
**Verification:** `npx vitest run src/__tests__/unit/jev/JevBaseRef.test.ts src/__tests__/unit/jev/JevAdvisoryService.gates.test.ts src/__tests__/unit/jev/sddJevCheckTool.test.ts src/__tests__/unit/runtime/SDDToolAdapter.inventory.test.ts src/__tests__/unit/runtime/entrypoints.stdio.test.ts`

### 2.2 Read-only range resolution
**Covers:** FR-3, NFR-2, D-3
**Dependencies:** 2.1
**TDD:** required
**Affected artifacts:** src/application/services/JevBaseRef.ts, src/__tests__/unit/jev/JevBaseRef.test.ts
**Acceptance criteria:** 1. RED: a recording GitPort asserts the exact vectors in order: `rev-parse --verify --quiet --end-of-options <ref>^{commit}`, then `rev-parse --verify --quiet HEAD`, then `merge-base <hex> <hex>`. `baseRef` appears only in vector 1, directly after `--end-of-options`. 2. RED: non-hex stdout, a non-zero exit, or empty output at any step gives `{ ok: false }`, and later steps are not run. 3. RED: real temporary repositories cover a missing ref, a tree SHA, and an unrelated orphan history; each gives `{ ok: false }`. A valid branch gives the merge-base and HEAD. 4. GREEN: implement `resolveRange` with the `^[0-9a-f]{40}(?:[0-9a-f]{24})?$` check.
**Verification:** `npx vitest run src/__tests__/unit/jev/JevBaseRef.test.ts`. If the local Git is older than 2.30, the real-repository success case is reported as an environment limit, not hidden.

### 2.3 Committed-range manifest
**Covers:** FR-4, FR-5, NFR-3, D-4
**Dependencies:** 2.2
**TDD:** required
**Affected artifacts:** src/application/services/JevChangeManifest.ts, src/__tests__/unit/jev/JevChangeManifest.test.ts
**Acceptance criteria:** 1. RED: temporary-repository tests cover:
   - a committed change with a clean tree lists the path;
   - an added uncommitted change and an untracked file add paths and change `diffSha256`;
   - merge-base equal to HEAD with a clean tree gives `empty`;
   - a deleted path gets the `deleted` token;
   - a symlink gets the link blob;
   - a sidecar path is excluded;
   - more than 2,000 paths give `unavailable`;
   - a bad ref gives `invalid-base-ref`.
   2. RED: a counting GitPort shows at most four extra git calls compared with `buildReviewManifest` on the same repository. 3. GREEN: extract `tokenEntries(git, root, paths, gitlinkTree)` from `reviewEntries` (which passes `'HEAD'`), and add `buildRangeManifest` with `range: { rangeBaseCommit, headCommit }` on `ok`. 4. Existing manifest tests pass with unchanged expectations.
**Verification:** `npx vitest run src/__tests__/unit/jev/JevChangeManifest.test.ts`

### 2.4 Range binding fields and file name
**Covers:** FR-6, D-5
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/JevSidecarStore.ts, src/__tests__/unit/jev/JevSidecarStore.test.ts, src/__tests__/unit/cli/install-target.test.ts
**Acceptance criteria:** 1. RED: a binding with `rangeBaseCommit` gives `jev-review-<kind>-range-<12 hex>.json`, and the stored binding has exactly the five fields. 2. RED: changing any one of HEAD, merge base, diff hash, input hash, or version makes `readMatching` return undefined. 3. RED: an answered range sidecar is not overwritten by a `timeout` result. 4. RED: a no-range binding's file name and stored JSON key set are unchanged. 5. The installer ignore patterns cover a range file name (test asserted). 6. GREEN: add the two optional binding keys to `SidecarBinding` and `BINDING_KEYS`, and add the range branch in `fileNameFor`.
**Verification:** `npx vitest run src/__tests__/unit/jev/JevSidecarStore.test.ts` and the installer test file that asserts the JEV ignore entries.

### 2.5 Service wiring for review and code-disabled paths
**Covers:** FR-4, FR-5, FR-6, FR-8, D-6
**Dependencies:** 2.1, 2.3, 2.4
**TDD:** required
**Affected artifacts:** src/application/services/JevAdvisoryService.ts, src/application/services/JevReviewCheck.ts, src/__tests__/unit/jev/JevAdvisoryService.review.test.ts, src/__tests__/unit/jev/JevAdvisoryService.gates.test.ts
**Acceptance criteria:** 1. RED: with a `baseRef` on a temporary repository with a committed change, a `security` check sends one request with an excerpt from the committed path. It writes a range sidecar with the five binding fields, and a second identical call reuses it with no HTTP call. 2. RED: an unknown ref gives `skipped / invalid-base-ref` with no HTTP call and no files. 3. RED: in baseRef mode, an excluded `.env` path and a symlink to an excluded file get no excerpt, a seeded secret is redacted, and `spec.json` bytes are unchanged. 4. RED: `code-disabled` with a `baseRef` writes the range file name. 5. RED: with no `baseRef`, no `merge-base` or `--end-of-options` vector is issued, and the file name matches `^jev-review-(security|principles)-[0-9a-f]{12}\.json$`. 6. GREEN: add a private `manifestFor`, pass the manifest into `JevReviewCheck.run` and `codeDisabled`, and spread the range fields into the binding.
**Verification:** `npx vitest run src/__tests__/unit/jev/`

### 2.6 Commit lookup ignores range and older-version sidecars
**Covers:** FR-7, D-7
**Dependencies:** 1.2, 2.4
**TDD:** required
**Affected artifacts:** src/application/services/JevSidecarStore.ts, src/application/services/JevCommitLookup.ts, src/__tests__/unit/jev/JevAdvisoryService.commit.test.ts
**Acceptance criteria:** 1. RED: a range-bound sidecar with a confirmed critical finding and a hash equal to the staged hash, stored under the non-range name, gives no warning. 2. RED: a version-2 non-range matching sidecar gives no warning. 3. The existing current-version staged-match warning test still passes. 4. Recording ports show zero HTTP calls and no writes. 5. GREEN: `findByDiff` takes `questionSetVersion` and rejects range bindings, and `JevCommitLookup` passes `QUESTION_SET_VERSION`.
**Verification:** `npx vitest run src/__tests__/unit/jev/JevAdvisoryService.commit.test.ts`

### 3.1 Skill text passes baseRef
**Covers:** FR-11, D-10
**Dependencies:** 2.5
**TDD:** not-applicable — static instruction text; its presence and size are asserted by the existing Skill-text tests, which are extended first
**Affected artifacts:** skills/sdd-review/SKILL.md, skills/sdd-security-check/SKILL.md, src/__tests__/unit/jev/JevSkillText.test.ts
**Acceptance criteria:** 1. Both Skills tell the parent to pass the PR or branch base as `baseRef`, and to omit it for uncommitted-only reviews. 2. Both files stay at or below 4,000 bytes. 3. `JevSkillText.test.ts` asserts the `baseRef` instruction in both. 4. No generated native target is hand-edited.
**Verification:** `npx vitest run src/__tests__/unit/jev/JevSkillText.test.ts src/__tests__/unit/cli/canonical-assets.test.ts`

### 3.2 Documentation and changelog
**Covers:** FR-12, D-11
**Dependencies:** 2.5, 2.6, 1.2
**TDD:** not-applicable — documentation text; content is asserted by the documentation-consistency test, which is extended first
**Affected artifacts:** docs/WORKFLOW.md, README.md, CHANGELOG.md, src/__tests__/unit/cli/documentation-consistency.test.ts
**Acceptance criteria:** 1. `docs/WORKFLOW.md` describes:
   - the `baseRef` input, its validation rules, and `invalid-base-ref`;
   - the Git 2.30 minimum;
   - the merge-base-to-working-tree change set, with excerpts from the working tree;
   - the `jev-review-<kind>-range-<hash>.json` name and binding;
   - the rule that the commit lookup matches staged diffs only;
   - the zero-based-only score scale.
   2. The README JEV paragraph mentions `baseRef`. 3. The CHANGELOG Unreleased section covers both changes. 4. The documentation test asserts `baseRef`, `invalid-base-ref`, `-range-`, and `zero-based` in WORKFLOW.md. 5. No doc mentions a one-based fallback.
**Verification:** `npx vitest run src/__tests__/unit/cli/documentation-consistency.test.ts`

### 4.1 Full verification gates
**Covers:** NFR-1, D-12
**Dependencies:** 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2
**TDD:** not-applicable — verification-only task with no new behaviour
**Affected artifacts:** none
**Acceptance criteria:** 1. The full test suite has no failures other than the known pre-existing "maps interactive cancellation to exit code 130 without writes" in `compiled-cli.e2e.test.ts`. 2. Any `entrypoints.stdio` JEV schema flake is reported, with one rerun result. 3. Lint reports 0 errors, and typecheck and build exit 0. 4. `git diff --stat -- .spec/specs/jev-advisory-toggle/` is empty. 5. No commit or push is made.
**Verification:** Run `npm test`, `npm run lint`, `npm run typecheck` (or the repository equivalent), and `npm run build`, and record the exit codes and failure lists in the implementation report.
