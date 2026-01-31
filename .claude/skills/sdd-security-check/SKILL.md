---
name: sdd-security-check
description: Perform OWASP-aligned security audit of code. Checks for common vulnerabilities including injection, authentication flaws, sensitive data exposure, and more. Invoked via /sdd-security-check [file-path or scope].
---

# SDD Security Check

Perform comprehensive security audits aligned with OWASP Top 10 and security best practices. Identify vulnerabilities before they reach production.

## Security Philosophy

Security is not a feature—it's a requirement. Every code change should be reviewed through a security lens.

## OWASP Top 10 Checks (2021)

### A01: Broken Access Control

Check for:
- Missing authorization checks on endpoints
- Insecure Direct Object References (IDOR)
- Missing function-level access control
- CORS misconfiguration
- JWT validation bypass

**Pattern**: Ensure every endpoint has explicit authorization checks.

### A02: Cryptographic Failures

Check for:
- Sensitive data transmitted without TLS
- Weak or deprecated algorithms (MD5, SHA1, DES)
- Hardcoded secrets or API keys
- Insufficient key length
- Missing encryption at rest

**Pattern**: Use strong algorithms (bcrypt for passwords, AES-256 for data).

### A03: Injection

Check for:
- SQL injection (use parameterized queries)
- NoSQL injection (validate/sanitize inputs)
- Command injection (use execFile with array args, not string interpolation)
- LDAP injection
- Template injection

**Pattern**: Never interpolate user input into queries or commands.

### A04: Insecure Design

Check for:
- Missing rate limiting
- No brute force protection
- Predictable resource IDs
- Missing threat modeling

### A05: Security Misconfiguration

Check for:
- Debug mode in production
- Default credentials
- Unnecessary features enabled
- Missing security headers
- Verbose error messages in production

**Required Headers**: CSP, X-Frame-Options, X-Content-Type-Options, HSTS

### A06: Vulnerable Components

- Check dependencies with `npm audit`
- Review for known CVEs
- Verify component versions

### A07: Authentication Failures

Check for:
- Weak password requirements
- Missing MFA where required
- Session fixation vulnerabilities
- Credential stuffing exposure
- Insecure password recovery

**Session Config**: secure=true, httpOnly=true, sameSite='strict'

### A08: Software and Data Integrity Failures

Check for:
- Missing integrity verification on downloads
- Insecure CI/CD pipeline
- Unsigned code or packages
- Auto-update without verification

### A09: Security Logging and Monitoring Failures

Check for:
- No logging of security events
- Sensitive data in logs (never log passwords!)
- Missing audit trail
- Logs not protected from tampering

**Required Events**: Auth attempts, auth failures, admin actions, data access anomalies

### A10: Server-Side Request Forgery (SSRF)

Check for:
- User-controlled URLs in server requests
- Missing URL validation
- Internal network access possible

**Pattern**: Use URL allowlists for server-side requests.

## Security Check Workflow

### Step 1: Define Scope

```
/sdd-security-check src/api/        # Check API layer
/sdd-security-check src/auth/       # Focus on authentication
/sdd-security-check HEAD~5..HEAD    # Check recent changes
```

### Step 2: Automated Scans

Run these checks:
```bash
# Dependency vulnerabilities
npm audit

# Secret detection
npx gitleaks detect

# SAST scan if configured
npx semgrep --config=p/security-audit
```

### Step 3: Manual Review

For each file, check:
1. Input validation
2. Output encoding
3. Authentication/Authorization
4. Data handling
5. Error handling
6. Logging practices

### Step 4: Generate Report

```markdown
# Security Audit Report: {scope}

## Summary
- 🔴 Critical: {count}
- 🟠 High: {count}
- 🟡 Medium: {count}
- 🟢 Low: {count}

## Critical Findings

### SEC-001: {Finding Title}
**Location**: {file:line}
**Risk**: Critical
**OWASP**: {category}

**Issue**: {description}
**Recommendation**: {fix}

## Remediation Priority
1. Critical findings - Fix immediately
2. High findings - Fix before deployment
3. Medium findings - Fix this sprint
4. Low findings - Track and schedule
```

## Quick Security Checklist

Before any deployment:
- [ ] No hardcoded secrets in code
- [ ] All inputs validated and sanitized
- [ ] All outputs properly encoded
- [ ] Authentication on all protected routes
- [ ] Authorization checks at function level
- [ ] Security headers configured
- [ ] Dependencies scanned for vulnerabilities
- [ ] Error messages don't leak sensitive info
- [ ] Security events are logged
- [ ] Rate limiting in place

## Integration with SDD Workflow

When checking implementation against spec:
1. Verify security NFRs from requirements.md are met
2. Check security considerations from design.md are implemented
3. Ensure security-related tasks in tasks.md are complete
