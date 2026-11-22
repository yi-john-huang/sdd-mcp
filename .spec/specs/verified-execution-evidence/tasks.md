# Implementation Tasks: verified-execution-evidence

## Overview

Four tracks, ordered so each task ends in a runnable check:

- Track 1, pure foundations (1.1 to 1.4): config reader, evidence settings, the process port and adapter, and the evidence runner. 1.1→1.2 and 1.3 are independent of each other; 1.4 needs both.
- Track 2, engine (2.1 to 2.5): additive evidence entry, the transition gate with the engine run, tool schema and DI, the JEV red check, and status and handoff labels. 2.1 is independent of Track 1.
- Track 3, text (3.1, 3.2): the `sdd-implement` skill with its baseline, then docs.
- Track 4, proof (4.1, 4.2): the stdio e2e run and the full verification.

Independent slices that could run concurrently: {1.1, 1.3, 2.1}. Everything else is serial. Tests use Jest (`npx jest <paths>`). No commits are made inside tasks; the user commits through `/skill:sdd-commit`.

## Tasks

### 1.1 Shared project config reader
**Covers:** FR-3, D-5
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/application/services/ProjectConfig.ts, src/application/services/JevSettings.ts, src/__tests__/unit/evidence/ProjectConfig.test.ts, src/__tests__/unit/jev/JevSettings.test.ts
**Acceptance criteria:** 1. RED: `ProjectConfig.test.ts` fails on import; it asserts `readProjectConfig(root, fs)` returns the parsed object for a valid file, `undefined` for a missing file, a non-file, a file over 16 KB, invalid JSON, and a JSON array, and uses only `exists`, `stat`, and `readFile` on the port. 2. GREEN: `readProjectConfig` is implemented; `readProjectJevSetting` delegates to it and its private reader is deleted. 3. All existing `JevSettings.test.ts` cases pass unchanged.
**Verification:** `npx jest src/__tests__/unit/evidence/ProjectConfig.test.ts src/__tests__/unit/jev/JevSettings.test.ts`

### 1.2 Evidence settings with precedence, clamping, and warnings
**Covers:** FR-3, FR-4, FR-5, FR-9, D-5
**Dependencies:** 1.1
**TDD:** required
**Affected artifacts:** src/application/services/EvidenceSettings.ts, src/__tests__/unit/evidence/EvidenceSettings.test.ts
**Acceptance criteria:** 1. RED: a table test fails on import; it covers: no config → `mode: verified`, `timeoutMs: 120000`, the 18 default commands, empty `passEnv`, no warnings; `SDD_EVIDENCE_MODE=self-reported` wins over config `verified`; `SDD_EVIDENCE_MODE=bogus` → `verified` plus one warning naming the value; `SDD_EVIDENCE_TIMEOUT_MS=1` → 5000 and `=999999999` → 600000; config `evidence.timeoutMs: 30000` used when env unset; config `allowedCommands: ["npm"]` replaces the defaults; an entry `"bin/npm"` or `"npm test"` invalidates the whole list → defaults plus one warning; `passEnv: ["MY_TEST_TOKEN"]` is kept. 2. GREEN: `resolveEvidenceSettings(env, projectConfig)` returns a frozen `EvidenceSettings` with `ReadonlySet` fields. 3. `toString` and `JSON.stringify` of the settings expose no environment values other than mode and timeout.
**Verification:** `npx jest src/__tests__/unit/evidence/EvidenceSettings.test.ts`

### 1.3 ProcessPort and NodeProcessAdapter
**Covers:** FR-1, FR-5, NFR-1, NFR-5, D-1, D-2
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/domain/ports.ts, src/infrastructure/adapters/NodeProcessAdapter.ts, src/__tests__/unit/evidence/NodeProcessAdapter.test.ts
**Acceptance criteria:** 1. RED: the adapter test fails on import; cases: `node -e "process.exit(0)"` → `exited` 0; `process.exit(3)` → `exited` 3; a script writing `out` to stdout then `err` to stderr → `output` is `out\nerr` in order; a script printing 2 MiB with `maxOutputBytes: 1 MiB` → `truncated: true` and `output.length === 1048576`; `setTimeout(()=>{}, 60000)` with `timeoutMs: 1000` → `timed-out` within 2 s and `process.kill(pid, 0)` throws ESRCH within 1 s; a script that spawns a sleeping child → the grandchild pid is also gone after timeout; program `definitely-not-a-program-xyz` → `spawn-failed` with `reason: 'not-found'`; `durationMs` is a non-negative integer on every variant. 2. GREEN: `spawn` with `shell: false`, `windowsHide: true`, `stdio: ['ignore','pipe','pipe']`, `detached` on POSIX, SIGTERM then SIGKILL on the process group after 2 s, `taskkill /pid /T /F` on Windows; the Windows branch is covered by a unit test on the built command line, skipped at runtime off Windows. 3. The adapter never rejects: a test that passes `cwd` of a missing directory resolves to `spawn-failed`.
**Verification:** `npx jest src/__tests__/unit/evidence/NodeProcessAdapter.test.ts`

