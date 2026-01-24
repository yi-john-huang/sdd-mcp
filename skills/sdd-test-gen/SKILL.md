---
name: sdd-test-gen
description: Generate comprehensive tests following TDD methodology. Creates unit tests, integration tests, and edge case coverage. Works with existing test frameworks in the project. Invoked via /sdd-test-gen [file-path or function-name].
---

# SDD Test Generation

Generate comprehensive tests following Test-Driven Development (TDD) methodology. Write tests that serve as living documentation and ensure code correctness.

## TDD Philosophy

> "Write a failing test before you write the code to make it pass."

Tests are not an afterthought—they're a design tool that:
1. **Document behavior** - Tests show how code is intended to be used
2. **Prevent regressions** - Catch bugs before they ship
3. **Enable refactoring** - Change with confidence
4. **Drive design** - Writing tests first leads to better interfaces

## The TDD Cycle

```
┌─────────────────────────────────────┐
│                                     │
│   ┌─────────┐   Write failing test  │
│   │   RED   │◄──────────────────────┤
│   └────┬────┘                       │
│        │                            │
│        ▼ Make it pass               │
│   ┌─────────┐                       │
│   │  GREEN  │                       │
│   └────┬────┘                       │
│        │                            │
│        ▼ Improve code               │
│   ┌─────────┐                       │
│   │REFACTOR │───────────────────────┘
│   └─────────┘
└─────────────────────────────────────┘
```

## Workflow

### Step 1: Identify Test Scope

```
/sdd-test-gen src/services/UserService.ts           # Generate tests for file
/sdd-test-gen UserService.createUser                # Generate for specific method
/sdd-test-gen src/services/ --integration           # Integration tests for module
```

### Step 2: Analyze the Code

Before generating tests:
1. Read the source file to understand its behavior
2. Check existing tests (if any) to avoid duplication
3. Review related requirements in `.spec/specs/`
4. Identify dependencies that need mocking

### Step 3: Test File Structure

Generate tests with this structure:

```typescript
import { UserService } from '../UserService';
import { UserRepository } from '../../repositories/UserRepository';
import { EmailService } from '../../services/EmailService';

// Mock dependencies
jest.mock('../../repositories/UserRepository');
jest.mock('../../services/EmailService');

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockEmailService: jest.Mocked<EmailService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepo = new UserRepository() as jest.Mocked<UserRepository>;
    mockEmailService = new EmailService() as jest.Mocked<EmailService>;
    userService = new UserService(mockUserRepo, mockEmailService);
  });

  describe('createUser', () => {
    it('should create a user with valid input', async () => {
      // Arrange
      const input = { email: 'test@example.com', name: 'Test User' };
      mockUserRepo.save.mockResolvedValue({ id: '1', ...input });

      // Act
      const result = await userService.createUser(input);

      // Assert
      expect(result.id).toBeDefined();
      expect(mockUserRepo.save).toHaveBeenCalledWith(expect.objectContaining(input));
    });

    it('should throw error when email already exists', async () => {
      // Arrange
      mockUserRepo.findByEmail.mockResolvedValue({ id: '1', email: 'test@example.com' });

      // Act & Assert
      await expect(userService.createUser({ email: 'test@example.com' }))
        .rejects.toThrow('Email already exists');
    });
  });
});
```

### Step 4: Test Categories to Generate

#### Unit Tests

Test individual functions in isolation:
- Mock all external dependencies
- Test one behavior per test
- Use descriptive test names

```typescript
describe('calculateTotal', () => {
  it('should sum all item prices', () => { ... });
  it('should apply discount when provided', () => { ... });
  it('should handle empty cart', () => { ... });
  it('should throw error for negative quantities', () => { ... });
});
```

#### Edge Case Tests

Always test:
- Null/undefined inputs
- Empty arrays/objects
- Boundary values (0, -1, MAX_INT)
- Invalid types
- Concurrent access (if applicable)

