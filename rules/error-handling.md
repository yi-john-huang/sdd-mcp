---
name: error-handling
description: Error handling patterns and best practices
priority: 90
alwaysActive: true
---

# Error Handling Rules

## Error Types

Use typed domain errors with a stable code, so callers branch on the code, not the message text.

## Error Handling Patterns

### Try-Catch Best Practices
- Catch only errors you can handle; re-throw the rest.
- Never swallow an error silently. Log or return it with context.
- Add context when re-throwing, and keep the original as `cause`.
- Clean up resources in `finally`.

## Logging Errors

### What NOT to Log
- Passwords, tokens, keys, or other secrets
- Personal identifiable information (PII)
- Full request or file payloads that may hold either

## User-Facing Errors

Give a clear message that names the next step. Never expose stack traces, internal paths, or raw dependency errors.
