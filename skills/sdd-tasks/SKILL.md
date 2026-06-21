---
name: sdd-tasks
description: Generate TDD task breakdown for SDD workflow. Use when breaking down design into implementable tasks with test-first approach. Invoked via /sdd-tasks <feature-name>.
---

# SDD Task Breakdown Generation

Generate comprehensive TDD-based task breakdowns that translate approved designs into implementable work items.

## Prerequisites

Before generating tasks:
1. Design must be generated using `/sdd-design`
2. Design phase should be approved (use `sdd-approve design` MCP tool)
3. Review the design document in `.spec/specs/{feature}/design.md`

## Workflow

### Step 1: Verify Prerequisites

Use `sdd-status` MCP tool to verify:
- `design.generated: true`
- `design.approved: true` (recommended before tasks)

### Step 2: Review Design

1. Read `.spec/specs/{feature}/design.md`
2. Identify all components to implement
3. Note interfaces and data models
4. Understand dependencies between components

### Step 3: Apply TDD Workflow

For each task, follow the Red-Green-Refactor cycle:

```
┌─────────────────────────────────────────────────────────────┐
│                    TDD CYCLE                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. RED    ──────>  Write failing test first              │
│                      (Test describes expected behavior)     │
│                                                             │
│   2. GREEN  ──────>  Write minimal code to pass            │
│                      (Just enough to make test green)       │
│                                                             │
│   3. REFACTOR ────>  Clean up, maintain tests passing      │
│                      (Improve design without breaking)      │
│                                                             │
│   ─────────────────────────────────────────────────────    │
│                      REPEAT                                 │
└─────────────────────────────────────────────────────────────┘
```

### Step 4: Choose Test Case Review Checkpoint

Ask the user whether they want to review TDD test cases before implementation:

- If yes, enable the checkpoint when generating tasks by setting `reviewTestCases: true` where the MCP tool supports it, or record the choice in `spec.json` under `workflow_options.review_test_cases`.
- Generate a concise **Test Case Review Checklist** in `tasks.md` listing the behavior, edge, and error scenarios that need approval.
- Before approving tasks, the user or agent should run `sdd-review-test-cases` after reviewing the test cases.

Keep this checkpoint optional. If the user declines, continue with normal task approval.

### Step 5: Apply Test Pyramid

Structure tests following the 70/20/10 ratio:

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E╲         10% - Critical user journeys
                 ╱──────╲
                ╱        ╲
               ╱Integration╲    20% - Component interactions
              ╱────────────╲
             ╱              ╲
            ╱   Unit Tests   ╲  70% - Individual functions
           ╱──────────────────╲
```

| Level | Coverage | Scope | Speed |
|-------|----------|-------|-------|
| **Unit** | 70% | Single function/class | Fast (ms) |
| **Integration** | 20% | Component interactions | Medium (s) |
| **E2E** | 10% | Full user journeys | Slow (min) |

### Step 6: Generate Task Breakdown

Structure tasks hierarchically:

```markdown
# Tasks: {Feature Name}

## Overview
{Summary of implementation approach}

## Task Groups

### 1. {Component/Layer Name}

#### 1.1 {Task Name}
**Type:** Unit | Integration | E2E
**Estimated Effort:** S | M | L | XL
**Dependencies:** {Task IDs}

**TDD Steps:**
1. RED: Write test for {specific behavior}
   ```typescript
   describe('{Component}', () => {
     it('should {expected behavior}', () => {
       // Arrange
       // Act
       // Assert
     });
   });
   ```
2. GREEN: Implement {minimal solution}
3. REFACTOR: {Specific improvements}

**Acceptance Criteria:**
- [ ] Test passes
- [ ] Code coverage >= 80%
- [ ] No lint errors

#### 1.2 {Next Task}
...

### 2. {Next Component}
...

## Implementation Order

```
[1.1] ──> [1.2] ──> [2.1]
              │
              └──> [1.3] ──> [2.2]
```

