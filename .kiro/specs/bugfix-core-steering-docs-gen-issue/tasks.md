# Implementation Plan

## Phase 1 – Validation & Baseline

### Task 1.1 – Reproduce the fallback issue (FR-2)
- Run `npm run dev` and call `sdd-steering`, `sdd-requirements`, `sdd-design`, `sdd-tasks` to capture the current fallback output and `[SDD-DEBUG]` logs showing loader failures.
- Document the failing stack traces and the exact path list reported so we can assert parity after the fix.
- Acceptance: Screenshots or logs committed to issue notes; requirements/design/tasks confirmed to contain fallback warning prior to code changes.
- Governance:
  - Follow `.kiro/steering/tdd-guideline.md` while creating any diagnostic helpers (write failing test or reproduction script before patches).
  - Review `.kiro/steering/principles.md` to ensure investigation scripts stay simple and reversible.

## Phase 2 – Module Loader Hardening

### Task 2.1 – Implement cross-context loader (FR-1, FR-2, FR-3)
- Refactor `src/utils/moduleLoader.ts` to compute absolute candidate paths from `import.meta.url`, loop over `.ts/.js/.mjs/.cjs`, and log each attempt.
- Expose shared `loadModule` helper used by both `loadDocumentGenerator` and `loadSpecGenerator`.
- Acceptance: Running `npm run dev` loads modules without fallback; loader error (forced via renamed file) lists every attempted path.
- Governance:
  - Follow `.kiro/steering/tdd-guideline.md`: add/adjust unit tests that fail first (e.g., simulate `.ts` success before implementation).
  - Review `.kiro/steering/principles.md`: ensure helper stays modular (single responsibility, no unnecessary branching).

### Task 2.2 – Unit tests for loader behavior (FR-5)
- Extend `src/__tests__/unit/utils/moduleLoader.test.ts` to cover both TypeScript (source) and JavaScript (dist) scenarios plus aggregated failure output.
- Mock `import()` / `fs.existsSync` as needed so the tests do not touch the file system.
- Acceptance: New tests fail on current main branch, pass after loader refactor, and assert attempted path logging.
- Governance:
  - Follow `.kiro/steering/tdd-guideline.md`: write the failing test first.
  - Review `.kiro/steering/principles.md`: keep tests short, readable, and DRY.

## Phase 3 – Simplified Handler Resilience

### Task 3.1 – Add fallback gating + shared error helper (FR-2, FR-3)
- Update `handleSteeringSimplified`, `handleRequirementsSimplified`, `handleDesignSimplified`, and `handleTasksSimplified` in `src/index.ts` to:
  - Surface loader errors in MCP responses by default.
  - Respect `SDD_ALLOW_TEMPLATE_FALLBACK` env flag or `args.allowFallback===true` before writing template docs.
  - Emit actionable instructions inside the error/fallback text (point to `npm run build`).
- Acceptance: With default settings commands fail fast with aggregated loader error when modules are deliberately missing; when env flag is true templates contain the warning comment.
- Governance:
  - Follow `.kiro/steering/tdd-guideline.md`: create regression tests/mocks that fail before handler changes.
  - Review `.kiro/steering/principles.md`: keep helper functions small, avoid duplicated logic across handlers.

### Task 3.2 – Update docs & CHANGELOG (FR-3)
- Document the new fallback flag and behavior change in `README.md` and add an entry to `CHANGELOG.md`.
- Acceptance: Docs mention `SDD_ALLOW_TEMPLATE_FALLBACK` usage and warn that templates indicate build issues.
- Governance:
  - Follow `.kiro/steering/tdd-guideline.md`: treat doc updates like code—lint/preview before committing.
  - Review `.kiro/steering/principles.md`: ensure explanations are concise and avoid unnecessary complexity.

## Phase 4 – Task Generator Governance Hooks

### Task 4.1 – Inject TDD/principle subtasks in `specGenerator` (FR-4, FR-5)
- Implement `enforceGovernance` helper in `src/utils/specGenerator.ts`, append it to all phase arrays, and ensure `requirements` fields mention `TDD, Principles`.
- Rebuild artifacts (`npm run build`) so `dist/utils/specGenerator.js` and the root `specGenerator.js` mirror the change.
- Acceptance: Generated `tasks.md` for any spec shows the two governance subtasks under every checklist item; diff confirms dist output updated.
- Governance:
  - Follow `.kiro/steering/tdd-guideline.md`: add failing snapshot/string test before modifying generator output.
  - Review `.kiro/steering/principles.md`: keep helper pure and reusable across phases.

### Task 4.2 – Tests for governance injection (FR-5)
- Add/extend Jest tests to verify each task entry includes the TDD and principles subtasks and that requirement tags include `TDD` and `Principles`.
- Acceptance: Tests fail before generator change and pass afterward; coverage reports include new branches.
- Governance:
  - Follow `.kiro/steering/tdd-guideline.md`: develop tests first.
  - Review `.kiro/steering/principles.md`: avoid brittle string comparisons; prefer parsing sections logically.

## Phase 5 – Integration, QA, and Release

### Task 5.1 – End-to-end verification & release prep (FR-2, FR-3, FR-4)
- Run `npm run test`, `npm run build`, and manual smoke tests:
  - `npm run dev` + each SDD command (analysis path).
  - `SDD_ALLOW_TEMPLATE_FALLBACK=true npm run dev` to confirm optional templates.
  - `npx sdd-mcp` from a clean clone to ensure dist consumers work.
- Ensure `.kiro/steering` outputs reflect analysis and `tasks.md` shows governance subtasks.
- Acceptance: All commands succeed without fallback in normal mode; release notes updated; no dirty files remaining besides intentional changes.
- Governance:
  - Follow `.kiro/steering/tdd-guideline.md`: treat manual tests as validation of previously written automated tests; add new automated coverage if a manual step reveals a missing guard.
  - Review `.kiro/steering/principles.md`: verify final code remains simple, with no unused abstractions before merging.