### 1.4 EvidenceRunner: argv bounds, allowlist, child env, hash, excerpt, redaction, classification
**Covers:** FR-1, FR-4, FR-5, FR-8, FR-9, NFR-1, NFR-4, D-6, D-7, D-8, D-11
**Dependencies:** 1.2, 1.3
**TDD:** required
**Affected artifacts:** src/application/services/EvidenceRunner.ts, src/__tests__/unit/evidence/EvidenceRunner.test.ts
**Acceptance criteria:** 1. RED: tests fail on import. Allowlist table: `sh`, `bash`, `../npm`, `npm\u0000`, 65 argv elements, a 4097-byte element, and `[]` are rejected before the fake port is called (call count 0), with `EvidenceCommandNotAllowed` for the first two and `InvalidParams` for the rest; `/usr/local/bin/npm`, `npm.cmd`, `C:\tools\npm.cmd`, and `NPM.CMD` (Windows case only) resolve to `npm`; project list `["npm"]` rejects `node`. 2. RED: `childEnv` drops `SDD_JEV_API_KEY`, `MY_SECRET`, `API_TOKEN`, `DB_PASSWORD`, `AWS_SECRET_ACCESS_KEY`; keeps `PATH`, `HOME`, `TMPDIR`, `NODE_OPTIONS`, `LANG`, `KEYBOARD` (no underscore boundary), `TOKENIZER`; re-adds `passEnv` names; sets `CI=1` only when unset. 3. RED: with a fake port returning 10 KiB where the last line is `Expected: 2 Received: 3`, the result has `outputSha256 === sha256(raw)`, an `outputExcerpt` of at most 8192 bytes ending with that line, no leading partial UTF-8 code point when the cut lands inside a 3-byte character, `truncated` echoed from the port, and `classification: assertion`; with output `Cannot find module 'x'` → `classification: setup`, pattern `module-not-found`; with output containing `API_KEY=sk-live-abc123` → excerpt redacted, `redactions: 1`, hash computed over the raw bytes; empty output → excerpt `""`, hash of zero bytes. 4. RED: a `timed-out` port result maps to `{ kind: 'timed-out', excerpt }` and a `spawn-failed` result maps to `{ kind: 'spawn-failed', reason }`; the runner never throws for a port result. 5. GREEN: implement `EvidenceRunner.run(request): Promise<EvidenceRunOutcome>` as a pure orchestration over the port with the single `ProcessPort.run` call; the exhaustive `switch` on `ProcessRunResult.kind` compiles with `never` in the default branch.
**Verification:** `npx jest src/__tests__/unit/evidence/EvidenceRunner.test.ts`

### 2.1 Additive v5 evidence entry and compatibility load
**Covers:** FR-7, NFR-3, D-9
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/domain/types.ts, src/application/services/WorkflowEngineService.ts, src/__tests__/unit/workflow/WorkflowEngineService.evidence-shape.test.ts
**Acceptance criteria:** 1. RED: tests fail: a spec with a legacy entry (`command`, `exit_code`, `summary`, `observed_at`) loads and `getFeatureStatus` reports `source: caller` for it; an entry with `source: "engine"`, `argv`, `output_sha256` (64 hex), `duration_ms`, `output_excerpt`, `truncated`, `redactions`, `red_classification` loads and round-trips through `commitSpec` byte-for-byte on those keys; an engine entry missing `output_sha256` or with a 63-char hash fails with `StateInvariantViolation`; an unknown key fails as today; every spec under `src/__tests__/fixtures` and every `.spec/specs/*/spec.json` in this repository (12 features) loads with no error. 2. GREEN: `ExecutionEvidence` gains the optional fields from D-9; `normalizeV5Evidence` and the writer map snake_case keys; `source` defaults to `caller` on read; the schema version constant is unchanged. 3. `summary` for an engine entry equals the excerpt or `"(no output)"` when empty, and `command` equals `argv.join(' ')`.
**Verification:** `npx jest src/__tests__/unit/workflow/WorkflowEngineService.evidence-shape.test.ts src/__tests__/unit/workflow/WorkflowEngineService.v4.test.ts`

