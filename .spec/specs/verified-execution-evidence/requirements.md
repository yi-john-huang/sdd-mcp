# Requirements: Verified Execution Evidence

## Overview

### Problem
`sdd-spec-impl` accepts `evidence: { command, exitCode, summary }` from the calling agent for the `record-red`, `record-green`, and `complete` actions. `WorkflowEngineService` checks the shape of that object and the sign of `exitCode`, then persists it. Nothing proves the command ran. The RED classifier and the JEV `red` check read the agent-written `summary`. The TDD gate is therefore recorded, not proven.

### Goal
The SDD server runs the verification command itself, observes the real exit code and output, and persists that observation as the task evidence. A caller can no longer advance a task by typing an exit code.

### Users
- The implementing agent (Claude Code, Codex, OMP) driving `sdd-implement`.
- The human reviewer reading `sdd-status`, `context/handoff.md`, and `spec.json`.
- The project maintainer configuring the server through `.spec/sdd-config.json` and environment variables.

### Scope
- Engine-side execution of evidence commands for `sdd-spec-impl` transitions.
- A command allowlist, timeout, output bound, and environment scrubbing for that execution.
- An additive evidence record shape in `spec.json` schema v5.
- Feeding captured output to the RED classifier and the JEV `red` check.
- Updating `skills/sdd-implement` so the agent passes a command instead of an exit code.

### Out of scope
- Running commands for any other MCP tool.
- Changing approval or checkpoint gates.
- Changing the 17-tool MCP contract beyond new optional inputs and new error codes.
- Sandboxing beyond process-level controls (no containers, no seccomp).

### Assumptions
- The server process already runs with the permissions needed to execute the project's own test commands, because the agent runs the same commands today.
- `GitPort` in `NodeGitAdapter` is the precedent for bounded child-process execution (`execFile`, timeout, `maxBuffer`, `windowsHide`).
- `JevSettings` is the precedent for reading `.spec/sdd-config.json` with an environment override.

### Dependencies
- `WorkflowEngineService.recordTaskProgress` and `withLockedFeature`.
- `RedEvidenceClassifier.classifyRedEvidence`.
- `JevAdvisoryService` `red` check and `JevRedaction`.
- `sddToolDefinitions.ts` `sdd-spec-impl` input schema.
- Skill render baseline hashes in `src/__tests__/unit/cli/fixtures/workflow-skill-render-baseline.json`.

### Success metrics
1. With verified mode on, 100% of `red`, `green`, and `verification` evidence written for `tdd_required` tasks carries `source: "engine"`, an engine-observed exit code, and a SHA-256 of captured output. An e2e test that submits a caller-supplied `exitCode` is rejected with a named error and leaves `spec.json` byte-identical.
2. Every evidence run ends by completion or by timeout within the configured bound (default 120 s, maximum 600 s). A timeout persists no evidence.
3. All 12 existing features under `.spec/specs/` load without migration, and the existing test suite passes except for tests that assert the caller-supplied path in verified mode.
4. The RED classifier and the JEV `red` check receive captured output, never an agent-written summary, when `source` is `engine`.

## Functional Requirements

### FR-1: Engine runs the evidence command
**Objective:** Evidence must come from an observation the server made, not from a claim the caller made.
**EARS Specification:** WHEN `sdd-spec-impl` receives `record-red`, `record-green`, or `complete` with a `run` object `{ argv: string[] }` THEN the workflow engine SHALL execute `argv[0]` with `argv[1..]` as arguments, with `shell: false`, in the validated workspace root, and SHALL record the observed exit code, the SHA-256 of the concatenated stdout and stderr, the wall-clock duration in milliseconds, and the observation timestamp as the task evidence.
**Acceptance Criteria:**
1. A unit test with a fake process port shows the persisted evidence equals the port's observed exit code and output hash, not any value in the request.
2. An e2e test against the packed stdio server runs `node -e "process.exit(3)"` through `record-red` and persists `exitCode: 3`.
3. The child process's `cwd` equals the validated workspace root; a request cannot change it.
4. `argv` is passed as an array; a value containing shell metacharacters such as `;`, `|`, `&&`, or `$(` is executed literally as an argument and is never interpreted by a shell.

