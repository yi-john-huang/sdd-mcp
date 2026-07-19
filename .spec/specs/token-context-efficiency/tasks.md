# Tasks: Token and Context Efficiency

All production changes follow red-green-refactor. Each task is complete only with its focused behavioral tests.

## 1. Managed installation foundation

- [x] 1.1 Add failing manifest tests for missing, unchanged, modified, legacy, obsolete, shared, and three-target merge behavior.
- [x] 1.2 Implement locked atomic manifest persistence and hash-based ownership reconciliation.
- [x] 1.3 Add failing refresh tests for backup layout, tombstones, unknown files, steering preservation, gitignore block, traversal, and symlink escape.
- [x] 1.4 Implement `--refresh-generated`, v3.5.1 legacy catalog, reversible backups, and `.sdd-mcp/` ignore management.

## 2. Native OMP target and unified CLI

- [x] 2.1 Add failing target/profile/CLI journeys for explicit OMP, three-way prompt, stable Claude default, deprecated Codex alias, all-tools, hook rejection, and ambiguous overrides.
- [x] 2.2 Implement OMP target paths, profile sets, native skill/rule/context/agent/root renderers, route metadata, and filesystem-only diagnostics.
- [x] 2.3 Add failing tests proving `install-skills` and all-tools use the unified recursive target renderer.
- [x] 2.4 Remove the targetless direct skill install path and implement the unified alias.

## 3. Progressive guidance and routing

- [x] 3.1 Add failing byte-budget and content tests for roots, skills, descriptions, rules, nested references, and agents.
- [x] 3.2 Compact target-specific root guidance and repository `AGENTS.md` without persistent catalogs.
- [x] 3.3 Add manual-only skill metadata and Codex `agents/openai.yaml`; split optional detail into reachable references while retaining mandatory checks.
- [x] 3.4 Implement structured rule scopes for Claude paths, OMP globs/non-always application, and Codex pointers; remove duplicate workflow/git generated rules.
- [x] 3.5 Centralize execution classes and render Claude current-turn overrides, one Codex advisor request, OMP inline-default routing with explicit opt-in native advisors, and inline implementation/TDD/commit behavior.
- [x] 3.6 Slim specialist bodies and enforce role-specific tools, turn limits, nested-delegation guard, and compact result schema.

## 4. Cross-platform atomic persistence and safe paths

- [x] 4.1 Add failing adapter tests for serialized replacement, existing destinations, temporary cleanup, EEXIST/EPERM injection, and mode preservation.
- [x] 4.2 Pin `write-file-atomic ^5.0.1`, extend `FileSystemPort`, and replace the POSIX-only helper.
- [x] 4.3 Add failing resolver tests for valid child names, absolute/traversal names, escaping feature/document/context symlinks, status listing, and steering writes.
- [x] 4.4 Implement one realpath-aware `SpecPathResolver` and route every feature/steering path through it.

## 5. Phase-aware context service

- [x] 5.1 Add failing tests for init, phase cutoff, explicit unapproved rejection, full draft inclusion, missing/read failures, and parsed normalized metadata.
- [x] 5.2 Implement disk-addressed request/result contracts and effective phase/source selection.
- [x] 5.3 Add failing tests for global deduplication, caps, tiny direct payload, exact default/custom budgets, mandatory-envelope underflow, and full overflow.
- [x] 5.4 Implement deterministic bounded selection and typed budget errors.
- [x] 5.5 Add failing tests for source/payload fingerprints, cache hit/regeneration, not-modified, malformed/stale/wrong-phase cache, and absence of phase duplicates.
- [x] 5.6 Implement canonical compact handoff persistence, ETag behavior, and deterministic custom response rebuilding.

## 6. Durable workflow transitions

- [x] 6.1 Add failing approval/review/rollback tests covering restart, prerequisites, ordering, checkpoint, idempotence, concurrent attempts, spec failure, post-commit handoff failure, repair, and invalidation.
- [x] 6.2 Refactor `WorkflowEngineService` around disk-authoritative feature requests, per-feature locking, atomic spec commits, and rebuildable handoff publication.
- [x] 6.3 Implement public metadata-only approval and test-review responses and internal disk-addressed rollback.

## 7. Canonical package runtime

- [x] 7.1 Add a shared inventory/schema contract asserting exactly 16 public action tools and `featureName` locator policy.
- [x] 7.2 Port every retained handler to the compiled registry; add review-test-cases and remove list-skills.
- [x] 7.3 Export one callable server start function and replace package/direct scripts with thin launchers.
- [x] 7.4 Add actual stdio tests for both launchers covering inventory, handler families, review checkpoint, approval handoff, context modes, ETag, and budget errors.

## 8. Offline measurement

- [x] 8.1 Add deterministic tiny/routine/large context and provider usage fixtures.
- [x] 8.2 Add failing parser/normalization tests for raw input/output/cache/reasoning/cost classes, malformed records, subagents, comparability, and stable JSON.
- [x] 8.3 Implement and package `context-usage-report.mjs`, the npm script, and `context-report` bin route.
- [x] 8.4 Generate fresh v3.5.1 baseline/new targets and prove exact root/core/agent limits and ≥50% Codex, ≥50% OMP, ≥60% Claude static reduction.

## 9. Integrated verification

- [x] 9.1 Run focused installer/guidance tests.
- [x] 9.2 Run focused context/workflow tests.
- [x] 9.3 Run packed/bin and direct runtime integration tests.
- [x] 9.4 Run typecheck, build, lint, package dry-run, and dependency review.
- [x] 9.5 Run six actual OMP before/after scenarios three times per branch, record raw and normalized usage plus quality, and enforce the revised no-regression gate under the approved inline-default OMP routing.