### 2.2 Transition gate: mode, engine run, exit-code rule, re-record RED, lock lease
**Covers:** FR-1, FR-2, FR-3, FR-6, FR-8, FR-10, NFR-2, D-4, D-8, D-12
**Dependencies:** 1.4, 2.1
**TDD:** required
**Affected artifacts:** src/application/services/WorkflowEngineService.ts, src/application/services/WorkflowErrors.ts, src/utils/withFilesystemLock.ts, src/__tests__/unit/workflow/WorkflowEngineService.evidence.test.ts, src/__tests__/unit/workflow/WorkflowErrors.test.ts
**Acceptance criteria:** 1. RED: with a fake `ProcessPort` and verified mode, `record-red` with `evidence` and no `run` → `SelfReportedEvidenceRejected`, zero port calls, `spec.json` bytes identical; `record-red` with `run` whose fake exit is 1 → status `red-observed`, entry `source: engine`, `exit_code: 1`, `red_classification` set, revision +1, result carries `observed` and `evidenceMode: verified`; fake exit 0 on `record-red` → `TaskTransitionInvalid` with `details.observed.exitCode === 0`, no write; `record-green` with fake exit 1 → `TaskTransitionInvalid`, no write; `record-green` exit 0 then `complete` exit 0 with artifacts → `completed`, both entries `engine`; `not-applicable` task `complete` without `run` in verified mode → `SelfReportedEvidenceRejected`; `timed-out` port result → `EvidenceRunTimedOut` with the partial excerpt, no write; `spawn-failed` → `TaskTransitionInvalid` with `details.observed.spawnFailed`, no write; engine constructed without a runner in verified mode → `EvidenceRunnerUnavailable`. 2. RED: `self-reported` mode accepts the 5.5.0 `evidence` object, persists `source: caller`, and never calls the port; `self-reported` mode with `run` still runs the command and persists `engine`. 3. RED: re-record: a `red-observed` task whose red entry is `engine` with `red_classification: setup` accepts a second `record-red` and replaces the entry, revision +1; classification `assertion` → `TaskTransitionInvalid`; a `caller`-sourced red → `TaskTransitionInvalid`. 4. RED: two concurrent `record-red` calls on one feature with a port that resolves after 200 ms → exactly one port call and one error whose code is `RevisionConflict` or `LockTimeout`; a concurrent call on another feature is not delayed beyond 50 ms. 5. RED: `WorkflowErrors.test.ts` asserts the four new codes exist in `GovernanceErrorCode` and map to the existing MCP error mapping. 6. RED (NFR-2): 20 sequential transitions with an immediately-resolving port finish in under 4 s. 7. GREEN: implement D-4, D-8, D-12; `withFilesystemLock` gains an optional `leaseMs` (or the engine passes an existing equivalent) so the lease is `timeoutMs + 30000` for the three evidence actions; `assertHeld()` is called after the run and before any mutation.
**Verification:** `npx jest src/__tests__/unit/workflow/WorkflowEngineService.evidence.test.ts src/__tests__/unit/workflow/WorkflowErrors.test.ts src/__tests__/unit/workflow/WorkflowEngineService.v4.test.ts`

