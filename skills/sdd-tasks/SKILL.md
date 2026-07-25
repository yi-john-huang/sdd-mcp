---
name: sdd-tasks
description: Generate an approved-design task plan with test-first slices and measurable completion.
disable-model-invocation: true
---

# SDD Tasks

The user invokes this Skill; backend lifecycle calls are internal. Never tell the user to call a raw MCP tool or expose revision, hash, fingerprint, or backend JSON except in explicit debug output.

## Resolve and Restore

1. Internally resolve status. If no feature name is supplied, resume the sole incomplete feature or ask the user to select when several exist.
2. Design and requirements must be approved. If durable status says otherwise, present the persisted blocker and make no file change.
3. Load the latest approved compact context before method work. Load an unapproved tasks draft only with full mode and explicit unapproved inclusion.
4. The saved test-case-review choice is authoritative. Ask once only when status has no choice; reuse it on every revision.
5. If status reports an observed artifact identity for an orphan or manual edit, read that exact tasks file before revising. Never acknowledge its hash without inspecting and deliberately incorporating or replacing its content.

If the runtime is unavailable because of host permission, report an actionable reload/trust or policy blocker; never substitute manual backend instructions.

## Method and Artifact Contract

1. Map every requirement and design decision to small, ordered implementation and verification slices.
2. Use unique `### N.M ...` task sections with same-line labels `**Covers:**`, `**Dependencies:**`, `**TDD:**`, `**Affected artifacts:**`, `**Acceptance criteria:**`, and `**Verification:**`.
3. `Covers`, dependencies, and affected artifacts are comma-separated; an empty set is exactly `none`. Dependencies name existing task IDs and must be acyclic.
4. `TDD` is exactly `required` or `not-applicable — <reason>`. Behavioral work uses RED → GREEN → REFACTOR and covers relevant boundaries, errors, transitions, security, migration, and integration.
5. Mark concurrency only for genuinely independent slices.

Internally submit complete Markdown with the exact revision and artifact identity last observed and the persisted review choice. Submission is the canonical write. Present the saved path and concise validation outcome. A failed validation remains a durable draft to revise and cannot advance.

## Human Gates

If test-case review is required, present the concrete behavior, boundary, and error cases. Only explicit confirmation records the internal checkpoint for the exact tasks revision and artifact. This is separate from approval.

After validation and any required review, ask **“Approve these implementation tasks?”** Only an unambiguous affirmative answer in this Skill flow permits internal approval of the exact reviewed artifact. Never self-approve. Reread status after each checkpoint and approval.

## Specialist Delegation

Target renderers provide the `planner` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only approved decisions, constraints, dependencies, and the task contract. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If unavailable, record one fallback and continue in the parent without retrying or selecting a generic child.

## Output

Return the canonical saved path, traceability, saved checkpoint choice, concise validation evidence, the current human decision, and durable blockers. Do not present raw MCP operations as next steps.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for the exact task template, sizing heuristics, dependency diagrams, or extended checklist.
