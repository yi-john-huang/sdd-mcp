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

## Suggested Document Shape

```markdown
# Requirements: Feature
## Scope
## Functional Requirements
### FR-1: Name
EARS statement
Acceptance criteria
## Non-functional Requirements
## Constraints and assumptions
## Traceability
```

## Quality Checklist

Each requirement has one concern, a stable ID, normative SHALL wording, measurable bounds, positive and failure behavior, and acceptance criteria that do not prescribe incidental implementation. Requirements do not conflict, duplicate one another, hide an undefined actor, or depend on ambiguous timing. Security and compatibility requirements identify an asset or existing contract rather than repeating a generic checklist.
