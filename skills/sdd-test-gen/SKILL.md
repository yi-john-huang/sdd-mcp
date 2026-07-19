---
name: sdd-test-gen
description: Generate focused tests for observable behavior, boundaries, and real failures.
disable-model-invocation: true
---

# Test Generation

Work inline in the current turn; do not create a serial TDD specialist.

## Required Workflow

1. Identify the exact behavior contract, scope, framework, and existing test conventions.
2. Read related requirements/design and nearby tests. Avoid duplicate coverage and incidental implementation assertions.
3. Write the smallest focused test that proves observable behavior. Cover relevant boundaries, invariants, transitions, precedence, concurrency, and real error propagation.
4. Keep tests deterministic, isolated, and full-suite safe. Prefer real domain collaborators; mock only external or nondeterministic boundaries.
5. Run the new test before production changes and confirm it fails for the intended reason. A syntax/import failure is not valid RED evidence.
6. If implementation is in scope, make the minimal change, rerun the focused test to GREEN, refactor, and rerun.
7. Never weaken assertions, snapshot unstable output, add sleeps, or claim coverage/test results that were not observed.

Use focused test commands during the cycle. Broader verification belongs after the requested behavior works.

## Output

Report tests added or changed, contracts protected, the expected failing-test evidence, focused passing-test evidence, affected artifacts, and unresolved blockers.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for test matrices, framework examples, naming guidance, or the extended quality checklist.
