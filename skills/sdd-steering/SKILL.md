---
name: sdd-steering
description: Create or update concise project steering from verified repository facts.
disable-model-invocation: true
---

# Project Steering

## Workflow

1. Inspect manifests, source layout, build/test configuration, existing documentation, and current `.spec/steering/`.
2. Distinguish verified facts from assumptions. Do not invent commands, versions, architecture, users, or conventions.
3. Create or update:
   - `product.md`: purpose, users, capabilities, boundaries;
   - `tech.md`: languages, versions, dependencies, architecture, verified commands;
   - `structure.md`: directory roles, naming, module boundaries, test locations.
4. Preserve user-authored guidance and unrelated sections. In update mode, merge precise changes rather than replacing the whole steering tree.
5. Keep guidance project-specific, actionable, non-secret, and concise. Preserve mandatory security guidance; never copy credentials, private environment values, or generated output.
6. Validate every documented path and command against the repository; report uncertain facts as unresolved rather than guessing.

## Specialist Delegation

Target renderers provide the `planner` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only verified project facts, existing conventions, requested scope, and unresolved decisions. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If the advisor or routed model is unavailable, record one fallback and continue in the parent without retrying or selecting a generic child. Where a native per-turn model override applies, execute in this turn.

## Output

Return affected steering paths, source evidence used, validation performed, preserved user content, and unresolved blockers.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for document templates or the extended validation checklist.