### FR-2: Caller-supplied exit codes are rejected in verified mode
**Objective:** Close the gap that lets an agent record evidence without running anything.
**EARS Specification:** WHILE evidence mode is `verified`, IF `sdd-spec-impl` receives `record-red`, `record-green`, or `complete` for any task with an `evidence` object and no `run` object THEN the engine SHALL reject the request with `GovernanceError` code `SelfReportedEvidenceRejected`, SHALL execute nothing, and SHALL leave the task status, revision, and `spec.json` unchanged.
**Acceptance Criteria:**
1. A test submits `evidence: { command, exitCode: 1, summary }` with no `run` in verified mode and receives `SelfReportedEvidenceRejected`; `spec.json` bytes are identical before and after.
2. The rejection applies to `tdd_required` tasks and to `not-applicable` tasks at `complete`.
3. The error message names the `run` field as the accepted input.

### FR-3: Evidence mode is configurable with a verified default
**Objective:** Let an installation roll out verification deliberately while keeping the safe behavior as the default.
**EARS Specification:** The engine SHALL resolve evidence mode from `SDD_EVIDENCE_MODE` when set to `verified` or `self-reported`, otherwise from `.spec/sdd-config.json` key `evidence.mode`, otherwise `verified`; and WHILE the mode is `self-reported` the engine SHALL accept the existing `evidence` input exactly as before this feature and SHALL persist it with `source: "caller"`.
**Acceptance Criteria:**
1. With no configuration, a caller-supplied `evidence` is rejected (FR-2) and a `run` is executed (FR-1).
2. With `SDD_EVIDENCE_MODE=self-reported`, the existing `sdd-spec-impl` request shape from version 5.5.0 succeeds and the persisted entry has `source: "caller"`.
3. An unrecognized `SDD_EVIDENCE_MODE` value resolves to `verified` and is reported once in the tool result as a warning.
4. The resolved mode appears in every `sdd-status` result for the feature.

### FR-4: Command allowlist
**Objective:** The server runs the project's test tooling, not arbitrary programs chosen by a prompt.
**EARS Specification:** IF `run.argv[0]`, after stripping any directory and a Windows `.cmd` or `.exe` suffix, is not in the resolved allowlist THEN the engine SHALL reject the request with `GovernanceError` code `EvidenceCommandNotAllowed`, SHALL execute nothing, and SHALL leave `spec.json` unchanged; the default allowlist SHALL be `node`, `npm`, `npx`, `pnpm`, `yarn`, `bun`, `jest`, `vitest`, `tsc`, `pytest`, `python`, `python3`, `go`, `cargo`, `make`, `mvn`, `gradle`, `dotnet`, and `.spec/sdd-config.json` key `evidence.allowedCommands` SHALL replace the default list when present.
**Acceptance Criteria:**
1. `argv: ["sh", "-c", "exit 1"]` and `argv: ["bash", "..."]` are rejected with `EvidenceCommandNotAllowed` under the default list.
2. `argv: ["/usr/local/bin/npm", "test"]` and `argv: ["npm.cmd", "test"]` resolve to `npm` and are allowed.
3. `argv[0]` containing a path segment `..` or a NUL byte is rejected before any lookup.
4. A project list `["npm"]` rejects `node` and allows `npm`.
5. An allowlist entry that is not a bare program name (contains `/`, `\\`, or whitespace) makes the configuration invalid; the engine then uses the default list and reports the invalid entry once.

### FR-5: Timeout and output bounds
**Objective:** A hung or chatty test command must not hang the MCP server or bloat `spec.json`.
**EARS Specification:** The engine SHALL stop the child process and its descendants when it exceeds the resolved timeout (`SDD_EVIDENCE_TIMEOUT_MS`, then `.spec/sdd-config.json` key `evidence.timeoutMs`, default 120000, clamped to 5000..600000), SHALL then reject the request with `GovernanceError` code `EvidenceRunTimedOut` without persisting evidence, and SHALL cap captured stdout plus stderr at 1 MiB for hashing and at 8 KiB for the persisted excerpt.
**Acceptance Criteria:**
1. A test with a 5000 ms timeout and `node -e "setTimeout(()=>{}, 60000)"` returns `EvidenceRunTimedOut` within 5000 ms plus 1000 ms of tolerance, and no child process remains.
2. Output above 1 MiB stops capture; the hash covers exactly the bytes captured and the excerpt notes truncation.
3. The persisted excerpt is at most 8 KiB and keeps the last bytes of output, because test runners print the verdict last.
4. `SDD_EVIDENCE_TIMEOUT_MS=1` resolves to 5000 and `=999999999` resolves to 600000.

