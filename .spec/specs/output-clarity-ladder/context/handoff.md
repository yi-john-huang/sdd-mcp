<!-- sdd-context schema=2 phase=implementation source=6885bb206f0283c8fc3743a9b06727574f92ba430f3cd8ae577d2a65caea8841 payload=79642800d702ff3f7a40a78b8c33cdcab57e9c3cfe92fb2e17d9c76dfa2dcc28 -->
# SDD Context: output-clarity-ladder

## Workflow State
- Effective phase: implementation
- Phase status: approved
- Requirements: approved
- Design: approved
- Tasks: approved
- Test-case review: not required

## Implementation Progress
- Revision: 24
- Completed: 6/12
- Active: 0
- Blocked: 0

## Next Action
Select a ready task: 2.2, 3.3, 3.4, 3.5, 4.1.

## Source References
- requirements.md
- design.md
- tasks.md

## Payload Estimate
- Payload estimated tokens: 02041

## Selected Context
- # Requirements: Output Clarity Ladder
- ## Overview
- People spend more time understanding model output than producing it. This feature adds a canonical `output-clarity-ladder` skill to `sdd-mcp-server`. The skill makes explanation, summary, and teaching replies easier to check. It writes about 80% of the way to ASD-STE100 Simplified Technical English. It moves up a ladde
- Source: the user's Output Clarity Ladder document (`output-clarity-ladder.md`), which cites Andrej Karpathy, 2026-10-02.
- ## Users and Goals
- **Host users** (Claude Code, Codex, OMP) read replies faster and check them with less effort.
- **SDD workflow users** read validation results, blockers, and errors that state one fact per sentence and name the next action.
- **Maintainers** keep one canonical skill source that renders for all three hosts.
- ## Scope
- One canonical skill at `skills/output-clarity-ladder/` with the four-step ladder and the writing rules.
- Localized Japanese (`ja`) and Traditional Chinese (`zh-TW`) guidance shipped with the skill.
- Rendering for Claude Code, Codex, and OMP through the existing `install` and `setup-global` paths.
- Model invocation for this skill only, as an explicit exception to manual-only rendering.
- Root guidance for each target that points to the skill.
- Human-facing validation blocker messages and governance error messages in the MCP runtime rewritten to the writing rules.
- ## Out of Scope
- Video or narration generation tooling, and storage of API keys or other secrets.
- An automated ASD-STE100 approved-word checker or dictionary.
- Changes to the 11 existing SDD workflow skill files beyond what rendering tests require.
- New MCP tools, workflow phases, or durable state fields.
- Localization of MCP runtime messages.
- ## Assumptions and Dependencies
- The installer has no project-level language setting. Feature language lives in each feature's `spec.json`. So the skill selects localized guidance from the language of the user's request, not from an install option.
- Hosts load a model-invocable skill from its `description` field. The exact frontmatter or policy key per host is a design decision.
- ASD-STE100 defines English only. The `ja` and `zh-TW` guidance applies the same principles without claiming STE conformance.
- Error `code` values and JSON field names are a public contract. Tests and host skills match on them.
- ## Functional Requirements
- ### FR-1: Canonical skill content
- **Objective:** Give every host one source of the ladder and writing rules from the user's document.
- **EARS Specification:** The repository SHALL contain `skills/output-clarity-ladder/SKILL.md` with frontmatter `name` and `description` and a body that states the trigger, the writing rules, the four ladder steps, and the order rule.
- **Acceptance Criteria:**
- The frontmatter `name` is `output-clarity-ladder` and `description` states that the skill applies to explanation, summary, and teaching replies.
- The body states that a one-line status, a yes or no answer, and a draft the user asked to word themselves keep their requested form.
- The body lists all six writing rules from the source document: user's language with usual technical names, one idea per sentence with short active sentences, named actor, one word for one thing, kept numbers, conditions, and uncertainty, and no claim of ASD-STE100 certification.
- The body describes the four steps in order: writing (default), diagram, self-contained HTML page, explainer video.
- The body states that output starts at writing, moves up only when the next format makes the same facts easier to understand, and never replaces a requested artifact such as an email, resume, or code with another format.
- ### FR-2: Explainer video safety
- **Objective:** Keep the video step useful without leaking secrets or making routine replies heavy.
- **EARS Specification:** The skill SHALL limit the explainer video step to replies where the user asks to see or hear the idea or a narrated visual is clearly easier than text, and SHALL forbid asking the user to paste a secret into chat.
- The skill text says not to make a video for a routine reply.
- The skill text says narration uses a key the user already stored or a free local option.
- The skill text says never to ask the user to paste a secret into chat.
- ### FR-3: Localized guidance
- **Objective:** Give Japanese and Traditional Chinese users guidance that fits their language.
- **EARS Specification:** WHEN the user's request is in Japanese or Traditional Chinese THEN the skill SHALL direct the model to read the matching `ja` or `zh-TW` guidance file shipped in the skill directory, and SHALL fall back to the English rules for any other language.
- The skill directory contains one `ja` and one `zh-TW` guidance file, each written in its own language.
- Each localized file covers the same writing rules, the four ladder steps, the order rule, and the video safety rule as the English skill.
- Each localized file states that the rules apply the ASD-STE100 principles and are not ASD-STE100 conformant.
- `SKILL.md` names both files and the condition for reading each one.
- The installer copies both files to every target's skill directory unchanged.
- ### FR-4: Model invocation exception
- **Objective:** Apply the ladder to replies without the user typing a command.
- **EARS Specification:** WHEN the installer renders `output-clarity-ladder` for Claude Code, Codex, or OMP THEN it SHALL emit the target's model-invocable form, and it SHALL keep every existing SDD workflow skill manual-only.
- The rendered Claude Code `SKILL.md` for `output-clarity-ladder` does not contain `disable-model-invocation: true`.
- The rendered Codex skill policy for `output-clarity-ladder` allows implicit invocation.
- The rendered OMP skill for `output-clarity-ladder` is loadable by the model without a user command.
- A test asserts that each of the 11 existing workflow skills still renders manual-only on all three targets.
- The exception is declared in one place in source, keyed by skill name.
- ### FR-5: No agent route
- **Objective:** Keep the skill inside the current reply.
- **EARS Specification:** The installer SHALL render `output-clarity-ladder` without a model, effort, or agent route and without delegation instructions.
- `SKILL_AGENT_ROUTES` has no entry for `output-clarity-ladder`.
- The rendered Claude Code skill contains no `model:` or `effort:` line.
- The rendered skills for all three targets contain no ask-once or `specialistDepth` text.
- ### FR-6: Installation on all targets
- **Objective:** Make the skill available through every existing install path.
- **EARS Specification:** WHEN a user runs `install` or `setup-global` for Claude Code, Codex, or OMP THEN the installer SHALL write the `output-clarity-ladder` skill directory to that target's skill path and record it in the install report.
- A project install writes the skill to `.claude/skills/output-clarity-ladder/`, `.agents/skills/output-clarity-ladder/`, or `.omp/skills/output-clarity-ladder/` by target.
- `setup-global` writes the skill to the personal skill path for each selected target.
- The install report lists the skill as written or unchanged.
- A rerun with no source change reports the skill as unchanged and makes no file change.
- ### FR-7: Root guidance pointer
- **Objective:** Tell each host that the ladder applies to explanation replies.
- ### FR-8: Validation blocker messages
- |---|---|