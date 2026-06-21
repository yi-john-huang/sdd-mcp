---
name: git-workflow
description: Git commit and branching conventions
priority: 80
alwaysActive: true
---

# Git Workflow Rules

## Commit Messages

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only changes
- **style**: Code style changes (formatting, semicolons)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvement
- **test**: Adding or updating tests
- **chore**: Build process or auxiliary tool changes

### Subject Line
- Use imperative mood ("add" not "added")
- No period at the end
- Maximum 50 characters
- Capitalize first letter

### Body
- Explain "what" and "why", not "how"
- Wrap at 72 characters
- Separate from subject with blank line

### Examples
```
feat(auth): add JWT token refresh endpoint

Implement automatic token refresh to improve user experience.
Tokens are refreshed 5 minutes before expiration.

Closes #123
```

```
fix(api): handle null response from external service

The external payment API occasionally returns null instead of
an error object. This caused unhandled exceptions in production.

Fixes #456
```

## Branching Strategy

### Branch Types
- **main/master**: Production-ready code
- **develop**: Integration branch for features
- **feature/**: New features (`feature/add-user-auth`)
- **fix/**: Bug fixes (`fix/login-validation`)
- **refactor/**: Code refactoring (`refactor/better-architecture`)

### Branch Naming
- Use lowercase with hyphens
- Include ticket number if applicable
- Keep names descriptive but concise

## Pull Requests

### Before Creating PR
- Rebase on latest target branch
- Run all tests locally
- Update documentation if needed
- Self-review your changes

### PR Description
- Reference related issues
- Describe what changed and why
- Include testing instructions
- Add screenshots for UI changes

### Review Process
- Address all review comments
- Don't force-push after review started
- Squash commits when merging (if team policy)