### FR-6: Transition rules keep their exit-code semantics
**Objective:** RED must still prove failure and GREEN must still prove success; only the source of the exit code changes.
**EARS Specification:** WHEN an engine run completes THEN the engine SHALL apply the existing transition rules to the observed exit code: `record-red` requires a non-zero exit code, `record-green` and `complete` require exit code zero; IF the observed code does not satisfy the rule THEN the engine SHALL reject with the existing `InvalidTransition` error and SHALL persist the observation in the tool result but not in `spec.json`.
**Acceptance Criteria:**
1. `record-red` with a run that exits 0 is rejected with `InvalidTransition`; the result includes the observed exit code and excerpt so the agent can see the test passed unexpectedly.
2. `record-green` with a run that exits 1 is rejected with `InvalidTransition` and the result includes the excerpt.
3. A successful `record-red` followed by `record-green` with the same `argv` persists both entries with `source: "engine"`.

### FR-7: Additive evidence record in spec.json v5
**Objective:** Existing specs stay readable and reviewers can tell observed evidence from claimed evidence.
**EARS Specification:** The persisted evidence entry SHALL keep `command`, `exit_code`, `summary`, and `observed_at`, and SHALL add `source` (`"engine"` or `"caller"`), and for `source: "engine"` SHALL add `argv`, `output_sha256`, `duration_ms`, and `output_excerpt`; WHEN the engine reads an entry without `source` THEN it SHALL treat it as `source: "caller"`.
**Acceptance Criteria:**
1. All 12 features under `.spec/specs/` load through `WorkflowEngineService` with no migration and no new validation error.
2. A v5 entry with `source: "engine"` and a missing `output_sha256` fails normalization with the existing `StateInvariantViolation` path.
3. For an engine entry, `command` equals `argv` joined by single spaces and `summary` equals the output excerpt, so tools that read the old fields keep working.
4. The schema version stays 5.

### FR-8: Captured output feeds the RED classifier and the JEV red check
**Objective:** Classification of a RED must be based on what the test runner printed, not on what the agent said it printed.
**EARS Specification:** WHEN a `record-red` run completes THEN the engine SHALL classify the captured excerpt with `classifyRedEvidence(command, excerpt)` and SHALL include the classification in the tool result; and WHEN the JEV `red` check is requested for an engine-sourced entry THEN `JevAdvisoryService` SHALL send the redacted excerpt and SHALL ignore any caller-supplied `summary`.
**Acceptance Criteria:**
1. A run that prints `Cannot find module` and exits 1 is persisted as RED and the result reports classification `setup` with pattern `module-not-found`.
2. A run that prints `Expected: 2 Received: 3` reports classification `assertion`.
3. A JEV `red` request for an engine entry that also carries `evidence.summary: "all good"` sends the persisted excerpt, shown by the fake HTTP port's recorded request body.
4. The excerpt sent to JEV passes through the existing redaction and is bounded to 8 KiB.

### FR-9: Child environment excludes server secrets
**Objective:** The test process must not receive the server's API keys.
**EARS Specification:** The engine SHALL build the child environment from the server environment with `SDD_JEV_API_KEY` removed and every variable whose name matches `/(^|_)(KEY|TOKEN|SECRET|PASSWORD)(_|$)/i` removed unless listed in `.spec/sdd-config.json` key `evidence.passEnv`, and SHALL set `CI=1` when unset.
**Acceptance Criteria:**
1. A run of `node -e "process.stdout.write(String('SDD_JEV_API_KEY' in process.env))"` prints `false` when the server has the key set.
2. `evidence.passEnv: ["MY_TEST_TOKEN"]` lets `MY_TEST_TOKEN` through while `OTHER_TOKEN` is still removed.
3. `PATH`, `HOME`, `NODE_OPTIONS`, and `TMPDIR` pass through unchanged.

### FR-10: One evidence run per feature at a time
**Objective:** Two agents, or one agent retrying, must not race on the same `spec.json`.
**EARS Specification:** WHILE an evidence run is in progress for a feature, IF a second `sdd-spec-impl` request for the same feature arrives THEN the engine SHALL reject it with the existing lock conflict error without starting a second process.
**Acceptance Criteria:**
1. Two concurrent `record-red` requests for one feature produce exactly one child process and one conflict error.
2. A run for feature A does not block a request for feature B.

