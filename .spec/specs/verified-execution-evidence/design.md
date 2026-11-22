# Design: Verified Execution Evidence

## Requirements Traceability

| Requirement | Decision |
|---|---|
| FR-1 Engine runs the evidence command | D-1, D-2, D-3 |
| FR-2 Caller exit codes rejected in verified mode | D-4 |
| FR-3 Evidence mode configurable, verified default | D-5 |
| FR-4 Command allowlist | D-6 |
| FR-5 Timeout and output bounds | D-2, D-7 |
| FR-6 Transition rules keep exit-code semantics | D-4, D-8 |
| FR-7 Additive evidence record in spec.json v5 | D-9 |
| FR-8 Captured output feeds RED classifier and JEV red | D-8, D-10 |
| FR-9 Child environment excludes server secrets | D-11 |
| FR-10 One evidence run per feature at a time | D-12 |
| FR-11 sdd-implement passes commands | D-13 |
| FR-12 Status and handoff show evidence source | D-14 |
| NFR-1 No shell interpretation | D-2, D-3 |
| NFR-2 Engine overhead | D-3, D-15 |
| NFR-3 MCP contract compatibility | D-3, D-5 |
| NFR-4 Persisted output is redacted | D-7 |
| NFR-5 Cross-platform execution | D-2, D-6 |

## Architecture and Data Flow

The change stays inside the existing hexagonal layout. One new domain port (`ProcessPort`), one new infrastructure adapter (`NodeProcessAdapter`), one new application module (`EvidenceRunner` with `EvidenceSettings`), and additive edits to `WorkflowEngineService`, `JevAdvisoryService`, `SDDToolAdapter`, `sddToolDefinitions`, `ContextCompactionService`, and the `sdd-implement` skill.

### Ownership

- `WorkflowEngineService` owns the decision to run, the transition, and the persisted evidence record. It is the only caller of `EvidenceRunner`.
- `EvidenceRunner` owns argv validation, allowlist resolution, environment scrubbing, output hashing, excerpt and redaction, and RED classification. It is pure except for the single `ProcessPort.run` call.
- `NodeProcessAdapter` owns spawning, timeout, output capture, and process-tree termination. It never rejects.
- `EvidenceSettings` owns mode, timeout, allowlist, and pass-through environment names, read from the environment and `.spec/sdd-config.json`.
- `spec.json` stays the single source of truth for evidence. Tool results carry the same observation as the persisted entry plus the classification.

### Flow for `record-red` in verified mode

```text
agent ──sdd-spec-impl {action: record-red, run: {argv}}──▶ SDDToolAdapter
  └─▶ WorkflowEngineService.recordTaskProgress
        1. withLockedFeature (existing lock, per feature)
        2. assertNoApprovedArtifactDrift, revision check, task lookup   (existing)
        3. EvidenceSettings.resolve(env, .spec/sdd-config.json)
        4. mode == verified && evidence && !run  ─▶ SelfReportedEvidenceRejected, no write
        5. run present ─▶ EvidenceRunner.run({argv, projectRoot, settings})
             a. validate argv bounds                      ─▶ InvalidParams
             b. resolve program name, check allowlist      ─▶ EvidenceCommandNotAllowed
             c. build scrubbed env
             d. ProcessPort.run({argv, cwd, env, timeoutMs, maxOutputBytes})
             e. timed-out ─▶ EvidenceRunTimedOut (result carries partial excerpt)
             f. sha256(raw output), tail 8 KiB, redactSecrets, classifyRedEvidence
        6. assertHeld()  (lease still ours after the run)
        7. apply exit-code rule for the action  ─▶ TaskTransitionInvalid with details.observed
        8. task.evidence.red = engine entry; revision += 1; commitSpec; publishHandoff
  ◀── result {taskState, revision, evidenceMode, observed: {exitCode, outputSha256, durationMs, outputExcerpt, truncated, redactions, classification}}
```

The run happens inside the feature lock and before any mutation, so a timeout or rejection leaves `spec.json` byte-identical. In `self-reported` mode step 5 is skipped and the existing `evidence` path persists with `source: "caller"`.

### Trust boundaries

