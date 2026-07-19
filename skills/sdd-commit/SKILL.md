---
name: sdd-commit
description: Commit verified SDD changes and prepare a focused pull request.
disable-model-invocation: true
---

# Commit and Pull Request

Run this skill locally in the current turn. Do not delegate commit, branch, or pull-request work.

## Required Workflow

1. Inspect repository status and the exact changes to include; preserve unrelated work.
2. Confirm the focused tests or checks relevant to those changes passed. Never claim unobserved verification.
3. Review the staged diff before committing. Never stage secrets, credentials, generated backups, or unrelated files.
4. Use the repository's established commit style. Otherwise use an imperative Conventional Commit subject:
   `<type>(<scope>): <subject>`.
5. Explain why in the body when the subject cannot; record breaking behavior explicitly.
6. For a pull request, summarize intent, affected behavior, focused test evidence, migration or security impact, and unresolved blockers.

Do not rewrite history, force-push, discard changes, bypass hooks, or create a commit unless the user requested it.

## Output

Return the commit or PR identifier when created, the included paths, verification evidence, and any blocker. Do not echo a large diff.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only when message examples, branch naming, staging guidance, or the pull-request checklist is needed.
