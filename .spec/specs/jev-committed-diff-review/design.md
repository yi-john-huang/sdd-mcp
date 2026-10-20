# Design: jev-committed-diff-review

## Overview

This design extends the existing JEV services. It adds no new service and no new port. A small new pure module validates and resolves `baseRef`. The change manifest gains a second builder for the committed range. The sidecar binding gains two optional fields. The score validator drops its base inference.

The behaviour without `baseRef` is unchanged by construction: every new branch is entered only when `request.baseRef !== undefined`. A binding without the new fields serializes exactly as before, because `pickBinding` omits undefined keys.

## Requirements Traceability

| Requirement | Decisions |
|---|---|
| FR-1 | D-1 |
| FR-2 | D-1, D-2 |
| FR-3 | D-3 |
| FR-4 | D-4 |
| FR-5 | D-4, D-5, D-6 |
| FR-6 | D-5, D-6 |
| FR-7 | D-7 |
| FR-8 | D-2, D-6 |
| FR-9 | D-8 |
| FR-10 | D-8, D-9 |
| FR-11 | D-10 |
| FR-12 | D-11 |
| NFR-1 | D-12 |
| NFR-2 | D-3 |
| NFR-3 | D-4 |

## Architecture and Data Flow

Data ownership:

- The caller owns `baseRef`. It is never logged, never written to a sidecar, and never echoed in a result.
- GitPort owns all repository reads. Every call is one argument vector without a shell.
- `JevChangeManifest` owns the change-set definition and `diffSha256`.
- `JevSidecarStore` owns the file names, the binding comparison, and the whitelist serialization.
- `JevResponseValidator` owns the score-scale rule.

Flow of a `security` or `principles` call with `baseRef`:

1. `JevAdvisoryService.run`: the `disabled` gate. Then, for `commit`, a `baseRef` gives `invalid-base-ref`; otherwise the lookup runs as today. Then the `no-key` gate.
2. Pure validation (D-2). A malformed `baseRef`, or a `baseRef` on a check other than `security` or `principles`, returns `skipped / invalid-base-ref`. No git call, no file system write, no HTTP call.
3. Feature-scope check (file system existence only, as today).
4. `manifestFor(request)` (D-6): with no `baseRef`, `buildReviewManifest` (unchanged); otherwise `buildRangeManifest`. A range resolution failure returns `skipped / invalid-base-ref`.
5. With `SDD_JEV_ALLOW_CODE` off: a `code-disabled` sidecar bound to the manifest from step 4. Otherwise `JevReviewCheck.run` with that manifest. Excerpts, redaction, fitting, and the exchange are unchanged.
6. `JevExchange` reuses a sidecar only on a full binding match. Otherwise it sends one request, validates zero-based scores (D-8), and persists through the whitelist.

The `commit` check reads only the staged manifest and non-range sidecars of the current question-set version (D-7).

## Components and Interfaces

### D-1: Request field, schema, and skip reason
**Covers:** FR-1, FR-2
**Decision:** The `sdd-jev-check` input schema gets `baseRef: { type: 'string', minLength: 1, maxLength: 256 }`. It has no schema pattern. The service is the one place that decides validity, so a direct service call and a tool call give the same `invalid-base-ref` result. The rest of the schema (`additionalProperties: false`, `required`, `allOf`) is unchanged. `JevCheckRequest` gets `baseRef?: string`. `SDDToolAdapter.handleJevCheck` passes `args.baseRef as string | undefined` unchanged. `JevSkipReason` gets `'invalid-base-ref'`.
**Failure behavior:** When the schema layer rejects a value (an empty string, or a string over 256 characters), the host's existing input-validation error applies. The service still validates both rules itself (D-2), as a second layer.
**Verification:** Schema and inventory tests (`sddJevCheckTool.test.ts`, `SDDToolAdapter.inventory.test.ts`, `entrypoints.stdio.test.ts`) assert the property, its bounds, and the unchanged required set. An adapter test asserts the pass-through.

### D-2: Pure baseRef validation in a new module `JevBaseRef.ts`
**Covers:** FR-2, FR-8
**Decision:** `isWellFormedBaseRef(value: string): boolean` returns false in these cases:
- `value.length === 0` or `value.length > 256`;
- `value.startsWith('-')`;
- `/\s/u` matches;
- `/[\u0000-\u001F\u007F]/` matches.

The check order in `JevAdvisoryService.run` is:
1. the `disabled` gate;
2. for `commit`: when `baseRef !== undefined`, `skipped / invalid-base-ref`; else the lookup;
3. the `no-key` gate;
4. when `baseRef !== undefined` and (the check is not `security` or `principles`, or the value is not well formed): `skipped / invalid-base-ref`;
5. the feature-scope check, and then the rest as today.

