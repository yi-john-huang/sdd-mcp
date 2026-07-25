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
