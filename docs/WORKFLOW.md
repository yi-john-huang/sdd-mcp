# SDD-MCP Workflow

This document explains how the SDD-MCP plugin system works with Claude Code.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
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
    participant Claude as Claude Code
    participant Hook as session-start Hook
    participant Steering as Steering Docs
    participant Rules as Active Rules

    User->>Claude: Start session
    Claude->>Hook: Trigger session-start
    Hook->>Steering: Load project context
    Steering-->>Claude: product.md, tech.md, structure.md
    Hook->>Rules: Activate always-on rules
    Rules-->>Claude: coding-style, security, testing rules
    Claude-->>User: Ready with project context
```

### 2. SDD Workflow (Feature Development)

```mermaid
sequenceDiagram
    participant User
    participant Claude as Claude Code
    participant Skill as SDD Skills
    participant MCP as MCP Server
    participant Spec as .spec/specs/

    User->>Claude: /sdd-requirements my-feature
    Claude->>Skill: Load sdd-requirements skill
    Skill->>MCP: sdd-init (if needed)
    MCP->>Spec: Create spec.json
    Skill-->>Claude: EARS requirements template
    Claude-->>User: Generated requirements.md

    User->>Claude: /sdd-design my-feature
    Claude->>Skill: Load sdd-design skill
    Skill->>MCP: sdd-validate-gap
    MCP-->>Skill: Gap analysis
    Skill-->>Claude: Design template
    Claude-->>User: Generated design.md

    User->>Claude: Approve design
    Claude->>MCP: sdd-approve design
    MCP->>Spec: Update spec.json

    User->>Claude: /sdd-tasks my-feature
    Claude->>Skill: Load sdd-tasks skill
    Skill-->>Claude: TDD task breakdown
    Claude-->>User: Generated tasks.md

    User->>Claude: /sdd-implement my-feature
    Claude->>Skill: Load sdd-implement skill
    Claude->>MCP: sdd-spec-impl
    MCP-->>Claude: TDD execution guidance
    Claude-->>User: Implementation with tests
```

### 3. Code Review Flow

```mermaid
sequenceDiagram
    participant User
    participant Claude as Claude Code
    participant Skill as sdd-review Skill
    participant Agent as Reviewer Agent
    participant Rules as Security Rules

    User->>Claude: /sdd-review src/api/
    Claude->>Skill: Load sdd-review skill
    Skill->>Agent: Activate reviewer persona
    Agent-->>Claude: Linus-style review mindset
    Claude->>Rules: Check security rules
    Rules-->>Claude: OWASP guidelines
    Claude->>Claude: Analyze code
    Claude-->>User: Review with severity levels
    Note over User,Claude: Must Fix / Should Fix / Suggestions
```

### 4. Pre-Tool Hook Flow

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
    participant SM as SkillManager
    participant RM as RulesManager
    participant CM as ContextManager
    participant AM as AgentManager
    participant HL as HookLoader

    User->>CLI: npx sdd-mcp-server install --all

    par Install all components
        CLI->>SM: installComponents(.claude/skills)
        SM-->>CLI: 11 skills installed
    and
        CLI->>RM: installComponents(.claude/rules)
        RM-->>CLI: 6 rules installed
    and
        CLI->>CM: installComponents(.claude/contexts)
        CM-->>CLI: 5 contexts installed
    and
        CLI->>AM: installComponents(.claude/agents)
        AM-->>CLI: 6 agents installed
    and
        CLI->>HL: installComponents(.claude/hooks)
        HL-->>CLI: 7 hooks installed
    end

    CLI-->>User: 41 components installed
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
