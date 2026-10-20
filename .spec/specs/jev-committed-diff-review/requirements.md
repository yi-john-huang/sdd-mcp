# Requirements: jev-committed-diff-review

## Introduction

This feature follows the completed `jev-advisory-toggle` spec. It does not edit that spec's approved artifacts. It makes two changes to the `sdd-jev-check` tool:

1. The B1 `security` and B2 `principles` checks get an optional `baseRef` input, so a PR or branch review can also judge changes that are already committed.
2. The JEV score scale is zero-based only. The one-based inference fallback is removed.

### Users

- Developers and reviewers who run `sdd-review` or `sdd-security-check` on a PR or branch whose changes are already committed.
- Maintainers of `sdd-mcp-server`, who need one clear score-scale rule.

### Scope

- An optional `baseRef` input on `sdd-jev-check` for `security` and `principles`.
- Strict `baseRef` validation and read-only resolution.
- A committed-range change manifest and its sidecar binding.
- The rule that the `commit` lookup uses only staged diffs.
- Zero-based-only score validation, removal of one-based inference, and a `QUESTION_SET_VERSION` bump.
- Updates to the `sdd-review` and `sdd-security-check` Skill text, the tool input schema, docs, CHANGELOG, and tests.

### Out of scope

- Edits to `.spec/specs/jev-advisory-toggle/` artifacts.
- Any change to behaviour when `baseRef` is absent.
- Git commands that write (fetch, checkout, reset, commit, gc, index writes beyond what `git status` already does).
- JEV results that block, gate, or approve anything; any JEV change to `spec.json`.
- Commit-time warnings from committed-range sidecars.
- Changes to the requirements, design, testcases, and red checks other than the score-scale rule.

### Assumptions and dependencies

- Git 2.24 or later is available (`--end-of-options` support).
- Code excerpts are still read from the working tree, as today.

### Success measures

- Each FR below has at least one automated test.
- `npm test` passes, except the known pre-existing failure "maps interactive cancellation to exit code 130 without writes" in `compiled-cli.e2e.test.ts`. A recurrence of the intermittent `entrypoints.stdio` JEV schema flake is reported.
- Lint reports 0 errors. Typecheck and build pass.

## Functional Requirements

### FR-1: Optional baseRef input
**Objective:** Let a caller ask the `security` and `principles` checks to review a committed branch range.
**EARS Specification:** The `sdd-jev-check` tool input schema SHALL accept an optional string property `baseRef` (1 to 256 characters) and SHALL use it only for the `security` and `principles` checks.
**Acceptance Criteria:** 1. The published `sdd-jev-check` input schema lists `baseRef` as an optional string with `minLength` 1 and `maxLength` 256. 2. The schema still has `additionalProperties: false` and the same required properties. 3. The CLI adapter passes `baseRef` to the JEV service unchanged. 4. The tool inventory and schema tests are updated and pass.

### FR-2: Strict baseRef validation without git side effects
**Objective:** Prevent option injection and malformed refs before any git command runs.
**EARS Specification:** IF `baseRef` is empty, longer than 256 characters, starts with `-`, contains any whitespace, or contains a control character (U+0000 to U+001F or U+007F), THEN the service SHALL return `status: "skipped"` with `skipReason: "invalid-base-ref"` without running any git command, sending any JEV request, or writing any file.
**Acceptance Criteria:** 1. Tests cover a leading `-` (for example `--output=x`), a space, a tab, a newline, NUL, DEL, an empty string, and 257 characters. Each test asserts the skip result, zero GitPort calls, zero HTTP calls, and zero files written. 2. If `baseRef` is given with a check other than `security` or `principles`, the result is the same `invalid-base-ref` skip with zero GitPort calls. 3. The `disabled` and `no-key` gates still return before any `baseRef` handling.

### FR-3: Read-only base resolution
**Objective:** Resolve the range with read-only git commands only.
**EARS Specification:** WHEN a well-formed `baseRef` is given for `security` or `principles`, the service SHALL resolve it through GitPort with `git rev-parse --verify --quiet --end-of-options <baseRef>^{commit}`, resolve `HEAD` with `git rev-parse --verify --quiet HEAD`, and compute the merge base with `git merge-base` called only with the two resolved hexadecimal commit IDs. IF any of these fails, THEN the service SHALL return `status: "skipped"` with `skipReason: "invalid-base-ref"` and send no JEV request.
**Acceptance Criteria:** 1. A test records the exact GitPort argument vectors and asserts that `--end-of-options` comes before the ref and that `^{commit}` is appended. 2. A ref that does not exist, a ref that names a non-commit object, and unrelated histories with no merge base each produce `invalid-base-ref` with no HTTP call. 3. Every git command issued in baseRef mode is on a read-only allowlist (`rev-parse`, `merge-base`, `diff` without `--output`, `status`, `ls-files`, `ls-tree`, `hash-object` without `-w`). A test asserts this allowlist.