### FR-11: sdd-implement passes commands, not exit codes
**Objective:** The skill must describe the new contract so agents stop typing evidence.
**EARS Specification:** `skills/sdd-implement/SKILL.md` and its `REFERENCE.md` SHALL instruct the agent to pass the focused test command as `run.argv` for RED, GREEN, and COMPLETE, SHALL state that the server observes the exit code, SHALL tell the agent to read the returned excerpt and classification before continuing, and the render baseline hashes SHALL be refreshed in the same change.
**Acceptance Criteria:**
1. The skill text contains no instruction to record or report an exit code the agent observed itself.
2. `documentation-consistency` and `install-target` tests pass with the refreshed baseline.
3. `docs/WORKFLOW.md`, `DEPLOYMENT.md`, and `CHANGELOG.md` describe `SDD_EVIDENCE_MODE`, `SDD_EVIDENCE_TIMEOUT_MS`, and the `.spec/sdd-config.json` `evidence` keys.

### FR-12: Status and handoff show the evidence source
**Objective:** A reviewer must see at a glance whether a task was proven or claimed.
**EARS Specification:** `sdd-status` SHALL report, per task, the `source` of each recorded evidence entry, and the published `context/handoff.md` SHALL mark each completed task as `verified` when all of its entries are engine-sourced and `self-reported` otherwise.
**Acceptance Criteria:**
1. A feature with one engine-sourced and one caller-sourced task shows both labels in `sdd-status` and in `context/handoff.md`.
2. Features without any evidence are unchanged in both outputs.

## Non-functional Requirements

### NFR-1: No shell interpretation
**Objective:** Prevent command injection through the MCP boundary.
**EARS Specification:** The engine SHALL start the child with `shell: false` and `windowsHide: true`, SHALL never pass `run.argv` through a shell, template, or string concatenation, and SHALL reject `run.argv` that is empty, has more than 64 elements, or has any element longer than 4096 bytes or containing a NUL byte.
**Acceptance Criteria:**
1. The `sdd-spec-impl` input schema encodes the length and size bounds and `additionalProperties: false` on `run`.
2. A code search of the implementation shows a single call site that spawns processes for evidence, and it does not use `exec`, `shell: true`, or string commands.

### NFR-2: Engine overhead
**Objective:** Verification must not slow the loop beyond the test itself.
**EARS Specification:** The engine's own work for one evidence transition, excluding the child's run time, SHALL complete within 200 ms at the 95th percentile on the CI runner.
**Acceptance Criteria:**
1. A unit test with a fake process port that returns immediately records 20 transitions in under 4 s total.

### NFR-3: MCP contract compatibility
**Objective:** Integrators on 5.5.0 must keep working until they opt into verification.
**EARS Specification:** The MCP contract SHALL stay at 17 tools, every existing `sdd-spec-impl` input SHALL stay valid in `self-reported` mode, and `run` SHALL be optional in the input schema; the tool description SHALL state that `run` is required in `verified` mode.
**Acceptance Criteria:**
1. The `sdd-tools-16.json` fixture and the inventory test pass with the 17-tool list.
2. The 5.5.0 request shape for `sdd-spec-impl` validates against the new schema.

### NFR-4: Persisted output is redacted
**Objective:** Test output can echo secrets; `spec.json` is committed.
**EARS Specification:** The engine SHALL pass the output excerpt through the existing `JevRedaction` rules before persisting it to `spec.json` and before including it in any tool result.
**Acceptance Criteria:**
1. A run that prints `API_KEY=sk-live-abc123` persists an excerpt with the value redacted and the tool result shows the same redacted text.
2. The `output_sha256` is computed over the raw captured bytes, before redaction, and the entry records `redactions: <count>`.

### NFR-5: Cross-platform execution
**Objective:** The server is installed on macOS, Linux, and Windows hosts.
**EARS Specification:** The engine SHALL resolve `argv[0]` through the child environment's `PATH` on all three platforms and SHALL accept `npm.cmd`, `npx.cmd`, and `yarn.cmd` on Windows as their bare names for allowlist purposes.
**Acceptance Criteria:**
1. The allowlist resolver unit test covers `npm`, `npm.cmd`, `C:\\tools\\npm.cmd`, and `/usr/bin/npm`.
2. CI runs the e2e evidence test on Linux; Windows and macOS are covered by the resolver unit tests.