The `disabled` and `no-key` gates therefore still come first. Step 4 runs before any GitPort call.
**Failure behavior:** Validation cannot throw. Any unexpected error is caught by the existing `check()` wrapper, which returns `not-ready`.
**Verification:** A table-driven unit test covers a leading `-`, `--output=x`, a space, a tab, a newline, NUL, DEL, `''`, 257 characters, and a valid `origin/develop` and SHA. Service tests with a recording GitPort and a recording HTTP port assert zero git calls, zero HTTP calls, and no new files under `.spec` for every invalid case, for `baseRef` on the `requirements` and `commit` checks, and for the disabled and no-key cases with a `baseRef`.

### D-3: Read-only range resolution `resolveRange(git, root, baseRef)`
**Covers:** FR-3, NFR-2
**Decision:** This function is in `JevBaseRef.ts`. It runs, in order:
1. `['rev-parse', '--verify', '--quiet', '--end-of-options', `${baseRef}^{commit}`]`;
2. `['rev-parse', '--verify', '--quiet', 'HEAD']`;
3. `['merge-base', base, head]`.

Each stdout is trimmed and must match `^[0-9a-f]{40}(?:[0-9a-f]{24})?$`, which covers SHA-1 and SHA-256 repositories. `merge-base` receives only those two validated IDs. The function returns `{ ok: true; rangeBaseCommit; headCommit } | { ok: false }`. `baseRef` appears only in vector 1, as the element directly after `--end-of-options`.
**Failure behavior:** Any non-zero exit, empty output, or non-hex output gives `{ ok: false }`, which the caller maps to `skipped / invalid-base-ref` with no HTTP call. This includes an unknown ref, a non-commit object, no common ancestor, and an unborn HEAD. `rev-parse --end-of-options` needs Git 2.30 or later. On older Git the command fails, so the safe failure is the same `invalid-base-ref` skip. The docs state this minimum.
**Verification:** A recording-GitPort test asserts the exact three vectors. Real temporary-repository tests cover: a missing ref, a tree object (`HEAD^{tree}` SHA), and an orphan branch with unrelated history. An allowlist test asserts that every vector issued in baseRef mode starts with `rev-parse`, `merge-base`, `diff`, `status`, `ls-files`, `ls-tree`, `hash-object` (with no `-w`), or `-c status.renames=false status`, and that no vector contains `--output`.

### D-4: Committed-range manifest `buildRangeManifest(git, root, baseRef)`
**Covers:** FR-4, FR-5, NFR-3
**Decision:** Add this function to `JevChangeManifest.ts`. It returns `ChangeManifest | { status: 'invalid-base-ref' }`. The `ok` variant gets an optional `range: { rangeBaseCommit; headCommit }`.

After `resolveRange` succeeds, the path set is the union of two sources:
- tracked paths from `['diff', '--name-status', '--no-renames', '--no-ext-diff', '-z', rangeBaseCommit, '--']`, which compares the merge-base tree with the working tree;
- untracked paths (`??` records) from the existing `status --porcelain=v1 -z --untracked-files=all` call.

Each path is then turned into a token by the same logic as the review manifest. The current per-path loop in `reviewEntries` is extracted into a shared `tokenEntries(git, root, paths, gitlinkTree)`. `reviewEntries` calls it with `gitlinkTree = 'HEAD'`, so its behaviour is identical. The range builder calls it with `gitlinkTree = rangeBaseCommit`, so a submodule bumped in a commit is kept. `finish` is unchanged: sidecar paths are filtered out, the 2,000-path limit applies, and the hash is the same definition as before. `baseCommit` (HEAD) is set as today.

Compared with the uncommitted mode, the extra git calls are: base resolution, merge-base, and one `diff` (HEAD resolution reuses the existing `baseCommit` lookup). This is within NFR-3.
**Failure behavior:** A resolution failure gives `invalid-base-ref`. A `diff` or `status` failure, or an over-limit path count, gives `unavailable`, which the review check treats as today (an unbound exchange; no sidecar read or written). No changed path gives `empty`, which becomes `skipped / no-changes`.
**Verification:** Temporary-repository tests cover:
- a committed change on a branch with a clean tree: the path is listed and a request is sent;
- an added uncommitted change: the path is added and `diffSha256` changes;
- merge-base equal to HEAD with a clean tree: `no-changes`;
- a sidecar path is excluded;
- a deleted file gets the `deleted` token;
- a symlink gets the link blob;
- 2,001 paths give `unavailable`.

The existing `JevChangeManifest.test.ts` expectations stay unchanged (FR-5).