- MCP input is untrusted: argv is bounded by schema and re-validated in `EvidenceRunner`.
- `.spec/sdd-config.json` is project-controlled, not server-controlled: invalid entries fall back to defaults and are reported, never trusted.
- The child process is untrusted: it gets a scrubbed environment, no stdin, a timeout, and an output cap.

## Components and Interfaces

### D-1: `ProcessPort` domain port, modeled on `GitPort`
**Covers:** FR-1, NFR-1
**Decision:** Add to `src/domain/ports.ts`:
```ts
export interface ProcessRunRequest {
  readonly argv: readonly string[];      // argv[0] is the program, resolved through env.PATH
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}
export type ProcessRunResult =
  | { kind: 'exited'; exitCode: number; output: Buffer; truncated: boolean; durationMs: number }
  | { kind: 'timed-out'; output: Buffer; truncated: boolean; durationMs: number }
  | { kind: 'spawn-failed'; reason: 'not-found' | 'permission' | 'other'; output: Buffer; durationMs: number };
export interface ProcessPort {
  /** Runs one program without a shell. Never rejects. */
  run(request: ProcessRunRequest): Promise<ProcessRunResult>;
}
```
`output` is stdout and stderr interleaved in arrival order, capped at `maxOutputBytes`. A signal-terminated child that was not timed out reports `exited` with `exitCode: 128 + signal number` (POSIX convention) so the exit-code rules still apply. The port is the only seam between the engine and the operating system, which lets every unit test use a fake.
**Failure behavior:** The adapter converts every error into a result variant; the engine never sees a rejection from the port.
**Verification:** `NodeProcessAdapter.test.ts` runs `node -e` scripts for exit 0, exit 3, timeout, 2 MiB output, and a missing program; a type-level test asserts the result union is exhaustive in `EvidenceRunner`.

### D-2: `NodeProcessAdapter` with `spawn`, process-group kill, and interleaved capture
**Covers:** FR-1, FR-5, NFR-1, NFR-5
**Decision:** `src/infrastructure/adapters/NodeProcessAdapter.ts` uses `child_process.spawn(argv[0], argv.slice(1), { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })`. On POSIX, `detached: true` creates a new process group and the timeout kills it with `process.kill(-child.pid, 'SIGKILL')` after a 2 s `SIGTERM` grace period. On Windows the timeout runs `taskkill /pid <pid> /T /F` through `execFile`. Output chunks from both streams are appended to one buffer until `maxOutputBytes`; later chunks are counted but not stored, setting `truncated`. `spawn` is used instead of `execFile` because `execFile` cannot kill a process group and buffers stdout and stderr separately. `ENOENT` and `EACCES` on the `error` event map to `spawn-failed`.
**Failure behavior:** Timeout returns `timed-out` with the partial buffer; a kill failure is logged and still returns `timed-out`. A spawn error returns `spawn-failed`. The adapter never throws.
**Verification:** Adapter test for each variant on Linux CI; the timeout test asserts the child's pid is gone within 1 s of the result; a Windows-only test for `taskkill` is skipped off Windows and covered by a unit test that asserts the command line built for it.

### D-3: `sdd-spec-impl` input gains optional `run`, result gains `observed` and `evidenceMode`
**Covers:** FR-1, NFR-1, NFR-2, NFR-3
**Decision:** In `sddToolDefinitions.ts` add
```json
"run": { "type": "object", "properties": { "argv": { "type": "array", "minItems": 1, "maxItems": 64,
  "items": { "type": "string", "minLength": 1, "maxLength": 4096, "pattern": "^[^\\u0000]+$" } } },
  "required": ["argv"], "additionalProperties": false }
```
and change the `record-red`, `record-green`, `complete` conditional to `anyOf: [{required: ['evidence']}, {required: ['run']}]`. The description becomes "Record governed implementation task progress. In verified evidence mode, pass the test command as run.argv; the server runs it and records the observed exit code." `SDDToolAdapter.handleSpecImplementation` forwards `run` unchanged. `RecordTaskProgressRequest` gains `run?: { argv: readonly string[] }`. The result type gains `evidenceMode: 'verified' | 'self-reported'` and `observed?: ObservedEvidence`. The tool count stays 17; the `sdd-tools-16.json` fixture and the inventory test are updated for the changed schema of this one tool.
**Failure behavior:** A request with neither `evidence` nor `run` fails schema validation before the engine runs, as today.
**Verification:** `SDDToolAdapter.inventory.test.ts` and `entrypoints.stdio.test.ts` pass with the new schema; a test shows the 5.5.0 request shape still validates.