### FR-4: Committed-range change set
**Objective:** Define clearly what a baseRef review covers.
**EARS Specification:** WHEN `baseRef` resolves, the service SHALL build the change manifest from every path that differs between the merge-base commit and the current working tree. This includes changes committed in merge-base..HEAD, uncommitted tracked changes, and untracked files. Each path token SHALL use the same blob, symlink, gitlink, and `deleted` definition as the existing review manifest.
**Acceptance Criteria:** 1. In a temporary repository, a branch with one committed change and a clean working tree yields a manifest that contains the committed path. A JEV request is sent for findings in that path. 2. Adding an uncommitted change adds that path and changes `diffSha256`. 3. JEV sidecar paths are excluded, and the 2,000-path limit returns `unavailable` as today. 4. When merge-base equals HEAD and the working tree is clean, the result is `skipped` with `no-changes`. 5. `docs/WORKFLOW.md` states that the reviewed change set is merge-base(baseRef, HEAD) compared to the working tree.

### FR-5: Unchanged behaviour without baseRef
**Objective:** Keep the current uncommitted review behaviour exactly.
**EARS Specification:** WHEN `baseRef` is absent, the `security` and `principles` checks SHALL build the same manifest, send the same request, and write the same sidecar file name and content as before this feature.
**Acceptance Criteria:** 1. The existing review, gate, and manifest tests pass without changes to their expectations, except for the `QUESTION_SET_VERSION` value. 2. A test asserts that with no `baseRef` no `merge-base` or `--end-of-options` git command is issued, and that the sidecar file name has the form `jev-review-<kind>-<12 hex>.json`.

### FR-6: Committed-range sidecar binding
**Objective:** Bind a committed-range result to exactly the range and content it judged.
**EARS Specification:** WHEN a baseRef review writes a sidecar, the store SHALL write `jev-review-<kind>-range-<first 12 hex of diffSha256>.json`. Its binding SHALL hold `questionSetVersion`, `inputSha256`, `diffSha256`, `rangeBaseCommit` (the merge-base) and `headCommit`. The service SHALL reuse a stored sidecar only when all binding fields are equal, and SHALL ignore any other stored sidecar as stale.
**Acceptance Criteria:** 1. A test asserts the file name and the five binding fields. 2. Changing HEAD, the merge base, the working-tree content, the inputs, or the question-set version each causes a stored range sidecar to be ignored. 3. An `answered` range sidecar is not overwritten by a later `unavailable` result for the same file. 4. With `SDD_JEV_ALLOW_CODE` off, the `code-disabled` sidecar uses the same range binding and file name. 5. The installer's existing ignore patterns cover range sidecar names (test asserted).

### FR-7: Commit lookup still matches staged diffs only
**Objective:** Keep the `sdd-commit` warning tied to exactly what is being committed.
**EARS Specification:** The `commit` check SHALL compare only the staged manifest with sidecars that have no range binding and whose `questionSetVersion` equals the current version. It SHALL ignore committed-range sidecars and sidecars with any other version.
**Acceptance Criteria:** 1. A range sidecar with a confirmed critical finding and a `diffSha256` equal to the staged manifest hash produces no warning. 2. A no-baseRef sidecar with an old `questionSetVersion` produces no warning. 3. The existing staged-match warning test still passes. 4. The lookup still makes no JEV request, needs no key, and writes nothing.

### FR-8: Existing guarantees preserved in baseRef mode
**Objective:** Make sure baseRef mode weakens no existing guarantee.
**EARS Specification:** WHILE `baseRef` is used, the service SHALL keep all existing JEV guarantees:
- the default-off toggle and `SDD_JEV_API_KEY` requirement;
- the `SDD_JEV_ALLOW_CODE` opt-in;
- redaction before clipping;
- ±15-line excerpts read from the working tree, with an 8,192-byte total cap;
- path exclusions, including resolved symlink targets;
- advisory-only results and no `spec.json` changes;
- zero files and zero git commands when JEV is disabled or has no key.
**Acceptance Criteria:** 1. Disabled and no-key tests with a `baseRef` assert zero GitPort calls, zero HTTP calls, and no `.spec` changes. 2. A baseRef test asserts that an excluded or symlink-to-excluded path sends no excerpt, and that a seeded secret is redacted. 3. A test asserts that `spec.json` is byte-identical before and after a baseRef review.

