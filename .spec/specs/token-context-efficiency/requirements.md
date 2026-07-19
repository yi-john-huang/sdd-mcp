# Requirements: Token and Context Efficiency

## Goal

Reduce repository-controlled startup and dynamic prompt payload, repeated MCP handoffs, and redundant delegation without weakening SDD phase gates, TDD/security checkpoints, or provider-specific model routing. Measurements must distinguish installed bytes, host-visible payload, estimated tokens, and provider-reported usage.

## Functional Requirements

### FR-1: Measurable payload and usage

WHEN a maintainer runs the packaged context report CLI
THEN the system SHALL report installed bytes, host-visible static payload, invoked assets, raw provider usage classes, normalized total work tokens, and comparable positive cost without copying prompt or response content.

Acceptance criteria:
- `npx sdd-mcp-server context-report` supports fresh generated targets, `--before`, `--after`, and stable `--json` output.
- Malformed usage records fail explicitly.
- Token estimates are always labeled `estimatedTokens` and use `ceil(characters / 4)`.
- Provider fixtures prevent cached input, output, and reasoning double counting.
- If neither positive comparable cost nor verified token normalization exists, the benchmark fails.

### FR-2: Managed target installation

WHEN generated target assets are installed or upgraded
THEN the installer SHALL use a locked, atomic `.sdd-mcp/install-manifest.json` ownership record to update unchanged package-owned files while preserving user modifications.

Acceptance criteria:
- Missing, unchanged, modified, legacy, and obsolete paths follow the approved hash-based ownership rules.
- `--refresh-generated` backs up selected generated files before replacement and never modifies user steering content or unknown files.
- `.sdd-mcp/` is managed in `.gitignore`.
- Symlink and out-of-root writes are rejected.
- Multi-target installation merges records without erasing another target.

### FR-3: Native OMP target

WHEN `--target omp` is selected
THEN the installer SHALL generate OMP-native skills, agents, rules, contexts, and root guidance under `.omp/`, with steering under `.spec/steering`.

Acceptance criteria:
- OMP lean installs skills, steering, and agents; full also installs rules and contexts.
- OMP agent definitions use canonical `gpt-5.6-sol`, xhigh for advisors, medium for implementation/TDD, and advisor tools omit child spawning.
- Installation is filesystem-only and reports model availability as unverified.
- `--target omp --hooks` fails as unsupported; profiles do not silently select hooks.
- Interactive selection includes Codex, Claude Code, and OMP; noninteractive default remains Claude Code; `--codex` remains Codex-only.
- `--all-tools` installs all three native targets plus Antigravity and rejects ambiguous generic path overrides.
- `install-skills` aliases the unified target-aware installer.

### FR-4: Progressive host guidance

WHEN target guidance is rendered
THEN only minimal workflow entry points, selected directory pointers, compact routing policy, and fallback behavior SHALL be persistent.

Acceptance criteria:
- Full roots: Codex ≤2,000 bytes, OMP ≤2,000 bytes, Claude ≤2,500 bytes, repository `AGENTS.md` ≤2,500 bytes.
- Root guidance contains no skill catalog, MCP tool catalog, or per-file component tables.
- All 11 skills are manual-only; each description ≤140 bytes and total descriptions ≤1,400 bytes.
- Each core `SKILL.md` ≤4,000 bytes and total core bodies ≤40,000 bytes; optional material remains reachable in references.
- Claude rules use native `paths`; OMP rules use bounded metadata and `alwaysApply: false`; Codex receives compact pointers only.
- The standalone git and duplicate workflow rules are removed from generated rule sets.
- Six specialist bodies total ≤18,000 bytes and each ≤4,000 bytes.

### FR-5: Provider-native routing

WHEN an SDD skill executes
THEN route behavior SHALL use the shared role and skill route tables without redundant serial delegation.

Acceptance criteria:
- Claude advisor skills use native model override in the current turn.
- Codex advisor skills request one configured Sol/xhigh custom agent and prohibit nested delegation.
- OMP high-level skills run inline on the Sol/medium parent by default; project `.omp/agents` Sol/xhigh advisors remain explicit opt-in, lack spawn capability, and fall back once without retry when explicitly invoked.
- Implementation, TDD, simple task, and commit work remain inline unless at least two independent implementation slices run concurrently.
- Specialist handoffs/results are compact and at most 2,048 estimated tokens.

