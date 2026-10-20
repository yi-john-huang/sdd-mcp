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
