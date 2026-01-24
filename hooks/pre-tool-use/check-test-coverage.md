---
name: check-test-coverage
description: Reminds developers to write tests first when implementing features
event: pre-tool-use
priority: 90
enabled: true
---

# Check Test Coverage Hook

This hook promotes TDD by reminding developers to write tests before implementation.

## Trigger Conditions

Triggered before code modification tools:
- File writes to `src/**/*.ts` (excluding test files)
- Code generation requests
- Implementation-related tool calls

## Validation Logic

```
IF modifying source file (not test file) THEN
  CHECK if corresponding test file exists
  IF no test file THEN
    WARN about TDD best practice
    SUGGEST creating test file first
```

## Example Prompt

```
🧪 TDD Reminder

You're about to modify 'src/services/UserService.ts' but no
corresponding test file was found.

Consider creating 'src/__tests__/services/UserService.test.ts'
first and writing failing tests for the expected behavior.

TDD Flow:
1. Write failing test (Red)
2. Implement code to pass test (Green)
3. Refactor for quality (Refactor)
```

## Configuration

This hook can be configured via environment variables:
- `SDD_TDD_STRICT=true` - Block modifications without tests
- `SDD_TDD_REMINDER=true` - Show reminder but allow proceeding (default)