### D-5: Range binding and file name in `JevSidecarStore`
**Covers:** FR-6
**Decision:** `SidecarBinding` gets `rangeBaseCommit?: string` and `headCommit?: string`. Both are appended to `BINDING_KEYS`, so `pickBinding` and `sameBinding` include them automatically. When `kind` is `security` or `principles` and `binding.rangeBaseCommit !== undefined`, `fileNameFor` returns `jev-review-${kind}-range-${diffSha256.slice(0, 12)}.json`. Otherwise the name is unchanged.

Because undefined keys are omitted, a no-baseRef binding produces byte-identical JSON. Sidecars that were stored before this feature compare as "undefined on both sides" for the new keys. They are then still rejected by the version bump (D-9).
**Failure behavior:** A partial or mismatched binding never matches, so the sidecar is ignored as stale and a new request is made. The existing rule that an `answered` sidecar is never overwritten by `unavailable` uses the file name, so it applies to range files without change. The installer's ignore pattern `.spec/specs/*/review/jev-review-*` and `.spec/reviews/` already cover the range names.
**Verification:** Store tests cover:
- the range file name and the five binding fields;
- a stale result for each changed field: HEAD, merge base, content hash, input hash, and version;
- `answered` is not overwritten by `timeout`;
- a no-baseRef sidecar's JSON key set is unchanged.

An installer test asserts that `jev-review-security-range-abc.json` matches the ignore pattern.

### D-6: One manifest entry point for both review paths
**Covers:** FR-5, FR-6, FR-8
**Decision:** A private `manifestFor(request)` in `JevAdvisoryService` returns either the unchanged review manifest or the range manifest. It passes the manifest to `JevReviewCheck.run(request, context, manifest)` and to `codeDisabled`, so there is one git pass per call. Both spread `...(manifest.range && { rangeBaseCommit, headCommit })` into the binding after `diffSha256`. `invalid-base-ref` returns before any excerpt is read. Excerpts are still read from the working tree by `buildExcerpts`, with the ±15-line window, the 8,192-byte cap, redaction before clipping, and exclusions on both the requested path and the resolved realpath. `spec.json` is never written.
**Failure behavior:** Same as today: an unexpected error becomes `not-ready` through `check()`. A `code-disabled` call with an empty or unavailable manifest writes no sidecar.
**Verification:** Review tests in baseRef mode cover:
- an excluded path (`.env`), and a symlink to an excluded file, both get `excerpt: null`;
- a seeded secret is redacted;
- `spec.json` bytes are unchanged;
- `code-disabled` writes the range file name;
- with no `baseRef`, no `merge-base` and no `--end-of-options` vector is issued, and the file name matches `^jev-review-(security|principles)-[0-9a-f]{12}\.json$`.

### D-7: Commit lookup filters by binding shape and version
**Covers:** FR-7
**Decision:** `JevSidecarStore.findByDiff(projectRoot, featureName, kind, diffSha256, questionSetVersion)` returns a sidecar only when all of these hold:
- `binding.diffSha256 === diffSha256`;
- `binding.questionSetVersion === questionSetVersion`;
- `binding.rangeBaseCommit === undefined` and `binding.headCommit === undefined`.

`JevCommitLookup` passes `QUESTION_SET_VERSION`. The lookup still builds only the staged manifest. The non-range file name keeps range files out of the lookup by name, and the binding check is a second layer.
**Failure behavior:** Any mismatch means no warning. The lookup still makes no JEV request, needs no key, and writes nothing.
**Verification:** Commit tests cover:
- a range sidecar with a confirmed critical finding and a matching hash, placed under the non-range name to exercise the binding check: no warning;
- a version-2 non-range sidecar: no warning;
- a current-version matching sidecar: the existing warning;
- the recording ports show zero HTTP calls and no writes.

### D-8: Zero-based-only score validation
**Covers:** FR-9, FR-10
**Decision:** `parseAnswer` receives the question. For a `score` question, it accepts only `Number.isInteger(value) && value >= 0 && value < question.criteria.length`, and returns `{ type: 'score', raw: value, index: value }`. The following are removed: `normalizeScores`, `NormalizedScores`, `JevScoreBase`, the `scoreBase` field of `ValidatedJevResponse`, `Outcome`, `JevSidecar`, and `toStored`, and the deferred score loop in `validateJevResponse`. Any invalid score returns `INVALID`, which `JevExchange` maps to `unavailable / invalid-response`. A numeric string is already rejected by the `typeof value !== 'number'` check.
**Failure behavior:** An invalid score makes the whole response `invalid-response`. No partial answers are kept. An `answered` sidecar for the same binding is not overwritten.
**Verification:** Validator tests cover:
- accepted: 0, and levels-1;
- rejected: -1, levels, levels+1, 1.5, and `"1"`;
- every score equal to its level count (the old one-based case) is rejected;
- `index === raw` in every accepted answer.

