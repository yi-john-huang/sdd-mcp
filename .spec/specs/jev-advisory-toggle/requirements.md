# Requirements: JEV Advisory Toggle

## Overview

Every runtime gate in `sdd-mcp-server` checks structure only. Only the human judges meaning. So a vague requirement, a design decision that does not satisfy its `Covers` requirements, a weak test plan, or a RED step caused by a compile error can pass every gate and cause rework later.

This feature adds an opt-in, advisory-only check that calls the TypeSafe Jev decision API (JEV) at six points: requirements, design, planned test cases (A1), RED validity (A2), security finding triage (B1), and narrowed principle adherence (B2). JEV is a toggle. When it is not explicitly enabled, or no API key is present, the workflow state and every gate behave as they do in 5.4.0, and JEV creates no files. JEV results are typed answers saved in sidecar files bound to the artifact revision and hash. They never change approval, validation, next action, or `spec.json`.

Sources: the two owner-approved read-only reviews (`sdd-mcp-claude-review.md` and `sdd-mcp-claude-review-2.md`) and the agreed scope.

## Users and Goals

- **SDD workflow users** on Claude Code, Codex, and OMP who enable JEV with their own key get a short list of flagged items before each human decision, so they review less text and catch defects earlier.
- **Users who do not enable JEV** see no change in workflow state, gates, tool contracts, or project files.
- **Maintainers** keep one runtime implementation for all three hosts and one source for each set of judging criteria.

## Scope

- A TypeScript runtime JEV client with a hard-coded HTTPS endpoint, bearer key from the environment, bounded timeout, no retry, and defensive response validation.
- Activation by environment variable or project setting (default off), and a separate opt-in for sending code excerpts.
- Advisory checks for requirements, design, tasks test cases (A1), implement RED validity (A2), security triage (B1), and principle adherence (B2).
- A local regex classifier for RED setup failures, used before any JEV call.
- Code excerpt bounding, file exclusion, and secret redaction.
- Sidecar result files bound to revision and SHA-256, with stale-sidecar detection.
- Skill text changes for `sdd-requirements`, `sdd-design`, `sdd-tasks`, `sdd-implement`, `sdd-review`, `sdd-security-check`, and `sdd-commit`, and the wording change in `agents/security-auditor.md`.
- Documentation and contract-test updates for the added MCP tool.

## Out of Scope

- A JEV check at task completion.
- Any JEV call from `sdd-commit`. The commit skill only reads a matching sidecar.
- Blocking or gating any phase, approval, RED/GREEN record, review, or commit on a JEV result.
- Retries, queues, caching services, or a configurable endpoint.
- JEV checks on steering documents.
- Fixing the 5.4.0 runtime defect where `sdd-status` or `sdd-context-load` for a missing feature creates an empty feature directory. The owner reports it separately.
- Reconciling the principle list in `src/application/services/staticSteering.ts` with `rules/`.

## Assumptions and Dependencies

- The JEV API accepts `POST https://jevtypesafeai.com/api/v1/decide` with JSON body `{"state": {...}, "questions": {"<id>": {"type": "choice"|"score"|"noul", "instructions": "...", "criteria": ...}}}` and header `Authorization: Bearer <key>`. It returns `{"answers": {"<id>": {"choice": label} | {"score": n} | {"noul": p}}}`. The exact numeric base of `score` is confirmed in design.
- Node.js 18 or later provides global `fetch` and `AbortController`. Tests replace the HTTP transport with a mock and never contact the network.
- The repository has no project-level settings file today. The location and name of the JEV project setting is a design decision.
- The planned test cases exist only in chat today. A1 therefore requires the `sdd-tasks` skill to produce a structured case list.
- Whether code-review sidecars are git-ignored is a design decision.
- The runtime exposes JEV through one new MCP tool, so the documented contract grows from 16 to 17 tools. The existing 16 tools keep their inputs and outputs.

