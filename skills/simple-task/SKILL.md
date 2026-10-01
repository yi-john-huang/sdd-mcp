---
name: simple-task
description: Implement a small focused change test-first without starting the full SDD workflow.
disable-model-invocation: true
---

# Simple Task

Work inline in the current turn; do not create a serial implementation specialist.

Use this route for a bounded bug fix, refactor, or enhancement with clear acceptance behavior. Switch to formal SDD when requirements, architecture, approval gates, or several dependent components need design.

## Required Workflow

1. Confirm the requested behavior and inspect existing patterns. Do not infer extra scope.
2. Locate the narrowest affected code and focused test.
3. **RED:** write or adjust a focused failing test for observable behavior; run it and confirm the intended failure.
4. **GREEN:** implement the smallest complete fix; run the focused test.
5. **REFACTOR:** simplify while preserving behavior; rerun the focused test.
6. Check boundaries, error propagation, compatibility, authorization, input validation, injection, secret handling, and sensitive logs where relevant.
7. Review all affected callers and artifacts. Never discard unrelated work or claim unobserved checks.

## Execution Mode

Work inline in the current turn. Only when project agents are installed and at least two independent slices exist, ask once per session, in the user's language, "inline or project agent for this run?" and reuse the answer; never ask again or per phase. Agent mode: one `specialistDepth: 1` handoff per slice, no nesting or retry; on failure record one fallback and finish in the parent. Never split work to justify agents.

## Output

Report changed paths, behavior protected, failing and passing focused test evidence, security considerations, and unresolved blockers. Execution report: mode (inline|project-agent; asked|reused|not offered), agents started and whether parallel, configured model/effort per agent (never claim unobserved values), and any fallback to the parent.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for scope examples, TDD reminders, or the completion checklist.
