<!-- sdd-context schema=2 phase=implementation source=232616136baf9ef77acc38a709f5443b9bc88706ba9d999f422e923c7e2e5e98 payload=2dcaa22ad4fde53236ed33a51984f2a42744fd5a06bfccd91366334899b1594d -->
# SDD Context: verified-execution-evidence

## Workflow State
- Effective phase: implementation
- Phase status: approved
- Requirements: approved
- Design: approved
- Tasks: approved
- Test-case review: reviewed

## Implementation Progress
- Revision: 50
- Completed: 13/13
- Active: 0
- Blocked: 0

## Next Action
Implementation is complete.

## Source References
- requirements.md
- design.md
- tasks.md

## Payload Estimate
- Payload estimated tokens: 02043

## Selected Context
- # Requirements: Verified Execution Evidence
- ## Overview
- ### Problem
- `sdd-spec-impl` accepts `evidence: { command, exitCode, summary }` from the calling agent for the `record-red`, `record-green`, and `complete` actions. `WorkflowEngineService` checks the shape of that object and the sign of `exitCode`, then persists it. Nothing proves the command ran. The RED classifier and the JEV `re
- ### Goal
- The SDD server runs the verification command itself, observes the real exit code and output, and persists that observation as the task evidence. A caller can no longer advance a task by typing an exit code.
- ### Users
- The implementing agent (Claude Code, Codex, OMP) driving `sdd-implement`.
- The human reviewer reading `sdd-status`, `context/handoff.md`, and `spec.json`.
- The project maintainer configuring the server through `.spec/sdd-config.json` and environment variables.
- ### Scope
- Engine-side execution of evidence commands for `sdd-spec-impl` transitions.
- A command allowlist, timeout, output bound, and environment scrubbing for that execution.
- An additive evidence record shape in `spec.json` schema v5.
- Feeding captured output to the RED classifier and the JEV `red` check.
- Updating `skills/sdd-implement` so the agent passes a command instead of an exit code.
- ### Out of scope
- Running commands for any other MCP tool.
- Changing approval or checkpoint gates.
- Changing the 17-tool MCP contract beyond new optional inputs and new error codes.
- Sandboxing beyond process-level controls (no containers, no seccomp).
- ### Assumptions
- The server process already runs with the permissions needed to execute the project's own test commands, because the agent runs the same commands today.
- `GitPort` in `NodeGitAdapter` is the precedent for bounded child-process execution (`execFile`, timeout, `maxBuffer`, `windowsHide`).
- `JevSettings` is the precedent for reading `.spec/sdd-config.json` with an environment override.
- ### Dependencies
- `WorkflowEngineService.recordTaskProgress` and `withLockedFeature`.
- `RedEvidenceClassifier.classifyRedEvidence`.
- `JevAdvisoryService` `red` check and `JevRedaction`.
- `sddToolDefinitions.ts` `sdd-spec-impl` input schema.
- Skill render baseline hashes in `src/__tests__/unit/cli/fixtures/workflow-skill-render-baseline.json`.
- ### Success metrics
- With verified mode on, 100% of `red`, `green`, and `verification` evidence written for `tdd_required` tasks carries `source: "engine"`, an engine-observed exit code, and a SHA-256 of captured output. An e2e test that submits a caller-supplied `exitCode` is rejected with a named error and leaves `spec.json` byte-identic
- Every evidence run ends by completion or by timeout within the configured bound (default 120 s, maximum 600 s). A timeout persists no evidence.
- All 12 existing features under `.spec/specs/` load without migration, and the existing test suite passes except for tests that assert the caller-supplied path in verified mode.
- The RED classifier and the JEV `red` check receive captured output, never an agent-written summary, when `source` is `engine`.
- ## Functional Requirements
- ### FR-1: Engine runs the evidence command
- **Objective:** Evidence must come from an observation the server made, not from a claim the caller made.
- **EARS Specification:** WHEN `sdd-spec-impl` receives `record-red`, `record-green`, or `complete` with a `run` object `{ argv: string[] }` THEN the workflow engine SHALL execute `argv[0]` with `argv[1..]` as arguments, with `shell: false`, in the validated workspace root, and SHALL record the observed exit code, the SH
- **Acceptance Criteria:**
- A unit test with a fake process port shows the persisted evidence equals the port's observed exit code and output hash, not any value in the request.
- An e2e test against the packed stdio server runs `node -e "process.exit(3)"` through `record-red` and persists `exitCode: 3`.
- The child process's `cwd` equals the validated workspace root; a request cannot change it.
- `argv` is passed as an array; a value containing shell metacharacters such as `;`, `|`, `&&`, or `$(` is executed literally as an argument and is never interpreted by a shell.
- ### FR-2: Caller-supplied exit codes are rejected in verified mode
- **Objective:** Close the gap that lets an agent record evidence without running anything.
- **EARS Specification:** WHILE evidence mode is `verified`, IF `sdd-spec-impl` receives `record-red`, `record-green`, or `complete` for any task with an `evidence` object and no `run` object THEN the engine SHALL reject the request with `GovernanceError` code `SelfReportedEvidenceRejected`, SHALL execute nothing, and SH
- A test submits `evidence: { command, exitCode: 1, summary }` with no `run` in verified mode and receives `SelfReportedEvidenceRejected`; `spec.json` bytes are identical before and after.
- The rejection applies to `tdd_required` tasks and to `not-applicable` tasks at `complete`.
- The error message names the `run` field as the accepted input.
- ### FR-3: Evidence mode is configurable with a verified default
- **Objective:** Let an installation roll out verification deliberately while keeping the safe behavior as the default.
- **EARS Specification:** The engine SHALL resolve evidence mode from `SDD_EVIDENCE_MODE` when set to `verified` or `self-reported`, otherwise from `.spec/sdd-config.json` key `evidence.mode`, otherwise `verified`; and WHILE the mode is `self-reported` the engine SHALL accept the existing `evidence` input exactly as befo
- With no configuration, a caller-supplied `evidence` is rejected (FR-2) and a `run` is executed (FR-1).
- With `SDD_EVIDENCE_MODE=self-reported`, the existing `sdd-spec-impl` request shape from version 5.5.0 succeeds and the persisted entry has `source: "caller"`.
- An unrecognized `SDD_EVIDENCE_MODE` value resolves to `verified` and is reported once in the tool result as a warning.
- The resolved mode appears in every `sdd-status` result for the feature.
- ### FR-4: Command allowlist
- **Objective:** The server runs the project's test tooling, not arbitrary programs chosen by a prompt.
- **EARS Specification:** IF `run.argv[0]`, after stripping any directory and a Windows `.cmd` or `.exe` suffix, is not in the resolved allowlist THEN the engine SHALL reject the request with `GovernanceError` code `EvidenceCommandNotAllowed`, SHALL execute nothing, and SHALL leave `spec.json` unchanged; the default allo
- `argv: ["sh", "-c", "exit 1"]` and `argv: ["bash", "..."]` are rejected with `EvidenceCommandNotAllowed` under the default list.
- `argv: ["/usr/local/bin/npm", "test"]` and `argv: ["npm.cmd", "test"]` resolve to `npm` and are allowed.
- `argv[0]` containing a path segment `..` or a NUL byte is rejected before any lookup.
- A project list `["npm"]` rejects `node` and allows `npm`.
- An allowlist entry that is not a bare program name (contains `/`, `\\`, or whitespace) makes the configuration invalid; the engine then uses the default list and reports the invalid entry once.
- ### FR-5: Timeout and output bounds
- **Objective:** A hung or chatty test command must not hang the MCP server or bloat `spec.json`.
- A test with a 5000 ms timeout and `node -e "setTimeout(()=>{}, 60000)"` returns `EvidenceRunTimedOut` within 5000 ms plus 1000 ms of tolerance, and no child process remains.
- Output above 1 MiB stops capture; the hash covers exactly the bytes captured and the excerpt notes truncation.
- The schema version stays 5.