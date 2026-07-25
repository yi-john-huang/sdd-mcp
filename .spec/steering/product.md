# Product Overview

## Description
SDD MCP Server is a Skill-governed spec-driven workflow and companion installer for Claude Code, Codex, Oh My Pi (OMP), and compatible MCP hosts.

The four Formal SDD phase Skills own method and presentation. A hidden MCP runtime owns durable identity, artifact writes, deterministic governance, approvals, checkpoints, implementation progress, recovery, and cross-session context in `.spec`.

## Vision
Make disciplined spec-driven development practical inside AI-assisted engineering tools while keeping context usage controlled. The workflow should preserve human approval checkpoints and TDD discipline without forcing every interaction to load all guidance documents.

## Target Users
- **Primary:** Engineers using AI coding agents who want a repeatable requirements -> design -> tasks -> implementation workflow.
- **Secondary:** Team leads and maintainers standardizing AI-assisted development conventions across repositories.
- **Tertiary:** MCP client and plugin authors who need a reference implementation for workflow tools, resources, prompts, and installable agent components.

## Core Features
1. Phase Skills - Requirements owns initialization/resume; requirements, design, tasks, and implementation each provide their native method and human conversation.
2. Durable governance - The MCP runtime owns feature identity, canonical writes, revision/hash checks, deterministic structure and traceability validation, approval/checkpoint records, and task progress.
3. Target-aware installer - Installs native Skills and guidance plus mandatory hidden runtime registration for Claude Code, Codex, or OMP with preserve-first upgrades.
4. Human gates - Requirements, design, and tasks approval remain explicit decisions; optional test-case review is a distinct tasks checkpoint.
5. Context management - Restores approved bounded context and exact implementation progress across sessions; draft content requires explicit revision mode.
6. Quality and security guidance - Includes Linus-style review, OWASP-oriented checks, TDD guidance, and project-specific steering.
7. Migration utilities - Continue valid legacy disk workflows through strict normalization while preserving the clean v5 public API.

## Key Value Propositions
- Users operate host-native phase Skills rather than backend tools or workflow JSON.
- Deterministic disk authority replaces implicit agent/process memory.
- Humans retain explicit phase and test-review decisions while Skills automate status, context, validation, persistence, and progress recording.
- Runtime registration and native invocation are installed together for all supported hosts.
- Readable `.spec` artifacts and restart-safe progress make the workflow auditable and resumable.

## Success Metrics
- Users can complete SDD phases with fewer full-context reloads and fewer repeated steering reads.
- Default install profile keeps always-on guidance small while preserving full install options for teams that need them.
- Claude Code, Codex, and OMP installs contain only their selected native artifacts and apply the documented role/model policy.
- New workflow tools and skills are covered by focused unit tests and type checks.
- README, package version examples, and install behavior stay aligned for published releases.
- Context handoff summaries produce meaningful reductions compared with loading all source spec documents.

## Product Principles
- Public journey: install -> reload/trust -> invoke the host-native phase Skill.
- Skill owns method and presentation; MCP owns identity, canonical writes, revision/hash governance, deterministic gates, approvals/checkpoints, task progress, and handoff.
- `.spec/specs/<feature>/spec.json` is the sole workflow authority; handoff is rebuildable cache.
- Governed Markdown is readable by humans but is changed through the Skill/MCP flow; approved drift blocks.
- Keep generated target trees as installer output; never hand-edit or duplicate choreography in them.
- Use compact approved context by default and explicit full draft context only for revision.
