# Implementation Tasks: Output Clarity Ladder

## Overview

There are three independent tracks and one docs and verification track:

- Track A (skill content): 1.1 → 1.2
- Track B (installer): 2.1 and 2.3, then 2.2 after 1.2 and 2.1
- Track C (runtime messages): 3.1 and 3.2, then 3.3, 3.4, and 3.5
- Track D: 4.1, then 5.1

Tracks A, B, and C edit different files and can run concurrently. Tasks 3.3, 3.4, and 3.5 edit different source files. They can run concurrently only if each one updates only the old-text assertions for its own source file.

Test files match `*.test.ts` (`jest.config.js`). So `src/__tests__/helpers/*.ts` files are helpers, not test suites. `package.json` `files` already ships `skills/**/*`.

## 1. Skill content

### 1.1 English output-clarity-ladder skill
**Covers:** FR-1, FR-2, NFR-2, NFR-3, D-1, D-11
**Dependencies:** none
**TDD:** required
**Affected artifacts:** skills/output-clarity-ladder/SKILL.md, src/__tests__/unit/cli/canonical-assets.test.ts
**Acceptance criteria:** 1. RED: a new `modelInvocableSkills` test in `canonical-assets.test.ts` fails because `skills/output-clarity-ladder/SKILL.md` does not exist. 2. GREEN: the file has `name: output-clarity-ladder`, a `description` that names explanation, summary, and teaching replies, and no `disable-model-invocation` line. 3. The body has the requested-form exceptions (one-line status, yes or no, user-worded draft), all six writing rules, the headings `## 1. Writing (default)`, `## 2. Diagram`, `## 3. Web page`, `## 4. Explainer video` in that order, the three video rules (no routine video, stored key or free local narration, never ask for a secret in chat), and the `## Order` rule with the requested-artifact exception. 4. The body contains "no approved-word check", and no sentence claims certification or conformance without a negation. 5. The file is at most 4,096 UTF-8 bytes. 6. The existing manual-only test still lists only the 11 workflow skills and still passes.
**Verification:** `npx jest src/__tests__/unit/cli/canonical-assets.test.ts`

### 1.2 Japanese and Traditional Chinese references
**Covers:** FR-3, NFR-2, NFR-3, D-2, D-11
**Dependencies:** 1.1
**TDD:** required
**Affected artifacts:** skills/output-clarity-ladder/references/ja.md, skills/output-clarity-ladder/references/zh-TW.md, skills/output-clarity-ladder/SKILL.md, src/__tests__/unit/cli/canonical-assets.test.ts
**Acceptance criteria:** 1. RED: tests fail because the two reference files and the `## Languages` section do not exist. 2. GREEN: `ja.md` contains Japanese kana. `zh-TW.md` contains Traditional-only characters (for example `體` or `說`). 3. Each file covers the writing rules, the four steps in order, the order rule, and the video safety rule. 4. Each file states that it applies ASD-STE100 principles and is not ASD-STE100 conformant. 5. `SKILL.md` `## Languages` links `references/ja.md` and `references/zh-TW.md` with the condition for each one. It says any other language, including Simplified Chinese, uses the English rules and replies in the user's language. 6. The existing contained-link test accepts both links. 7. Each reference file is at most 4,096 UTF-8 bytes, and `SKILL.md` stays at most 4,096 bytes.
**Verification:** `npx jest src/__tests__/unit/cli/canonical-assets.test.ts`

## 2. Installer

### 2.1 Model-invocation exception without an agent route
**Covers:** FR-4, FR-5, D-3, D-4
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/cli/install-target.ts, src/cli/tool-support/target-installer.ts, src/__tests__/unit/cli/target-installers.test.ts, src/__tests__/unit/cli/install-target.test.ts
**Acceptance criteria:** 1. RED: tests fail because `renderTargetSkill('claude-code' | 'omp', 'output-clarity-ladder', source)` still emits `disable-model-invocation: true`, and the Codex policy still emits `allow_implicit_invocation: false`. 2. GREEN: `MODEL_INVOCABLE_SKILLS` is exported from `install-target.ts` with exactly `output-clarity-ladder`, and no other file declares the exception. 3. For a skill in the set, the Claude Code and OMP output has no `disable-model-invocation` line, even when the source has one. The Codex `agents/openai.yaml` has `allow_implicit_invocation: true` and the description "Apply automatically to explanation, summary, and teaching replies." 4. The output for all three targets has no `model:`, `effort:`, ask-once, or `specialistDepth` text. 5. `SKILL_AGENT_ROUTES` has no `output-clarity-ladder` entry, and a test asserts that the set and the routes share no skill name. 6. `renderOmpSkillRouting()` output does not contain `output-clarity-ladder`. 7. For each of the 11 workflow skills on each target, the rendered output is byte-identical to the output before this change. Claude Code and OMP keep `disable-model-invocation: true`, and Codex keeps `allow_implicit_invocation: false`.
**Verification:** `npx jest src/__tests__/unit/cli/target-installers.test.ts src/__tests__/unit/cli/install-target.test.ts`

