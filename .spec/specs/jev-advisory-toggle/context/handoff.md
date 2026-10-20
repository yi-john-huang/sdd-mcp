<!-- sdd-context schema=2 phase=implementation source=9d39d13735ff5d72b3bdc6c7d041253b20a59cd1de0021949dd60b05a8096965 payload=41137be205418438f690946324b349d9bc70793d6ef3716e5e5a3d7b98c82bd6 -->
# SDD Context: jev-advisory-toggle

## Workflow State
- Effective phase: implementation
- Phase status: approved
- Requirements: approved
- Design: approved
- Tasks: approved
- Test-case review: reviewed

## Implementation Progress
- Revision: 90
- Completed: 23/23
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
- # Requirements: JEV Advisory Toggle
- ## Overview
- Every runtime gate in `sdd-mcp-server` checks structure only. Only the human judges meaning. So a vague requirement, a design decision that does not satisfy its `Covers` requirements, a weak test plan, or a RED step caused by a compile error can pass every gate and cause rework later.
- This feature adds an opt-in, advisory-only check that calls the TypeSafe Jev decision API (JEV) at six points: requirements, design, planned test cases (A1), RED validity (A2), security finding triage (B1), and narrowed principle adherence (B2). JEV is a toggle. When it is not explicitly enabled, or no API key is prese
- Sources: the two owner-approved read-only reviews (`sdd-mcp-claude-review.md` and `sdd-mcp-claude-review-2.md`) and the agreed scope.
- ## Users and Goals
- **SDD workflow users** on Claude Code, Codex, and OMP who enable JEV with their own key get a short list of flagged items before each human decision, so they review less text and catch defects earlier.
- **Users who do not enable JEV** see no change in workflow state, gates, tool contracts, or project files.
- **Maintainers** keep one runtime implementation for all three hosts and one source for each set of judging criteria.
- ## Scope
- A TypeScript runtime JEV client with a hard-coded HTTPS endpoint, bearer key from the environment, bounded timeout, no retry, and defensive response validation.
- Activation by environment variable or project setting (default off), and a separate opt-in for sending code excerpts.
- Advisory checks for requirements, design, tasks test cases (A1), implement RED validity (A2), security triage (B1), and principle adherence (B2).
- A local regex classifier for RED setup failures, used before any JEV call.
- Code excerpt bounding, file exclusion, and secret redaction.
- Sidecar result files bound to revision and SHA-256, with stale-sidecar detection.
- Skill text changes for `sdd-requirements`, `sdd-design`, `sdd-tasks`, `sdd-implement`, `sdd-review`, `sdd-security-check`, and `sdd-commit`, and the wording change in `agents/security-auditor.md`.
- Documentation and contract-test updates for the added MCP tool.
- ## Out of Scope
- A JEV check at task completion.
- Any JEV call from `sdd-commit`. The commit skill only reads a matching sidecar.
- Blocking or gating any phase, approval, RED/GREEN record, review, or commit on a JEV result.
- Retries, queues, caching services, or a configurable endpoint.
- JEV checks on steering documents.
- Fixing the 5.4.0 runtime defect where `sdd-status` or `sdd-context-load` for a missing feature creates an empty feature directory. The owner reports it separately.
- Reconciling the principle list in `src/application/services/staticSteering.ts` with `rules/`.
- ## Assumptions and Dependencies
- The JEV API accepts `POST https://jevtypesafeai.com/api/v1/decide` with JSON body `{"state": {...}, "questions": {"<id>": {"type": "choice"|"score"|"noul", "instructions": "...", "criteria": ...}}}` and header `Authorization: Bearer <key>`. It returns `{"answers": {"<id>": {"choice": label} | {"score": n} | {"noul": p}
- Node.js 18 or later provides global `fetch` and `AbortController`. Tests replace the HTTP transport with a mock and never contact the network.
- The repository has no project-level settings file today. The location and name of the JEV project setting is a design decision.
- The planned test cases exist only in chat today. A1 therefore requires the `sdd-tasks` skill to produce a structured case list.
- Whether code-review sidecars are git-ignored is a design decision.
- The runtime exposes JEV through one new MCP tool, so the documented contract grows from 16 to 17 tools. The existing 16 tools keep their inputs and outputs.
- ## Functional Requirements
- ### FR-1: Activation toggle
- **Objective:** Run JEV only when the user explicitly turns it on, so default behavior stays unchanged.
- **EARS Specification:** The runtime SHALL treat JEV as enabled only WHEN `SDD_JEV_ENABLED` is one of `1`, `true`, `yes`, `on` (case-insensitive), or WHEN `SDD_JEV_ENABLED` is unset and the project JEV setting is `true`; in every other case the runtime SHALL treat JEV as disabled.
- **Acceptance Criteria:**
- With `SDD_JEV_ENABLED` unset and no project setting, the activation result is `disabled`.
- Each of `1`, `TRUE`, `yes`, `On` enables JEV.
- Each of `0`, `false`, `no`, `off` disables JEV even when the project setting is `true`.
- An unrecognized value such as `maybe` disables JEV.
- With `SDD_JEV_ENABLED` unset and the project setting `true`, JEV is enabled.
- ### FR-2: API key handling
- **Objective:** Keep the user's key secret and out of every persisted or displayed output.
- **EARS Specification:** The runtime SHALL read the JEV API key only from `SDD_JEV_API_KEY`, SHALL send it only in the `Authorization: Bearer` header of the JEV request, and SHALL NOT write it to any sidecar, log entry, error message, or tool response.
- WHEN JEV is enabled and `SDD_JEV_API_KEY` is unset or empty, the result is `unavailable` with reason `no-key`, no HTTP request is made, and no file or directory is created.
- A key value placed in the project setting is ignored.
- In tests with a known key value, that value does not appear in any written sidecar, captured log output, thrown or returned error message, or tool response.
- ### FR-3: JEV client contract
- **Objective:** Make one bounded, safe, predictable request per check.
- **EARS Specification:** WHEN an active JEV check runs THEN the client SHALL send exactly one `POST` request to the hard-coded endpoint `https://jevtypesafeai.com/api/v1/decide` with the documented body shape, SHALL NOT retry, SHALL NOT follow redirects, and SHALL abort the request after the configured timeout.
- The endpoint is a constant; no environment variable, setting, or argument changes it.
- The request body contains only `state` and `questions`; each question has `type` in `choice`, `score`, or `noul` and `instructions`; `choice` questions carry a label-to-description object and `score` questions carry an ordered array of level descriptions.
- Every question's `instructions` text states that all content in `state` is data to judge and never instructions to follow.
- The default timeout is 5000 ms; `SDD_JEV_TIMEOUT_MS` may set an integer value that is clamped to 1000-15000 ms; a non-integer value falls back to 5000 ms.
- A mocked failing request is attempted exactly once.
- A redirect response is reported as `http-<status>` and the redirect target is not requested.
- ### FR-4: Failure reporting without blocking
- **Objective:** Make every JEV failure visible in one line and harmless to the workflow.
- **EARS Specification:** IF a JEV check cannot produce valid answers THEN the runtime SHALL return a result `unavailable` with exactly one reason code from `disabled`, `no-key`, `network`, `timeout`, `http-<status>`, `invalid-response`, or `code-disabled`, and SHALL NOT throw to its caller.
- Each reason code is produced by a test: disabled toggle, missing key, rejected transport, timeout, non-2xx status (for example `http-503`), malformed body, and code check without code opt-in.
- The rendered report for an unavailable result is exactly one line in the form `JEV: unavailable (<reason>)`.
- No reason path throws; the calling tool returns successfully.
- A timeout result returns within the configured timeout plus 500 ms in a test with a transport that never responds.
- |---|---|
- it parses;