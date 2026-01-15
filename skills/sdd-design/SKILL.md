---
name: sdd-design
description: Create technical design specifications for SDD workflow. Use when designing architecture, defining components, or creating system design documents after requirements are approved. Invoked via /sdd-design <feature-name>.
---

# SDD Technical Design Generation

Generate comprehensive technical design documents that translate approved requirements into actionable architecture specifications.

## Prerequisites

Before generating design:
1. Requirements must be generated using `/sdd-requirements`
2. Requirements phase should be approved (use `sdd-approve requirements` MCP tool)
3. Review existing architecture in `.spec/steering/tech.md` and `.spec/steering/structure.md`

## Workflow

### Step 1: Verify Prerequisites

Use `sdd-status` MCP tool to verify:
- `requirements.generated: true`
- `requirements.approved: true` (recommended before design)

### Step 2: Review Requirements

1. Read `.spec/specs/{feature}/requirements.md`
2. Identify all functional requirements (FR-*)
3. Identify all non-functional requirements (NFR-*)
4. Note constraints and assumptions

### Step 3: Choose Architecture Pattern

Select appropriate patterns based on requirements:

| Pattern | Use When | Key Characteristics |
|---------|----------|---------------------|
| **Clean Architecture** | Domain-heavy apps | Layers: Domain → Use Cases → Interface → Infrastructure |
| **MVC/MVP** | Web applications | Model-View-Controller separation |
| **Microservices** | Distributed systems | Independent deployable services |
| **Event-Driven** | Async processing | Event producers and consumers |
| **Hexagonal** | Testable business logic | Ports and Adapters pattern |

### Step 4: Design Components

For each component, specify:

```markdown
## Component: {ComponentName}

**Type:** Service | Controller | Repository | Adapter | Provider

**Purpose:** {Single responsibility description}

**Responsibilities:**
- {Responsibility 1}
- {Responsibility 2}

**Interface:**
```typescript
interface I{ComponentName} {
  methodName(input: InputType): Promise<OutputType>;
}
```

**Dependencies:**
- {Dependency 1 via interface}
- {Dependency 2 via interface}

**Error Handling:**
- {Error scenario 1}: {How to handle}
```

### Step 5: Define Data Models

```markdown
## Data Models

### Model: {EntityName}

**Purpose:** {What this entity represents}

| Property | Type | Required | Description | Validation |
|----------|------|----------|-------------|------------|
| id | string | Yes | Unique identifier | UUID format |
| name | string | Yes | Display name | 1-100 chars |
| createdAt | Date | Yes | Creation timestamp | ISO 8601 |

**Relationships:**
- Has many: {RelatedEntity} (one-to-many)
- Belongs to: {ParentEntity} (many-to-one)

**Invariants:**
- {Business rule 1}
- {Business rule 2}
```

### Step 6: Specify Interfaces

```markdown
## API Interfaces

### REST Endpoints

| Method | Path | Description | Request | Response | Auth |
|--------|------|-------------|---------|----------|------|
| POST | /api/v1/resource | Create resource | CreateDTO | Resource | Bearer |
| GET | /api/v1/resource/:id | Get by ID | - | Resource | Bearer |

### Internal Service Interfaces

Following Interface Segregation Principle:

```typescript
// Read operations
interface IResourceReader {
  getById(id: string): Promise<Resource>;
  list(filter: Filter): Promise<Resource[]>;
}

// Write operations
interface IResourceWriter {
  create(data: CreateDTO): Promise<Resource>;
  update(id: string, data: UpdateDTO): Promise<Resource>;
  delete(id: string): Promise<void>;
}
```
```

### Step 7: Document Error Handling

```markdown
## Error Handling Strategy

### Error Categories

| Category | HTTP Status | Retry | Log Level |
|----------|-------------|-------|-----------|
| Validation | 400 | No | WARN |
| Not Found | 404 | No | INFO |
| Conflict | 409 | No | WARN |
| Rate Limit | 429 | Yes (backoff) | WARN |
| Internal | 500 | Yes (limited) | ERROR |

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [{ "field": "email", "issue": "Invalid format" }],
    "requestId": "uuid-for-tracing"
  }
}
```
```

### Step 8: Apply Linus-Style Quality Review

Before finalizing, validate against these principles:

#### 1. Taste - Is it elegant?
- Does the design feel natural and intuitive?
- Are there unnecessary complications?

#### 2. Complexity - Is it simple?
- Can any component be simplified?
- Are there too many abstractions?

#### 3. Special Cases - Are edge cases handled?
- What happens at boundaries?
- How does it fail gracefully?

#### 4. Data Structures - Are they optimal?
- Is the right data structure chosen?
- Does data flow make sense?

#### 5. Code Organization - Is it maintainable?
- Can new developers understand it?
- Is it easy to modify?

### Step 9: Save and Validate

1. Save design to `.spec/specs/{feature}/design.md`
2. Use `sdd-validate-design` MCP tool for GO/NO-GO review
3. If GO, use `sdd-approve design` MCP tool

## Design Document Template

```markdown
# Design: {Feature Name}

## Overview
{Brief summary of the design approach}

## Architecture Pattern
{Selected pattern and rationale}

## Component Diagram
```
[Component A] ──> [Component B]
       │
       └──> [Component C]
```

## Components

### {Component 1}
{Component details as described above}

## Data Models

### {Entity 1}
{Model details as described above}

## Interfaces

### External APIs
{API specifications}

### Internal Interfaces
{Service interfaces}

## Error Handling
{Error strategy}

## Security Considerations
- Authentication: {approach}
- Authorization: {approach}
- Data protection: {approach}

## Testing Strategy
- Unit tests: {coverage target}
- Integration tests: {scope}
- E2E tests: {critical paths}

## Dependencies
- External: {list}
- Internal: {list}
```

## MCP Tool Integration

| Tool | When to Use |
|------|-------------|
| `sdd-status` | Verify requirements phase complete |
| `sdd-validate-design` | Perform GO/NO-GO review |
| `sdd-approve` | Mark design phase as approved |

## Steering Document References

Apply these steering documents during design:

| Document | Purpose | Key Application |
|----------|---------|-----------------|
| `.spec/steering/principles.md` | SOLID, DRY, KISS, YAGNI | Apply SOLID principles to component design, ensure interfaces follow ISP and DIP |
| `.spec/steering/linus-review.md` | Code quality, data structures | Focus on data structures first, eliminate special cases, ensure backward compatibility |

**Key Linus Principles for Design:**
1. **Data Structures First**: "Bad programmers worry about the code. Good programmers worry about data structures."
2. **Eliminate Special Cases**: "Good code has no special cases"
3. **Simplicity**: "If implementation needs more than 3 levels of indentation, redesign it"
4. **Never Break Userspace**: Ensure backward compatibility

## Quality Checklist

- [ ] All FR-* requirements have corresponding components
- [ ] All NFR-* requirements have technical solutions
- [ ] SOLID principles are followed
- [ ] Interfaces are well-defined (ISP)
- [ ] Dependencies flow inward (DIP)
- [ ] Data models are complete with invariants
- [ ] Error handling strategy is comprehensive
- [ ] Security considerations are addressed
- [ ] Testing approach is specified
- [ ] Linus-style review passed