### 2.2 Install and setup-global write the skill on all targets
**Covers:** FR-6, FR-3, D-5, D-2
**Dependencies:** 1.2, 2.1
**TDD:** required
**Affected artifacts:** src/__tests__/unit/cli/target-installers.test.ts, src/__tests__/unit/cli/setup-global.test.ts
**Acceptance criteria:** 1. RED: new assertions fail before the skill source exists or before the exception renders. 2. GREEN: a project install into a temp directory writes `output-clarity-ladder/SKILL.md`, `references/ja.md`, and `references/zh-TW.md` under `.claude/skills/`, `.agents/skills/`, or `.omp/skills/` by target. For Codex it also writes `agents/openai.yaml`. 3. Both reference files are byte-identical to the source. 4. The install report lists each file as written. A second run lists each file as unchanged and changes no file content or mtime. 5. `setup-global` writes the skill to the personal skill directory for each selected target. 6. If no product code change is needed, this task adds tests only. Any needed fix stays inside the existing `copySkills` path.
**Verification:** `npx jest src/__tests__/unit/cli/target-installers.test.ts src/__tests__/unit/cli/setup-global.test.ts`

### 2.3 Root guidance sentence
**Covers:** FR-7, D-6
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/cli/tool-support/root-guidance.ts, templates/CLAUDE.md, templates/codex-AGENTS.md, src/__tests__/unit/cli/root-guidance.test.ts
**Acceptance criteria:** 1. RED: a test fails because generated root guidance for `claude-code`, `codex`, and `omp` lacks the sentence. 2. GREEN: generated guidance for each target contains, in `## Workflow`, exactly one line: "The `output-clarity-ladder` skill applies automatically to explanation, summary, and teaching replies; it is the only model-invocable skill." 3. Root guidance does not contain `ASD-STE100` or any ladder step rule. 4. `templates/CLAUDE.md` and `templates/codex-AGENTS.md` contain the same sentence and say "manual-only workflow Skills" where they said "manual-only Skills". 5. Existing root-guidance assertions still pass, or they are updated only for the new line.
**Verification:** `npx jest src/__tests__/unit/cli/root-guidance.test.ts src/__tests__/unit/cli/target-installers.test.ts`

## 3. Runtime messages

### 3.1 Clarity bound checker
**Covers:** FR-8, FR-9, D-7
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/__tests__/helpers/message-clarity.ts, src/__tests__/unit/workflow/message-clarity.test.ts
**Acceptance criteria:** 1. RED: helper tests fail because the helper does not exist. 2. GREEN: `splitSentences` splits on `.`, `?`, or `!` followed by whitespace or end of text. It does not split `spec.json`, `FR-1.2`, or `5.0.1`. 3. `countWords` counts whitespace-separated tokens, and a template placeholder `X` counts as one word. 4. `checkClarity(text, { maxSentences: 2, maxWords: 25 })` passes a 25-word sentence. It fails a 26-word sentence and a three-sentence message, and the result names the failing sentence and its count. 5. Empty or whitespace-only text fails with a clear reason.
**Verification:** `npx jest src/__tests__/unit/workflow/message-clarity.test.ts`

### 3.2 Message extractor, baseline, and contract test
**Covers:** NFR-1, FR-8, FR-9, D-8, D-10
**Dependencies:** none
**TDD:** required
**Affected artifacts:** src/__tests__/helpers/message-extractor.ts, src/__tests__/fixtures/message-contract-baseline.json, src/__tests__/unit/workflow/message-contract.test.ts, scripts/generate-message-baseline.ts
**Acceptance criteria:** 1. RED: the contract test fails because the extractor and the baseline do not exist. 2. GREEN: the extractor uses the TypeScript compiler API. It returns `{ file, code, message, line, literal }` for every `blocker(code, message, ...)` call and every `new GovernanceError(code, message, ...)` in `WorkflowValidationService.ts`, `WorkflowEngineService.ts`, `SDDToolAdapter.ts`, and `ToolRegistry.ts`. 3. A template literal yields its text with each `${...}` replaced by `X`. A non-literal message yields `literal: false`. 4. The extractor returns at least one entry per file. A missing or unparsable file fails with the file name. 5. The baseline is generated from the unmodified source, before any message edit. It records, per file, the sorted code set and, per code, the multiset of numeric tokens, with `2,000` normalized to `2000`. 6. The contract test asserts that the current code sets equal the baseline and that each code's numeric tokens contain the baseline tokens. It passes on the unmodified source. 7. A deliberately removed code or dropped number in a temporary test fixture makes the contract check fail.
**Verification:** `npx jest src/__tests__/unit/workflow/message-contract.test.ts`