An exchange test checks that an out-of-range score gives `invalid-response`. Sidecar tests assert that no `scoreBase` key is written.

### D-9: Question-set version bump and text clean-up
**Covers:** FR-10
**Decision:** `QUESTION_SET_VERSION = 3`. The reason is that sidecar semantics changed: there is no `scoreBase` and no inferred base. `SCORE_SCALE_INSTRUCTION` text stays byte-identical. Its doc comment changes to state that the scale is zero-based, with no mention of a fallback. The two one-based tests are replaced by the rejection tests in D-8. Sidecar store test fixtures drop `scoreBase`. The approved `jev-advisory-toggle` artifacts are not touched.
**Failure behavior:** Version-2 sidecars no longer match any binding. They are ignored and stay on disk, and the next run writes a fresh result under the same name. (The no-overwrite rule protects only an answered file against an unavailable result. An answered v3 result replaces a v2 file of the same name.)
**Verification:** The catalog test asserts version 3 and the unchanged instruction. A repository-text test asserts that `one-inferred` appears nowhere in `src/`, `README.md`, `docs/`, `CHANGELOG.md`, or `skills/`. A store test asserts that a stored v2 sidecar is stale.

### D-10: Skill text
**Covers:** FR-11
**Decision:** Add one sentence to `skills/sdd-review/SKILL.md` step 6 and to `skills/sdd-security-check/SKILL.md` step 7: "For a PR or branch review, pass its base (for example `origin/<base-branch>` or a commit SHA) as `baseRef`; omit it when only uncommitted changes are reviewed." Both files stay below 4,000 bytes; they are currently 2,657 and 2,770 bytes. Only canonical `skills/` files are edited. The repository holds no generated native copies, and installed host copies are refreshed by reinstalling.
**Failure behavior:** Not applicable: these are static text edits.
**Verification:** `JevSkillText.test.ts` asserts `baseRef` in both Skills. The existing byte-limit tests stay green.

### D-11: Documentation
**Covers:** FR-12
**Decision:** `docs/WORKFLOW.md`, in the "Optional JEV advisory" section, gets a "Reviewing committed branch changes" paragraph. It covers:
- the `baseRef` input;
- the validation rules and the `invalid-base-ref` skip;
- Git 2.30 or later;
- the merge-base(baseRef, HEAD)-to-working-tree change set, with excerpts read from the working tree;
- the `jev-review-<kind>-range-<hash>.json` name and binding;
- the rule that `sdd-commit` matches staged diffs only and ignores range and older-version sidecars;
- one sentence that scores are zero-based integers 0 to levels-1, and that any other value is `invalid-response`.

The tool list in README.md is unchanged. The README JEV paragraph mentions `baseRef` in one clause. `CHANGELOG.md` gets an Unreleased entry for both changes.
**Failure behavior:** Not applicable: these are static text edits.
**Verification:** `documentation-consistency.test.ts` asserts `baseRef`, `invalid-base-ref`, `-range-`, and `zero-based` in WORKFLOW.md, and both items in the Unreleased CHANGELOG section.

## Failure Handling

| Condition | Result | Git calls | HTTP | Files |
|---|---|---|---|---|
| JEV disabled (any `baseRef`) | unchanged `disabled` result | 0 | 0 | 0 |
| No key (any `baseRef`, not `commit`) | `unavailable / no-key` | 0 | 0 | 0 |
| `baseRef` on `commit` or another non-review check | `skipped / invalid-base-ref` | 0 | 0 | 0 |
| Malformed `baseRef` | `skipped / invalid-base-ref` | 0 | 0 | 0 |
| Unknown ref, non-commit, no merge base, Git older than 2.30 | `skipped / invalid-base-ref` | ≤3 read-only | 0 | 0 |
| Range has no changes | `skipped / no-changes` | read-only | 0 | 0 |
| `diff` or `status` fails, or more than 2,000 paths | unbound exchange, as today | read-only | 1 | 0 |
| Out-of-range score | `unavailable / invalid-response` | — | 1 | sidecar unless an answered one exists |

There is no new concurrency surface. Sidecar writes stay atomic, through `writeFileAtomic` when it is available. Rollback is to revert the change. Version-3 sidecars would then be ignored by the old version-2 code.

## Verification

### D-12: Verification gates
**Covers:** NFR-1
**Decision:** Run `npm test`, lint, typecheck, and build in the parent after implementation. Report the known `compiled-cli.e2e.test.ts` cancellation failure as pre-existing. Report any `entrypoints.stdio` JEV schema flake, with one rerun result. A focused run of `src/__tests__/unit/jev/` comes first.
**Failure behavior:** Any new failure blocks completion. It is fixed in the parent, and no failing test is skipped.
**Verification:** The command outputs and exit codes are recorded in the implementation report.
