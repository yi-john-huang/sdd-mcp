---
name: sdd-security-check
description: Audit a focused scope for exploitable security flaws and prioritized remediation.
disable-model-invocation: true
---

# Security Audit

## Required Audit

1. Define trust boundaries, assets, actors, entry points, data sensitivity, and the exact review scope.
2. Trace untrusted input through validation, authorization, storage, commands, queries, templates, URLs, and output.
3. Check relevant OWASP risks: access control, cryptography, injection, insecure design, misconfiguration, vulnerable components, authentication, integrity, logging, and SSRF.
4. Search for embedded secrets and unsafe sensitive-data logging. Never print a discovered secret; redact it and identify only its location/type.
5. Inspect dependency and automated scan results only when the project provides safe focused commands; distinguish tool evidence from manual review.
6. For each finding, prove the path to impact, assign severity, cite location, and give a minimal remediation plus a regression test.
7. Compare implementation with security requirements and design controls. Record coverage gaps and residual risk.

Do not make destructive probes, contact external systems, or claim exploitability without evidence.

## Specialist Delegation

Target renderers provide the `security-auditor` route. When a native advisor is required, dispatch exactly one compact handoff with `specialistDepth: 1`; include only threat context, relevant diff, security requirements, and scan evidence. The specialist must not delegate again. Keep the handoff and returned summary at or below 2,048 estimated tokens. If the advisor or routed model is unavailable, record one fallback and continue in the parent without retrying or selecting a generic child. Where a native per-turn model override applies, execute in this turn.

## Output

Return findings ordered critical/high/medium/low, each with evidence, impact, remediation, and verification. Then list checked areas, unresolved blockers, and residual risk.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for OWASP prompts, severity guidance, or the report checklist.