## Functional Requirements

### FR-1: Activation toggle
**Objective:** Run JEV only when the user explicitly turns it on, so default behavior stays unchanged.
**EARS Specification:** The runtime SHALL treat JEV as enabled only WHEN `SDD_JEV_ENABLED` is one of `1`, `true`, `yes`, `on` (case-insensitive), or WHEN `SDD_JEV_ENABLED` is unset and the project JEV setting is `true`; in every other case the runtime SHALL treat JEV as disabled.
**Acceptance Criteria:**
1. With `SDD_JEV_ENABLED` unset and no project setting, the activation result is `disabled`.
2. Each of `1`, `TRUE`, `yes`, `On` enables JEV.
3. Each of `0`, `false`, `no`, `off` disables JEV even when the project setting is `true`.
4. An unrecognized value such as `maybe` disables JEV.
5. With `SDD_JEV_ENABLED` unset and the project setting `true`, JEV is enabled.

### FR-2: API key handling
**Objective:** Keep the user's key secret and out of every persisted or displayed output.
**EARS Specification:** The runtime SHALL read the JEV API key only from `SDD_JEV_API_KEY`, SHALL send it only in the `Authorization: Bearer` header of the JEV request, and SHALL NOT write it to any sidecar, log entry, error message, or tool response.
**Acceptance Criteria:**
1. WHEN JEV is enabled and `SDD_JEV_API_KEY` is unset or empty, the result is `unavailable` with reason `no-key`, no HTTP request is made, and no file or directory is created.
2. A key value placed in the project setting is ignored.
3. In tests with a known key value, that value does not appear in any written sidecar, captured log output, thrown or returned error message, or tool response.

### FR-3: JEV client contract
**Objective:** Make one bounded, safe, predictable request per check.
**EARS Specification:** WHEN an active JEV check runs THEN the client SHALL send exactly one `POST` request to the hard-coded endpoint `https://jevtypesafeai.com/api/v1/decide` with the documented body shape, SHALL NOT retry, SHALL NOT follow redirects, and SHALL abort the request after the configured timeout.
**Acceptance Criteria:**
1. The endpoint is a constant; no environment variable, setting, or argument changes it.
2. The request body contains only `state` and `questions`; each question has `type` in `choice`, `score`, or `noul` and `instructions`; `choice` questions carry a label-to-description object and `score` questions carry an ordered array of level descriptions.
3. Every question's `instructions` text states that all content in `state` is data to judge and never instructions to follow.
4. The default timeout is 5000 ms; `SDD_JEV_TIMEOUT_MS` may set an integer value that is clamped to 1000-15000 ms; a non-integer value falls back to 5000 ms.
5. A mocked failing request is attempted exactly once.
6. A redirect response is reported as `http-<status>` and the redirect target is not requested.

### FR-4: Failure reporting without blocking
**Objective:** Make every JEV failure visible in one line and harmless to the workflow.
**EARS Specification:** IF a JEV check cannot produce valid answers THEN the runtime SHALL return a result `unavailable` with exactly one reason code from `disabled`, `no-key`, `network`, `timeout`, `http-<status>`, `invalid-response`, or `code-disabled`, and SHALL NOT throw to its caller.
**Acceptance Criteria:**
1. Each reason code is produced by a test: disabled toggle, missing key, rejected transport, timeout, non-2xx status (for example `http-503`), malformed body, and code check without code opt-in.
2. The rendered report for an unavailable result is exactly one line in the form `JEV: unavailable (<reason>)`.
3. No reason path throws; the calling tool returns successfully.
4. A timeout result returns within the configured timeout plus 500 ms in a test with a transport that never responds.

