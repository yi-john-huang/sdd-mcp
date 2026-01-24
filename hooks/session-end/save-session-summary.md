---
name: save-session-summary
description: Saves a summary of the session for continuity between sessions
event: session-end
priority: 100
enabled: true
---

# Save Session Summary Hook

This hook saves a summary of the session when it ends, enabling seamless continuity in future sessions.

## What Gets Saved

1. **Workflow Progress**
   - Features worked on during session
   - Phases completed
   - Tasks implemented

2. **Decisions Made**
   - Architecture decisions
   - Implementation choices
   - Trade-offs considered

3. **Context to Preserve**
   - Current working state
   - Pending items
   - Blockers or questions

## Summary Location

```
.spec/sessions/
└── 2024-01-15T10-30-00Z.md
```

## Summary Format

```markdown
# Session Summary - 2024-01-15

## Duration
Started: 10:30 AM | Ended: 2:45 PM (4h 15m)

## Features Worked On

### plugin-architecture-v3
- Completed: requirements phase approved
- In Progress: design phase
- Next: Complete component diagram

### user-authentication
- Implemented: Tasks 1.1, 1.2, 1.3
- Tests: 12 new tests, all passing
- Blockers: Need OAuth provider decision

## Key Decisions
1. Using BaseManager pattern for all component managers
2. Hooks organized by event type in nested directories
3. YAML frontmatter for all component metadata

## Continuation Notes
- Resume design.md at "Data Flow" section
- Review OAuth options before next session
- Run integration tests after completing design
```

## Benefits

- **Seamless Continuity** - Start next session with full context
- **Knowledge Preservation** - Decisions and context don't get lost
- **Progress Tracking** - Clear record of work accomplished
