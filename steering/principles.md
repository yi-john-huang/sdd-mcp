# Core Coding Principles and Patterns

## Overview

This document defines the fundamental software engineering principles that MUST be followed in all code development. These principles ensure code quality, maintainability, scalability, and team collaboration.

**Golden Rule**: Always ask "Does this code follow SOLID, DRY, KISS, YAGNI, Separation of Concerns, and Modularity?" before committing.

---

## SOLID Principles (Object-Oriented Design)

### S - Single Responsibility Principle (SRP)

**Definition**: A class/module should have one, and only one, reason to change. Each component should do one thing well.

**✅ Good Example**:
```typescript
// Good: Separate responsibilities
class UserRepository {
  save(user: User): Promise<void> { /* DB logic */ }
  findById(id: string): Promise<User> { /* DB logic */ }
}

class UserValidator {
  validate(user: User): ValidationResult { /* Validation logic */ }
}

class EmailService {
  sendWelcomeEmail(user: User): Promise<void> { /* Email logic */ }
}
```

**❌ Bad Example**:
```typescript
// Bad: Multiple responsibilities in one class
class UserManager {
  save(user: User) { /* DB logic */ }
  validate(user: User) { /* Validation */ }
  sendEmail(user: User) { /* Email */ }
  generateReport(user: User) { /* Reporting */ }
}
```

**Application**:
- Functions should do ONE thing
- Classes should have ONE reason to change
- Modules should have ONE clear purpose

---

### O - Open/Closed Principle (OCP)

**Definition**: Software entities should be open for extension, but closed for modification.

**✅ Good Example**:
```typescript
// Good: Use interfaces/abstractions for extension
interface PaymentProcessor {
  process(amount: number): Promise<void>;
}

class CreditCardProcessor implements PaymentProcessor {
  process(amount: number) { /* Credit card logic */ }
}

class PayPalProcessor implements PaymentProcessor {
  process(amount: number) { /* PayPal logic */ }
}

// Adding new payment method doesn't modify existing code
class CryptoProcessor implements PaymentProcessor {
  process(amount: number) { /* Crypto logic */ }
}
```

**❌ Bad Example**:
```typescript
// Bad: Modifying existing code to add features
class PaymentProcessor {
  process(amount: number, type: 'card' | 'paypal' | 'crypto') {
    if (type === 'card') { /* Card logic */ }
    else if (type === 'paypal') { /* PayPal logic */ }
    else if (type === 'crypto') { /* Crypto logic */ } // Modified existing code
  }
}
```

**Application**:
- Use interfaces/abstract classes
- Favor composition over inheritance
- Use dependency injection

---

### L - Liskov Substitution Principle (LSP)

**Definition**: Derived classes must be substitutable for their base classes without altering correctness.

**✅ Good Example**:
```typescript
// Good: Subclass maintains expected behavior
class Rectangle {
  constructor(protected width: number, protected height: number) {}

  getArea(): number {
    return this.width * this.height;
  }
}

class Square extends Rectangle {
  constructor(size: number) {
    super(size, size);
  }

  getArea(): number {
    return super.getArea(); // Maintains expected behavior
  }
}
```

**❌ Bad Example**:
```typescript
// Bad: Subclass violates parent contract
class Rectangle {
  setWidth(w: number) { this.width = w; }
  setHeight(h: number) { this.height = h; }
}

class Square extends Rectangle {
  setWidth(w: number) {
    this.width = w;
    this.height = w; // Violates rectangle behavior!
  }
}
```

**Application**:
- Subclasses should honor parent contracts
- Don't surprise callers with unexpected behavior
- Use composition when inheritance doesn't fit

---

### I - Interface Segregation Principle (ISP)

**Definition**: No client should be forced to depend on methods it doesn't use.

**✅ Good Example**:
```typescript
// Good: Small, focused interfaces
interface Readable {
  read(): string;
}

interface Writable {
  write(data: string): void;
}

class File implements Readable, Writable {
  read() { return "data"; }
  write(data: string) { /* write */ }
}

class ReadOnlyFile implements Readable {
  read() { return "data"; }
  // Not forced to implement write()
}
```

