# Design Reference

Read only for format help after the mandatory core design workflow is understood.

## Pattern Selection

- Layered or clean architecture: business rules need stable inward dependencies.
- Hexagonal: domain logic needs replaceable external adapters.
- Event-driven: asynchronous producers and consumers are inherent to the requirement.
- Service split: independent ownership/deployment is proven; do not choose it merely for fashion.

## Exact Document Shape

```markdown
# Design: Feature
## Requirements Traceability
## Architecture and Data Flow
## Components and Interfaces
### D-1: Decision title
**Covers:** FR-1, NFR-1
**Decision:** The chosen mechanism and trade-off.
**Failure behavior:** The observable safe failure.
**Verification:** How the decision is tested.
## Failure Handling
## Verification
```

## Component Template

```markdown
### Component name
Purpose and owned data:
Responsibilities and non-responsibilities:
Public interface:
Dependencies and direction:
Invariants:
Failure/timeout/retry behavior:
Authorization and validation boundary:
Verification:
```

## Design Checklist

- every FR/NFR maps to a decision and test strategy;
- data lifecycle, ownership, cardinality, validation, and migration are explicit;
- interfaces specify inputs, outputs, errors, idempotency, and compatibility;
- trust boundaries and least privilege are visible;
- retry behavior cannot amplify a failure or duplicate side effects;
- alternatives explain why simpler options were rejected;
- diagrams clarify real flow rather than decorate the document;
- rollout and rollback preserve valid existing state.
