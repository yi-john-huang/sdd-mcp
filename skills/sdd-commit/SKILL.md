---
name: sdd-commit
description: Guide commit message and PR creation for SDD workflow. Use when committing changes, creating pull requests, or documenting changes. Invoked via /sdd-commit.
---

# SDD Commit & PR Guidelines

Create clear, consistent commit messages and pull requests that document changes effectively.

## Commit Message Format

Follow the Conventional Commits specification:

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Type Prefixes

| Type | When to Use | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(auth): add JWT refresh token` |
| `fix` | Bug fix | `fix(api): handle null user response` |
| `docs` | Documentation only | `docs(readme): update installation steps` |
| `style` | Formatting, no code change | `style(lint): fix linter warnings` |
| `refactor` | Code change, no new feature or fix | `refactor(user): extract validation logic` |
| `perf` | Performance improvement | `perf(query): add index for user lookup` |
| `test` | Adding/updating tests | `test(auth): add login failure tests` |
| `build` | Build system changes | `build(deps): update dependencies` |
| `ci` | CI/CD changes | `ci(github): add test workflow` |
| `chore` | Other changes | `chore(deps): bump lodash version` |
| `revert` | Revert previous commit | `revert: feat(auth): add JWT refresh` |

### Scope

The scope should indicate the area affected:

```
feat(auth):       # Authentication module
fix(api/users):   # Users API endpoint
docs(readme):     # README file
test(e2e):        # End-to-end tests
refactor(db):     # Database layer
```

### Subject Line

- Use imperative mood: "add" not "added" or "adds"
- Don't capitalize first letter
- No period at the end
- Max 50 characters

```
# GOOD
feat(auth): add password reset flow
fix(cart): prevent duplicate items

# BAD
feat(auth): Added password reset flow.
fix(cart): Fixes the duplicate items bug
```

### Body (Optional)

Use for explaining:
- **What** changed and **why**
- Breaking changes
- Related issues

```
feat(auth): add multi-factor authentication

Implement TOTP-based 2FA for enhanced security.
Users can now enable 2FA from their profile settings.

- Add TOTP secret generation
- Add QR code for authenticator apps
- Add backup codes for recovery

Closes #123
```

### Footer (Optional)

```
BREAKING CHANGE: API endpoint changed from /users to /api/v1/users

Refs: #123, #456
Co-authored-by: Name <email@example.com>
```

## Pull Request Template

```markdown
## Summary
<!-- 1-3 bullet points describing the changes -->
- Add user authentication with JWT
- Implement password reset flow
- Add comprehensive test coverage

## Motivation
<!-- Why is this change needed? -->
Users need secure authentication to access protected resources.

## Changes
<!-- Detailed list of changes -->
### Added
- `AuthService` for handling authentication logic
- `JWTProvider` for token generation/validation
- Unit and integration tests for auth flow

### Changed
- Updated `UserController` to use AuthService
- Modified API routes to require authentication

### Removed
- Deprecated session-based authentication

## Testing
<!-- How was this tested? -->
- [x] Unit tests pass
- [x] Integration tests pass
- [x] Manual testing completed
- [ ] E2E tests (pending)

## Screenshots
<!-- If applicable -->

## Checklist
- [x] Code follows project style guidelines
- [x] Tests added/updated
- [x] Documentation updated
- [x] No breaking changes (or documented)
- [x] Security considerations reviewed

## Related Issues
Closes #123
Refs #456
```

## Commit Best Practices

### Atomic Commits
Each commit should be one logical change:

```bash
# GOOD: Separate commits for separate changes
git commit -m "feat(user): add email validation"
git commit -m "test(user): add email validation tests"

# BAD: Multiple unrelated changes
git commit -m "add email validation, fix bug, update docs"
```

### Commit Frequency
- Commit when a logical unit is complete
- Don't commit broken code
- Small, frequent commits are better than large, infrequent ones

### Commit Message Examples

#### Feature
```
feat(cart): add quantity update functionality

Allow users to update item quantities directly from the cart.
Includes optimistic UI updates and error handling.

- Add updateQuantity method to CartService
- Add quantity input component
- Add debounced API calls

Closes #234
```

#### Bug Fix
```
fix(auth): prevent session fixation attack

Regenerate session ID after successful login to prevent
session fixation attacks.

Security: OWASP A7 - Identification and Authentication Failures
```

#### Refactor
```
refactor(api): extract common error handling

Move error handling logic to middleware for consistency
across all API endpoints.

- Create ErrorHandlerMiddleware
- Add custom error classes
- Update all controllers to throw custom errors

No functional changes.
```

#### Breaking Change
```
feat(api)!: change user endpoint response format

BREAKING CHANGE: The /api/users endpoint now returns
a paginated response instead of an array.

Before:
[{ id: 1, name: "John" }, ...]

After:
{
  data: [{ id: 1, name: "John" }, ...],
  pagination: { page: 1, total: 100 }
}

Migration: Update all clients to handle the new response format.
```

## Branch Naming

```
<type>/<ticket>-<description>

Examples:
feature/AUTH-123-jwt-authentication
bugfix/CART-456-duplicate-items
hotfix/PROD-789-security-patch
chore/update-dependencies
```

## Git Workflow

### Before Committing
```bash
# Check status
git status

# Review changes
git diff

# Stage specific files
git add src/auth/

# Or stage all
git add -A
```

### Creating Commit
```bash
# With message
git commit -m "feat(auth): add login endpoint"

# Open editor for longer message
git commit
```

### Before PR
```bash
# Update from main
git fetch origin main
git rebase origin/main

# Run tests
{your test command}  # e.g., npm test, pytest, cargo test, go test

# Push
git push origin feature/AUTH-123-jwt-auth
```

## Quality Checklist

- [ ] Commit message follows format
- [ ] Type prefix is appropriate
- [ ] Scope is specific
- [ ] Subject is imperative and concise
- [ ] Body explains why (if needed)
- [ ] Breaking changes documented
- [ ] Related issues linked
- [ ] Branch name follows convention
- [ ] Tests pass before commit
- [ ] PR description complete
