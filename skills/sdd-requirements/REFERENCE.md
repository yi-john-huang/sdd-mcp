# Requirements Reference

Read only for examples or document formatting.

## EARS Examples

```text
The service SHALL reject an absolute feature name.
WHEN a valid approval request is committed THEN the service SHALL publish the derived handoff.
WHILE a phase is unapproved THE service SHALL exclude its draft from compact context.
WHERE test-case review is enabled THE service SHALL require review before tasks approval.
IF handoff publication fails after approval THEN the service SHALL retain the approved state and report pending regeneration.
```

## Exact Document Shape

Metadata values may begin on the same line as their bold label or on the following lines. Multiline values continue until the next metadata label or section heading. Keep the labels exactly as shown, include `SHALL` in the EARS specification, and use a numbered list for acceptance criteria.

```markdown
# Requirements: Feature

## Functional Requirements

### FR-1: Observable outcome
**Objective:** Why this behavior matters.
**EARS Specification:** WHEN an event occurs THEN the system SHALL produce an observable result.
**Acceptance Criteria:**
1. A measurable result is observed.

## Non-functional Requirements

### NFR-1: Bounded quality
**Objective:** The quality attribute and stakeholder value.
**EARS Specification:** The system SHALL satisfy a measurable bound.
**Acceptance Criteria:**
1. The bound is verified under stated conditions.
```

## Quality Checklist

Each requirement has one concern, a stable ID, normative SHALL wording, measurable bounds, positive and failure behavior, and acceptance criteria that do not prescribe incidental implementation. Requirements do not conflict, duplicate one another, hide an undefined actor, or depend on ambiguous timing. Security and compatibility requirements identify an asset or existing contract rather than repeating a generic checklist.

## Delegated Reviewer

Use this only when `.spec/sdd-config.json` sets `approval.mode` to `delegated-reviewer`. Otherwise ask the human.

- A reviewer listed in `approval.reviewers` (default `agy`) may answer the approval question instead of the human. The authoring agent is never the reviewer.
- The reviewer reads the exact submitted artifact and writes `review/<reviewer>-requirements-r<revision>.json` in the feature directory with `reviewer`, `phase`, `revision`, `artifact_sha256`, and `verdict` (`approve` or `reject`).
- Only an `approve` verdict for the current revision and hash permits the internal approval call, with `approvedBy` and `reviewSidecar`. The runtime refuses any mismatch.
- A `reject` verdict is not approval. Report the findings, revise, and resubmit.