**❌ Bad Example**:
```typescript
// Bad: Bloated interface
interface FileOperations {
  read(): string;
  write(data: string): void;
  delete(): void;
  compress(): void;
  encrypt(): void;
}

class ReadOnlyFile implements FileOperations {
  read() { return "data"; }
  write() { throw new Error("Not supported"); } // Forced to implement!
  delete() { throw new Error("Not supported"); }
  compress() { throw new Error("Not supported"); }
  encrypt() { throw new Error("Not supported"); }
}
```

**Application**:
- Keep interfaces small and focused
- Split large interfaces into smaller ones
- Use role interfaces

---

### D - Dependency Inversion Principle (DIP)

**Definition**: High-level modules should not depend on low-level modules. Both should depend on abstractions.

**✅ Good Example**:
```typescript
// Good: Depend on abstractions
interface Logger {
  log(message: string): void;
}

class UserService {
  constructor(private logger: Logger) {} // Depends on abstraction

  createUser(user: User) {
    this.logger.log(`Creating user: ${user.name}`);
    // ...
  }
}

// Can inject any logger implementation
class ConsoleLogger implements Logger {
  log(message: string) { console.log(message); }
}

class FileLogger implements Logger {
  log(message: string) { /* write to file */ }
}
```

**❌ Bad Example**:
```typescript
// Bad: Direct dependency on concrete class
class UserService {
  private logger = new ConsoleLogger(); // Tightly coupled!

  createUser(user: User) {
    this.logger.log(`Creating user: ${user.name}`);
  }
}
```

**Application**:
- Use dependency injection
- Program to interfaces, not implementations
- Invert control flow

---

## DRY (Don't Repeat Yourself)

**Definition**: Every piece of knowledge must have a single, unambiguous, authoritative representation within a system.

**✅ Good Example**:
```typescript
// Good: Extract common logic
function calculateDiscount(price: number, discountPercent: number): number {
  return price * (1 - discountPercent / 100);
}

const regularPrice = calculateDiscount(100, 10);
const premiumPrice = calculateDiscount(200, 15);
const vipPrice = calculateDiscount(300, 20);
```

**❌ Bad Example**:
```typescript
// Bad: Repeated logic
const regularPrice = 100 * (1 - 10 / 100);
const premiumPrice = 200 * (1 - 15 / 100);
const vipPrice = 300 * (1 - 20 / 100);
```

**When to Break DRY**:
- **Accidental Duplication**: Similar code, different concerns
- **Premature Abstraction**: Wait until you have 3+ instances
- **Different Change Reasons**: Code that looks similar but changes for different business reasons

**Application**:
- Extract common functions/classes
- Use inheritance/composition for shared behavior
- Apply at data level (single source of truth)

---

## KISS (Keep It Simple, Stupid)

**Definition**: Simplicity should be a key goal in design. Avoid unnecessary complexity.

**✅ Good Example**:
```typescript
// Good: Simple and clear
function isEven(num: number): boolean {
  return num % 2 === 0;
}
```

**❌ Bad Example**:
```typescript
// Bad: Overly complex
function isEven(num: number): boolean {
  return ((num / 2) === Math.floor(num / 2)) &&
         (parseInt(num.toString()) % 2 === 0) &&
         ((num & 1) === 0);
}
```

**Guidelines**:
- Write code that's easy to understand
- Avoid clever tricks that sacrifice readability
- Break complex functions into smaller, simple ones
- Use clear naming over comments

**Application**:
- Prefer straightforward solutions
- Avoid premature optimization
- Refactor complex code into simple pieces

---

## YAGNI (You Aren't Gonna Need It)

**Definition**: Don't implement functionality until it's actually needed. Avoid speculative features.

**✅ Good Example**:
```typescript
// Good: Implement only what's needed now
class User {
  constructor(
    public id: string,
    public email: string,
    public name: string
  ) {}
}
```

**❌ Bad Example**:
```typescript
// Bad: Anticipating future needs
class User {
  constructor(
    public id: string,
    public email: string,
    public name: string,
    public secondaryEmail?: string,     // Not needed yet
    public phoneNumbers?: string[],     // Not needed yet
    public socialProfiles?: object[],   // Not needed yet
    public preferences?: UserPrefs,     // Not needed yet
    public metadata?: Record<string, any> // Not needed yet
  ) {}
}
```

