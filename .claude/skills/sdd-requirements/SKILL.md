---
name: sdd-requirements
description: Generate EARS-formatted requirements for SDD workflow. Use when starting a new feature specification, creating requirements documents, or defining acceptance criteria. Invoked via /sdd-requirements <feature-name>.
---

# SDD Requirements Generation

Generate comprehensive, EARS-formatted requirements documents that integrate with the SDD (Spec-Driven Development) workflow.

## Prerequisites

Before generating requirements:
1. Feature must be initialized with `sdd-init` MCP tool
2. Check current phase with `sdd-status` MCP tool
3. Review project steering documents in `.spec/steering/`

## Workflow

### Step 1: Gather Context

1. Use `sdd-status` MCP tool to verify feature exists and check current phase
2. Read project context from `.spec/steering/product.md` if available
3. Review the feature description from `.spec/specs/{feature}/spec.json`

### Step 2: Analyze Requirements

Identify and document:
- **Primary user goal**: What problem are we solving?
- **Target users**: Who will use this feature?
- **Core functionality**: What must the system do?
- **Success criteria**: How do we know it works?

### Step 3: Generate EARS-Formatted Requirements

Use the **EARS (Easy Approach to Requirements Syntax)** format for all requirements.

#### EARS Patterns

| Pattern | Syntax | Use When |
|---------|--------|----------|
| **Ubiquitous** | `The <system> SHALL <action>` | Always true requirement |
| **Event-Driven** | `WHEN <trigger> THEN the <system> SHALL <action>` | Response to event |
| **State-Driven** | `WHILE <state> THE <system> SHALL <action>` | During specific state |
| **Optional** | `WHERE <feature enabled> THE <system> SHALL <action>` | Configurable feature |
| **Unwanted Behavior** | `IF <condition> THEN the <system> SHALL <action>` | Exception handling |

#### Examples

```markdown
## FR-1: User Authentication
WHEN a user submits valid credentials
THEN the system SHALL authenticate the user and return a session token

## FR-2: Session Management
WHILE a user session is active
THE system SHALL maintain the session for up to 24 hours of inactivity

## NFR-1: Performance
The system SHALL respond to authentication requests within 200ms
```

### Step 4: Structure the Document

Generate requirements.md with this structure:

```markdown
# Requirements: {Feature Name}

## Overview
Brief description of the feature and its purpose.

## Functional Requirements

### FR-1: {Requirement Name}
**Objective:** As a {user type}, I want {goal}, so that {benefit}

**EARS Specification:**
WHEN {trigger}
THEN the system SHALL {action}

**Acceptance Criteria:**
1. {Specific, testable criterion}
2. {Specific, testable criterion}

### FR-2: {Next Requirement}
...

## Non-Functional Requirements

### NFR-1: Performance
{Performance requirements with specific metrics}

### NFR-2: Security
{Security requirements aligned with OWASP guidelines}

### NFR-3: Scalability
{Scalability requirements if applicable}

## Constraints
{Technical or business constraints}

## Assumptions
{Assumptions made during requirements gathering}
```

### Step 5: Validate and Save

After generating requirements:
1. Ensure all requirements are testable
2. Verify EARS format is correctly applied
3. Save to `.spec/specs/{feature}/requirements.md`
4. Use `sdd-approve` MCP tool to mark phase complete when ready

## MCP Tool Integration

This skill works with these MCP tools:

| Tool | When to Use |
|------|-------------|
| `sdd-status` | Check current workflow phase before starting |
| `sdd-validate-gap` | Validate requirements against existing codebase |
| `sdd-approve` | Mark requirements phase as approved |

## Quality Checklist

Before completing requirements:
- [ ] All requirements use EARS format
- [ ] Each requirement is independently testable
- [ ] Acceptance criteria are specific and measurable
- [ ] Security requirements align with OWASP Top 10
- [ ] Performance requirements have specific metrics
- [ ] Requirements are traceable to user stories
- [ ] No ambiguous terms (avoid "should", "may", "might")
- [ ] Each FR has clear acceptance criteria

## Steering Document References

Apply these steering documents during requirements generation:

| Document | Purpose | Key Application |
|----------|---------|-----------------|
| `.spec/steering/principles.md` | SOLID, DRY, KISS, YAGNI | Ensure requirements follow KISS (simple, unambiguous) and YAGNI (only what's needed now) |

**Key Principles for Requirements:**
- **KISS**: Keep requirements simple and unambiguous
- **YAGNI**: Only specify what's actually needed now
- **Single Responsibility**: Each requirement addresses one concern
