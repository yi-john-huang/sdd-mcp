# Commit and Pull Request Reference

Read only when the core workflow needs examples or repository conventions do not answer the question.

## Commit Messages

Use `<type>(<scope>): <imperative subject>` when Conventional Commits applies. Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Keep scope specific, explain why in the body, and use `BREAKING CHANGE:` for migration-impacting behavior.

Examples:

```text
feat(auth): add password reset flow
fix(api): preserve error cause
refactor(storage): centralize key validation
```

Prefer one logical change per commit. Do not combine unrelated cleanup. Never claim co-authorship without consent.

## Branches and Staging

Follow repository policy. Otherwise use a short `<type>/<ticket>-<description>` branch. Before committing, inspect status, inspect the intended diff, stage explicit paths, re-inspect the staged diff, and verify no secrets or unrelated changes entered it. Do not rewrite published history or force-push unless explicitly directed.

## Pull Request Checklist

- concise summary and motivation;
- behavioral changes and affected artifacts;
- linked requirement/issue and breaking-change migration;
- exact tests/checks observed, with failures disclosed;
- security, privacy, compatibility, and rollout impact;
- screenshots only for visual behavior;
- unresolved blockers or follow-up work.
