---
name: security
description: Security best practices aligned with OWASP Top 10
priority: 99
alwaysActive: true
---

# Security Rules

## OWASP Top 10 Alignment

### A01: Broken Access Control
- Implement proper authentication checks before sensitive operations
- Use principle of least privilege for permissions
- Validate user authorization for every request
- Never expose internal IDs directly to users

### A02: Cryptographic Failures
- Never store passwords in plain text - use bcrypt or similar
- Use HTTPS for all external communications
- Don't hardcode secrets in source code
- Use secure random number generators for tokens

### A03: Injection
- Always use parameterized queries for database operations
- Validate and sanitize all user inputs
- Escape output data appropriately for context (HTML, SQL, etc.)
- Never use `eval()` or similar dynamic code execution

### A04: Insecure Design
- Apply defense in depth - multiple layers of security
- Implement rate limiting for APIs
- Design with security in mind from the start
- Use secure defaults

### A05: Security Misconfiguration
- Disable unnecessary features and services
- Keep dependencies updated
- Remove default credentials
- Configure proper error handling (no stack traces in production)

### A06: Vulnerable Components
- Regularly audit and update dependencies
- Use `npm audit` or similar tools
- Pin dependency versions in production
- Monitor security advisories

### A07: Authentication Failures
- Implement strong password policies
- Use multi-factor authentication where possible
- Protect against brute force attacks
- Secure session management

### A08: Data Integrity Failures
- Validate data integrity with checksums
- Use code signing for releases
- Verify software updates are from trusted sources

### A09: Logging Failures
- Log security-relevant events
- Never log sensitive data (passwords, tokens, PII)
- Ensure logs are tamper-proof
- Monitor logs for suspicious activity

### A10: Server-Side Request Forgery (SSRF)
- Validate and sanitize URLs before making requests
- Use allowlists for external services
- Don't expose internal services to user-controlled URLs

## Code Security Practices

### Input Validation
```typescript
// Always validate user input
function processUserInput(input: unknown): ValidatedInput {
  if (typeof input !== 'string') {
    throw new ValidationError('Input must be a string');
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new ValidationError('Input too long');
  }
  return sanitize(input);
}
```

### Error Handling
- Never expose internal errors to users
- Log errors with context for debugging
- Return generic error messages to clients
