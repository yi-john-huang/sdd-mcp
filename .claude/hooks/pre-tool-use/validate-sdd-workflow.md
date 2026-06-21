---
name: validate-sdd-workflow
description: Validates that SDD workflow phases are followed in correct order
event: pre-tool-use
priority: 100
enabled: true
---

# Validate SDD Workflow Hook

This hook validates that the SDD workflow phases are being followed correctly before tool invocation.

## Trigger Conditions

Triggered before these tools are invoked:
- `sdd-design` (requires `sdd-requirements` to be completed first)
- `sdd-tasks` (requires `sdd-design` to be completed first)
- `sdd-implement` (requires `sdd-tasks` to be completed first)

## Validation Logic

```
IF tool == 'sdd-design' THEN
  CHECK that requirements.md exists and is approved
  CHECK that spec.json shows requirements phase completed

IF tool == 'sdd-tasks' THEN
  CHECK that design.md exists and is approved
  CHECK that spec.json shows design phase completed

IF tool == 'sdd-implement' THEN
  CHECK that tasks.md exists
  CHECK that spec.json shows tasks phase completed
```

## On Validation Failure

If validation fails:
1. Display warning message explaining which phase is missing
2. Suggest running the correct phase first
3. Allow override with explicit `--skip-validation` flag

## Example Warning

```
⚠️ SDD Workflow Violation

You're attempting to run 'sdd-design' but the requirements phase
has not been completed yet.

Please run 'sdd-requirements' first to generate the requirements
document, then have it reviewed and approved before proceeding.

To skip this check: sdd-design --skip-validation
```
