---
name: log-tool-execution
description: Logs all tool executions for debugging and audit purposes
event: post-tool-use
priority: 50
enabled: false
---

# Log Tool Execution Hook

This hook logs all tool executions to a local log file for debugging and auditing.

## Purpose

- **Debugging** - Trace issues by reviewing tool invocation history
- **Auditing** - Track what actions were taken during a session
- **Learning** - Analyze patterns in tool usage over time

## Log Format

```
[2024-01-15T10:30:00.000Z] TOOL_EXEC
  tool: sdd-requirements
  feature: user-authentication
  duration: 1250ms
  status: success
  output_files:
    - .spec/specs/user-authentication/requirements.md
```

## Log Location

Logs are written to:
- Default: `.sdd/logs/tool-execution.log`
- Configurable via `SDD_LOG_PATH` environment variable

## Configuration

```yaml
# In .sdd/config.yaml
hooks:
  log-tool-execution:
    enabled: true
    log_level: info  # debug, info, warn, error
    max_log_size: 10MB
    retain_days: 30
```

## Note

This hook is disabled by default to avoid unnecessary disk I/O during normal development. Enable it when debugging or for compliance requirements.
