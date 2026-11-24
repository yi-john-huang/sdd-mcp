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

## Interface Spike

Use a spike only when two interface shapes are both plausible and reading code cannot settle the choice.

- Put throwaway code under `.spec/specs/<feature>/spike/`. Production code never imports it, and the spike is not a deliverable.
- Keep it to the smallest call sequence that shows the difference: a caller, the candidate interface, and one stub.
- In the design, add `## Interface Spike` with the question, the path, what the spike showed, and the decision it settled. Cite that decision from the relevant `### D-N` section.
- Delete or keep the spike folder as the team prefers; the validator ignores it and approval still needs the explicit human answer.

## Delegated Reviewer

Use this only when `.spec/sdd-config.json` sets `approval.mode` to `delegated-reviewer`. Otherwise ask the human.

- A reviewer listed in `approval.reviewers` (default `agy`) may answer the approval question instead of the human. The authoring agent is never the reviewer.
- The reviewer reads the exact submitted artifact and writes `review/<reviewer>-design-r<revision>.json` in the feature directory with `reviewer`, `phase`, `revision`, `artifact_sha256`, and `verdict` (`approve` or `reject`).
- Only an `approve` verdict for the current revision and hash permits the internal approval call, with `approvedBy` and `reviewSidecar`. The runtime refuses any mismatch.
- A `reject` verdict is not approval. Report the findings, revise, and resubmit.
