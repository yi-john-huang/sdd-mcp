---
name: sdd-implement
description: Implementation guidelines for SDD workflow. Use when implementing features, applying TDD, checking security, or ensuring code quality. Invoked via /sdd-implement <feature-name>.
---

# SDD Implementation Guidelines

Execute implementation following TDD methodology, SOLID principles, and security best practices.

## Prerequisites

Before implementing:
1. Tasks must be approved (use `sdd-status` to verify)
2. Review tasks in `.spec/specs/{feature}/tasks.md`
3. Understand the design in `.spec/specs/{feature}/design.md`

## Implementation Workflow

### Step 1: Load Context

1. Use `sdd-status` MCP tool to verify all phases approved
2. Read the tasks document for current implementation
3. Identify the next task to implement

### Step 2: Execute TDD Cycle

For each task:

```
┌─────────────────────────────────────────────────────────────┐
│  1. RED: Write Failing Test                                 │
│     - Define expected behavior                              │
│     - Run test, confirm it FAILS                           │
│                                                             │
│  2. GREEN: Write Minimal Code                               │
│     - Just enough to pass the test                         │
│     - No extra features                                     │
│     - Run test, confirm it PASSES                          │
│                                                             │
│  3. REFACTOR: Improve Code                                  │
│     - Clean up without changing behavior                    │
│     - Run tests, confirm still PASSING                     │
│                                                             │
│  REPEAT for each test case                                  │
└─────────────────────────────────────────────────────────────┘
```

### Step 3: Apply SOLID Principles

#### S - Single Responsibility Principle
```typescript
// GOOD: One class, one job
class UserValidator {
  validate(user: User): ValidationResult { ... }
}

class UserRepository {
  save(user: User): Promise<void> { ... }
}

// BAD: Class doing too much
class UserManager {
  validate(user: User) { ... }
  save(user: User) { ... }
  sendEmail(user: User) { ... }
  generateReport() { ... }
}
```

#### O - Open/Closed Principle
```typescript
// GOOD: Open for extension, closed for modification
interface PaymentProcessor {
  process(amount: number): Promise<Result>;
}

class StripeProcessor implements PaymentProcessor { ... }
class PayPalProcessor implements PaymentProcessor { ... }

// BAD: Modifying existing code for new payment types
class PaymentService {
  process(type: string, amount: number) {
    if (type === 'stripe') { ... }
    else if (type === 'paypal') { ... }
    // Adding new type requires modifying this class
  }
}
```

#### L - Liskov Substitution Principle
```typescript
// GOOD: Subtypes are substitutable
class Bird {
  move(): void { /* fly or walk */ }
}

class Sparrow extends Bird {
  move(): void { this.fly(); }
}

class Penguin extends Bird {
  move(): void { this.walk(); }
}

// BAD: Subtype breaks expected behavior
class Bird {
  fly(): void { ... }
}

class Penguin extends Bird {
  fly(): void { throw new Error("Can't fly!"); }
}
```

#### I - Interface Segregation Principle
```typescript
// GOOD: Specific interfaces
interface Readable {
  read(): Data;
}

interface Writable {
  write(data: Data): void;
}

class FileHandler implements Readable, Writable { ... }
class ReadOnlyFile implements Readable { ... }

// BAD: Fat interface forcing unnecessary implementation
interface FileOperations {
  read(): Data;
  write(data: Data): void;
  delete(): void;
  execute(): void;
}
```

#### D - Dependency Inversion Principle
```typescript
// GOOD: Depend on abstractions
interface IUserRepository {
  findById(id: string): Promise<User>;
}

class UserService {
  constructor(private repo: IUserRepository) {}
}

// BAD: Depend on concrete implementations
class UserService {
  private repo = new PostgresUserRepository();
}
```

### Step 4: Security Checklist (OWASP Top 10)

Before marking implementation complete, verify:

#### 1. Broken Access Control
- [ ] Enforce access control on every request
- [ ] Deny by default
- [ ] Validate user owns the resource

