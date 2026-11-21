---
name: sdd-implement
description: Implement approved SDD tasks test-first with focused verification and security checks.
disable-model-invocation: true
---

# SDD Implementation

Work inline in the current turn. Backend lifecycle calls are internal; never ask the user to operate raw MCP tools.

## Execution Mode

Never create a serial specialist or split work to justify agents. Only when project agents are installed and at least two independent, dependency-ready slices can run concurrently, ask once per session, in the user's language, "inline or project agent for this run?" and reuse the answer; never ask again or per phase. Agent mode: one `specialistDepth: 1` handoff per slice, no nesting or retry; on failure record one fallback and finish that slice in the parent.

## Restore Durable Progress

1. Internally resolve status and load compact implementation context. Requirements, design, tasks, and any required test-case review must be approved.
2. If invoked too early or state is blocked, present the persisted blocker and change nothing.
3. Internally begin implementation when status requests it; otherwise follow the next action: continue the active task, let the user pick among resumable candidates, or select a dependency-ready pending task.
4. Read the approved task, acceptance criteria, design interfaces, and steering before editing. Never infer progress from chat or Markdown checkboxes.

If the runtime is unavailable by host permission, report a reload/trust or policy blocker; never substitute manual backend instructions.

## Governed Task Loop

For each selected task, internally record `start` with the exact revision. RED, GREEN, and COMPLETE records carry the test command as `run.argv`; the server runs it and records the observed exit code, hash, and excerpt. Never type an exit code. Then:

1. **RED:** for TDD-required work, write a focused observable test and record RED with its command as `run.argv` before production changes; a zero exit is rejected. On `classification` `setup`, fix the test and record RED again; `assertion` is final. Then run the JEV `red` check internally and show its line (advisory only).
2. **GREEN:** implement only enough to pass, then record GREEN with the same `run.argv`.
3. **REFACTOR:** simplify without changing behavior; rerun focused verification.
4. **COMPLETE:** after all acceptance and security checks, record completion with the verification `run.argv` and the observed affected project-relative artifacts.

For `not-applicable` TDD tasks, start, implement, verify, then complete with the verification `run.argv`. On an evidence error, follow its message (see REFERENCE.md). If work cannot continue after start, internally record the blocker and reason; never fabricate evidence. On resume, continue from the persisted state without replaying completed transitions. Reread status after every record.

## Mandatory Checks

- Preserve approved interfaces and existing conventions; update every affected caller.
- Test boundaries, errors, invariants, transitions, and precedence, not implementation plumbing.
- Validate untrusted input, enforce authorization, avoid injection, protect secrets and sensitive logs, and fail safely.
- Consider concurrency, cleanup, compatibility, cancellation, rollback, and error propagation.
- Run focused verification while iterating, then all affected checks. Never fabricate test, coverage, lint, or build results.

## Output

Report persisted task states, observed artifacts, RED/GREEN/verification evidence, security decisions, next action, and blockers. Never expose backend JSON or raw MCP operations as user steps. Execution report: mode (inline|project-agent; asked|reused|not offered), agents started and whether parallel, configured model/effort per agent (never claim unobserved values), and any fallback to the parent.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for progress examples, evidence errors, SOLID, OWASP, or completion checklists.