**Guidelines**:
- Implement features only when required
- Don't add "might need" functionality
- Refactor when new requirements come
- Focus on current user stories

**Application**:
- Stick to requirements
- Avoid gold-plating
- Iterate based on real needs

---

## Separation of Concerns (SoC)

**Definition**: Separate a system into distinct sections, each addressing a separate concern.

**✅ Good Example**:
```typescript
// Good: Layered architecture
// Presentation Layer
class UserController {
  createUser(req, res) {
    const user = this.userService.create(req.body);
    res.json(user);
  }
}

// Business Logic Layer
class UserService {
  create(data: UserData): User {
    this.validate(data);
    return this.repository.save(data);
  }
}

// Data Access Layer
class UserRepository {
  save(data: UserData): User {
    return db.users.insert(data);
  }
}
```

**❌ Bad Example**:
```typescript
// Bad: Mixed concerns
class UserController {
  createUser(req, res) {
    // Validation (business logic)
    if (!req.body.email) throw new Error('Email required');

    // Database access (data layer)
    const user = db.users.insert(req.body);

    // Email sending (external service)
    emailService.send(user.email, 'Welcome!');

    // Response (presentation)
    res.json(user);
  }
}
```

**Common Separations**:
- **Presentation** (UI, API) ↔ **Business Logic** ↔ **Data Access**
- **Domain Model** ↔ **Infrastructure**
- **Configuration** ↔ **Implementation**

**Application**:
- Use layered architecture
- Keep business logic independent of frameworks
- Separate I/O from computation

---

## Modularity

**Definition**: Design systems as a collection of independent, interchangeable modules with well-defined interfaces.

**Principles**:
- **High Cohesion**: Elements within a module are strongly related
- **Low Coupling**: Modules have minimal dependencies on each other
- **Encapsulation**: Hide internal details, expose only necessary interfaces

**✅ Good Example**:
```typescript
// Good: Modular design
// auth/index.ts (Authentication Module)
export interface AuthService {
  login(email: string, password: string): Promise<Token>;
  logout(token: string): Promise<void>;
}

export class JWTAuthService implements AuthService {
  login(email, password) { /* JWT logic */ }
  logout(token) { /* JWT logout */ }
}

// payment/index.ts (Payment Module)
export interface PaymentService {
  charge(amount: number): Promise<Receipt>;
}

export class StripePaymentService implements PaymentService {
  charge(amount) { /* Stripe logic */ }
}

// Each module is independent, replaceable, testable
```

**❌ Bad Example**:
```typescript
// Bad: Tightly coupled, non-modular
class Application {
  doEverything() {
    // Auth logic mixed in
    const user = db.users.find(email);
    if (bcrypt.compare(password, user.hash)) {
      // Payment logic mixed in
      const charge = stripe.charges.create({amount: 100});
      // Email logic mixed in
      sendgrid.send({to: user.email, body: 'Thanks!'});
      // Logging mixed in
      winston.log('Charged user');
    }
  }
}
```

**Module Design Guidelines**:
- One module = one responsibility
- Minimal cross-module dependencies
- Clear public interfaces
- Hide implementation details

**Application**:
- Organize code by feature/domain, not by type
- Use dependency injection for inter-module communication
- Create facade interfaces for complex modules

---

## Integration of Principles

### How Principles Work Together

**Example: User Registration Feature**

```typescript
// SOLID + SoC + Modularity
interface UserRepository {              // DIP: Depend on abstraction
  save(user: User): Promise<User>;      // ISP: Focused interface
}

interface EmailService {                // ISP: Separate interface
  send(to: string, subject: string, body: string): Promise<void>;
}

class UserRegistrationService {         // SRP: Single responsibility
  constructor(
    private userRepo: UserRepository,   // DIP: Inject dependencies
    private emailService: EmailService
  ) {}

  async register(data: UserData): Promise<User> {  // KISS: Simple method
    // YAGNI: Only what's needed for registration
    const user = this.validate(data);   // SoC: Separate validation
    const saved = await this.userRepo.save(user);
    await this.emailService.send(saved.email, 'Welcome', 'Thanks for registering!');
    return saved;
  }

  private validate(data: UserData): User {  // DRY: Reusable validation
    if (!data.email || !data.password) {
      throw new ValidationError('Email and password required');
    }
    return new User(data);
  }
}
```

