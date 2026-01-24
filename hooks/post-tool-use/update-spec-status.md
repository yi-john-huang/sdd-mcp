---
name: update-spec-status
description: Automatically updates spec.json status after SDD tool completion
event: post-tool-use
priority: 100
enabled: true
---

# Update Spec Status Hook

This hook automatically updates the spec.json file after SDD workflow tools complete successfully.

## Trigger Conditions

Triggered after these tools complete successfully:
- `sdd-init` - Sets status to "initialized"
- `sdd-requirements` - Sets requirements phase to "generated"
- `sdd-approve requirements` - Sets requirements phase to "approved"
- `sdd-design` - Sets design phase to "generated"
- `sdd-approve design` - Sets design phase to "approved"
- `sdd-tasks` - Sets tasks phase to "generated"
- `sdd-approve tasks` - Sets tasks phase to "approved"
- `sdd-implement` - Updates task completion status

## Status Updates

```json
{
  "workflow_status": {
    "current_phase": "design",
    "phases": {
      "requirements": {
        "status": "approved",
        "completed_at": "2024-01-15T10:30:00Z"
      },
      "design": {
        "status": "in_progress",
        "started_at": "2024-01-15T11:00:00Z"
      }
    }
  }
}
```

## Benefits

1. **Audit Trail** - Track when each phase was completed
2. **Workflow Validation** - Enable pre-tool-use hooks to validate phase order
3. **Progress Visibility** - Show current workflow status in sdd-status
4. **Automation** - Enable CI/CD integration based on spec status