## Definition of Done
- [ ] All tests pass
- [ ] Code coverage >= 80%
- [ ] No lint/type errors
- [ ] TDD test cases reviewed (if checkpoint enabled)
- [ ] Code reviewed
- [ ] Documentation updated
```

### Step 7: Task Sizing Guidelines

| Size | Description | Test Count | Time |
|------|-------------|------------|------|
| **S** | Single function, 1-2 tests | 1-2 | < 1 hour |
| **M** | Multiple functions, 3-5 tests | 3-5 | 1-4 hours |
| **L** | Component with integration | 5-10 | 4-8 hours |
| **XL** | Complex component, many edge cases | 10+ | 1-2 days |

### Step 8: Test-First Task Template

For each implementation task:

```markdown
#### Task {X.Y}: {Task Name}

**Component:** {ComponentName}
**Type:** Unit Test → Implementation

**Test Scenarios:**
1. Happy path: {Expected behavior when inputs are valid}
2. Edge case: {Boundary conditions}
3. Error case: {Invalid inputs, failures}

**Test Code (RED):**
```typescript
import { {Component} } from './{component}';

describe('{Component}', () => {
  describe('{method}', () => {
    it('should {happy path behavior}', async () => {
      // Arrange
      const input = { /* valid input */ };

      // Act
      const result = await component.method(input);

      // Assert
      expect(result).toEqual({ /* expected */ });
    });

    it('should throw when {error condition}', async () => {
      // Arrange
      const invalidInput = { /* invalid */ };

      // Act & Assert
      await expect(component.method(invalidInput))
        .rejects.toThrow('{ErrorType}');
    });
  });
});
```

**Implementation (GREEN):**
{Brief description of minimal implementation}

**Refactor:**
- Extract {helper function} if needed
- Apply {specific pattern}
```

### Step 9: Save and Execute

1. Save tasks to `.spec/specs/{feature}/tasks.md`
2. If test-case review is enabled, review the Test Case Review Checklist and run `sdd-review-test-cases`
3. Use `sdd-approve tasks` MCP tool to mark phase complete
4. Use `sdd-spec-impl` MCP tool to execute tasks with TDD

## MCP Tool Integration

| Tool | When to Use |
|------|-------------|
| `sdd-status` | Verify design phase complete |
| `sdd-review-test-cases` | Mark optional TDD test-case review complete |
| `sdd-approve` | Mark tasks phase as approved |
| `sdd-spec-impl` | Execute tasks using TDD methodology |
| `sdd-quality-check` | Validate code quality during implementation |

## Quality Checklist

- [ ] All design components have corresponding tasks
- [ ] Tasks follow TDD (test first)
- [ ] Test pyramid ratio maintained (70/20/10)
- [ ] Dependencies between tasks are clear
- [ ] Each task has specific acceptance criteria
- [ ] Tasks are sized appropriately (avoid XL when possible)
- [ ] Implementation order respects dependencies
- [ ] Definition of Done is clear

## Steering Document References

Apply these steering documents during task breakdown:

| Document | Purpose | Key Application |
|----------|---------|-----------------|
| `.spec/steering/tdd-guideline.md` | Test-Driven Development | Structure all tasks using Red-Green-Refactor cycle, follow test pyramid (70/20/10) |

**Key TDD Principles for Tasks:**
1. **RED**: Every task starts with writing a failing test
2. **GREEN**: Implement minimal code to pass the test
3. **REFACTOR**: Clean up while keeping tests green
4. **Test Pyramid**: 70% unit, 20% integration, 10% E2E

## Common Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| **Test After** | Missing edge cases | Always write test first |
| **Ice Cream Cone** | Too many E2E tests | Follow pyramid (70/20/10) |
| **Big Tasks** | Hard to track progress | Break into S/M sizes |
| **No Dependencies** | Blocked work | Map dependencies explicitly |
| **Vague Criteria** | Unclear completion | Specific, measurable criteria |
