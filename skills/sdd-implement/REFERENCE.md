# Implementation Reference

Read only when a detailed checklist is needed for the current task.

## Mandatory Checks

- Preserve approved interfaces and existing conventions; update every affected caller.
- Test boundaries, errors, invariants, transitions, and precedence, not implementation plumbing.
- Validate untrusted input, enforce authorization, avoid injection, protect secrets and sensitive logs, and fail safely.
- Consider concurrency, cleanup, compatibility, cancellation, rollback, and error propagation.
- Run focused verification while iterating, then all affected checks. Never fabricate test, coverage, lint, or build results.

## REFACTOR

Simplify names, remove duplication, and narrow interfaces without changing observable behavior. Rerun the focused test after each change; a red result means the refactor changed behavior, so undo it rather than adjust the test.

## Not-Applicable Tasks

For a task marked `not-applicable`, record start, implement, verify, then complete with the verification `run.argv`. No RED or GREEN record is needed.

## Progress Recording Example

For a TDD-required task, persist the observed sequence: start; RED with `run: { argv: ["npx", "jest", "src/order.test.ts"] }`, which the server runs and must see fail; GREEN with the same `run`, which the server must see pass; COMPLETE with the final verification `run` plus affected project-relative artifacts. The server stores the observed exit code, a SHA-256 of the output, and an 8 KB excerpt on each record; you never supply them. A RED whose excerpt is classified `setup` can be recorded again after the test is fixed. If interrupted, status supplies the persisted state and next action; never reconstruct it from conversation history.

## Evidence Errors

- `SelfReportedEvidenceRejected`: the project runs in verified evidence mode; pass the command as `run.argv` instead of an evidence object. Projects configured for `self-reported` mode still accept the legacy object.
- `EvidenceCommandNotAllowed`: the program is not on the allowlist (`node`, `npm`, `npx`, `pnpm`, `yarn`, `bun`, `jest`, `vitest`, `tsc`, `pytest`, `python`, `python3`, `go`, `cargo`, `make`, `mvn`, `gradle`, `dotnet`, or the project's `evidence.allowedCommands`). Shells are never allowed.
- `EvidenceRunTimedOut`: the command exceeded the configured timeout (default 120 s); narrow the test selection or raise `SDD_EVIDENCE_TIMEOUT_MS`.

## Design Prompts

- SRP: does each unit own one reason to change?
- OCP: is a real extension point needed, or is direct code simpler?
- LSP: can every subtype preserve the advertised contract?
- ISP: can consumers depend on a smaller capability?
- DIP: do policy decisions avoid depending on infrastructure details?
- Prefer KISS and YAGNI over speculative abstraction; eliminate special cases through better data shape when possible.

## Security Prompts

Check only relevant risks, but never skip the analysis: authorization/ownership, validation and canonicalization, parameterized queries and command arguments, output encoding, safe URL handling, cryptographic primitives, secret storage, session state, dependency integrity, error disclosure, and sensitive logging. Default deny at trust boundaries and clean up resources on every failure path.

## Completion Checklist

- acceptance criteria have observable tests;
- RED failure was caused by missing behavior, not broken setup;
- GREEN and post-refactor focused results were observed;
- all affected callers and schemas were migrated;
- concurrency, errors, cancellation, and rollback were considered;
- no dead compatibility alias, debug output, placeholder, or secret remains;
- task record names exact evidence rather than estimated coverage.
