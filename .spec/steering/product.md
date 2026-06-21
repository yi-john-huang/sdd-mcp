# Product Overview

## Description
SDD MCP Server is a Model Context Protocol server and companion CLI for running spec-driven development workflows across AI-agent CLIs and IDEs such as Claude Code and Cursor.

The project packages workflow tools, agent skills, steering documents, rules, contexts, agents, and hooks so teams can move from project intent to requirements, design, tasks, implementation, review, and commit guidance with consistent governance.

## Vision
Make disciplined spec-driven development practical inside AI-assisted engineering tools while keeping context usage controlled. The workflow should preserve human approval checkpoints and TDD discipline without forcing every interaction to load all guidance documents.

## Target Users
- **Primary:** Engineers using AI coding agents who want a repeatable requirements -> design -> tasks -> implementation workflow.
- **Secondary:** Team leads and maintainers standardizing AI-assisted development conventions across repositories.
- **Tertiary:** MCP client and plugin authors who need a reference implementation for workflow tools, resources, prompts, and installable agent components.

## Core Features
1. MCP workflow tools - Initialize specs, inspect status, approve phases, validate design/gaps, run quality checks, and execute spec implementation.
2. Agent skills - On-demand guidance for requirements, design, tasks, implementation, steering, simple tasks, review, security checks, tests, and commits.
3. Component installer - Installs skills, steering, rules, contexts, agents, and hooks into consuming projects with lean and full profiles.
4. Approval workflow - Enforces requirements, design, and tasks approval before implementation, with an optional TDD test-case review checkpoint.
5. Context management - Generates compact handoff summaries after phase approvals and supports compact, standard, and full context loading modes.
6. Quality and security guidance - Includes Linus-style review, OWASP-oriented checks, TDD guidance, and project-specific steering.
7. Migration utilities - Supports migration from legacy `.kiro` and static steering layouts into the current `.spec` and component architecture.

## Key Value Propositions
- Reduces repeated prompt/context loading by moving template-heavy guidance into on-demand skills and compact handoffs.
- Gives AI agents a deterministic workflow contract instead of ad hoc planning and implementation.
- Keeps humans in control of phase approvals while still automating status, validation, and context restoration.
- Works through MCP stdio and direct CLI usage, so the same workflow can serve multiple AI clients.
- Ships reusable components that projects can install locally without copying source repo internals.

## Success Metrics
- Users can complete SDD phases with fewer full-context reloads and fewer repeated steering reads.
- Default install profile keeps always-on guidance small while preserving full install options for teams that need them.
- New workflow tools and skills are covered by focused unit tests and type checks.
- README, package version examples, and install behavior stay aligned for published releases.
- Context handoff summaries produce meaningful reductions compared with loading all source spec documents.

## Product Principles
- Prefer explicit workflow state over implicit agent memory.
- Keep generated project artifacts readable and editable by humans.
- Use compact context by default and provide full context only when the task needs it.
- Preserve backward compatibility for existing `.spec`, `.kiro`, and installed component users where practical.