### FR-9: Zero-based-only score validation
**Objective:** Make the score scale definitive.
**EARS Specification:** WHEN a JEV response contains a score answer, the validator SHALL accept it only if it is an integer from 0 to (level count - 1). For any other value, including a value equal to the level count, the validator SHALL treat the whole response as `invalid-response`.
**Acceptance Criteria:** 1. Tests accept 0 and levels-1, and reject -1, levels, levels+1, 1.5, and a numeric string. 2. A response where every score equals its level count (previously inferred as one-based) is `invalid-response`. 3. The stored score `index` always equals `raw`.

### FR-10: Removal of one-based inference
**Objective:** Remove the guessed fallback and the uncertainty around it.
**EARS Specification:** The codebase SHALL contain no `one-inferred` score base, no one-based inference branch, and no comment, test name, or doc sentence that describes the score scale as uncertain or as having a fallback. `QUESTION_SET_VERSION` SHALL be 3, and the zero-based scale instruction text SHALL be kept.
**Acceptance Criteria:** 1. A search of `src/`, `README.md`, `docs/`, `CHANGELOG.md`, and `skills/` for `one-inferred` returns no match. The approved artifacts in `.spec/specs/jev-advisory-toggle/` are unchanged. 2. `SCORE_SCALE_INSTRUCTION` still states the zero-based index, and the catalog test asserts version 3. 3. Sidecars that are written never record a one-based score base. 4. A stored version-2 sidecar is treated as stale.

### FR-11: Skill text passes the base ref
**Objective:** Make branch and PR reviews send the base ref.
**EARS Specification:** The `sdd-review` and `sdd-security-check` Skill texts SHALL tell the parent to pass the PR or branch base (for example `origin/<base-branch>` or a commit SHA) as `baseRef` when the review target is a PR or branch. They SHALL tell it to omit `baseRef` when the review covers only uncommitted changes.
**Acceptance Criteria:** 1. Each Skill file stays at or below 4,000 bytes (test asserted). 2. The Skill-text tests assert that the `baseRef` instruction is present. 3. Generated native targets are regenerated through the installer, not hand-edited.

### FR-12: Documentation
**Objective:** Document the input, the range definition, and the score rule.
**EARS Specification:** `docs/WORKFLOW.md`, the tool schema documentation, and `CHANGELOG.md` SHALL describe:
- the `baseRef` input and its validation rules;
- the merge-base-to-working-tree change set;
- range sidecar naming and binding;
- the commit-lookup rule (staged diffs only);
- the zero-based-only score scale.
**Acceptance Criteria:** 1. Each item above appears in `docs/WORKFLOW.md`. 2. `CHANGELOG.md` has an Unreleased entry for both changes. 3. No doc mentions a one-based fallback.

## Non-Functional Requirements

### NFR-1: Verification gates
**Objective:** Keep the repository releasable.
**EARS Specification:** WHEN implementation is complete, the full test suite, lint, typecheck, and build SHALL pass, except for the one documented pre-existing e2e failure.
**Acceptance Criteria:** 1. `npm test` shows no new failures. 2. Lint reports 0 errors. 3. Typecheck and build exit 0. 4. Any recurrence of the `entrypoints.stdio` JEV schema flake is reported.

### NFR-2: Security of git invocation
**Objective:** Make sure no user input can change git's behaviour.
**EARS Specification:** The service SHALL pass `baseRef` to git only as one argument vector element after `--end-of-options`. It SHALL pass only validated hexadecimal commit IDs to every other git command, and SHALL never invoke a shell.
**Acceptance Criteria:** 1. A test asserts that `baseRef` appears in exactly one GitPort argument vector, directly after `--end-of-options`. 2. Tests assert that `merge-base` and `diff` arguments match `^[0-9a-f]{40}([0-9a-f]{24})?$` or are fixed literals.

### NFR-3: Performance
**Objective:** Keep the extra resolution cost small.
**EARS Specification:** The baseRef mode SHALL add at most three git invocations (base resolution, HEAD resolution, merge-base), plus one `diff --name-status` invocation, compared with the uncommitted mode.
**Acceptance Criteria:** 1. A test with a counting GitPort asserts the bound for a small repository.
