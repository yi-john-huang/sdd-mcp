---
name: simple-task
description: Implement simple features with best practices. Use when adding small features, bug fixes, or quick enhancements without the full SDD workflow. Invoked via /simple-task <description>.
---

# Simple Task Implementation

Implement small features, bug fixes, or quick enhancements while following best practices from the project's steering documents.

## When to Use

Use `/simple-task` for:
- Small feature additions (e.g., "add logout button")
- Bug fixes
- Minor enhancements
- Quick refactoring

Use **full SDD workflow** for:
- Complex features requiring multiple components
- New modules or subsystems
- Features needing formal requirements/design review

## Workflow

### Step 1: Understand the Task

1. Clarify what needs to be done
2. Identify affected files/components
3. Estimate scope (if larger than expected, suggest full SDD workflow)

### Step 2: Apply TDD (Test-Driven Development)

**Reference:** `.spec/steering/tdd-guideline.md`

Follow the Red-Green-Refactor cycle:

```
1. RED    → Write a failing test first
2. GREEN  → Write minimal code to pass
3. REFACTOR → Clean up while tests pass
```

**Quick TDD Checklist:**
- [ ] Write test before implementation
- [ ] Test describes expected behavior
- [ ] Minimal code to make test pass
- [ ] Refactor without breaking tests

### Step 3: Apply Design Principles

**Reference:** `.spec/steering/principles.md`

**SOLID Quick Reference:**
- **S**ingle Responsibility: Each function/class does one thing
- **O**pen/Closed: Extend behavior without modifying existing code
- **L**iskov Substitution: Subtypes must be substitutable
- **I**nterface Segregation: Small, focused interfaces
- **D**ependency Inversion: Depend on abstractions

**Other Principles:**
- **DRY**: Don't repeat yourself - extract common logic
- **KISS**: Keep it simple - avoid unnecessary complexity
- **YAGNI**: You aren't gonna need it - only implement what's required

### Step 4: Code Quality Review

**Reference:** `.spec/steering/linus-review.md`

Before finalizing, ask:
1. **Taste**: Is the solution elegant? Can special cases be eliminated?
2. **Simplicity**: Can it be simpler? Fewer lines? Less nesting?
3. **Data Structures**: Is the right data structure used?
4. **Breaking Changes**: Does this break existing functionality?

**Quality Checklist:**
- [ ] Functions are short and focused
- [ ] No more than 3 levels of indentation
- [ ] Clear, descriptive naming
- [ ] No unnecessary complexity

### Step 5: Security Check

**Reference:** `.spec/steering/owasp-top10-check.md`

**Quick Security Checklist:**
- [ ] Input validation (sanitize user inputs)
- [ ] No SQL/command injection (use parameterized queries)
- [ ] Access control enforced
- [ ] No secrets in code (use env vars)
- [ ] Proper error handling (no stack traces to users)

### Step 6: Implement and Test

1. Write the failing test (RED)
2. Implement minimal solution (GREEN)
3. Run tests to confirm pass
4. Refactor if needed
5. Run full test suite
6. Verify no lint/type errors

## Reference Documents

These steering documents provide detailed guidance:

| Document | Content |
|----------|---------|
| `tdd-guideline.md` | TDD methodology, test pyramid, Red-Green-Refactor |
| `principles.md` | SOLID, DRY, KISS, YAGNI, Separation of Concerns |
| `linus-review.md` | Code quality, "good taste", simplicity standards |
| `owasp-top10-check.md` | Security checklist (OWASP Top 10) |

## Output

After implementing, provide:

```markdown
## Implementation Summary

**Task:** {what was implemented}

**Changes:**
- {file1}: {what changed}
- {file2}: {what changed}

**Tests Added:**
- {test description}

**Principles Applied:**
- TDD: {how TDD was followed}
- Design: {which principles were applied}
- Security: {security considerations}

**Ready for:** {commit / further review / testing}
```

## Example

```
User: /simple-task add a logout button to the navbar

Claude:
1. Understand: Add logout button that clears session and redirects to login
2. TDD: Write test for logout functionality first
3. Principles: Single responsibility - logout logic in AuthService
4. Security: Ensure session is properly invalidated
5. Implement: Button component + logout handler
6. Test: Verify all tests pass
```
