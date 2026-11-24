---
name: security
description: Security best practices aligned with OWASP Top 10
priority: 99
alwaysActive: true
---

# Security Rules

## Trust Boundaries

- Validate every untrusted input (tool arguments, files, environment, network) at the boundary: type, size, and allowed values.
- Check authorization before each sensitive operation, and apply least privilege.

## Injection

- Run processes with an argv array, never a shell string.
- Use parameterized queries. Never `eval` untrusted text.
- Resolve paths and reject traversal outside the allowed root.

## Secrets

- Never hardcode secrets or write them to logs, specs, or error messages.
- Read secrets from the environment or a secret store.

## Dependencies and Network

- Keep dependencies pinned and audited.
- Allowlist outbound hosts; never fetch a user-controlled URL unchecked.

## Failure

Fail closed: on a failed security check, deny and report, do not continue.
