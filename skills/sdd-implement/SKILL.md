---
name: sdd-implement
description: Implement approved SDD tasks test-first with focused verification and security checks.
disable-model-invocation: true
---

# SDD Implementation

Work inline in the current turn. Backend lifecycle calls are internal; never ask the user to operate raw MCP tools.

## Execution Mode

Never create a serial specialist or split work to justify agents. Only when project agents are installed and at least two independent, dependency-ready slices can run concurrently, ask once per session, in the user's language, "inline or project agent for this run?" and reuse the answer; never ask again or per phase. Agent mode: one `specialistDepth: 1` handoff per slice, no nesting or retry; on failure record one fallback and finish that slice in the parent. Parallel slices need one git worktree per slice; while evidence mode is verified, do not offer parallel project-agent mode.

## Restore Durable Progress

1. Internally resolve status and load compact implementation context. Requirements, design, tasks, and any required test-case review must be approved.
2. If invoked too early or state is blocked, present the persisted blocker and change nothing.
3. Internally begin implementation when status requests it; otherwise follow the next action: continue the active task, let the user pick a resumable candidate, or select a dependency-ready task.
4. Read the approved task, acceptance criteria, design interfaces, and steering before editing. Never infer progress from chat or Markdown checkboxes.

If the runtime is unavailable by host permission, report a reload/trust or policy blocker; never substitute manual backend instructions.

## Governed Task Loop

For each selected task, internally record `start` with the exact revision. RED, GREEN, and COMPLETE records carry the test command as `run.argv`; the server runs it and records the observed exit code, hash, and excerpt. Never type an exit code. Then:

1. **RED:** for TDD-required work, write a focused observable test and record RED with its command as `run.argv` before production changes; a zero exit is rejected. On `classification` `setup`, fix the test and record RED again; `assertion` is final. Then run the JEV `red` check internally and show its line (advisory only).
2. **GREEN:** implement only enough to pass, then record GREEN with the same `run.argv` after changing files.
3. **REFACTOR:** simplify without changing behavior; rerun focused verification.
4. **COMPLETE:** after all acceptance and security checks, record completion with the verification `run.argv` and the affected project-relative artifacts. COMPLETE may omit `run` when status shows a verify command.

If work cannot continue, internally record the blocker and reason; never fabricate evidence. Resume from the persisted state and reread status after every record. REFERENCE.md holds REFACTOR, not-applicable, and Mandatory Checks detail.

## Stop and Escalate

Get explicit user confirmation in the current turn before deploy or publish, data deletion outside task artifacts, force-push or shared-history rewrite, external messages, or credential changes. After 3 failed GREEN attempts on one task, or before changing files outside the task's planned artifacts, record a blocker and ask.

## Output

Report task states, artifacts, RED/GREEN/verification evidence, security decisions, next action, and blockers. Add `Unverified / Could Not Run`: each skipped check with its reason, or `None`. For 2 or more tasks, add a decision log of choices made without the user. Never expose backend JSON or raw MCP operations as user steps. Execution report: mode (inline|project-agent; asked|reused|not offered), agents started and whether parallel, configured model/effort per agent (never claim unobserved values), and any fallback to the parent.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for progress examples, evidence errors, Mandatory Checks, SOLID, OWASP, or completion checklists.
