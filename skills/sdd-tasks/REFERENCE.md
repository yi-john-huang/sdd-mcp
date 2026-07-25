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

## Checklist

Every requirement and design component is covered; dependencies form an acyclic order; each behavioral task begins with RED; edge/error/security/migration scenarios appear where relevant; acceptance criteria are measurable; optional test-case review is explicit; no task is merely “finish”, “wire up”, or “add tests”; and approval remains a separate user-visible gate.