```typescript
describe('edge cases', () => {
  it('should handle null input gracefully', () => { ... });
  it('should handle empty array', () => { ... });
  it('should handle maximum allowed length', () => { ... });
  it('should reject invalid email format', () => { ... });
});
```

#### Error Handling Tests

Verify error paths:
```typescript
describe('error handling', () => {
  it('should throw ValidationError for invalid input', async () => {
    await expect(service.create({})).rejects.toThrow(ValidationError);
  });

  it('should propagate database errors', async () => {
    mockRepo.save.mockRejectedValue(new DatabaseError('Connection failed'));
    await expect(service.create(validInput)).rejects.toThrow(DatabaseError);
  });
});
```

#### Integration Tests (when requested)

Test component interactions:
```typescript
describe('UserService integration', () => {
  let app: Express;
  let db: Database;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = createApp({ database: db });
  });

  afterAll(async () => {
    await db.close();
  });

  it('should create user and send welcome email', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'Test' });

    expect(response.status).toBe(201);
    // Verify email was queued
    expect(await getEmailQueue()).toContainEqual(
      expect.objectContaining({ to: 'test@example.com' })
    );
  });
});
```

### Step 5: Test Naming Convention

Use the pattern: `should [expected behavior] when [condition]`

```typescript
// Good
it('should return empty array when no users match criteria', () => {});
it('should throw AuthError when token is expired', () => {});
it('should create user and return ID when input is valid', () => {});

// Bad
it('test createUser', () => {});
it('works correctly', () => {});
```

## Test Quality Checklist

For each generated test:
- [ ] Test name describes behavior, not implementation
- [ ] Arrange-Act-Assert pattern used
- [ ] Only one assertion concept per test
- [ ] Tests are independent (no shared state)
- [ ] Mocks are minimal (only external deps)
- [ ] Edge cases covered
- [ ] Error paths tested
- [ ] Async tests properly awaited

## Integration with SDD Workflow

When generating tests for a spec:
1. Read requirements from `.spec/specs/{feature}/requirements.md`
2. Map each acceptance criterion to test cases
3. Check design.md for expected interfaces
4. Reference tasks.md for implementation details

## Test Generation Prompt

When running `/sdd-test-gen`:

```markdown
## Test Generation Summary

### Target: {file/function}

### Tests Generated:
- **Unit Tests**: {count}
- **Edge Cases**: {count}
- **Error Handling**: {count}
- **Integration**: {count} (if requested)

### Coverage Targets:
- Statements: 80%+
- Branches: 75%+
- Functions: 90%+
- Lines: 80%+

### Files Created:
- `src/__tests__/unit/{file}.test.ts`
- `src/__tests__/integration/{file}.integration.test.ts` (if requested)
```

## Framework Detection

Automatically detect and use project's test framework:
- **Jest** (default for TypeScript/JavaScript)
- **Vitest** (if vite.config.ts present)
- **Mocha/Chai** (if mocha in dependencies)
- **Pytest** (for Python projects)

## Example Output

For input: `/sdd-test-gen src/services/AuthService.ts`

```typescript
import { AuthService } from '../AuthService';
import { TokenService } from '../../utils/TokenService';
import { UserRepository } from '../../repositories/UserRepository';

jest.mock('../../utils/TokenService');
jest.mock('../../repositories/UserRepository');

describe('AuthService', () => {
  // ... setup ...

  describe('login', () => {
    it('should return token when credentials are valid', async () => { ... });
    it('should throw AuthError when user not found', async () => { ... });
    it('should throw AuthError when password is incorrect', async () => { ... });
    it('should increment failed login count on failure', async () => { ... });
    it('should lock account after 5 failed attempts', async () => { ... });
  });

  describe('logout', () => {
    it('should invalidate token when called', async () => { ... });
    it('should handle already-logged-out user gracefully', async () => { ... });
  });

  describe('refreshToken', () => {
    it('should return new token when refresh token is valid', async () => { ... });
    it('should throw AuthError when refresh token is expired', async () => { ... });
  });
});
```
