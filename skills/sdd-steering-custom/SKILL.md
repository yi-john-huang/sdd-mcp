---
name: sdd-steering-custom
description: Define scoped custom steering for a verified project convention or domain.
disable-model-invocation: true
---

# Custom Steering

## Required Workflow

1. Define the missing guidance, its audience, and why standard steering is insufficient.
2. Accept `fileName` only as a basename ending in `.md`; reject separators, absolute paths, traversal, control characters, and non-Markdown names.
3. Choose the narrowest inclusion mode:
   - always for genuinely universal project facts;
   - conditional with explicit file globs;
   - manual for rare or specialized guidance.
4. Write purpose, scope, actionable rules, exceptions, and verification steps. Use examples only when they prevent ambiguity.
5. Preserve user-authored content during updates. Never overwrite unrelated steering or weaken mandatory security guidance.
6. Validate conditional globs against intended and unintended paths. Keep secrets and private environment values out of steering.

## Specialist Delegation

Target renderers provide the `planner` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only domain facts, intended file scope, project constraints, and output contract. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If the advisor or routed model is unavailable, record one fallback and continue in the parent without retrying or selecting a generic child. Where a native per-turn model override applies, execute in this turn.

## Output

Return the contained path, inclusion mode/globs, evidence used, validation results, preserved user content, and blockers.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for templates, glob examples, or sample domain steering.
