---
name: sdd-workflow
description: Spec-Driven Development process rules
priority: 85
alwaysActive: true
---

# SDD Workflow Rules

## Spec-Driven Development Process

### Phase Order
Follow the SDD phases in strict order:

1. **Initialize** (`sdd-init`)
   - Define feature name and description
   - Answer clarification questions
   - Create spec directory structure

2. **Requirements** (`sdd-requirements`)
   - Generate EARS-formatted requirements
   - Define acceptance criteria
   - Identify constraints and assumptions

3. **Design** (`sdd-design`)
   - Create technical design specifications
   - Define component architecture
   - Document interfaces and data flows

4. **Tasks** (`sdd-tasks`)
   - Break down into implementable tasks
   - Apply TDD methodology
   - Estimate complexity

5. **Implement** (`sdd-implement`)
   - Follow TDD (Red-Green-Refactor)
   - Reference steering documents
   - Update spec status

## EARS Requirements Format

Use Easy Approach to Requirements Syntax:

| Pattern | Template | Use Case |
|---------|----------|----------|
| Ubiquitous | The `<system>` SHALL `<action>` | Always true |
| Event-Driven | WHEN `<trigger>` THEN the `<system>` SHALL `<action>` | Response to event |
| State-Driven | WHILE `<state>` THE `<system>` SHALL `<action>` | During state |
| Optional | WHERE `<feature>` THE `<system>` SHALL `<action>` | Configurable |
| Unwanted | IF `<condition>` THEN the `<system>` SHALL `<action>` | Exception |

### Example
```markdown
## FR-1: User Authentication
WHEN a user submits valid credentials
THEN the system SHALL authenticate the user and return a session token

**Acceptance Criteria:**
1. Token expires after 24 hours of inactivity
2. Invalid credentials return 401 error
3. Rate limiting prevents brute force attempts
```

## Steering Documents

### Always Reference
- `.spec/steering/tdd-guideline.md` - TDD methodology
- `.spec/steering/principles.md` - SOLID, DRY, KISS, YAGNI
- `.spec/steering/linus-review.md` - Code review standards

### When to Reference
- Before writing any code, review relevant steering docs
- During code review, verify compliance
- When refactoring, ensure principles are maintained

## Approval Gates

### Requirements Approval
Before proceeding to design:
- [ ] All requirements use EARS format
- [ ] Each requirement is testable
- [ ] Acceptance criteria are specific
- [ ] Constraints are documented

### Design Approval
Before proceeding to tasks:
- [ ] Architecture diagram included
- [ ] Interfaces defined
- [ ] Dependencies identified
- [ ] Security considerations addressed

### Tasks Approval
Before proceeding to implementation:
- [ ] Tasks follow TDD structure
- [ ] Complexity estimated
- [ ] Dependencies mapped
- [ ] Steering doc references included

## Spec File Locations

```
.spec/
├── steering/          # Project-wide rules
│   ├── product.md
│   ├── tech.md
│   ├── structure.md
│   ├── tdd-guideline.md
│   ├── principles.md
│   └── linus-review.md
└── specs/             # Feature specifications
    └── {feature-name}/
        ├── spec.json
        ├── requirements.md
        ├── design.md
        └── tasks.md
```
