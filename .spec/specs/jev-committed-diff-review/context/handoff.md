<!-- sdd-context schema=2 phase=implementation source=301c3984497acbb2356163f52e68c49f264eceda0e044b5d0e6e6d76fcf62332 payload=3cf03e4e974db3bd5d36ccb875e8193651b6b0f12fd02d245930eccaa03302c5 -->
# SDD Context: jev-committed-diff-review

## Workflow State
- Effective phase: implementation
- Phase status: approved
- Requirements: approved
- Design: approved
- Tasks: approved
- Test-case review: not required

## Implementation Progress
- Revision: 38
- Completed: 11/11
- Active: 0
- Blocked: 0

## Next Action
Implementation is complete.

## Source References
- requirements.md
- design.md
- tasks.md

## Payload Estimate
- Payload estimated tokens: 02042

## Selected Context
- # Requirements: jev-committed-diff-review
- ## Introduction
- This feature follows the completed `jev-advisory-toggle` spec. It does not edit that spec's approved artifacts. It makes two changes to the `sdd-jev-check` tool:
- The B1 `security` and B2 `principles` checks get an optional `baseRef` input, so a PR or branch review can also judge changes that are already committed.
- The JEV score scale is zero-based only. The one-based inference fallback is removed.
- ### Users
- Developers and reviewers who run `sdd-review` or `sdd-security-check` on a PR or branch whose changes are already committed.
- Maintainers of `sdd-mcp-server`, who need one clear score-scale rule.
- ### Scope
- An optional `baseRef` input on `sdd-jev-check` for `security` and `principles`.
- Strict `baseRef` validation and read-only resolution.
- A committed-range change manifest and its sidecar binding.
- The rule that the `commit` lookup uses only staged diffs.
- Zero-based-only score validation, removal of one-based inference, and a `QUESTION_SET_VERSION` bump.
- Updates to the `sdd-review` and `sdd-security-check` Skill text, the tool input schema, docs, CHANGELOG, and tests.
- ### Out of scope
- Edits to `.spec/specs/jev-advisory-toggle/` artifacts.
- Any change to behaviour when `baseRef` is absent.
- Git commands that write (fetch, checkout, reset, commit, gc, index writes beyond what `git status` already does).
- JEV results that block, gate, or approve anything; any JEV change to `spec.json`.
- Commit-time warnings from committed-range sidecars.
- Changes to the requirements, design, testcases, and red checks other than the score-scale rule.
- ### Assumptions and dependencies
- Git 2.24 or later is available (`--end-of-options` support).
- Code excerpts are still read from the working tree, as today.
- ### Success measures
- Each FR below has at least one automated test.
- `npm test` passes, except the known pre-existing failure "maps interactive cancellation to exit code 130 without writes" in `compiled-cli.e2e.test.ts`. A recurrence of the intermittent `entrypoints.stdio` JEV schema flake is reported.
- Lint reports 0 errors. Typecheck and build pass.
- ## Functional Requirements
- ### FR-1: Optional baseRef input
- **Objective:** Let a caller ask the `security` and `principles` checks to review a committed branch range.
- **EARS Specification:** The `sdd-jev-check` tool input schema SHALL accept an optional string property `baseRef` (1 to 256 characters) and SHALL use it only for the `security` and `principles` checks.
- **Acceptance Criteria:** 1. The published `sdd-jev-check` input schema lists `baseRef` as an optional string with `minLength` 1 and `maxLength` 256. 2. The schema still has `additionalProperties: false` and the same required properties. 3. The CLI adapter passes `baseRef` to the JEV service unchanged. 4. The tool inven
- ### FR-2: Strict baseRef validation without git side effects
- **Objective:** Prevent option injection and malformed refs before any git command runs.
- **EARS Specification:** IF `baseRef` is empty, longer than 256 characters, starts with `-`, contains any whitespace, or contains a control character (U+0000 to U+001F or U+007F), THEN the service SHALL return `status: "skipped"` with `skipReason: "invalid-base-ref"` without running any git command, sending any JEV requ
- **Acceptance Criteria:** 1. Tests cover a leading `-` (for example `--output=x`), a space, a tab, a newline, NUL, DEL, an empty string, and 257 characters. Each test asserts the skip result, zero GitPort calls, zero HTTP calls, and zero files written. 2. If `baseRef` is given with a check other than `security` or `prin
- ### FR-3: Read-only base resolution
- **Objective:** Resolve the range with read-only git commands only.
- **EARS Specification:** WHEN a well-formed `baseRef` is given for `security` or `principles`, the service SHALL resolve it through GitPort with `git rev-parse --verify --quiet --end-of-options <baseRef>^{commit}`, resolve `HEAD` with `git rev-parse --verify --quiet HEAD`, and compute the merge base with `git merge-base
- **Acceptance Criteria:** 1. A test records the exact GitPort argument vectors and asserts that `--end-of-options` comes before the ref and that `^{commit}` is appended. 2. A ref that does not exist, a ref that names a non-commit object, and unrelated histories with no merge base each produce `invalid-base-ref` with no 
- ### FR-4: Committed-range change set
- **Objective:** Define clearly what a baseRef review covers.
- **EARS Specification:** WHEN `baseRef` resolves, the service SHALL build the change manifest from every path that differs between the merge-base commit and the current working tree. This includes changes committed in merge-base..HEAD, uncommitted tracked changes, and untracked files. Each path token SHALL use the same 
- **Acceptance Criteria:** 1. In a temporary repository, a branch with one committed change and a clean working tree yields a manifest that contains the committed path. A JEV request is sent for findings in that path. 2. Adding an uncommitted change adds that path and changes `diffSha256`. 3. JEV sidecar paths are exclud
- ### FR-5: Unchanged behaviour without baseRef
- **Objective:** Keep the current uncommitted review behaviour exactly.
- **EARS Specification:** WHEN `baseRef` is absent, the `security` and `principles` checks SHALL build the same manifest, send the same request, and write the same sidecar file name and content as before this feature.
- **Acceptance Criteria:** 1. The existing review, gate, and manifest tests pass without changes to their expectations, except for the `QUESTION_SET_VERSION` value. 2. A test asserts that with no `baseRef` no `merge-base` or `--end-of-options` git command is issued, and that the sidecar file name has the form `jev-review
- ### FR-6: Committed-range sidecar binding
- **Objective:** Bind a committed-range result to exactly the range and content it judged.
- **EARS Specification:** WHEN a baseRef review writes a sidecar, the store SHALL write `jev-review-<kind>-range-<first 12 hex of diffSha256>.json`. Its binding SHALL hold `questionSetVersion`, `inputSha256`, `diffSha256`, `rangeBaseCommit` (the merge-base) and `headCommit`. The service SHALL reuse a stored sidecar only 
- **Acceptance Criteria:** 1. A test asserts the file name and the five binding fields. 2. Changing HEAD, the merge base, the working-tree content, the inputs, or the question-set version each causes a stored range sidecar to be ignored. 3. An `answered` range sidecar is not overwritten by a later `unavailable` result fo
- ### FR-7: Commit lookup still matches staged diffs only
- **Objective:** Keep the `sdd-commit` warning tied to exactly what is being committed.
- **EARS Specification:** The `commit` check SHALL compare only the staged manifest with sidecars that have no range binding and whose `questionSetVersion` equals the current version. It SHALL ignore committed-range sidecars and sidecars with any other version.
- **Acceptance Criteria:** 1. A range sidecar with a confirmed critical finding and a `diffSha256` equal to the staged manifest hash produces no warning. 2. A no-baseRef sidecar with an old `questionSetVersion` produces no warning. 3. The existing staged-match warning test still passes. 4. The lookup still makes no JEV r
- ### FR-8: Existing guarantees preserved in baseRef mode
- **Objective:** Make sure baseRef mode weakens no existing guarantee.
- ## Overview