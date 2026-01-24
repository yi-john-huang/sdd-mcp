# Requirements: Plugin Architecture v3.0

## Overview

Transform sdd-mcp from a basic MCP server with skills into a comprehensive Claude Code plugin system by adding four new infrastructure layers inspired by everything-claude-code concepts.

## Business Justification

Currently sdd-mcp only provides skills (slash commands). Users cannot define:
- Always-active rules for consistent code quality
- Specialized agent personas for different tasks
- Mode-specific contexts for different workflows
- File-based automation hooks

This limits the plugin's ability to provide comprehensive AI-assisted development guidance.

## Functional Requirements

### FR-1: RulesManager Component
**Objective:** As a plugin developer, I want to define always-active rules, so that consistent guidelines are enforced across all AI interactions.

**EARS Specification:**
WHEN the plugin system initializes
THEN the RulesManager SHALL discover and load all rule files from `/rules/*.md`

**Acceptance Criteria:**
1. RulesManager extends BaseManager abstract class
2. Rules are discovered from `rules/` directory with `.md` extension
3. Each rule file uses YAML frontmatter for metadata (name, description, priority)
4. Rules are installed to `.claude/rules/` in target projects

### FR-2: ContextManager Component
**Objective:** As a plugin developer, I want to define mode-specific contexts, so that the AI behaves appropriately for different workflows.

**EARS Specification:**
WHEN a user switches to a specific mode (dev, review, planning)
THEN the ContextManager SHALL load the corresponding context from `/contexts/*.md`

**Acceptance Criteria:**
1. ContextManager extends BaseManager abstract class
2. Contexts are discovered from `contexts/` directory with `.md` extension
3. Each context file uses YAML frontmatter for metadata (name, description, mode)
4. Contexts are installed to `.claude/contexts/` in target projects

### FR-3: AgentManager Component
**Objective:** As a plugin developer, I want to define specialized agent personas, so that the AI can take on different roles.

**EARS Specification:**
WHEN an agent is invoked by name
THEN the AgentManager SHALL load the agent definition from `/agents/*.md`

**Acceptance Criteria:**
1. AgentManager extends BaseManager abstract class
2. Agents are discovered from `agents/` directory with `.md` extension
3. Each agent file uses YAML frontmatter for metadata (name, description, role)
4. Agents are installed to `.claude/agents/` in target projects

### FR-4: HookLoader Component
**Objective:** As a plugin developer, I want to define file-based hooks, so that automation can be triggered by events.

**EARS Specification:**
WHEN the plugin system initializes
THEN the HookLoader SHALL discover hook definitions from `/hooks/**/*.md`

**Acceptance Criteria:**
1. HookLoader loads hook definitions from structured directories
2. Hook directories are organized by event type (pre-tool-use, post-tool-use, etc.)
3. Each hook file uses YAML frontmatter for metadata (name, event, priority)
4. Hooks are installed to `.claude/hooks/` in target projects

### FR-5: Unified Install CLI
**Objective:** As a user, I want a single command to install all plugin components, so that setup is simple.

**EARS Specification:**
WHEN the user runs `npx sdd-mcp-server install`
THEN the CLI SHALL install skills, agents, rules, contexts, and hooks to `.claude/`

**Acceptance Criteria:**
1. Single `install` command installs all component types
2. Support `--list` flag to show available components
3. Support component-specific flags (--skills, --agents, --rules, --contexts, --hooks)
4. Backward compatible with existing skill installation

### FR-6: New Skills
**Objective:** As a user, I want additional skills for code review, security auditing, and test generation.

**EARS Specification:**
WHEN the user invokes `/sdd-review`, `/sdd-security-check`, or `/sdd-test-gen`
THEN the system SHALL execute the corresponding skill workflow

**Acceptance Criteria:**
1. `sdd-review` skill provides Linus-style code review guidance
2. `sdd-security-check` skill provides OWASP Top 10 security audit
3. `sdd-test-gen` skill provides TDD test generation guidance

## Non-Functional Requirements

### NFR-1: Backward Compatibility
The system SHALL maintain backward compatibility with all 8 existing skills.

### NFR-2: Architectural Consistency
All new managers SHALL follow the SkillManager pattern using BaseManager abstract class.

### NFR-3: Metadata Format
All component files SHALL use YAML frontmatter for metadata extraction.

### NFR-4: Test Coverage
All new managers SHALL have unit tests with >80% code coverage.

### NFR-5: Independent Mergeability
Each sprint/phase SHALL be independently mergeable to the main branch.

## Constraints

- Must use existing DI container (Inversify) for dependency injection
- Must follow existing TypeScript patterns in the codebase
- Hook definitions are file-based only (no runtime execution integration)

## Assumptions

- Claude Code supports loading components from `.claude/` subdirectories
- YAML frontmatter parsing is sufficient for metadata (no complex nested structures)
- Users will run `npx sdd-mcp-server install` to set up plugins in their projects

## Out of Scope

- Runtime hook execution integration with Claude Code
- Plugin marketplace/registry
- Remote plugin installation
- Plugin dependency resolution
- GUI/visual configuration tools
