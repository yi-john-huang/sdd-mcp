# Security Audit Reference

Read only for the branch being audited.

## OWASP Prompts

- Access control: object ownership, function-level checks, tenant isolation, deny-by-default paths.
- Cryptography: approved primitives, key lifecycle, transport/storage protection, password hashing.
- Injection: query parameters, process arguments, templates, headers, paths, deserialization.
- Design: abuse cases, rate limits, replay/idempotency, resource exhaustion.
- Configuration: debug/default settings, CORS, headers, unnecessary capabilities.
- Components/integrity: vulnerable dependencies, lockfiles, update/build provenance.
- Authentication: session fixation, credential recovery, MFA/rate-limit requirements.
- Logging: security events without credentials, tokens, personal or regulated data.
- SSRF: URL parsing, redirects, DNS rebinding, private-address blocking, allowlists.

## Finding Checklist

A finding names the threat actor, preconditions, source-to-sink path, affected asset, impact, severity rationale, location, remediation, and regression test. Redact secrets. Separate confirmed vulnerabilities from hardening opportunities and tool warnings. If a control is outside scope, record it as unverified rather than absent.