### D-4: Mode gate and exit-code rule in `recordTaskProgress`
**Covers:** FR-2, FR-6
**Decision:** After the existing revision and task checks, the engine resolves `EvidenceSettings`. For `record-red`, `record-green`, and `complete`:
- `mode === 'verified'` and `request.run` absent → `GovernanceError('SelfReportedEvidenceRejected', 'Verified evidence mode is on. Pass the test command as run.argv; the server records the observed exit code.')`.
- `request.run` present (either mode) → `EvidenceRunner.run`, then the existing rule on the observed exit code (`record-red` needs non-zero, the others zero). A rule miss throws the existing `TaskTransitionInvalid` with `details: { observed }` so the agent sees the excerpt.
- `mode === 'self-reported'` and `request.evidence` present → existing `this.evidence()` path, entry gets `source: 'caller'`.
`GovernanceErrorCode` gains `SelfReportedEvidenceRejected`, `EvidenceCommandNotAllowed`, `EvidenceRunTimedOut`, `EvidenceRunnerUnavailable`. `recordTaskProgress` in the engine takes `EvidenceRunner` as a new optional constructor dependency; when it is absent and mode is `verified`, the engine throws `EvidenceRunnerUnavailable` rather than silently accepting caller evidence, matching the existing `FileSystemPort is required` pattern.
**Failure behavior:** Every rejection happens before `commitSpec`, so `spec.json` is unchanged and the revision does not advance.
**Verification:** `WorkflowEngineService.evidence.test.ts` covers each branch with a fake `ProcessPort`, asserting spec bytes before and after on every rejection.

### D-5: `EvidenceSettings` and a shared `ProjectConfig` reader
**Covers:** FR-3, NFR-3
**Decision:** Add `src/application/services/ProjectConfig.ts` with `readProjectConfig(projectRoot, fileSystem): Promise<Record<string, unknown> | undefined>`, extracted from `JevSettings.readProjectJevSetting` (same 16 KB cap, same read-only behavior). `JevSettings` is migrated to it in the same change and its private reader deleted. Add `EvidenceSettings.ts`:
```ts
export interface EvidenceSettings {
  readonly mode: 'verified' | 'self-reported';
  readonly timeoutMs: number;            // clamp 5000..600000, default 120000
  readonly allowedCommands: ReadonlySet<string>;
  readonly passEnv: ReadonlySet<string>;
  readonly warnings: readonly string[];  // invalid config entries, reported once per result
}
export function resolveEvidenceSettings(env, projectConfig): EvidenceSettings;
```
Precedence per key: environment (`SDD_EVIDENCE_MODE`, `SDD_EVIDENCE_TIMEOUT_MS`), then `.spec/sdd-config.json` `evidence.{mode,timeoutMs,allowedCommands,passEnv}`, then defaults. Unrecognized mode values resolve to `verified` with a warning. The resolved mode is attached to every `recordTaskProgress` result and to `DurableFeatureStatus.evidenceMode`. The engine binds `process.env` through the existing `TYPES.JevEnvironment` constant value, renamed `TYPES.ProcessEnvironment` with the JEV binding migrated.
**Failure behavior:** Unreadable or oversized config means "no project setting"; defaults apply and no warning is raised, matching `JevSettings`. An invalid value raises a warning and falls back to the default for that key only.
**Verification:** `EvidenceSettings.test.ts` covers precedence, clamping, invalid mode, invalid allowlist entry, and the JEV reader still passing its existing tests after migration.