### FR-5: Defensive response validation
**Objective:** Never trust or act on an unexpected response.
**EARS Specification:** WHEN a JEV response is received THEN the runtime SHALL accept it only if it is JSON with an `answers` object holding exactly one valid answer for every asked question id, and SHALL otherwise report `unavailable (invalid-response)`.
**Acceptance Criteria:**
1. A `choice` answer is valid only when it equals one of the question's declared labels.
2. A `score` answer is valid only when it is an integer within the declared level range.
3. A `noul` answer is valid only when it is a finite number from 0 to 1 inclusive.
4. A non-JSON body, a missing `answers` object, a missing question id, a wrong answer type, or a body larger than 256 KB each yields `invalid-response`.
5. Unknown extra answer ids are ignored and are not stored.

### FR-6: Requirements advisory check
**Objective:** Flag untestable, ambiguous, or incomplete requirements before the human approves them.
**EARS Specification:** WHEN requirements validation has status `passed` and JEV is active THEN the requirements Skill SHALL run one JEV check on a bounded excerpt of each FR/NFR (Objective, EARS line, acceptance criteria) plus the feature goal, before asking the approval question.
**Acceptance Criteria:**
1. The check asks a per-requirement `score` for testability with four levels (untestable, vague bound, observable, measurable with threshold).
2. It asks a per-requirement `choice` for ambiguity (unbounded wording present / none).
3. It asks one `choice` for scope coverage of the goal (all reflected / partly reflected / contradicted) and one `noul` for the probability that human clarification is needed now.
4. The Skill shows one JEV line naming at most 3 flagged requirement IDs, then asks the approval question unchanged.
5. The check does not run when validation has status `failed`.

### FR-7: Design advisory check
**Objective:** Flag design decisions that do not deliver what they claim to cover.
**EARS Specification:** WHEN design validation has status `passed` and JEV is active THEN the design Skill SHALL run one JEV check on each D-N decision (Covers, Decision, Failure behavior, Verification) with the text of the requirements it covers, before asking the approval question.
**Acceptance Criteria:**
1. The check asks a per-decision `choice` for Covers fidelity (fully satisfies / partly satisfies / not related).
2. It asks a per-decision `score` for failure-handling specificity.
3. It asks a per-NFR `choice` for whether a concrete mechanism exists (concrete mechanism / no mechanism).
4. The Skill shows one JEV line naming at most 3 flagged D-N or NFR IDs, then asks the approval question unchanged.

### FR-8: Structured test-case list for tasks (A1 input)
**Objective:** Give A1 a stable artifact to judge and bind.
**EARS Specification:** WHEN tasks validation has status `passed` and JEV is active THEN the tasks Skill SHALL produce a structured case list in which every case records task ID, case kind, given/when/then text, and the acceptance criterion it covers.
**Acceptance Criteria:**
1. The case kind is one of `behavior`, `boundary`, `error`, `transition`, `security`.
2. The runtime computes the SHA-256 of a canonical serialization of the case list; the same list in the same order produces the same hash.
3. A case list larger than the state bound in NFR-3 is truncated by whole tasks and the result records that truncation occurred.

### FR-9: Test-plan adequacy advisory check (A1)
**Objective:** Flag weak test plans before code is written.
**EARS Specification:** WHEN the structured case list exists and JEV is active THEN the tasks Skill SHALL run one JEV check covering every TDD-required task (its Covers line, acceptance criteria, covered EARS lines, and planned cases) and every `TDD: not-applicable` reason, before the human test-case question when test-case review is on, or before the tasks approval question when it is off.
**Acceptance Criteria:**
1. Per task, the check asks a `score` for acceptance-criteria coverage with four levels (a criterion has no case; every criterion has a positive case; every criterion has positive and negative cases; plus the boundaries the EARS line implies).
2. Per task, it asks a `choice` for missing category (boundary / error / transition-or-precedence / security / none-missing), a `choice` for proportionality (under-tested / proportionate / over-tested), and a `choice` for observability (public interface / coupled to implementation).
3. Per `TDD: not-applicable` task, it asks a `choice` for whether the reason is justified (justified / not justified).
4. Per task, it asks a `noul` for the probability that some case cannot show a meaningful RED.
5. The Skill presents flagged tasks first and shows one JEV line naming at most 3 flagged task IDs.
6. The check never records, changes, or satisfies the test-case review checkpoint; `reviewTestCases` still requires explicit human confirmation.

