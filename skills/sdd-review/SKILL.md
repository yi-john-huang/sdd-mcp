---
name: sdd-review
description: Review a focused change for correctness, regressions, security, and maintainability.
disable-model-invocation: true
---

# Code Review

## Required Review

1. Establish the exact diff or artifact scope. Read related requirements, design, tests, and local conventions.
2. Verify behavior and error paths from code and focused test evidence; do not infer correctness from style.
3. Review data flow, state transitions, concurrency, resource ownership, compatibility, and boundary conditions.
4. Check authorization, validation, injection, secret handling, sensitive logging, and dependency risk where applicable.
5. Remove false positives and preference-only remarks. Cite each finding with a path and line, triggering scenario, impact, and concrete remediation.
6. Rank findings: **critical** (security/data loss), **important** (incorrect behavior/regression), then **minor** (maintainability with real cost).
7. State verification evidence and residual risk. If no findings remain, say so explicitly.

Do not edit code unless asked. Never claim a test or security check ran when it did not.

## Specialist Delegation

Target renderers provide the `reviewer` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only the diff/scope, approved contracts, conventions, and verification evidence. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If the advisor or routed model is unavailable, record one fallback and continue in the parent without retrying or selecting a generic child. Where a native per-turn model override applies, execute in this turn.

## Output

Return findings first, ordered by severity, then assumptions, verification evidence, and unresolved blockers. Do not echo the reviewed artifact.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for language-specific review prompts, severity examples, or the extended checklist.
