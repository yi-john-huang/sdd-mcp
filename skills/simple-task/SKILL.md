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

If the work genuinely decomposes into at least two independent slices, they may run concurrently; otherwise keep it in the parent.

## Output

Report changed paths, behavior protected, failing and passing focused test evidence, security considerations, and unresolved blockers.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for scope examples, TDD reminders, or the completion checklist.
