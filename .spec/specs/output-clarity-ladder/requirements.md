# Requirements: Output Clarity Ladder

## Overview

People spend more time understanding model output than producing it. This feature adds a canonical `output-clarity-ladder` skill to `sdd-mcp-server`. The skill makes explanation, summary, and teaching replies easier to check. It writes about 80% of the way to ASD-STE100 Simplified Technical English. It moves up a ladder (diagram, self-contained HTML page, explainer video) only when the next format makes the same facts easier to understand. The MCP runtime's human-facing workflow messages also follow the same writing rules.

Source: the user's Output Clarity Ladder document (`output-clarity-ladder.md`), which cites Andrej Karpathy, 2026-10-02.

## Users and Goals

- **Host users** (Claude Code, Codex, OMP) read replies faster and check them with less effort.
- **SDD workflow users** read validation results, blockers, and errors that state one fact per sentence and name the next action.
- **Maintainers** keep one canonical skill source that renders for all three hosts.

## Scope

- One canonical skill at `skills/output-clarity-ladder/` with the four-step ladder and the writing rules.
- Localized Japanese (`ja`) and Traditional Chinese (`zh-TW`) guidance shipped with the skill.
- Rendering for Claude Code, Codex, and OMP through the existing `install` and `setup-global` paths.
- Model invocation for this skill only, as an explicit exception to manual-only rendering.
- Root guidance for each target that points to the skill.
- Human-facing validation blocker messages and governance error messages in the MCP runtime rewritten to the writing rules.

## Out of Scope

- Video or narration generation tooling, and storage of API keys or other secrets.
- An automated ASD-STE100 approved-word checker or dictionary.
- Changes to the 11 existing SDD workflow skill files beyond what rendering tests require.
- New MCP tools, workflow phases, or durable state fields.
- Localization of MCP runtime messages.

## Assumptions and Dependencies

- The installer has no project-level language setting. Feature language lives in each feature's `spec.json`. So the skill selects localized guidance from the language of the user's request, not from an install option.
- Hosts load a model-invocable skill from its `description` field. The exact frontmatter or policy key per host is a design decision.
- ASD-STE100 defines English only. The `ja` and `zh-TW` guidance applies the same principles without claiming STE conformance.
- Error `code` values and JSON field names are a public contract. Tests and host skills match on them.

## Functional Requirements

### FR-1: Canonical skill content
**Objective:** Give every host one source of the ladder and writing rules from the user's document.
**EARS Specification:** The repository SHALL contain `skills/output-clarity-ladder/SKILL.md` with frontmatter `name` and `description` and a body that states the trigger, the writing rules, the four ladder steps, and the order rule.
**Acceptance Criteria:**
1. The frontmatter `name` is `output-clarity-ladder` and `description` states that the skill applies to explanation, summary, and teaching replies.
2. The body states that a one-line status, a yes or no answer, and a draft the user asked to word themselves keep their requested form.
3. The body lists all six writing rules from the source document: user's language with usual technical names, one idea per sentence with short active sentences, named actor, one word for one thing, kept numbers, conditions, and uncertainty, and no claim of ASD-STE100 certification.
4. The body describes the four steps in order: writing (default), diagram, self-contained HTML page, explainer video.
5. The body states that output starts at writing, moves up only when the next format makes the same facts easier to understand, and never replaces a requested artifact such as an email, resume, or code with another format.

### FR-2: Explainer video safety
**Objective:** Keep the video step useful without leaking secrets or making routine replies heavy.
**EARS Specification:** The skill SHALL limit the explainer video step to replies where the user asks to see or hear the idea or a narrated visual is clearly easier than text, and SHALL forbid asking the user to paste a secret into chat.
**Acceptance Criteria:**
1. The skill text says not to make a video for a routine reply.
2. The skill text says narration uses a key the user already stored or a free local option.
3. The skill text says never to ask the user to paste a secret into chat.

### FR-3: Localized guidance
**Objective:** Give Japanese and Traditional Chinese users guidance that fits their language.
**EARS Specification:** WHEN the user's request is in Japanese or Traditional Chinese THEN the skill SHALL direct the model to read the matching `ja` or `zh-TW` guidance file shipped in the skill directory, and SHALL fall back to the English rules for any other language.
**Acceptance Criteria:**
1. The skill directory contains one `ja` and one `zh-TW` guidance file, each written in its own language.
2. Each localized file covers the same writing rules, the four ladder steps, the order rule, and the video safety rule as the English skill.
3. Each localized file states that the rules apply the ASD-STE100 principles and are not ASD-STE100 conformant.
4. `SKILL.md` names both files and the condition for reading each one.
5. The installer copies both files to every target's skill directory unchanged.

### FR-4: Model invocation exception
**Objective:** Apply the ladder to replies without the user typing a command.
**EARS Specification:** WHEN the installer renders `output-clarity-ladder` for Claude Code, Codex, or OMP THEN it SHALL emit the target's model-invocable form, and it SHALL keep every existing SDD workflow skill manual-only.
**Acceptance Criteria:**
1. The rendered Claude Code `SKILL.md` for `output-clarity-ladder` does not contain `disable-model-invocation: true`.
2. The rendered Codex skill policy for `output-clarity-ladder` allows implicit invocation.
3. The rendered OMP skill for `output-clarity-ladder` is loadable by the model without a user command.
4. A test asserts that each of the 11 existing workflow skills still renders manual-only on all three targets.
5. The exception is declared in one place in source, keyed by skill name.

