# Custom Steering Reference

Read only for templates or scope examples.

## Template

```markdown
# Topic
## Purpose
Why this guidance exists.
## Scope
Included and excluded files or workflows.
## Rules
Actionable MUST/SHOULD guidance with rationale.
## Exceptions
Bounded exceptions and approval path.
## Verification
How a maintainer proves compliance.
```

## Scope Examples

- Always: a repository-wide legal or safety constraint that applies to every task.
- Conditional: test conventions for `**/*.test.ts` and `**/*.spec.ts`; API rules for `src/api/**/*`.
- Manual: release procedure, rare migration playbook, or domain glossary.

Use forward-slash globs and test both matching and near-miss paths. Avoid a broad `**/*` conditional scope when manual inclusion is honest. A custom file supplements rather than contradicts mandatory security or workflow gates. Examples should use synthetic values and contain no live credentials or private endpoints.
