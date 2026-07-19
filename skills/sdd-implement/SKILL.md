---
name: sdd-implement
description: Implement approved SDD tasks test-first with focused verification and security checks.
disable-model-invocation: true
---

# SDD Implementation

Work inline in the current turn. Do not create a serial implementation specialist. Delegate only when at least two genuinely independent slices can run concurrently.

## Prerequisites

- Use `sdd-status`: requirements, design, and tasks must be approved.
- If test-case review is configured, `sdd-review-test-cases` must already be complete.
- Read the approved task, its acceptance criteria, design interfaces, and relevant steering before editing.

## Required TDD Cycle

For each task:

1. **RED:** write a focused test for observable behavior and run it to prove the expected failure.
2. **GREEN:** implement only enough production code to pass; run the focused test.
3. **REFACTOR:** simplify without changing behavior; rerun the focused test.

Do not mark a task complete without recorded failing and passing evidence. Test boundaries, errors, invariants, transitions, and precedence—not implementation plumbing.

## Mandatory Checks

- Preserve approved interfaces and existing conventions; update every affected caller.
- Validate untrusted input, enforce authorization, avoid injection, protect secrets and sensitive logs, and fail safely.
- Consider concurrency, resource cleanup, compatibility, and error propagation where applicable.
- Run only relevant verification while iterating, then the required affected checks.
- Update task status only after acceptance criteria and security checks pass. Never fabricate test, coverage, lint, or build results.

## Output

Report completed task numbers, affected artifacts, RED/GREEN verification evidence, security-relevant decisions, and unresolved blockers. Write large artifacts to their canonical files instead of echoing them.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only when detailed SOLID, OWASP, anti-pattern, or completion checklists are needed.