### FR-5: No agent route
**Objective:** Keep the skill inside the current reply.
**EARS Specification:** The installer SHALL render `output-clarity-ladder` without a model, effort, or agent route and without delegation instructions.
**Acceptance Criteria:**
1. `SKILL_AGENT_ROUTES` has no entry for `output-clarity-ladder`.
2. The rendered Claude Code skill contains no `model:` or `effort:` line.
3. The rendered skills for all three targets contain no ask-once or `specialistDepth` text.

### FR-6: Installation on all targets
**Objective:** Make the skill available through every existing install path.
**EARS Specification:** WHEN a user runs `install` or `setup-global` for Claude Code, Codex, or OMP THEN the installer SHALL write the `output-clarity-ladder` skill directory to that target's skill path and record it in the install report.
**Acceptance Criteria:**
1. A project install writes the skill to `.claude/skills/output-clarity-ladder/`, `.agents/skills/output-clarity-ladder/`, or `.omp/skills/output-clarity-ladder/` by target.
2. `setup-global` writes the skill to the personal skill path for each selected target.
3. The install report lists the skill as written or unchanged.
4. A rerun with no source change reports the skill as unchanged and makes no file change.

### FR-7: Root guidance pointer
**Objective:** Tell each host that the ladder applies to explanation replies.
**EARS Specification:** WHEN the installer writes root guidance for Claude Code, Codex, or OMP THEN the guidance SHALL contain one sentence that names the `output-clarity-ladder` skill and the reply types it covers.
**Acceptance Criteria:**
1. `templates/CLAUDE.md`, `templates/codex-AGENTS.md`, and the OMP root guidance each contain the sentence.
2. The sentence does not copy the ladder rules into root guidance.
3. The existing statement that SDD workflow skills are manual-only stays accurate and unchanged in meaning.

### FR-8: Validation blocker messages
**Objective:** Make phase validation results easy to read and act on.
**EARS Specification:** WHEN workflow validation reports a blocker THEN the blocker `message` SHALL follow the writing rules and SHALL name what the author must change.
**Acceptance Criteria:**
1. Every blocker message produced by `WorkflowValidationService` has at most two sentences and at most 25 words per sentence.
2. Each blocker message names the section, label, or identifier to change when the blocker has one.
3. Each blocker message uses the same term for the same artifact element across all blockers, for example "Acceptance Criteria" and never a synonym.
4. A test enumerates every blocker message template and checks the sentence and word bounds.

### FR-9: Governance error messages
**Objective:** Make runtime errors and blockers easy to understand without reading code.
**EARS Specification:** WHEN the MCP runtime returns a `GovernanceError` or tool error to a host THEN the human-facing `message` SHALL follow the writing rules, SHALL keep numbers and limits, and SHALL state the next action when one exists.
**Acceptance Criteria:**
1. Every `GovernanceError` message in `WorkflowEngineService`, `SDDToolAdapter`, and `ToolRegistry` has at most two sentences and at most 25 words per sentence.
2. Messages keep every number, limit, and identifier that the current message contains, such as `2000 characters`.
3. Messages for recoverable states name the next action, for example the Skill to rerun or the artifact to inspect.
4. A test checks the sentence and word bounds for every message literal or template in those files.

## Non-functional Requirements

### NFR-1: Contract compatibility
**Objective:** Protect hosts, skills, and tests that match on machine-readable fields.
**EARS Specification:** The MCP runtime SHALL keep every error `code`, blocker `code`, blocker `reference`, JSON field name, and response shape unchanged while message text changes.
**Acceptance Criteria:**
1. A test compares the set of error and blocker codes before and after the change and finds no difference.
2. The existing test suite passes after tests that assert exact old message text are updated to the new text.
3. No public type in `WorkflowEngineService` changes its fields.

### NFR-2: Skill size
**Objective:** Keep the always-available skill cheap to load.
**EARS Specification:** The canonical `SKILL.md` and each localized guidance file SHALL each be at most 4,096 bytes.
**Acceptance Criteria:**
1. A test reads each file and asserts a size of at most 4,096 bytes.

### NFR-3: Honest claims
**Objective:** Avoid false conformance claims to users.
**EARS Specification:** The skill, localized guidance, and documentation SHALL NOT claim that any output is certified or conformant to ASD-STE100.
**Acceptance Criteria:**
1. A test asserts that the English skill states there is no approved-word check.
2. Review confirms that no shipped file states certification or conformance.

### NFR-4: Documentation
**Objective:** Tell maintainers and users what the skill does and where it installs.
**EARS Specification:** WHEN the feature ships THEN `docs/WORKFLOW.md` and the README skill list SHALL describe the `output-clarity-ladder` skill, its model-invocable status, and its supported languages.
**Acceptance Criteria:**
1. `docs/WORKFLOW.md` names the skill and states that it is the only model-invocable skill.
2. The README skill list includes the skill with a one-line description.
