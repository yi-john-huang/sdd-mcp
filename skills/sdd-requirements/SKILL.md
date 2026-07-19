---
name: sdd-requirements
description: Generate testable EARS requirements and measurable acceptance criteria for an SDD feature.
disable-model-invocation: true
---

# SDD Requirements

## Prerequisites

- The feature must exist through `sdd-init`.
- Check its durable phase with `sdd-status`.
- Read the feature description and relevant steering. Ask only for material information that cannot be derived.

## Workflow

1. Identify users, goals, in-scope behavior, exclusions, constraints, assumptions, dependencies, and measurable success.
2. Write independently testable functional and non-functional requirements using EARS:
   - ubiquitous: `The system SHALL ...`
   - event: `WHEN ... THEN the system SHALL ...`
   - state: `WHILE ... THE system SHALL ...`
   - optional: `WHERE ... THE system SHALL ...`
   - unwanted behavior: `IF ... THEN the system SHALL ...`
3. Give every requirement a stable ID and specific acceptance criteria. Replace ambiguous words such as “fast”, “appropriate”, “should”, or “may” with observable bounds.
4. Include security, privacy, accessibility, compatibility, error, and performance requirements only where relevant; do not invent scope.
5. Check completeness, consistency, feasibility, traceability, and testability; use `sdd-validate-gap` when existing code is in scope.
6. Write `.spec/specs/{feature}/requirements.md`. Request requirements approval only after the artifact is complete; never self-approve silently.

## Specialist Delegation

Target renderers provide the `planner` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only the goal, verified context, constraints, open decisions, and output contract. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If the advisor or routed model is unavailable, record one fallback and continue in the parent without retrying or selecting a generic child. Where a native per-turn model override applies, execute in this turn.

## Output

Return the saved path, key scope decisions, validation evidence, and approval as the next action.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for EARS examples, document structure, or the extended quality checklist.