### FR-6: Phase-aware context contract

WHEN `sdd-context-load` is invoked with a validated `featureName`
THEN the server SHALL derive approved disk state and return deterministic compact, standard, or full context within explicit estimated-token bounds.

Acceptance criteria:
- Public requests never accept `projectRoot`; the server binds its validated workspace root.
- Requests support mode, phase, maxEstimatedTokens, ifNoneMatch, and full-only includeUnapproved.
- Init, approved cutoff, explicit unapproved rejection, and full draft inclusion follow the approved phase-selection contract.
- Default limits are 2,048 compact, 4,096 standard, and 16,384 full estimated tokens.
- Compact/standard underflow returns `ContextBudgetTooSmall`; full overflow returns `ContextBudgetExceeded`; full content is never silently truncated.
- Candidate lines are globally deduplicated and stable; tiny inputs use a bounded direct representation.
- Results expose source and payload fingerprints, sizes, reduction, omitted sources, phase status, and cache status.
- `ifNoneMatch` returns no duplicate content.
- Only canonical default compact `context/handoff.md` persists; phase handoff duplicates do not exist.

### FR-7: Durable workflow transitions

WHEN approval, test-case review, or internal rollback changes workflow state
THEN `WorkflowEngineService` SHALL use disk `spec.json` as authority under a per-feature lock and atomic persistence.

Acceptance criteria:
- Public approval accepts `{ featureName, phase }`; review accepts `{ featureName }`; no v4 public feature tool accepts `projectId`.
- Approval prerequisites and optional test-review checkpoint remain enforced after restart.
- Repeated transitions are idempotent.
- Spec commit precedes rebuildable handoff publication; post-commit handoff failure returns `pending-regeneration` and the next load repairs it.
- Rollback is internal, disk-addressable, atomic, and invalidates context.
- Feature, document, context, backup, and steering paths reject traversal, absolute names, and escaping symlinks.

### FR-8: Cross-platform atomic writes

WHEN specs, handoffs, or manifests are persisted
THEN writes SHALL serialize per destination and safely replace existing files on Node 18+ Windows and POSIX.

Acceptance criteria:
- The adapter uses `write-file-atomic ^5.0.1`.
- Tests cover repeated replacement and injected EEXIST/EPERM failures.
- Temporary files are cleaned and mode is preserved where supported.

### FR-9: One packaged runtime

WHEN either the package bin or direct compatibility launcher starts the MCP server
THEN both SHALL use the compiled TypeScript implementation and expose exactly the same 16 action tools and schemas.

Acceptance criteria:
- Inventory is exactly: init, requirements, design, tasks, implement, status, approve, review-test-cases, quality-check, context-load, template-render, steering, steering-custom, validate-design, validate-gap, spec-impl.
- `sdd-list-skills` is absent.
- Feature-scoped tools use `featureName`; status may omit it to list contained specs.
- Packed/bin and direct stdio tests smoke-test every handler family and workflow/cache behavior.

## Non-functional requirements

- NFR-1 Security: all externally influenced paths use one realpath-aware containment resolver.
- NFR-2 Compatibility: Node 18+ remains supported and noninteractive target defaults remain stable.
- NFR-3 Determinism: unchanged source and options produce byte-identical context and fingerprints.
- NFR-4 Quality: existing approval, TDD, validation, and artifact contracts do not regress.
- NFR-5 Static reduction: fresh-session repository payload drops ≥50% for Codex, ≥50% for OMP versus the documented legacy OMP baseline, and ≥60% for Claude.
- NFR-6 Observed usage: three fresh OMP runs per branch preserve task quality, use no automatic child under the OMP inline-default policy, and regress no scenario by >5% using comparable positive cost or verified normalized total work tokens. This replaces the original automatic-advisor improvement gate after the first real A/B demonstrated that adding a separate Sol/xhigh request to the v3.5.1 inline baseline increased median cost by 42–93% on high-level workflows.