### 2.3 Tool schema `run`, adapter pass-through, result fields, DI wiring
**Covers:** FR-1, NFR-1, NFR-3, D-3, D-15
**Dependencies:** 2.2
**TDD:** required
**Affected artifacts:** src/infrastructure/mcp/sddToolDefinitions.ts, src/adapters/cli/SDDToolAdapter.ts, src/infrastructure/di/container.ts, src/infrastructure/di/types.ts, src/__tests__/unit/jev/fixtures/sdd-tools-16.json, src/__tests__/unit/runtime/SDDToolAdapter.inventory.test.ts, src/__tests__/unit/runtime/entrypoints.stdio.test.ts, src/__tests__/unit/evidence/container-wiring.test.ts
**Acceptance criteria:** 1. RED: inventory test asserts `sdd-spec-impl` has `run` with `argv` bounds (`minItems` 1, `maxItems` 64, item `maxLength` 4096, NUL-excluding pattern, `additionalProperties: false`), that `record-red`/`record-green`/`complete` accept `evidence` or `run` (`anyOf`), that the 5.5.0 request shape validates, that a request with neither fails, and that the tool count is 17; the description mentions verified mode and `run.argv`. 2. RED: adapter test shows `run` is forwarded to `recordTaskProgress` unchanged and `evidenceMode` plus `observed` appear in the tool result. 3. RED: `container-wiring.test.ts` resolves `WorkflowEngineService` from the container and asserts its runner is bound to a `NodeProcessAdapter`-backed `EvidenceRunner`; `TYPES.JevEnvironment` is renamed `TYPES.ProcessEnvironment` and both JEV and the runner receive it. 4. GREEN: implement; the `sdd-tools-16.json` fixture is regenerated for the one changed tool and the diff touches only `sdd-spec-impl`.
**Verification:** `npx jest src/__tests__/unit/runtime src/__tests__/unit/evidence/container-wiring.test.ts src/__tests__/unit/jev/sddJevCheckTool.test.ts`

### 2.4 JEV red check reads the engine entry
**Covers:** FR-8, D-10
**Dependencies:** 2.2
**TDD:** required
**Affected artifacts:** src/application/services/JevAdvisoryService.ts, src/application/services/JevSpecState.ts, src/application/services/AdvisorySnapshot.ts, src/__tests__/unit/jev/JevAdvisoryService.red.test.ts, src/__tests__/unit/jev/helpers.ts
**Acceptance criteria:** 1. RED: a `red-observed` task with an engine entry and a request carrying `evidence.summary: "all good"` → the fake HTTP body contains the persisted excerpt and not `all good`; the sidecar binds to `output_sha256`; a `red_classification: setup` entry is sent (not skipped) and the result flags it; a caller-sourced `in-progress` task keeps the existing path and existing tests pass unchanged; a `red-observed` task with a `caller` entry → `skipped / not-ready` as today. 2. GREEN: `AdvisoryEngine`'s snapshot exposes per-task `evidenceSource`, `outputExcerpt`, `outputSha256`, and `redClassification`; `redCheck` prefers the engine entry.
**Verification:** `npx jest src/__tests__/unit/jev/JevAdvisoryService.red.test.ts src/__tests__/unit/jev/AdvisorySnapshot.test.ts`

### 2.5 Evidence source in status and handoff
**Covers:** FR-12, D-14
**Dependencies:** 2.1
**TDD:** required
**Affected artifacts:** src/application/services/WorkflowEngineService.ts, src/application/services/ContextCompactionService.ts, src/domain/types.ts, src/__tests__/unit/workflow/WorkflowEngineService.status.test.ts, src/__tests__/unit/context/ContextCompactionService.handoff.test.ts
**Acceptance criteria:** 1. RED: `getFeatureStatus` reports `evidenceMode` and, per task, `evidence: { red?, green?, verification? }` with `engine` or `caller`, plus `redClassification`; a spec with one engine-complete task and one caller-complete task renders handoff lines `- 1.1: completed (verified)` and `- 1.2: completed (self-reported)` under `## Implementation Progress`; tasks without evidence render as today; the handoff payload estimate stays under the existing bound for a 20-task spec. 2. GREEN: implement; `implementationProgress` includes completed tasks only when at least one task has evidence, to keep unchanged output for features without evidence.
**Verification:** `npx jest src/__tests__/unit/workflow/WorkflowEngineService.status.test.ts src/__tests__/unit/context`

### 3.1 sdd-implement skill, reference, and render baseline
**Covers:** FR-11, D-13
**Dependencies:** 2.3
**TDD:** required
**Affected artifacts:** skills/sdd-implement/SKILL.md, skills/sdd-implement/REFERENCE.md, src/__tests__/unit/cli/fixtures/workflow-skill-render-baseline.json, src/__tests__/unit/cli/documentation-consistency.test.ts
**Acceptance criteria:** 1. RED: a new `documentation-consistency` case fails on the current text: `skills/sdd-implement/SKILL.md` must contain `run.argv`, must state that the server observes the exit code, must place the JEV `red` step after `record-red`, and must not contain the phrase `Record the observed command, non-zero exit code`; `REFERENCE.md` progress examples must show `run: { argv: [...] }` and no agent-written `exitCode`. 2. GREEN: rewrite the RED, GREEN, COMPLETE, and JEV steps per D-13, including "on `setup`, fix the test and record RED again"; refresh the baseline hashes for `sdd-implement` only; `install-target.test.ts` passes. 3. `simple-task/SKILL.md` is byte-identical.
**Verification:** `npx jest src/__tests__/unit/cli/documentation-consistency.test.ts src/__tests__/unit/cli/install-target.test.ts src/__tests__/unit/cli/skill-delegation.test.ts`

