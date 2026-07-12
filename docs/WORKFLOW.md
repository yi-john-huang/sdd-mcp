# SDD-MCP Workflow

This document explains how the SDD-MCP workflow works with Codex and Claude Code. Shared source components are rendered into the selected agent's native layout.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                 Target Agent (Codex / Claude Code)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Rules   │  │ Contexts │  │  Agents  │  │  Hooks   │        │
│  │ (always) │  │  (mode)  │  │ (persona)│  │ (events) │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┴──────┬──────┴─────────────┘               │
│                            │                                     │
│                    ┌───────▼───────┐                            │
│                    │    Skills     │                            │
│                    │ (/sdd-* cmds) │                            │
│                    └───────┬───────┘                            │
│                            │                                     │
├────────────────────────────┼────────────────────────────────────┤
│                            │                                     │
│                    ┌───────▼───────┐                            │
│                    │  MCP Server   │                            │
│                    │  (sdd-mcp)    │                            │
│                    └───────┬───────┘                            │
│                            │                                     │
│       ┌────────────────────┼────────────────────┐               │
│       │                    │                    │               │
│  ┌────▼────┐         ┌─────▼─────┐        ┌────▼────┐          │
│  │ Project │         │  Workflow │        │ Quality │          │
│  │  Init   │         │  Engine   │        │  Check  │          │
│  └─────────┘         └───────────┘        └─────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Interaction Sequence

### 1. Session Start

```mermaid
sequenceDiagram
    participant User
    participant Agent as Target Agent
    participant Hook as session-start Hook
    participant Steering as Steering Docs
    participant Rules as Active Rules

    User->>Agent: Start session
    Agent->>Hook: Trigger session-start
    Hook->>Steering: Load project context
    Steering-->>Agent: product.md, tech.md, structure.md
    Hook->>Rules: Activate always-on rules
    Rules-->>Agent: coding-style, security, testing guidance
    Agent-->>User: Ready with project context
```

### 2. SDD Workflow (Feature Development)

```mermaid
sequenceDiagram
    participant User
    participant Agent as Target Agent
    participant Skill as SDD Skills
    participant MCP as MCP Server
    participant Spec as .spec/specs/

    User->>Agent: /sdd-requirements my-feature
    Agent->>Skill: Load sdd-requirements skill
    Skill->>MCP: sdd-init (if needed)
    MCP->>Spec: Create spec.json
    Skill-->>Agent: EARS requirements guidance
    Agent-->>User: Generated requirements.md

    User->>Agent: /sdd-design my-feature
    Agent->>Skill: Load sdd-design skill
    Skill->>MCP: sdd-validate-gap
    MCP-->>Skill: Gap analysis
    Skill-->>Agent: Design guidance
    Agent-->>User: Generated design.md

    User->>Agent: Approve design
    Agent->>MCP: sdd-approve design
    MCP->>Spec: Update spec.json

    User->>Agent: /sdd-tasks my-feature
    Agent->>Skill: Load sdd-tasks skill
    Skill-->>Agent: TDD task breakdown
    Agent-->>User: Generated tasks.md

    User->>Agent: /sdd-implement my-feature
    Agent->>Skill: Load sdd-implement skill
    Agent->>MCP: sdd-spec-impl
    MCP-->>Agent: TDD execution guidance
    Agent-->>User: Implementation with tests
```

### 3. Code Review Flow

```mermaid
sequenceDiagram
    participant User
    participant Target as Target Agent
    participant Skill as sdd-review Skill
    participant Agent as Reviewer Agent
    participant Rules as Security Rules

    User->>Target: /sdd-review src/api/
    Target->>Skill: Load sdd-review skill
    Skill->>Agent: Activate reviewer persona
    Agent-->>Target: Linus-style review mindset
    Target->>Rules: Check security guidance
    Rules-->>Target: OWASP guidelines
    Target->>Target: Analyze code
    Target-->>User: Review with severity levels
    Note over User,Target: Must Fix / Should Fix / Suggestions
```

### 4. Claude Code Pre-Tool Hook Flow

Claude Code can execute the packaged pre-tool hook guidance. Codex installation maps only supported lifecycle behavior (`SessionStart` and `Stop`) to a read-only Node runner; workflow validation remains in `AGENTS.md` and phase skills.

