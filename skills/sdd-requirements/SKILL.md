---
name: sdd-requirements
description: Generate testable EARS requirements and measurable acceptance criteria for an SDD feature.
disable-model-invocation: true
---

# SDD Requirements

The user invokes this Skill; all MCP calls below are internal. Never ask the user to call a backend tool or expose revision, hash, fingerprint, or backend JSON except in explicit debug output.

## Resolve and Restore

1. Internally read status before doing method work.
2. With a supplied missing feature, internally initialize it from the user's name and complete goal. If clarification is required, present the structured questions, collect answers, and retry initialization. Use the returned canonical feature name.
3. With no supplied name: ask for a name and goal when no feature exists; resume the sole incomplete feature; when several are incomplete, list them and ask the user to select. Never infer identity from process memory.
4. Load compact approved context. For a failed or unapproved requirements revision, load that draft only with full mode and explicit unapproved inclusion.

If durable state reports a conflict or host permission failure, present an actionable blocker and make no artifact change.

## Method and Artifact Contract

1. Identify users, goals, scope, exclusions, constraints, assumptions, dependencies, and measurable success.
2. Write independently testable EARS requirements. Every requirement uses a unique `### FR-N: ...` or `### NFR-N: ...` section and same-line metadata labels:
   - `**Objective:** ...`
   - `**EARS Specification:** ... SHALL ...`
   - `**Acceptance Criteria:**` followed by at least one numbered item.
3. Replace ambiguous words with observable bounds. Include security, privacy, accessibility, compatibility, errors, and performance only when relevant.
4. Check completeness, consistency, feasibility, traceability, and testability; run gap analysis internally when existing code is in scope.

Internally submit the complete Markdown with the exact revision and artifact identity last observed. Submission, not direct file editing, is the canonical write. Present the saved path and a concise validation result. A failed validation is a durable draft: revise it using the observed draft content and identity; do not request approval.

## Human Gate

When validation passes, ask one explicit question: **“Approve these requirements?”** Only an unambiguous affirmative answer in this Skill flow permits the internal approval call for the exact reviewed revision and artifact. Never self-approve or treat host tool permission as approval. After approval, reread status and report the persisted outcome.

## Specialist Delegation

Target renderers provide the `planner` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only the goal, verified context, constraints, open decisions, and output contract. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If unavailable, record one fallback and continue in the parent without retrying or selecting a generic child.

## Output

Return the canonical saved path, key scope decisions, concise validation evidence, the approval question or persisted approval, and durable blockers. Do not present raw MCP operations as next steps.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for EARS examples, exact document shape, or the extended quality checklist.
