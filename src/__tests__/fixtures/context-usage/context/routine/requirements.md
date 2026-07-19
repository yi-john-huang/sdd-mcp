# Requirements

- When a caller supplies a feature name, the service shall resolve it beneath the project spec root.
- If a phase is unapproved, compact and standard loads shall fail with `PhaseNotApproved`.
- The service shall never expose a model-supplied project root.