### 3.2 Docs and changelog
**Covers:** FR-11, D-13
**Dependencies:** 3.1
**TDD:** not-applicable — prose with no runtime behavior; the documentation-consistency test is the executable check
**Affected artifacts:** docs/WORKFLOW.md, DEPLOYMENT.md, ARCHITECTURE.md, CHANGELOG.md, README.md
**Acceptance criteria:** 1. `DEPLOYMENT.md` gains rows for `SDD_EVIDENCE_MODE` and `SDD_EVIDENCE_TIMEOUT_MS` and documents `.spec/sdd-config.json` `evidence.{mode,timeoutMs,allowedCommands,passEnv}` with the default allowlist. 2. `docs/WORKFLOW.md` gains a "Verified execution evidence" section covering the `run.argv` contract, the four new error codes, re-record on `setup`, and the `self-reported` rollback. 3. `ARCHITECTURE.md` lists `ProcessPort`, `NodeProcessAdapter`, `EvidenceRunner`, `EvidenceSettings`, and `ProjectConfig`. 4. `CHANGELOG.md` has an Unreleased entry naming the breaking default (`verified`) and the opt-out. 5. `README.md` adds one line under features.
**Verification:** `npx jest src/__tests__/unit/cli/documentation-consistency.test.ts`; `grep -n "SDD_EVIDENCE_MODE" DEPLOYMENT.md docs/WORKFLOW.md CHANGELOG.md` returns a match in each file.

### 4.1 Stdio e2e: real run, real rejection
**Covers:** FR-1, FR-2, FR-6, NFR-3, D-3
**Dependencies:** 2.3
**TDD:** required
**Affected artifacts:** src/__tests__/unit/cli/governed-workflow.e2e.test.ts
**Acceptance criteria:** 1. RED: against the packed stdio server in a temp project with an approved three-task plan, `sdd-spec-impl record-red` with `run.argv: ["node","-e","process.exit(3)"]` fails today (unknown `run` property); the test asserts the persisted entry has `exit_code: 3`, `source: "engine"`, a 64-hex `output_sha256`, and that the tool result includes `observed.exitCode === 3`; `record-red` with `evidence: { command, exitCode: 1, summary }` and no `run` → error code `SelfReportedEvidenceRejected` and `spec.json` bytes identical; `record-green` with `["node","-e","process.exit(0)"]` → `green-observed`; `record-red` with `["sh","-c","exit 1"]` → `EvidenceCommandNotAllowed`; a server started with `SDD_EVIDENCE_MODE=self-reported` accepts the 5.5.0 `evidence` shape. 2. GREEN: the test passes against `dist/` after `npm run build`. 3. The existing e2e cases in the file pass unchanged.
**Verification:** `npm run build && npx jest src/__tests__/unit/cli/governed-workflow.e2e.test.ts`

### 4.2 Full verification and real-artifact check
**Covers:** NFR-2, NFR-3, D-15
**Dependencies:** 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.1
**TDD:** not-applicable — runs existing checks; adds no behavior
**Affected artifacts:** none
**Acceptance criteria:** 1. `npm run lint` reports 0 errors; `npm run typecheck` and `npm run build` pass. 2. `npm test` passes except the known pre-existing TTY test that expects exit code 130; the total test count is at least 802 plus the new cases. 3. `npm run context:report` shows all three host-visible reduction gates still `pass`. 4. Real artifact: with the local build registered in this repo and no `SDD_EVIDENCE_MODE` set, `/skill:sdd-implement` on a scratch feature records one RED through `run.argv` and the resulting `spec.json` entry has `source: "engine"`; the scratch feature is deleted afterwards. 5. No file under `.spec/specs/*/spec.json` other than this feature's changed during the run.
**Verification:** `npm run lint && npm run typecheck && npm run build && npm test && npm run context:report`
