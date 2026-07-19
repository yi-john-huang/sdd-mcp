# Review Reference

Read only when the focused review needs extra prompts.

## Severity

- Critical: exploitable security flaw, corruption, irreversible data loss, or broad outage.
- Important: reproducible incorrect behavior, regression, race, leak, or contract break.
- Minor: concrete maintenance cost likely to cause future defects.
- Suggestion: optional preference; omit it unless specifically requested.

## Language-independent Prompts

Check ownership and mutation, null/empty/boundary behavior, ordering and precedence, async cancellation, retries and idempotency, resource cleanup, error identity, public API compatibility, serialization, time zones, numeric overflow, and deterministic tests.

## Finding Shape

```text
[severity] path:line — concise defect
Trigger: exact input/state/interleaving
Impact: observable consequence
Evidence: code path or focused reproduction
Fix: smallest source-level remedy
```

Review tests for missing contracts, not line coverage. Reject tests that only mirror implementation, inspect source text, rely on timing sleeps, share state, or swallow real errors. End with verification actually performed and explicit residual risk.
