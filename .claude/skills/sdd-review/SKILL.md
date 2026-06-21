---
name: sdd-review
description: Perform thorough Linus-style code review focusing on correctness, maintainability, and adherence to project conventions. Use after completing implementation to ensure code quality. Invoked via /sdd-review [file-path or PR-number].
---

# SDD Code Review

Perform comprehensive code reviews in the style of Linus Torvalds - direct, thorough, and focused on what matters: correctness, simplicity, and long-term maintainability.

## Review Philosophy

> "Talk is cheap. Show me the code."
> — Linus Torvalds

This review focuses on:
1. **Correctness** - Does it actually work? Does it handle edge cases?
2. **Simplicity** - Is it more complex than necessary?
3. **Maintainability** - Will future developers understand this?
4. **Convention Adherence** - Does it follow project patterns?

## Workflow

### Step 1: Identify Review Scope

Determine what to review:
- **Single file**: `/sdd-review src/services/UserService.ts`
- **Directory**: `/sdd-review src/services/`
- **Git diff**: `/sdd-review HEAD~3..HEAD`
- **PR/MR**: `/sdd-review PR-123` or `/sdd-review MR-45`

### Step 2: Load Project Context

Before reviewing:
1. Read project steering documents from `.spec/steering/`
2. Understand existing patterns in the codebase
3. Check if there's a related spec in `.spec/specs/`

### Step 3: Perform Review

#### Code Correctness Checks

```markdown
## Correctness Issues

### Critical
- [ ] Logic errors that will cause bugs
- [ ] Race conditions or threading issues
- [ ] Resource leaks (files, connections, memory)
- [ ] Unhandled error conditions

### Important
- [ ] Edge cases not handled
- [ ] Assumptions that may not hold
- [ ] Off-by-one errors
- [ ] Type mismatches or unsafe casts
```

#### Simplicity Assessment

Ask these questions:
- Could this be done with less code?
- Is there a standard library function for this?
- Is this abstraction earning its keep?
- Would a junior developer understand this in 6 months?

#### Pattern Violations

Check against project conventions:
```markdown
## Pattern Violations

### Naming
- [ ] Variables don't follow naming convention
- [ ] Functions named for implementation, not purpose

### Structure
- [ ] Logic in wrong layer (controller doing business logic)
- [ ] Missing separation of concerns
- [ ] Circular dependencies introduced

### Error Handling
- [ ] Swallowed exceptions
- [ ] Generic error messages
- [ ] Missing error propagation
```

### Step 4: Provide Feedback

Structure feedback with clear categories:

```markdown
# Code Review: {file/PR description}

## Summary
Brief overall assessment (1-2 sentences)

## 🚨 Must Fix (Blocking)
Issues that must be resolved before merge:
1. **Line 42**: Memory leak - connection never closed
   ```diff
   - const conn = await getConnection();
   + const conn = await getConnection();
   + try { ... } finally { conn.close(); }
   ```

## ⚠️ Should Fix (Non-blocking)
Issues that should be addressed but won't block:
1. **Line 78**: Magic number should be a named constant
2. **Line 103**: Consider extracting this to a helper function

## 💡 Suggestions (Optional)
Improvements that would be nice but are truly optional:
1. **Line 156**: This could be simplified with `Array.flatMap()`

## ✅ What's Good
Acknowledge good patterns to reinforce them:
1. Good use of dependency injection
2. Clear separation of concerns
3. Comprehensive error handling in auth module
```

### Step 5: Verify Tests

For any code changes:
1. Check if tests exist for modified code
2. Verify edge cases are tested
3. Run existing tests to ensure no regressions

```bash
# Run tests for affected files
npm test -- --findRelatedTests {changed-files}
```

## Review Severity Levels

| Level | Meaning | Action Required |
|-------|---------|-----------------|
| 🚨 **Critical** | Bug, security issue, data loss risk | Must fix before merge |
| ⚠️ **Warning** | Code smell, potential issue | Should fix, discuss if disagree |
| 💡 **Info** | Suggestion, style preference | Optional, author's choice |

## Common Issues to Watch For

### TypeScript/JavaScript Specific
- `any` type usage without justification
- Missing null/undefined checks
- Promises not awaited
- Event listener memory leaks
- Mutable shared state

### General
- Functions doing too much
- Deep nesting (> 3 levels)
- Boolean parameters (use options object)
- Comments explaining *what* instead of *why*
- Dead code or unused imports

## Integration with SDD Workflow

When reviewing implementation:
1. Compare against requirements in `.spec/specs/{feature}/requirements.md`
2. Verify design patterns from `.spec/specs/{feature}/design.md`
3. Check task completion against `.spec/specs/{feature}/tasks.md`

## Example Review

```markdown
# Code Review: UserAuthService.ts

## Summary
Good overall structure but has a critical security issue and some error handling gaps.

## 🚨 Must Fix
1. **Line 67**: Password stored in plain text in error log
   ```typescript
   // BAD: Leaks credentials
   logger.error(`Login failed for ${email} with password ${password}`);

   // GOOD: Never log credentials
   logger.error(`Login failed for ${email}`);
   ```

## ⚠️ Should Fix
1. **Line 89**: Catch block swallows all errors
2. **Line 112-130**: This block should be extracted to a private method

## ✅ What's Good
- Clean separation between auth logic and data access
- Good use of TypeScript discriminated unions for auth result
- Comprehensive input validation
```
