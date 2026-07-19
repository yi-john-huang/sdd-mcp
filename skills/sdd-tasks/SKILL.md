---
name: sdd-tasks
description: Generate an approved-design task plan with test-first slices and measurable completion.
disable-model-invocation: true
---

# SDD Tasks

## Prerequisites

- Resolve the feature with `sdd-status`.
- Design must be generated and approved. Stop rather than planning from an unapproved draft.
- Read the approved requirements and design, including interfaces, dependencies, risks, and acceptance criteria.

## Workflow

1. Map every design component and requirement to implementation and verification work.
2. Split work into small, ordered slices that each produce observable value. State affected artifacts, dependencies, and acceptance criteria.
3. For behavioral work, make RED → GREEN → REFACTOR explicit: first a focused failing test, then minimal implementation, then cleanup with the test green.
4. Cover happy paths, boundaries, errors, state transitions, security controls, migration, and integration where applicable. Do not impose a test ratio when the architecture calls for a different mix.
5. Mark genuinely independent slices so they may run concurrently; never invent parallelism or a serial specialist.
6. Ask whether the optional test case review checkpoint is required. If enabled, record behavior/edge/error cases and require `sdd-review-test-cases` before tasks approval.
7. Write `.spec/specs/{feature}/tasks.md`. Request tasks approval only after dependencies, traceability, and completion criteria are validated.

## Specialist Delegation

Target renderers provide the `planner` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only approved design decisions, constraints, dependencies, and task output contract. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If the advisor or routed model is unavailable, record one fallback and continue in the parent without retrying or selecting a generic child. Where a native per-turn model override applies, execute in this turn.

## Output

Return the saved path, requirement/design traceability, checkpoint choice, validation evidence, and approval as the next action.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for task templates, sizing heuristics, dependency diagrams, or the extended checklist.
