---
name: sdd-implement
description: Implement approved SDD tasks test-first with focused verification and security checks.
disable-model-invocation: true
---

# SDD Implementation

Work inline in the current turn. Do not create a serial implementation specialist. Delegate only when at least two genuinely independent slices can run concurrently. Backend lifecycle calls are internal; never ask the user to operate raw MCP tools.

## Restore Durable Progress

1. Internally resolve status and load compact implementation context. Requirements, design, tasks, and any required test-case review must be approved.
2. If invoked too early or state is blocked, present the persisted blocker and make no workflow or source change.
3. Internally begin implementation when status requests it. Otherwise follow the returned next action: continue the exact active task, ask the user to select among resumable candidates, or select only a dependency-ready pending task.
4. Read the approved task, acceptance criteria, design interfaces, and relevant steering before editing. Never infer progress from chat or Markdown checkboxes.

If the runtime is unavailable because of host permission, report an actionable reload/trust or policy blocker; never substitute manual backend instructions.

## Governed Task Loop

For each selected task, internally record `start` with the exact implementation revision. Then:

1. **RED:** for TDD-required work, write a focused observable test and run it to prove the expected failure. Record the observed command, non-zero exit code, and concise summary before production changes.
2. **GREEN:** implement only enough to pass and run the focused test. Record the observed command, zero exit code, and summary.
3. **REFACTOR:** simplify without changing behavior; rerun focused verification.
4. **COMPLETE:** run final verification. Only after a zero exit code and all acceptance/security checks, record completion with the observed affected project-relative artifacts.

For `not-applicable` TDD tasks, start, implement, verify, then complete with zero-exit verification evidence. If work cannot continue after start, internally record the blocker and reason; do not fabricate evidence. On resume, continue from persisted `in-progress`, `red-observed`, `green-observed`, or `blocked` state without replaying completed transitions. Reread status after every progress record.

## Mandatory Checks

- Preserve approved interfaces and existing conventions; update every affected caller.
- Test relevant boundaries, errors, invariants, transitions, and precedence—not implementation plumbing.
- Validate untrusted input, enforce authorization, avoid injection, protect secrets and sensitive logs, and fail safely.
- Consider concurrency, cleanup, compatibility, cancellation, rollback, and error propagation where applicable.
- Run only relevant verification while iterating, then all affected checks. Never fabricate test, coverage, lint, or build results.

## Output

Report persisted task numbers/states, observed affected artifacts, RED/GREEN/final verification evidence, security decisions, next action, and blockers. Do not expose backend JSON or present raw MCP operations as user steps.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only when detailed progress examples, SOLID, OWASP, anti-pattern, or completion checklists are needed.
