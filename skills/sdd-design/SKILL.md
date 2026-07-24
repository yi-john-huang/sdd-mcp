---
name: sdd-design
description: Design an approved SDD feature with traceable components, interfaces, risks, and tests.
disable-model-invocation: true
---

# SDD Design

The user invokes this Skill; backend lifecycle calls are internal. Never tell the user to call a raw MCP tool or expose revision, hash, fingerprint, or backend JSON except in explicit debug output.

## Resolve and Restore

1. Internally resolve status. If no feature name is supplied, resume the sole incomplete feature or ask the user to select when several exist.
2. Requirements must be approved. If durable status says otherwise, present the persisted blocker and make no file change.
3. Load the latest approved compact context before method work. Load an unapproved design draft only with full mode and explicit unapproved inclusion.

If the runtime is unavailable because of host permission, report an actionable reload/trust or policy blocker; never substitute manual backend instructions.

## Method and Artifact Contract

1. Map every FR/NFR and constraint to a design decision.
2. Define data ownership and flow before components. Choose the simplest fitting architecture and explain trade-offs.
3. Include exact headings `## Requirements Traceability`, `## Architecture and Data Flow`, `## Components and Interfaces`, `## Failure Handling`, and `## Verification`.
4. Give each decision a unique `### D-N: ...` section with same-line labels `**Covers:**`, `**Decision:**`, `**Failure behavior:**`, and `**Verification:**`. `Covers` is a comma-separated list of known requirement IDs.
5. Specify responsibilities, interfaces, dependencies, invariants, persistence/migration, compatibility, authorization, input boundaries, concurrency, failure behavior, rollback, and verification where relevant.

Internally submit the complete Markdown with the exact revision and artifact identity last observed. Submission, not direct file editing, is the canonical write. Present the saved path and concise validation outcome. On failed validation, keep the durable draft, load it explicitly, and revise; do not request approval.

## Human Gate

When validation passes, ask one explicit question: **“Approve this design?”** Only an unambiguous affirmative answer in this Skill flow permits internal approval of the exact reviewed revision and artifact. Never self-approve. Reread status after approval and report the persisted outcome.

## Specialist Delegation

Target renderers provide the `architect` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only approved requirements, architecture facts, constraints, and needed decisions. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If unavailable, record one fallback and continue in the parent without retrying or spawning a generic child.

## Output

Return the canonical saved path, traceable decisions, concise validation evidence, the approval question or persisted approval, and durable blockers. Do not present raw MCP operations as next steps.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for the exact design shape, component template, checklist, or pattern comparison.
