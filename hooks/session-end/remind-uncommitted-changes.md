---
name: remind-uncommitted-changes
description: Reminds developer of uncommitted changes before ending session
event: session-end
priority: 90
enabled: true
---

# Remind Uncommitted Changes Hook

This hook checks for uncommitted changes and reminds the developer before the session ends.

## Actions

1. **Check Git Status**
   - Detect uncommitted changes
   - Identify untracked files
   - Check for stashed changes

2. **Display Warning**
   ```
   ⚠️ Uncommitted Changes Detected

   You have changes that haven't been committed:

   Modified:
     • src/hooks/HookLoader.ts
     • src/__tests__/hooks/HookLoader.test.ts

   Untracked:
     • hooks/pre-tool-use/validate-sdd-workflow.md

   Consider committing your changes before ending the session.
   Run: /sdd-commit to create a commit with proper message
   ```

3. **Suggest Actions**
   - Offer to run commit command
   - Show diff summary
   - Remind about push to remote

## Configuration

```yaml
# In .sdd/config.yaml
hooks:
  remind-uncommitted-changes:
    enabled: true
    include_untracked: true
    warn_large_diff: true
    large_diff_threshold: 500  # lines
```

## Benefits

- **Prevent Lost Work** - Don't lose changes between sessions
- **Clean State** - End sessions with clean working directory
- **Team Sync** - Remind to push for team visibility