```mermaid
sequenceDiagram
    participant Claude as Claude Code
    participant Hook as pre-tool-use Hook
    participant Validator as validate-sdd-workflow
    participant Spec as spec.json

    Claude->>Claude: About to call sdd-design
    Claude->>Hook: Trigger pre-tool-use
    Hook->>Validator: Check workflow order
    Validator->>Spec: Read current phase
    Spec-->>Validator: phase: requirements
    Validator-->>Hook: Requirements approved?

    alt Requirements NOT approved
        Hook-->>Claude: Block: Approve requirements first
        Claude-->>Claude: Show warning to user
    else Requirements approved
        Hook-->>Claude: Proceed with sdd-design
        Claude->>Claude: Execute tool
    end
```

### 5. Component Installation

```mermaid
sequenceDiagram
    participant User
    participant CLI as sdd-mcp-server CLI
    participant Resolver as Target Resolver
    participant Strategy as Target Installer
    participant Writer as Preserve-First Writer
    participant Ignore as Gitignore Manager

    User->>CLI: install --profile full
    CLI->>Resolver: Resolve primary target
    alt Interactive terminal without --target
        Resolver-->>User: Choose Codex or Claude Code
        User-->>Resolver: Selected target
    else Explicit or automated run
        CLI->>Resolver: --target codex or claude-code
    end
    Resolver-->>CLI: Target policy and native paths
    CLI->>Strategy: Install selected component plan
    Strategy->>Writer: Create native files if absent
    Note over Strategy,Writer: Claude: .claude/skills<br/>Codex: .agents/skills and .codex/guidance/rules
    Writer-->>Strategy: Installed, skipped, failed
    Strategy->>Ignore: Merge target-specific generated directories
    Ignore-->>CLI: Created, updated, or unchanged
    CLI-->>User: Target and aggregate result summary
```

## Component Responsibilities

### Rules (Always Active)
```
rules/
├── coding-style.md    → TypeScript/JS conventions
├── testing.md         → TDD requirements
├── security.md        → OWASP guidelines
├── git-workflow.md    → Commit conventions
├── error-handling.md  → Error patterns
└── sdd-workflow.md    → Phase order enforcement
```

### Contexts (Mode-Specific)
```
contexts/
├── dev.md            → Implementation focus
├── review.md         → Quality focus
├── planning.md       → Architecture focus
├── security-audit.md → Threat focus
└── research.md       → Exploration focus
```

### Agents (Specialized Personas)
```
agents/
├── planner.md         → Roadmap & planning
├── architect.md       → System design
├── reviewer.md        → Code review (Linus-style)
├── implementer.md     → TDD implementation
├── security-auditor.md → Vulnerability assessment
└── tdd-guide.md       → Test-driven coaching
```

### Hooks (Event Automation)
```
hooks/
├── pre-tool-use/
│   ├── validate-sdd-workflow.md  → Enforce phase order
│   └── check-test-coverage.md    → TDD reminder
├── post-tool-use/
│   ├── update-spec-status.md     → Auto-update spec.json
│   └── log-tool-execution.md     → Audit logging
├── session-start/
│   └── load-project-context.md   → Load steering docs
└── session-end/
    ├── save-session-summary.md   → Session notes
    └── remind-uncommitted-changes.md → Git reminder
```

## Data Flow

```
User Request
     │
     ▼
┌─────────────┐     ┌─────────────┐
│   Hooks     │────▶│   Rules     │
│ (pre-tool)  │     │  (always)   │
└─────────────┘     └─────────────┘
     │                    │
     ▼                    ▼
┌─────────────┐     ┌─────────────┐
│  Context    │────▶│   Agent     │
│   (mode)    │     │  (persona)  │
└─────────────┘     └─────────────┘
     │                    │
     └────────┬───────────┘
              ▼
       ┌─────────────┐
       │   Skill     │
       │  (action)   │
       └─────────────┘
              │
              ▼
       ┌─────────────┐
       │ MCP Server  │
       │  (tools)    │
       └─────────────┘
              │
              ▼
       ┌─────────────┐
       │   Hooks     │
       │ (post-tool) │
       └─────────────┘
              │
              ▼
        Response
```

## Key Concepts

1. **Layered Guidance**: Each layer adds context without conflicting
2. **Event-Driven**: Hooks automate repetitive checks
3. **Phase Enforcement**: SDD workflow order is validated automatically
4. **Persona Switching**: Agents provide specialized expertise on demand
5. **Mode Awareness**: Contexts adjust behavior for different tasks