**Principles Applied**:
- ✅ **SRP**: UserRegistrationService only handles registration
- ✅ **OCP**: Can extend with new validators without modifying
- ✅ **DIP**: Depends on interfaces, not concrete implementations
- ✅ **ISP**: Small, focused interfaces
- ✅ **SoC**: Validation, persistence, and email are separated
- ✅ **Modularity**: Can swap UserRepository or EmailService implementations
- ✅ **KISS**: Clear, simple logic
- ✅ **YAGNI**: No speculative features
- ✅ **DRY**: Validation extracted to private method

---

## Code Review Checklist

Use this checklist when reviewing code:

### SOLID
- [ ] Does each class/module have a single responsibility?
- [ ] Can I extend functionality without modifying existing code?
- [ ] Are abstractions used instead of concrete implementations?
- [ ] Are interfaces small and focused?
- [ ] Do dependencies point toward abstractions?

### DRY
- [ ] Is there any duplicated logic that should be extracted?
- [ ] Is duplication intentional (different concerns)?
- [ ] Are magic numbers/strings extracted to constants?

### KISS
- [ ] Is the solution as simple as possible?
- [ ] Can complex logic be broken into simpler pieces?
- [ ] Are variable/function names clear without comments?

### YAGNI
- [ ] Is every feature actually needed now?
- [ ] Are there "future-proofing" additions that can be removed?
- [ ] Does the code solve current requirements without speculation?

### Separation of Concerns
- [ ] Are different concerns (UI, business logic, data) separated?
- [ ] Is business logic independent of frameworks?
- [ ] Are responsibilities clearly divided?

### Modularity
- [ ] Are modules cohesive (related functionality together)?
- [ ] Are modules loosely coupled (minimal dependencies)?
- [ ] Are implementation details hidden?
- [ ] Are public interfaces clear and minimal?

---

## Common Anti-Patterns to Avoid

| Anti-Pattern | Violates | Fix |
|--------------|----------|-----|
| God Object/Class | SRP, SoC | Split into focused classes |
| Copy-Paste Programming | DRY | Extract common logic |
| Premature Optimization | KISS, YAGNI | Optimize when needed |
| Big Ball of Mud | All principles | Refactor with clear architecture |
| Shotgun Surgery | OCP, Modularity | Centralize related changes |
| Feature Envy | SRP, SoC | Move behavior to appropriate class |
| Long Parameter List | KISS, ISP | Use parameter objects |
| Magic Numbers | DRY | Extract to named constants |

---

## Language-Specific Guidance

### TypeScript/JavaScript
- Use interfaces for contracts (ISP, DIP)
- Favor composition with functions (OCP)
- Use modules for separation (SoC, Modularity)
- Apply principles to React components (SRP, DRY)

### Java
- Abstract classes and interfaces for SOLID
- Annotations for dependency injection (DIP)
- Packages for modularity
- Design patterns (Strategy, Factory) for OCP

### Python
- Duck typing supports ISP naturally
- Modules and packages for SoC
- Decorators for cross-cutting concerns
- ABC (Abstract Base Classes) for interfaces

### Go
- Interfaces for DIP and ISP
- Packages for modularity
- Composition over inheritance
- Simple, explicit code (KISS)

---

## References and Further Reading

- **SOLID**: Robert C. Martin (Uncle Bob) - "Clean Architecture"
- **DRY**: Andy Hunt & Dave Thomas - "The Pragmatic Programmer"
- **KISS**: Kelly Johnson - Lockheed Skunk Works
- **YAGNI**: Extreme Programming (XP) practices
- **Separation of Concerns**: Edsger W. Dijkstra
- **Modularity**: David Parnas - "On the Criteria to be Used in Decomposing Systems into Modules"

---

**Remember**: These principles are guidelines, not absolute rules. Use judgment to apply them appropriately for your context. When principles conflict, prioritize based on your project's specific needs.
