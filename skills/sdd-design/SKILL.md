---
name: sdd-design
description: Design an approved SDD feature with traceable components, interfaces, risks, and tests.
disable-model-invocation: true
---

# SDD Design

## Prerequisites

- Resolve the feature with `sdd-status`.
- Requirements must be generated and approved. Stop rather than designing from an unapproved draft.
- Read approved requirements plus relevant product, technology, and structure steering.

## Workflow

1. Map every FR/NFR and constraint to a design decision.
2. Define data ownership and flow before components. Choose the simplest fitting architecture and explain trade-offs.
3. Specify component responsibilities, public interfaces, dependencies, invariants, and failure behavior.
4. Cover persistence/migration, concurrency, compatibility, authorization, input boundaries, sensitive data, observability, and rollback where relevant.
5. Define unit, integration, and end-to-end verification against acceptance criteria.
6. Write `.spec/specs/{feature}/design.md`, then run `sdd-validate-design`. Resolve a NO-GO result before requesting design approval.
7. Request approval only after the design is complete and requirements remain traceable.

## Specialist Delegation

Target renderers provide the `architect` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only approved requirements, relevant architecture facts, constraints, and decisions needed. The specialist must not delegate again. Keep both the handoff and returned summary at or below 2,048 estimated tokens. Integrate its decisions and verification evidence. If the advisor or routed model is unavailable, record one fallback and continue in the parent without retrying or spawning a generic child. Where the target applies a native per-turn model override, execute in this turn instead of spawning.

## Output

The design must include overview, requirements traceability, architecture/data flow, components, interfaces, data models, errors, security, testing, dependencies, alternatives, and risks.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only when a component template, design checklist, or architecture-pattern comparison is needed.
