# Simple Task Reference

Read only when scope or completion is unclear.

## Appropriate Scope

Good candidates are one focused bug, a small behavior addition, a contained refactor, or a configuration correction with known acceptance behavior. Use formal SDD when the work needs competing architecture decisions, new subsystem boundaries, durable phase approvals, or a multi-step migration contract.

## TDD Reminder

RED proves the test can detect the missing behavior. GREEN implements the complete requested contract with minimal surface area. REFACTOR removes duplication or accidental complexity while preserving GREEN. Test externally observable results and real failures rather than private calls or source text.

## Completion Checklist

- request and non-goals remain unchanged;
- existing repository conventions were reused;
- focused RED and GREEN evidence was observed;
- relevant boundary and error behavior is protected;
- authorization, injection, secrets, and logging were considered;
- every affected caller/artifact is updated;
- unrelated user work is preserved;
- response lists exact changes, verification, and blockers without dumping file contents.
