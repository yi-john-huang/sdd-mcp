# Design: Token and Context Efficiency

## Architecture decisions

### D1. Single ownership-aware installation pipeline

All CLI entry paths resolve an `InstallTarget` (`claude-code`, `codex`, or `omp`) and a target-aware profile before rendering. A `TargetInstallSession` owns safe root validation, generated-file reconciliation, backup/tombstone handling, and one locked manifest transaction. The manifest stores per-target renderer provenance and hashes; shared mutable steering and marker-owned gitignore entries are tracked separately.

Target renderers own paths and native formats:
- Claude: `.claude/skills`, `.claude/agents`, path-scoped `.claude/rules`, `.claude/contexts`, guidance-only hooks, `CLAUDE.md`.
- Codex: `.agents/skills` with `agents/openai.yaml`, `.codex/agents`, compact pointers, `AGENTS.md`.
- OMP: `.omp/skills`, `.omp/agents`, `.omp/rules`, `.omp/contexts`, `.omp/AGENTS.md`.

Unknown and user-modified files are never inferred to be package-owned. Legacy ownership uses an explicit v3.5.1 catalog. Refresh is opt-in and reversible.

### D2. Progressive guidance renderer

A compact root renderer emits only host-specific manual invocation syntax, phase sequence, selected directory pointers, a two-line route policy, and fallback semantics. Skill frontmatter is target-rendered from the canonical source and shared route tables. Mandatory state transitions/checks remain in core skill bodies; examples and extended references are loaded only for matching branches. Rule policy is structured once and serialized into each host's native metadata.

### D3. Route execution classes

`SKILL_AGENT_ROUTES` and `ROLE_MODEL_ROUTES` remain the route authority. Claude uses a current-turn model override. Codex may request one instruction-driven custom advisor. OMP high-level work runs inline on Sol/medium by default; native read-only Sol/xhigh project agents remain explicit opt-in, bounded, and unable to spawn. This decision is evidence-driven: the initial real A/B showed that automatically adding a child to the v3.5.1 inline baseline increased high-level median cost by 42–93% despite compact handoffs. Implementation/TDD/simple/commit also execute inline unless genuine parallel implementation slices exist. Explicit advisor failures record one parent fallback without retry.

### D4. Disk-addressed workflow core

A shared `SpecPathResolver` validates child names, realpaths, symlinks, and containment for every feature and steering path. `WorkflowEngineService` reads durable `spec.json` under a feature lock, validates transitions, builds the prospective canonical handoff, atomically commits state, then atomically publishes the rebuildable cache. An in-memory repository is synchronized only when present and is never authoritative.

Public feature tools accept `featureName`, not `projectId` or `projectRoot`. Internal requests include the server-bound validated root.

### D5. Deterministic context selection

`ContextCompactionService.load(request)`:
1. Resolves and parses durable workflow state once.
2. Derives effective phase and approved cutoff.
3. Selects only required approved documents, or explicit full-mode draft content.
4. Builds a mandatory workflow-state/next-action/source envelope.
5. Applies global normalization, deduplication, line and section caps.
6. Allocates remaining compact/standard budget across phase-relevant sources.
7. Returns a typed underflow/overflow error rather than violating the bound.
8. Produces source and exact-response SHA-256 fingerprints.
9. Reuses or repairs only canonical default compact `context/handoff.md`.
10. Omits content when `ifNoneMatch` matches.

Defaults are compact 2,048, standard 4,096, full 16,384 estimated tokens using `ceil(chars/4)`. Full mode never truncates raw content. Custom responses are derived without writes.

### D6. Cross-platform atomic persistence

`FileSystemPort.writeFileAtomic` is implemented by a Node adapter around pinned `write-file-atomic ^5.0.1`, with per-destination serialization. Spec, handoff, and manifest publication use the port. Failure injection verifies prior-or-committed state, cache repair, temporary cleanup, and Windows replacement behavior.

### D7. One server registry

The compiled TypeScript registry defines the exact 16-tool public surface. `src/index.ts` exports a callable start function. `sdd-entry.js` and root `mcp-server.js` are thin launchers to that function. Shared schemas and handlers prevent tool drift. Every feature handler passes through the same resolver and durable services.

### D8. Offline measurement

`scripts/context-usage-report.mjs` generates isolated target trees and counts installed and host-visible bytes separately. It optionally parses explicitly supplied OMP JSONL session roots, recursively includes subagents, retains raw usage classes, applies adapter-verified normalization, and emits aggregate tables or stable JSON. It is packaged as `context-report`; it never runs during MCP traffic.

## Error model

Typed domain failures include `InvalidFeatureName`, `PathContainmentViolation`, `PhaseNotApproved`, `ContextBudgetTooSmall`, `ContextBudgetExceeded`, transition prerequisite errors, manifest conflicts, and unsupported target-component combinations. MCP adapters convert them to bounded structured errors without stack traces or file content leakage.

## Concurrency and consistency

- Manifest updates: one lock, re-read, merge selected records, atomic publish.
- Feature transitions: one lock per canonical feature path, re-read after acquisition.
- Atomic writes: serialized per destination.
- The spec is authoritative; handoff is cache. A stale or missing cache is never served and can be repaired after commit/restart.

## Security design

- Validate feature names against the existing child-name policy.
- Reject absolute names and `..` traversal.
- Canonicalize existing parents and targets and reject escaping symlinks before all reads, writes, backups, removals, or renames.
- Validate steering custom names as `.md` basenames.
- Context reporting reads only explicit paths and emits aggregates by default.
- Installation performs no model/auth/network resolution.

## Verification strategy

Unit contracts cover target rendering, ownership reconciliation, atomic failure behavior, context phase/budget/cache matrices, and durable transitions. Integration tests run fresh target journeys and both actual stdio launchers. Pack tests verify the report CLI. Static budgets and reductions are exact. Actual OMP A/B uses six fixed scenarios, three fresh runs per branch, task-quality checks, and comparable positive median cost. The final inline-default routing produced no automatic v4 child, preserved every observable task contract, and improved median cost in all six scenarios.
