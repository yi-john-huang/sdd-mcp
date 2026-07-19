# Task Planning Reference

Read only for formatting and decomposition help.

## Task Template

```markdown
### N.M Outcome
Affected artifacts:
Requirements/design traceability:
Dependencies:
RED: focused failing behavior test and command
GREEN: smallest complete behavior
REFACTOR: bounded cleanup
Acceptance criteria:
Verification:
```

## Decomposition

Prefer a vertical behavior slice over separate “write all tests” and “write all code” phases. Split when a task has distinct observable outcomes, ownership boundaries, or independently verifiable failure modes. Merge tasks that would otherwise require a serial handoff with no standalone value. Mark concurrency only when slices do not edit the same contract or require one another's output.

## Checklist

Every requirement and design component is covered; dependencies form an acyclic order; each behavioral task begins with RED; edge/error/security/migration scenarios appear where relevant; acceptance criteria are measurable; optional test-case review is explicit; no task is merely “finish”, “wire up”, or “add tests”; and approval remains a separate user-visible gate.
