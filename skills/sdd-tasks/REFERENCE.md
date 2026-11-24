# Task Planning Reference

Read only for formatting and decomposition help.

## Task Template

```markdown
### 1.1 Observable outcome
**Covers:** FR-1, NFR-1, D-1
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/example.ts, src/example.test.ts
**Acceptance criteria:** The stated behavior and failure boundary are observable.
**Verification:** Run the focused test, then the affected checks.
```

Use comma-separated values for `Covers`, `Dependencies`, and `Affected artifacts`; use literal `none` for an empty set. For non-behavioral work, write `**TDD:** not-applicable — <specific reason>`.

## Decomposition

Prefer a vertical behavior slice over separate “write all tests” and “write all code” phases. Split when a task has distinct observable outcomes, ownership boundaries, or independently verifiable failure modes. Merge tasks that would otherwise require a serial handoff with no standalone value. Mark concurrency only when slices do not edit the same contract or require one another's output.

## JEV Case List

When the JEV `testcases` check is active, it asks for a case list once. Send one entry per planned test case for each TDD-required task: `taskId` (for example `1.1`), `kind` (`behavior`, `boundary`, `error`, `transition`, or `security`), `given`, `when`, `then`, and `covers` (the acceptance criterion the case proves). Keep the list in task order; the same list in the same order is recognized as unchanged. Cases for tasks that are not TDD-required are not sent. Present flagged tasks first, then the rest, and treat the check as advice: it never records the test-case review checkpoint.

## Checklist

Every requirement and design component is covered; dependencies form an acyclic order; each behavioral task begins with RED; edge/error/security/migration scenarios appear where relevant; acceptance criteria are measurable; optional test-case review is explicit; no task is merely “finish”, “wire up”, or “add tests”; and approval remains a separate user-visible gate.

## Delegated Reviewer

Use this only when `.spec/sdd-config.json` sets `approval.mode` to `delegated-reviewer`. Otherwise ask the human.

- A reviewer listed in `approval.reviewers` (default `agy`) may answer the approval question instead of the human. The authoring agent is never the reviewer.
- The reviewer reads the exact submitted artifact and writes `review/<reviewer>-tasks-r<revision>.json` in the feature directory with `reviewer`, `phase`, `revision`, `artifact_sha256`, and `verdict` (`approve` or `reject`).
- Only an `approve` verdict for the current revision and hash permits the internal approval call, with `approvedBy` and `reviewSidecar`. The runtime refuses any mismatch.
- A `reject` verdict is not approval. Report the findings, revise, and resubmit.
- The test-case checkpoint stays human. A delegated reviewer never records it.