### D-6: Allowlist resolution
**Covers:** FR-4, NFR-5
**Decision:** `EvidenceRunner.programName(argv0)` rejects any `argv0` containing a NUL byte or a `..` path segment, takes the basename across `/` and `\`, lowercases on Windows only, and strips one trailing `.cmd`, `.exe`, or `.bat`. The result must be in `settings.allowedCommands`. Default list: `node npm npx pnpm yarn bun jest vitest tsc pytest python python3 go cargo make mvn gradle dotnet`. A project list replaces the default. An entry containing `/`, `\`, or whitespace invalidates the whole project list (warning, defaults used) so a typo cannot widen the set. Resolution of the program through `PATH` is left to `spawn`; the allowlist checks the name, not the location, because the engine cannot know the project's toolchain layout.
**Failure behavior:** `EvidenceCommandNotAllowed` with the rejected name and the active list, before any spawn.
**Verification:** Table-driven unit test for `sh`, `bash`, `/usr/local/bin/npm`, `npm.cmd`, `C:\tools\npm.cmd`, `../npm`, `npm\u0000`, and project lists.

### D-7: Output hash, excerpt, redaction
**Covers:** FR-5, NFR-4
**Decision:** `EvidenceRunner` computes `outputSha256 = sha256(rawOutput)` over the captured bytes (at most 1 MiB), takes the last 8 KiB as UTF-8 (dropping a leading partial code point), runs `redactSecrets` from `JevRedaction`, and stores the redacted text as `outputExcerpt` with `redactions` set to the count. The hash is over raw bytes so a reviewer with the real log can confirm it; the excerpt is redacted because `spec.json` is committed. `truncated` is set when capture hit the cap. The same excerpt goes into the tool result.
**Failure behavior:** Empty output produces an empty excerpt and the hash of zero bytes; the entry is still valid.
**Verification:** Unit test with a run that prints `API_KEY=sk-live-abc123` asserts the excerpt is redacted, `redactions === 1`, and the hash equals `sha256` of the raw bytes.

### D-8: RED classification at record time, re-record allowed for setup failures
**Covers:** FR-6, FR-8
**Decision:** On `record-red` with an engine run, `EvidenceRunner` returns `classification = classifyRedEvidence(argv.join(' '), outputExcerpt)`. The entry persists `red_classification` and the result reports it. Because the run now happens at record time, the agent learns about a `setup` failure only after the RED is persisted. To let it fix the test without faking state, `record-red` is additionally accepted from `red-observed` when the stored red entry is engine-sourced and its classification is `setup` or `ambiguous`; the new observation replaces the stored entry and the revision increments. A RED classified `assertion` is final. No other transition changes.
**Failure behavior:** `record-red` from `red-observed` with an `assertion` classification throws the existing `TaskTransitionInvalid`.
**Verification:** Engine tests for setup→re-record→assertion, assertion→re-record rejected, and caller-sourced red→re-record rejected.

### D-9: Additive v5 evidence entry
**Covers:** FR-7
**Decision:** `ExecutionEvidence` gains optional fields `source?: 'engine' | 'caller'`, `argv?: readonly string[]`, `outputSha256?: string`, `durationMs?: number`, `outputExcerpt?: string`, `truncated?: boolean`, `redactions?: number`, `redClassification?: RedClassification`. The spec.json keys are snake_case: `source`, `argv`, `output_sha256`, `duration_ms`, `output_excerpt`, `truncated`, `redactions`, `red_classification`. For an engine entry, `command` is `argv.join(' ')` and `summary` is `outputExcerpt` (or `"(no output)"` when empty, because `summary` has `minLength` 1 today). `normalizeV5Evidence` treats a missing `source` as `caller`, requires `argv`, `output_sha256` (64 hex), and `duration_ms` (non-negative integer) when `source === 'engine'`, and rejects unknown keys as it does today. The schema version stays 5 because every existing file remains valid.
**Failure behavior:** A malformed engine entry fails normalization with the existing `StateInvariantViolation`.
**Verification:** A test loads every fixture spec and each of the 12 features under `.spec/specs/` through `WorkflowEngineService`; a test for an engine entry missing `output_sha256`.

### D-10: JEV red check reads the persisted engine entry
**Covers:** FR-8
**Decision:** `JevAdvisoryService.redCheck` currently requires `task.status === 'in-progress'` and the caller's `evidence.summary`. It becomes: if the task has an engine-sourced red entry (status `red-observed`), use that entry's `outputExcerpt` and classification, ignore `request.evidence`, and bind the sidecar to `output_sha256`; otherwise (caller-sourced, `self-reported` mode) keep the current `in-progress` + `evidence.summary` path. `AdvisoryEngine` exposes the red entry's `source`, `outputExcerpt`, `outputSha256`, and `redClassification` per task. The excerpt is already redacted and at most 8 KiB, which satisfies the existing JEV bound.
**Failure behavior:** Unchanged: the check never throws and never touches workflow state.
**Verification:** `JevAdvisoryService.red.test.ts` adds a case where the request carries `evidence.summary: "all good"` and the fake HTTP port's recorded body contains the persisted excerpt instead.

### D-11: Scrubbed child environment
**Covers:** FR-9
**Decision:** `EvidenceRunner.childEnv(serverEnv, settings)` copies every variable except `SDD_JEV_API_KEY` and any name matching `/(^|_)(KEY|TOKEN|SECRET|PASSWORD)(_|$)/i`, re-adds names in `settings.passEnv`, and sets `CI=1` when unset. `PATH`, `HOME`, `TMPDIR`, `NODE_OPTIONS`, `LANG` pass through because the regex does not match them.
**Failure behavior:** None; this is a pure function.
**Verification:** Unit test with a synthetic environment; an adapter test runs `node -e` printing `'SDD_JEV_API_KEY' in process.env`.

### D-12: Run inside the existing feature lock
**Covers:** FR-10
**Decision:** The run executes inside `withLockedFeature`, before `commitSpec`. The lock is per feature, so feature B is never blocked by feature A. A second request for the same feature waits on the existing retry loop; when the first commits, the second fails `RevisionConflict`, and if the wait exceeds the lock's timeout it fails `FilesystemLockTimeoutError`. Either way exactly one child runs. After the run the engine calls `assertHeld()`; a lost lease throws `FilesystemLockCompromisedError` and nothing is written. The lock lease must outlive the evidence timeout: the engine passes a lease duration of `timeoutMs + 30_000` to `withLockedFeature` for the three evidence actions.
**Failure behavior:** Lock loss or conflict after the run discards the observation; the agent re-reads status and submits again, which re-runs the command.
**Verification:** A test issues two concurrent `record-red` calls with a fake `ProcessPort` that counts invocations and asserts one invocation and one conflict error.

### D-13: `sdd-implement` skill and docs
**Covers:** FR-11
**Decision:** `skills/sdd-implement/SKILL.md` RED, GREEN, and COMPLETE steps change to "pass the focused test command as `run.argv`; the server runs it and returns the observed exit code, excerpt, and RED classification; read them before continuing; on `setup`, fix the test and record RED again." The sentence "Record the observed command, non-zero exit code, and summary" is removed. The JEV red step moves after `record-red`. `REFERENCE.md` progress examples are rewritten. The baseline in `src/__tests__/unit/cli/fixtures/workflow-skill-render-baseline.json` is refreshed. `docs/WORKFLOW.md`, `DEPLOYMENT.md` (new env rows), `ARCHITECTURE.md` (ProcessPort), and `CHANGELOG.md` are updated. `simple-task` is unchanged because it does not record to the engine.
**Failure behavior:** Not applicable.
**Verification:** `documentation-consistency.test.ts` and `install-target.test.ts` pass; a grep test asserts the skill text does not contain `exitCode` as an agent-supplied value.

### D-14: Evidence source in status and handoff
**Covers:** FR-12
**Decision:** `DurableFeatureStatus.implementation.tasks[id]` gains `evidence: { red?: 'engine' | 'caller'; green?: ...; verification?: ... }` and `redClassification?`. `DurableFeatureStatus` gains `evidenceMode`. `ContextCompactionService.implementationProgress` appends to each completed task line ` (verified)` when every recorded entry is engine-sourced and ` (self-reported)` otherwise; tasks with no evidence are unchanged.
**Failure behavior:** Not applicable; rendering is pure.
**Verification:** A handoff rendering test with one engine-sourced and one caller-sourced task; a status test asserting the labels.

### D-15: DI wiring
**Covers:** NFR-2
**Decision:** `container.ts` binds `TYPES.ProcessPort → NodeProcessAdapter` and `TYPES.EvidenceRunner → EvidenceRunner` (constructed with `ProcessPort`, `FileSystemPort`, `ProcessEnvironment`). `WorkflowEngineService` receives `EvidenceRunner` as an optional injected dependency. No new npm dependency is added; hashing uses `node:crypto`.
**Failure behavior:** A missing binding surfaces as `EvidenceRunnerUnavailable` in verified mode (D-4).
**Verification:** Container test resolves `WorkflowEngineService` and asserts the runner is present; the overhead test from NFR-2 records 20 transitions through a fake port in under 4 s.

### Rejected alternatives

- **Verify a transcript hash instead of running the command.** The agent would supply the hash; the engine still could not tell a real run from a typed one. Rejected.
- **Keep `self-reported` as the default.** Nothing changes until a user opts in, and the gate stays recorded rather than proven. The requirements chose a verified default with an explicit opt-out.
- **Run the command outside the lock.** Avoids a long lease but allows two runs for one task and a write race. Rejected in favor of a longer lease.
- **`execFile` instead of `spawn`.** Cannot kill a process group and splits stdout and stderr, which loses runner ordering. Rejected.

## Failure Handling

| Condition | Where | Behavior | State change |
|---|---|---|---|
| `evidence` without `run` in verified mode | D-4 | `SelfReportedEvidenceRejected` | none |
| `run.argv` outside bounds | D-3 schema, D-6 | `InvalidParams` | none |
| Program not in allowlist | D-6 | `EvidenceCommandNotAllowed` | none |
| Spawn fails (not found, permission) | D-2, D-4 | `TaskTransitionInvalid` with `details.observed.spawnFailed` | none |
| Timeout | D-2, D-4 | `EvidenceRunTimedOut` with partial excerpt | none |
| Exit code violates the action's rule | D-4 | `TaskTransitionInvalid` with `details.observed` | none |
| Lock lost during the run | D-12 | `FilesystemLockCompromisedError` | none |
| Second request during a run | D-12 | `RevisionConflict` or `FilesystemLockTimeoutError` | none |
| Runner not bound in verified mode | D-4 | `EvidenceRunnerUnavailable` | none |
| Invalid project config value | D-5 | default for that key, warning in result | none |
| Output over 1 MiB | D-2, D-7 | capture stops, `truncated: true`, hash over captured bytes | entry persisted |
| JEV red unavailable | D-10 | existing skipped/unavailable result | none |

Rollback: set `SDD_EVIDENCE_MODE=self-reported`. Every spec written in verified mode stays readable because the entry shape is additive.

## Verification

- **Unit:** `EvidenceSettings`, `EvidenceRunner` (argv bounds, allowlist table, env scrub, hash and excerpt, redaction, classification), `NodeProcessAdapter` (each result variant, tree kill), `WorkflowEngineService.evidence` (every branch in D-4, D-8, D-12 with byte-identical spec assertions), `normalizeV5Evidence` (legacy, engine, malformed), `JevAdvisoryService.red` (engine entry wins over caller summary), handoff and status rendering.
- **Compatibility:** load all fixture specs and the 12 features under `.spec/specs/`; validate the 5.5.0 `sdd-spec-impl` request against the new schema; inventory test at 17 tools.
- **E2E:** `governed-workflow.e2e.test.ts` gains a run against the packed stdio server: `record-red` with `node -e "process.exit(3)"` persists `exit_code: 3` and `source: "engine"`; a caller-supplied `exitCode` is rejected and `spec.json` is byte-identical; `record-green` with `node -e "process.exit(0)"` completes the loop.
- **Performance:** 20 transitions with an immediate fake port in under 4 s (NFR-2).
- **Docs and skills:** `documentation-consistency` and `install-target` tests with the refreshed baseline.
- **Manual:** run `/skill:sdd-implement` on this feature's own first task with the local build, which is the real artifact for this change.