### FR-10: Local RED setup-failure classifier (A2, local step)
**Objective:** Catch false REDs caused by broken setup at zero cost.
**EARS Specification:** WHEN JEV is enabled and the implement Skill is about to record RED THEN the runtime SHALL classify the RED evidence command and summary locally as `setup`, `assertion`, or `ambiguous` before any JEV call.
**Acceptance Criteria:**
1. Evidence matching any of `Cannot find module`, `Module not found`, `SyntaxError`, `TS\d{4}`, `ENOENT`, `is not defined` (ReferenceError), `command not found`, or `ERR_MODULE_NOT_FOUND` is classified `setup` and reports the matched pattern name.
2. Evidence matching an assertion pattern (for example `AssertionError`, `Expected:` with `Received:`, `expect(`) and no setup pattern is classified `assertion`.
3. Evidence matching both a setup pattern and an assertion pattern is classified `setup`.
4. Evidence matching neither is classified `ambiguous`.
5. `setup` and `assertion` results make no HTTP request and need no API key.
6. The classifier is a pure function covered by unit tests for every listed pattern and for each of the four outcomes above.

### FR-11: RED validity advisory check (A2, JEV step)
**Objective:** Get a judgement only for ambiguous REDs.
**EARS Specification:** WHEN the local classifier returns `ambiguous` and JEV is active THEN the runtime SHALL run one JEV check on the RED evidence command, evidence summary, test name, and the task's acceptance criteria, and SHALL NOT send source code.
**Acceptance Criteria:**
1. The check asks a `choice` for failure cause (missing behavior / compile, import, or setup error / wrong assertion / unclear) and a `noul` for the probability that setup causes the failure.
2. The implement Skill shows one JEV line and, when the result indicates setup, advises fixing the test before recording RED.
3. `record-red` accepts and records the same evidence with the same result whether the check reports setup, missing behavior, or unavailable.

### FR-12: Security finding triage (B1)
**Objective:** Give security and review findings one comparable severity and classification.
**EARS Specification:** WHEN JEV is active and code sending is allowed (FR-14) THEN the parent of the `sdd-review` or `sdd-security-check` Skill SHALL, after the agent or inline audit returns and false positives are removed, run one JEV check over the existing finding records with their bounded code excerpts.
**Acceptance Criteria:**
1. Per finding, the check asks a `choice` for classification (confirmed vulnerability / hardening opportunity / false positive).
2. Per finding, it asks a `score` for severity on the ordered scale informational < low < medium < high < critical, whose level descriptions state attack vector, privileges required, user interaction, and confidentiality, integrity, and availability effect.
3. Per finding, it asks a `noul` for exploitability under the stated preconditions and a `choice` for whether the remediation addresses the source-to-sink path (yes / partly / no).
4. Review severities map to the unified scale as critical = critical, important = high or medium, minor = low; the sidecar marks a disagreement when the JEV severity is outside the mapped set.
5. The check judges only existing findings; the Skill never adds a finding from JEV output.
6. No agent performs the JEV call; only the parent does.

### FR-13: Principle adherence check (B2)
**Objective:** Report clear violations of judgement-level principles without noise.
**EARS Specification:** WHEN JEV is active and code sending is allowed THEN the `sdd-review` parent SHALL run one JEV check per changed unit asking a `choice` of followed / partly / violated / not-applicable for SRP, DRY, KISS/YAGNI, DIP, no swallowed errors, and no sensitive logging, and SHALL report only `violated` answers with a path and line location.
**Acceptance Criteria:**
1. The question set contains exactly these six principles.
2. Their criteria text is defined once in the runtime and a test verifies that each criterion cites an existing section of `rules/coding-style.md` or `rules/error-handling.md`.
3. `followed`, `partly`, and `not-applicable` answers are stored in the sidecar and not shown to the user.
4. OCP, LSP, ISP, `any` usage, naming, parameter count, and file length are not sent to JEV.

