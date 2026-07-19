# Test Generation Reference

Read only when selecting cases or matching a framework.

## Behavior Matrix

For each contract consider: normal input, empty/zero, minimum/maximum boundary, malformed input, missing dependency, dependency error identity, repeated call/idempotency, ordering/precedence, concurrent transition, cancellation/cleanup, authorization, and sensitive output. Include only cases plausible for the target.

## Test Quality

Name the condition and expected behavior. Arrange only necessary state, act once, and assert the observable result plus critical side effects. Keep time, randomness, network, and filesystem boundaries deterministic. Restore global state and close resources. Prefer table-driven cases when inputs share one contract.

## Framework Guidance

Detect the existing runner and nearby conventions from project files; do not assume Jest. Place tests beside or under the established test tree. Reuse existing helpers only when they preserve isolation. Run the narrowest supported command that executes the new test. A valid RED run must reach the intended assertion and fail because the behavior is missing.