### 3.3 Rewrite validation blocker messages
**Covers:** FR-8, NFR-1, D-8, D-9
**Dependencies:** 3.1, 3.2
**TDD:** required
**Affected artifacts:** src/application/services/WorkflowValidationService.ts, src/__tests__/unit/workflow/message-clarity-bounds.test.ts, src/__tests__/unit/workflow
**Acceptance criteria:** 1. RED: a bounds test for `WorkflowValidationService.ts` fails on at least one current blocker message, or on a message that lacks the item name or uses a glossary synonym. 2. GREEN: every blocker message has at most 2 sentences and at most 25 words per sentence. 3. Each message with a section, label, or identifier names it. 4. Messages use the glossary terms "requirement section", "EARS Specification", "Acceptance Criteria", "design decision", "task", "phase", "revision", "artifact", and "approval", with no synonyms. 5. Each message that has a next action names it without a host prefix (`/`, `$`, `/skill:`). 6. Blocker codes and references are unchanged, and the contract test passes. 7. Existing tests that assert the old blocker text are updated to the new text only.
**Verification:** `npx jest src/__tests__/unit/workflow`

### 3.4 Rewrite WorkflowEngineService error messages
**Covers:** FR-9, NFR-1, D-8, D-9
**Dependencies:** 3.1, 3.2
**TDD:** required
**Affected artifacts:** src/application/services/WorkflowEngineService.ts, src/__tests__/unit/workflow/message-clarity-bounds.test.ts, src/__tests__/unit/workflow
**Acceptance criteria:** 1. RED: the bounds test for `WorkflowEngineService.ts` fails on at least one current `GovernanceError` message that has no next action for a recoverable state. 2. GREEN: every message has at most 2 sentences and at most 25 words per sentence. 3. Every number, limit, and identifier from the old message remains, for example "2000 characters". 4. Recoverable states (for example phase not approved, stale review checkpoint, artifact drift, revision conflict) name the next action in host-neutral words. 5. No exported type or `details` field changes, and `npm run build` passes. 6. The contract test passes. Old-text assertions are updated to the new text only.
**Verification:** `npx jest src/__tests__/unit/workflow` and `npm run build`

### 3.5 Rewrite adapter and registry error messages
**Covers:** FR-9, NFR-1, D-8, D-9
**Dependencies:** 3.1, 3.2
**TDD:** required
**Affected artifacts:** src/adapters/cli/SDDToolAdapter.ts, src/infrastructure/mcp/ToolRegistry.ts, src/__tests__/unit/workflow/message-clarity-bounds.test.ts, src/__tests__/unit
**Acceptance criteria:** 1. RED: the bounds test for these two files fails on at least one current message, or it fails on a non-literal message that is not allowlisted. 2. GREEN: every literal message passes the bounds and keeps its numbers and identifiers. 3. Each non-literal forwarded message is in the allowlist with file, code, and reason. Each allowlisted entry still exists in source. 4. Error codes and MCP response shapes are unchanged, and the contract test passes. 5. Old-text assertions are updated to the new text only.
**Verification:** `npx jest src/__tests__/unit` and `npm run build`

## 4. Documentation

### 4.1 Document the skill and correct manual-only statements
**Covers:** NFR-4, D-12
**Dependencies:** 1.2, 2.1
**TDD:** not-applicable — prose documentation with no executable behavior; it is checked by grep and review
**Affected artifacts:** docs/WORKFLOW.md, README.md, docs/INSTALL-GUIDE.md, docs/MODEL-ROUTING.md
**Acceptance criteria:** 1. `docs/WORKFLOW.md` has a short section that names `output-clarity-ladder`, says it is the only model-invocable skill, and lists `en`, `ja`, and `zh-TW`. 2. The README skill table has a row for the skill with a one-line description. 3. `docs/INSTALL-GUIDE.md` and `docs/MODEL-ROUTING.md` name the single exception. No unqualified "All SDD skills are manual-only" sentence remains. 4. No doc claims ASD-STE100 certification or conformance. 5. New prose follows the skill's own writing rules.
**Verification:** `grep -rn "output-clarity-ladder" docs/WORKFLOW.md README.md docs/INSTALL-GUIDE.md docs/MODEL-ROUTING.md` and `grep -rn "All SDD skills are manual-only" docs README.md` returns no unqualified match

## 5. Verification

### 5.1 Full build, suite, and per-target install check
**Covers:** FR-1, FR-3, FR-4, FR-6, FR-7, NFR-1, D-3, D-5, D-6, D-10
**Dependencies:** 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1
**TDD:** not-applicable — end-to-end verification of behavior already covered by RED/GREEN tasks; it adds no new behavior
**Affected artifacts:** none
**Acceptance criteria:** 1. `npm run build` passes. 2. The full `npm test` passes, with no skipped or focused tests added. 3. A local install into a temp project for each target shows the expected skill frontmatter, the Codex `agents/openai.yaml` with `allow_implicit_invocation: true`, both reference files, and the root guidance sentence. 4. The 11 workflow skills still render manual-only on each target. 5. `git diff` shows no change to error codes, `GovernanceErrorCode`, or response types.
**Verification:** `npm run build && npm test`, then a temp-directory install with `--target claude-code`, `--target codex`, and `--target omp`, with each result inspected