### FR-14: Code excerpt opt-in, bounding, and exclusion
**Objective:** Send source code only with separate consent and in the smallest useful amount.
**EARS Specification:** WHERE a check would send code excerpts (B1 or B2) THE runtime SHALL require `SDD_JEV_ALLOW_CODE` set to `1`, `true`, `yes`, or `on` in addition to FR-1 activation and a key, SHALL limit each excerpt to 15 lines before and after the cited line and all excerpts in one request to 8192 bytes, and SHALL exclude protected files.
**Acceptance Criteria:**
1. WHEN JEV is active and `SDD_JEV_ALLOW_CODE` is not enabled THEN B1 and B2 report `unavailable (code-disabled)`, make no HTTP request, and the Skill keeps the model's own severity.
2. Requirements, design, A1, and A2 checks never require or use `SDD_JEV_ALLOW_CODE` and never send source code.
3. An excerpt request around line 100 includes at most lines 85-115.
4. Excerpts beyond the 8192-byte total are dropped by whole finding, and the dropped finding IDs are recorded.
5. Paths matching `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `id_rsa*`, `id_ed25519*`, lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `Cargo.lock`, `poetry.lock`, `Gemfile.lock`, `go.sum`), and generated paths (`dist/`, `build/`, `node_modules/`, `*.min.js`, `.claude/`, `.agents/`, `.codex/`, `.omp/`) produce no excerpt; the finding is sent without code.

### FR-15: Secret redaction
**Objective:** Prevent secrets in excerpts or evidence from leaving the machine.
**EARS Specification:** Before any JEV request is sent, the runtime SHALL replace each match of the configured secret patterns in the `state` payload with `[REDACTED]`.
**Acceptance Criteria:**
1. The patterns cover at least PEM private key blocks, AWS access key IDs (`AKIA` + 16 characters), GitHub tokens (`ghp_`, `gho_`, `ghs_`, `github_pat_`), Slack tokens (`xox[abprs]-`), JWTs (three base64url segments starting `eyJ`), `Bearer` tokens, and assignments whose name contains `api_key`, `apikey`, `secret`, `token`, `password`, or `passwd`.
2. A unit test per pattern shows the secret value is absent from the serialized request and `[REDACTED]` is present.
3. Redaction applies to every check, including spec text and RED evidence.
4. The sidecar records the number of redactions, not the redacted values.

### FR-16: Sidecar persistence and binding
**Objective:** Save typed results that can be compared later without touching workflow state, and leave no trace when JEV is off.
**EARS Specification:** WHEN a JEV check returns answers, or reports unavailable with reason `network`, `timeout`, `http-<status>`, `invalid-response`, or `code-disabled`, THEN the runtime SHALL write a JSON sidecar under `.spec/specs/<feature>/review/` (or `.spec/reviews/` when no feature is in scope) that records the check kind, phase revision, artifact SHA-256, any case-list, evidence, or diff SHA-256, answers, model and response metadata, reason code, and timestamp; IF the reason is `disabled` or `no-key` THEN the runtime SHALL NOT create, write, modify, or delete any file or directory.
**Acceptance Criteria:**
1. Spec-phase sidecars are named by check kind and revision (for example `jev-requirements-r3.json`); code-review sidecars are named by the first 12 hex characters of the diff SHA-256.
2. Code-review sidecars store base commit, diff SHA-256, finding ID, `path:line`, and an excerpt SHA-256, and never the excerpt text.
3. No sidecar contains the API key, the request body, or a redacted secret value.
4. A sidecar write failure does not throw; the check result is still returned and marked not persisted.
5. Sidecar paths are resolved with the existing containment checks and never escape `.spec/`.
6. For every check kind with reason `disabled` and with reason `no-key`, a test snapshots the project tree (every path and file content) before and after the call and shows no difference; in particular no `review/` or `.spec/reviews/` directory is created.
7. For each of `network`, `timeout`, `http-503`, `invalid-response`, and `code-disabled`, a test shows one sidecar is written with that reason code.

### FR-17: Stale sidecar handling and reuse
**Objective:** Never show a judgement of content that has changed, and never pay twice for the same content.
**EARS Specification:** WHEN a sidecar is read THEN the runtime SHALL use it only if its revision and every recorded SHA-256 match the current artifact, case list, evidence, or diff; IF any value differs THEN the runtime SHALL ignore the sidecar.
**Acceptance Criteria:**
1. A test that edits the artifact after a sidecar is written shows the sidecar is ignored.
2. A test with a matching sidecar shows the check returns the stored answers and makes no HTTP request.
3. A sidecar that is not valid JSON or fails schema validation is ignored and does not throw.

### FR-18: Commit warning from sidecar only
**Objective:** Surface confirmed serious findings at commit time without sending code then.
**EARS Specification:** WHEN `sdd-commit` runs and a code-review sidecar matches the staged diff SHA-256 and holds a finding classified `confirmed vulnerability` with JEV severity `high` or `critical` THEN the Skill SHALL show exactly one warning line and SHALL continue the commit flow unchanged.
**Acceptance Criteria:**
1. `sdd-commit` never makes a JEV request, whether or not JEV is active.
2. A missing, stale, or unreadable sidecar produces no warning and no error.
3. The warning never blocks, skips hooks, or asks an extra question.
4. The staged diff SHA-256 uses the same canonical diff definition as the B1/B2 sidecar.

### FR-19: Security contract wording
**Objective:** Allow the opt-in triage call without weakening the no-contact rule for audits.
**EARS Specification:** The files `skills/sdd-security-check/SKILL.md` and `agents/security-auditor.md` SHALL define forbidden external contact as contact with the audited target or its systems, and SHALL state one exception: the parent may make the opt-in JEV triage call after the audit returns.
**Acceptance Criteria:**
1. Both files contain the narrowed definition and the single exception.
2. `agents/security-auditor.md` still forbids the agent itself from any network access.
3. Rendered Claude, Codex, and OMP targets contain the updated wording.

### FR-20: One-line Skill report
**Objective:** Keep JEV output short and the same on every host.
**EARS Specification:** WHEN a Skill runs a JEV check THEN it SHALL show at most one JEV line, either `JEV: <n> flagged (<up to 3 IDs>)`, `JEV: no flags`, or `JEV: unavailable (<reason>)`, and SHALL NOT add a question or command for the user.
**Acceptance Criteria:**
1. The runtime returns the rendered line so all hosts show the same text.
2. With more than 3 flagged IDs, the line shows 3 IDs and the total count.
3. The Skill text for the seven affected Skills never asks the user to operate an MCP tool for JEV.

### FR-21: Runtime exposure and contract documentation
**Objective:** Keep the documented MCP tool contract true after JEV is added.
**EARS Specification:** WHEN the JEV MCP tool is added THEN the repository SHALL update the documented tool inventory in `docs/WORKFLOW.md` and every other location that states the tool count or list to 17 tools, and the tool-inventory and documentation-consistency tests SHALL pass against the new contract.
**Acceptance Criteria:**
1. The documented tool count equals the number of tools in `SDD_TOOL_DEFINITIONS`.
2. Every documented tool name exists in `SDD_TOOL_DEFINITIONS` and every defined tool is documented.
3. `docs/WORKFLOW.md` documents `SDD_JEV_ENABLED`, `SDD_JEV_API_KEY`, `SDD_JEV_ALLOW_CODE`, `SDD_JEV_TIMEOUT_MS`, the project setting, the data sent per check, and the sidecar locations.

## Non-functional Requirements

### NFR-1: Workflow state isolation
**Objective:** Protect journal recovery and approval integrity, which compare exact state.
**EARS Specification:** The runtime SHALL NOT let any JEV check, result, or sidecar change `spec.json`, `approvalRequired`, `resolveNextAction` output, validation status or blockers, approval bindings, or the test-case checkpoint, whether JEV is disabled, unavailable, or active.
**Acceptance Criteria:**
1. A test runs requirements, design, and tasks submission and a RED record with JEV active and a mocked response, and shows `spec.json` bytes equal those of the same run with JEV disabled, except time fields that already vary.
2. `approvalRequired`, `nextAction`, and `validation` in tool responses are equal between the two runs.
3. Sidecars are excluded from `sdd-context-load` output and from the compact handoff.
4. A sidecar in the feature `review/` directory does not cause an approved-artifact drift blocker.

### NFR-2: Default-off compatibility
**Objective:** Users who do not enable JEV see the 5.4.0 workflow and project files.
**EARS Specification:** WHILE JEV is disabled or has no key THE runtime SHALL make zero outbound HTTP requests, SHALL make zero JEV filesystem writes (no file or directory created, modified, or deleted), and SHALL keep the inputs and outputs of the existing 16 tools unchanged.
**Acceptance Criteria:**
1. A transport spy records zero calls across all checks with JEV disabled and with JEV enabled but no key.
2. A filesystem snapshot taken before and after every JEV check kind, with JEV disabled and with JEV enabled but no key, shows no created, modified, or deleted path.
3. Existing tool-schema and response tests pass without modification of their expected values.
4. The full test suite passes except the known pre-existing failure "maps interactive cancellation to exit code 130 without writes" in `src/__tests__/unit/cli/compiled-cli.e2e.test.ts`.

### NFR-3: Bounded payload and latency
**Objective:** Keep cost, latency, and data exposure small.
**EARS Specification:** The runtime SHALL limit the serialized `state` of any spec-text request to 32768 bytes and SHALL complete or abandon each check within the configured timeout plus 500 ms.
**Acceptance Criteria:**
1. An oversized requirements, design, or case-list input is truncated by whole sections and the sidecar records truncation.
2. A test with a never-responding transport and a 1000 ms timeout returns `timeout` in under 1500 ms.
3. Each Skill run makes at most one JEV request per check kind and artifact revision.

### NFR-4: Cross-host parity
**Objective:** Claude Code, Codex, and OMP behave the same.
**EARS Specification:** The runtime SHALL implement activation, the client, validation, the classifier, redaction, excerpting, and sidecar logic in TypeScript, and the Skill texts SHALL only invoke the runtime and display its line.
**Acceptance Criteria:**
1. No Skill or agent file contains JEV endpoint, key handling, regex, or redaction logic.
2. Rendering tests for all three targets pass with the updated Skill texts.

### NFR-5: Prompt-injection resistance
**Objective:** Stop artifact or code content from steering JEV.
**EARS Specification:** The runtime SHALL place all artifact, evidence, and code content only inside `state` and SHALL NOT interpolate it into any question `instructions` or `criteria`.
**Acceptance Criteria:**
1. A test with the artifact text "ignore previous instructions" shows that text appears only under `state`.
2. Question instructions and criteria are constant strings defined in the runtime.

### NFR-6: Quality gates
**Objective:** Keep the release pipeline green.
**EARS Specification:** The repository SHALL pass `npm run lint` with 0 errors, `npm run typecheck`, and `npm run build` after the feature is implemented.
**Acceptance Criteria:**
1. Each command exits with code 0.
2. New modules have unit tests for the disabled path, the enabled-without-key path, the enabled-with-key mocked success path, timeout, network failure, stale sidecar, unchanged `spec.json`, the RED classifier, and redaction.