#### 2. Cryptographic Failures
- [ ] Use strong encryption (AES-256, RSA-2048+)
- [ ] Never store passwords in plain text (use bcrypt/argon2)
- [ ] Use HTTPS for all communications

#### 3. Injection
- [ ] Use parameterized queries for database
- [ ] Validate and sanitize all user inputs
- [ ] Escape output in templates

#### 4. Insecure Design
- [ ] Apply threat modeling
- [ ] Implement defense in depth
- [ ] Fail securely

#### 5. Security Misconfiguration
- [ ] Remove default credentials
- [ ] Disable unnecessary features
- [ ] Keep dependencies updated

#### 6. Vulnerable Components
- [ ] Use dependency audit tools (e.g., `npm audit`, `pip-audit`, `cargo audit`, `snyk`)
- [ ] Update vulnerable packages
- [ ] Remove unused dependencies

#### 7. Authentication Failures
- [ ] Implement proper session management
- [ ] Use MFA where appropriate
- [ ] Implement account lockout

#### 8. Software Integrity
- [ ] Verify package integrity
- [ ] Use lockfiles (e.g., `package-lock.json`, `Cargo.lock`, `poetry.lock`, `go.sum`)
- [ ] Sign commits if required

#### 9. Logging & Monitoring
- [ ] Log security events
- [ ] Don't log sensitive data
- [ ] Implement alerting

#### 10. SSRF (Server-Side Request Forgery)
- [ ] Validate and sanitize URLs
- [ ] Use allowlists for external calls
- [ ] Disable redirects or validate them

### Step 5: Code Quality Standards

#### Naming
```typescript
// GOOD
const userEmail = user.email;
function calculateTotalPrice(items: Item[]): number { ... }

// BAD
const e = user.email;
function calc(i: any): any { ... }
```

#### Comments
```typescript
// GOOD: Explain WHY, not WHAT
// Use retry because the external API has rate limits
const result = await retryWithBackoff(fetchData);

// BAD: Obvious comments
// Get the user
const user = getUser(id);
```

#### Error Handling
```typescript
// GOOD: Specific, informative errors
class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User with ID ${userId} not found`);
    this.name = 'UserNotFoundError';
  }
}

// BAD: Generic errors
throw new Error('Error');
```

### Step 6: Update Task Status

After implementing each task:
1. Mark task as complete in tasks.md
2. Verify test coverage >= 80%
3. Run `sdd-quality-check` MCP tool on new code

## MCP Tool Integration

| Tool | When to Use |
|------|-------------|
| `sdd-status` | Check all phases approved before implementing |
| `sdd-spec-impl` | Execute specific tasks with TDD |
| `sdd-quality-check` | Validate code quality after implementation |

## Definition of Done

- [ ] All acceptance criteria met
- [ ] All tests pass
- [ ] Code coverage >= 80%
- [ ] No lint/type errors
- [ ] Security checklist verified
- [ ] SOLID principles applied
- [ ] Code self-documenting or commented where needed

## Steering Document References

Apply these steering documents during implementation:

| Document | Purpose | Key Application |
|----------|---------|-----------------|
| `.spec/steering/tdd-guideline.md` | Test-Driven Development | Follow Red-Green-Refactor cycle for all code |
| `.spec/steering/principles.md` | SOLID, DRY, KISS, YAGNI | Apply SOLID principles, keep code simple and focused |
| `.spec/steering/owasp-top10-check.md` | Security checklist | Verify all OWASP Top 10 security requirements before completion |

**Critical Implementation Rules:**
1. **TDD First**: Never write production code without a failing test
2. **SOLID Always**: Apply all five principles (SRP, OCP, LSP, ISP, DIP)
3. **Security Required**: Complete OWASP checklist before marking done

## Common Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| **God Class** | Class does too much | Split by responsibility |
| **Feature Envy** | Method uses another class's data extensively | Move method to that class |
| **Primitive Obsession** | Using primitives for domain concepts | Create value objects |
| **Magic Numbers** | Unexplained numeric literals | Use named constants |
| **Deep Nesting** | Multiple levels of if/loops | Extract methods, early returns |
| **Long Methods** | Methods doing too much | Split into smaller methods |
