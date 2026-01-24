---
name: load-project-context
description: Loads project context and steering documents at session start
event: session-start
priority: 100
enabled: true
---

# Load Project Context Hook

This hook loads project-specific context and steering documents when a new session starts.

## Actions

1. **Detect Project Type**
   - Check for `.spec/steering/` directory
   - Identify project technology stack
   - Load appropriate steering documents

2. **Load Steering Documents**
   ```
   .spec/steering/
   ├── PROJECT.md      # Project overview and conventions
   ├── AGENTS.md       # Agent configuration
   ├── ARCHITECTURE.md # System architecture
   └── custom/         # Project-specific guides
   ```

3. **Restore Workflow State**
   - Read `.spec/specs/*/spec.json` for active features
   - Identify current phase for each feature
   - Surface any incomplete workflows

4. **Set Session Context**
   - Configure AI persona based on active agent
   - Apply relevant rules
   - Activate appropriate context mode

## Session Initialization Message

```
📋 Project Context Loaded

Project: sdd-mcp
Type: Node.js/TypeScript
Active Features:
  • plugin-architecture-v3 (design phase)
  • user-authentication (implementation phase)

Steering Documents:
  ✓ PROJECT.md loaded
  ✓ AGENTS.md loaded
  ✓ 3 custom guides loaded

Ready to continue. Run /sdd-status for full workflow state.
```

## Benefits

- **Consistent Context** - Every session starts with full project understanding
- **Workflow Continuity** - Pick up where you left off
- **Best Practices** - Steering documents are always active
