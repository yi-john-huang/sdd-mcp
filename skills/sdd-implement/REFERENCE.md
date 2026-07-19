# Implementation Reference

Read only when a detailed checklist is needed for the current task.

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
