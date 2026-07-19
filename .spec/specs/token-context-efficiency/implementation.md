# Implementation Evidence: Token and Context Efficiency

## Status

Implementation completed for v4.0.0 on 2026-07-19. Requirements, design, and task approvals were preserved. The optional test-case review checkpoint was completed before implementation.

## Delivered contracts

- Managed, locked, atomic install ownership with safe upgrades, conflicts, tombstones, refresh backups, and three-target isolation.
- First-class Claude Code, Codex, and OMP target renderers and profiles.
- Manual-only progressive skills, scoped native rules, compact roots, reachable references, and bounded specialist definitions.
- OMP inline-default Sol/medium routing with explicit opt-in Sol/xhigh project advisors; Claude current-turn model routing; Codex custom-advisor metadata.
- Disk-authoritative `featureName` workflow state, realpath containment, atomic approval/review/rollback, phase-aware bounded context, canonical compact handoff, and ETag continuation.
- One compiled MCP runtime with exactly 16 public tools, used by both package and compatibility entrypoints.
- Packaged offline `context-report` CLI with static-category, real OMP JSONL, provider-normalization, cost-comparison, and privacy contracts.

## Static payload evidence

Measured by `node scripts/context-usage-report.mjs` against immutable v3.5.1 release baselines:

| Target | v3.5.1 host-visible bytes | v4 full bytes | Reduction | Gate |
|---|---:|---:|---:|---:|
| Codex | 8,017 | 2,055 | 74.37% | ≥50% — pass |
| OMP | 8,017 | 1,346 | 83.21% | ≥50% — pass |
| Claude Code | 25,197 | 1,098 | 95.64% | ≥60% — pass |

Guidance budgets:

- Repository `AGENTS.md`: below 2,500 bytes.
- Eleven core skill bodies: 21,421 bytes total; largest 2,352 bytes.
- Skill descriptions: 886 bytes total; largest 90 bytes; 11/11 manual-only.
- Six specialist bodies: 8,878 bytes total; largest 1,525 bytes.
- Generated roots: Codex 798 bytes, OMP 763 bytes, Claude Code 740 bytes in the measured full trees.
- Detailed Claude rule bodies loaded unconditionally: zero bytes.

## Real OMP A/B

Runtime: OMP 17.0.4, `openai-codex/gpt-5.6-sol`, medium parent reasoning. Three fresh sessions per branch and scenario. Positive provider-reported cost was comparable, so it was the primary gate; normalized input/output/work-token classes and raw cache/cost classes remain in `benchmark-results.json`.

The first automatic-advisor experiment was rejected: adding one Sol/xhigh child to the v3.5.1 inline baseline increased median cost by 92.96% for requirements, 51.24% for design, and 42.31% for security. The user approved the evidence-driven cutover to inline-default OMP routing with explicit opt-in advisors.

Final medians:

| Scenario | v3.5.1 median cost | v4 median cost | Change | Observable quality |
|---|---:|---:|---:|---|
| One-file simple fix | 0.212267 | 0.197769 | −6.83% | 3/3 focused tests pass |
| Medium three-file fix | 0.398256 | 0.351285 | −11.79% | 3/3 focused tests pass |
| Requirements | 0.417888 | 0.358991 | −14.09% | 3/3 EARS artifacts valid |
| Design | 0.717061 | 0.651686 | −9.12% | 3/3 traceable designs valid |
| Security review | 0.565867 | 0.556021 | −1.74% | 3/3 reports identify SQL injection and XSS with remediation |
| Repeated context | 0.259184 | 0.254329 | −1.87% | 3/3 second loads return `not-modified` without repeated content |

Every scenario improved; none regressed. All 18 v4 runs passed the task-quality contract and used zero automatic specialist sessions. Native OMP Sol/xhigh agent metadata remains installed and covered by renderer tests for explicit invocation.

## Verification evidence

Focused suites:

- Installer/guidance integration: 11 suites, 121 tests passed.
- Context/workflow/runtime contracts: 4 suites, 36 tests passed.
- Canonical asset and delegation tests: 16 tests passed.
- Rule/skill/agent managers: 38 tests passed.
- Context reporter: 8 tests passed, plus Node syntax/help smoke tests.
- Actual package/direct stdio entrypoints: 2 tests passed with the exact 16-tool inventory.
- Packed-install smoke: `context-report --help`, OMP lean install, root/skills/agents/manifest creation, and 16-tool stdio inventory passed.

Final repository checks: TypeScript typecheck passed; production build passed; all 38 Jest suites and 357 tests passed; lint completed with zero errors and 321 inherited warnings (v3.5.1 baseline: 335 warnings); production dependency audit reported zero vulnerabilities; package dry-run included the reporter, OMP renderer, and v4 launchers; a fresh packed install passed reporter help, OMP full installation, manifest creation, and exact 16-tool stdio inventory smoke tests.

## Security review

- All feature and steering locators reject absolute names, traversal, and escaping symlinks.
- Install ownership never infers package ownership from directory location alone.
- Modified generated files and user steering remain preserved.
- The usage reporter reads only explicit paths and emits aggregates by default; fixtures prove prompt, response, cwd, and source-path content is not leaked.
- Atomic state writes serialize by destination and retain a prior valid spec or a committed spec with a rebuildable handoff.
