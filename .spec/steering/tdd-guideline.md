# Test-Driven Development (TDD) Guidelines

## Overview

All new features and specifications MUST follow Test-Driven Development (TDD) methodology. This ensures code quality, maintainability, and adherence to requirements from the start.

## TDD Cycle: Red → Green → Refactor

### 1. RED Phase: Write Failing Tests First
**Goal**: Define expected behavior through tests before writing any implementation code.

**Process**:
1. Read and understand the requirement
2. Write a test that describes the expected behavior
3. Run the test and confirm it fails (RED)
4. Commit: `test: add failing test for [feature]`

**Example**:
```typescript
// ❌ Test fails because implementation doesn't exist yet
describe('UserService', () => {
  it('should create user with valid email', async () => {
    const result = await userService.create({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });
});
```

**Test Requirements**:
- Test MUST fail initially (if it passes, you're not testing new functionality)
- Test MUST be specific and focused on ONE behavior
- Test name MUST clearly describe the expected behavior
- Test MUST use realistic test data

### 2. GREEN Phase: Write Minimal Code to Pass
**Goal**: Write the simplest code possible to make the test pass.

**Process**:
1. Write only enough code to make the failing test pass
2. Avoid premature optimization or extra features
3. Run tests and confirm they pass (GREEN)
4. Commit: `feat: implement [feature] to pass tests`

**Example**:
```typescript
// ✅ Minimal implementation to make test pass
class UserService {
  async create(data: { email: string }) {
    if (!data.email.includes('@')) {
      return { success: false, error: 'Invalid email' };
    }
    return { success: true, user: { email: data.email } };
  }
}
```

**Implementation Requirements**:
- Code MUST make all tests pass
- Code SHOULD be minimal (no over-engineering)
- Code MUST be understandable and clear
- Add more tests if edge cases are discovered

### 3. REFACTOR Phase: Improve Code Quality
**Goal**: Improve code structure, readability, and performance while keeping tests green.

**Process**:
1. Review code for duplication, complexity, or unclear logic
2. Refactor while keeping tests passing
3. Run tests after each refactor to ensure nothing breaks
4. Commit: `refactor: improve [component] structure`

**Example**:
```typescript
// ✅ Refactored for better structure
class UserService {
  async create(data: UserInput): Promise<Result<User>> {
    const validation = this.validateEmail(data.email);
    if (!validation.valid) {
      return Result.failure(validation.error);
    }

    const user = await this.repository.save(data);
    return Result.success(user);
  }

  private validateEmail(email: string): ValidationResult {
    return EmailValidator.validate(email);
  }
}
```

**Refactoring Checklist**:
- [ ] Remove code duplication
- [ ] Extract methods for clarity
- [ ] Improve naming (variables, functions, classes)
- [ ] Optimize performance (if needed)
- [ ] Add inline documentation for complex logic
- [ ] All tests still pass

## Task Order for TDD Implementation

When generating tasks for new features, ALWAYS follow this order:

### Phase 1: Test Setup (RED)
```markdown
- [ ] 1. Set up test infrastructure
  - Install/configure test framework (Jest, Mocha, pytest, JUnit, etc.)
  - Create test directory structure
  - Configure test runner and coverage tools
  - _Requirements: NFR-3 (Quality Standards)_

- [ ] 2. Write failing tests for [Feature Name]
  - Write unit tests for core functionality
  - Write integration tests for system interactions
  - Write edge case and error handling tests
  - Confirm all tests fail (RED phase)
  - _Requirements: FR-1 (Core Functionality)_
```

### Phase 2: Implementation (GREEN)
```markdown
- [ ] 3. Implement minimal code to pass tests
  - Implement core feature logic to satisfy tests
  - Add necessary dependencies and modules
  - Ensure all tests pass (GREEN phase)
  - _Requirements: FR-1, FR-2 (Technology Integration)_

- [ ] 4. Verify test coverage
  - Run coverage report
  - Ensure minimum 80% code coverage
  - Add tests for uncovered branches
  - _Requirements: NFR-3 (Quality Standards)_
```

### Phase 3: Refactoring (REFACTOR)
```markdown
- [ ] 5. Refactor for code quality
  - Extract reusable components/functions
  - Improve naming and code clarity
  - Remove duplication (DRY principle)
  - Apply design patterns where appropriate
  - All tests must still pass
  - _Requirements: NFR-3 (Maintainability)_

- [ ] 6. Code quality validation
  - Run linter and fix issues
  - Run type checker (if TypeScript/typed language)
  - Apply Linus-style code review principles
  - _Requirements: NFR-3 (Quality Standards)_
```

### Phase 4: Integration & Documentation
```markdown
- [ ] 7. Integration with existing system
  - Integrate with build system
  - Update configuration files
  - Test in development environment
  - _Requirements: FR-2, NFR-2 (Reliability)_

- [ ] 8. Documentation and deployment prep
  - Update API documentation
  - Add inline code comments for complex logic
  - Update README/CHANGELOG if needed
  - Prepare for deployment
  - _Requirements: NFR-3 (Maintainability)_
```

## TDD Best Practices

### Test Quality
1. **AAA Pattern**: Arrange, Act, Assert
   ```typescript
   it('should validate email format', () => {
     // Arrange: Set up test data
     const email = 'invalid-email';

     // Act: Execute the functionality
     const result = validator.validate(email);

     // Assert: Verify the outcome
     expect(result.valid).toBe(false);
   });
   ```

2. **One Assertion Per Test** (when possible)
   - Each test should verify ONE specific behavior
   - Makes failures easier to diagnose
   - Keeps tests focused and maintainable

3. **Test Independence**
   - Tests should not depend on each other
   - Tests should be able to run in any order
   - Use setup/teardown for test isolation

4. **Meaningful Test Names**
   - ✅ `should return error when email is missing @symbol`
   - ❌ `test1`, `testEmail`, `checkValidation`

### Coverage Targets
- **Minimum**: 80% code coverage
- **Target**: 90%+ code coverage for critical paths
- **Focus**: All public APIs must have tests
- **Edge Cases**: Always test boundary conditions and error paths

### Test Types by Phase

#### Unit Tests (RED/GREEN)
- Test individual functions/methods in isolation
- Mock external dependencies
- Fast execution (milliseconds)
- Should be 70-80% of all tests

#### Integration Tests (GREEN/REFACTOR)
- Test interaction between components
- Use real or realistic dependencies
- Test database/API integrations
- Should be 15-20% of all tests

#### End-to-End Tests (REFACTOR/Integration)
- Test complete user workflows
- Test through actual interfaces (CLI, API, UI)
- Slower but validate full system behavior
- Should be 5-10% of all tests

## Anti-Patterns to Avoid

### ❌ Implementation-First Development
```markdown
# WRONG - Implementation before tests
- [ ] 1. Implement feature
- [ ] 2. Write tests for feature
```

### ❌ Skipping Tests for "Simple" Code
Every feature needs tests, regardless of perceived simplicity.

### ❌ Writing Tests After Implementation
This leads to tests that just verify what code does, not what it SHOULD do.

### ❌ Testing Implementation Details
Test behavior and outcomes, not internal implementation.

```typescript
// ❌ BAD: Testing implementation details
expect(service.internalCache.size).toBe(0);

// ✅ GOOD: Testing behavior
expect(await service.getUser(id)).toBeNull();
```

### ❌ Large, Monolithic Tests
Break down tests into small, focused units.

## Language-Specific TDD Tools

### TypeScript/JavaScript
- **Framework**: Jest, Mocha, Vitest
- **Assertions**: expect, chai
- **Mocking**: jest.mock(), sinon
- **Coverage**: Jest --coverage, nyc

### Java
- **Framework**: JUnit 5, TestNG
- **Assertions**: AssertJ, Hamcrest
- **Mocking**: Mockito, EasyMock
- **Coverage**: JaCoCo, Cobertura

### Python
- **Framework**: pytest, unittest
- **Assertions**: assert, pytest fixtures
- **Mocking**: unittest.mock, pytest-mock
- **Coverage**: pytest-cov, coverage.py

### Go
- **Framework**: testing package, Testify
- **Assertions**: testify/assert
- **Mocking**: testify/mock, gomock
- **Coverage**: go test -cover

### Ruby
- **Framework**: RSpec, Minitest
- **Assertions**: expect(), assert_equal
- **Mocking**: rspec-mocks, mocha
- **Coverage**: SimpleCov

### PHP
- **Framework**: PHPUnit
- **Assertions**: assertEquals(), assertTrue()
- **Mocking**: Mockery, Prophecy
- **Coverage**: PHPUnit --coverage-html

## Enforcement

### Code Review Checklist
- [ ] All new features have tests written BEFORE implementation
- [ ] Tests follow RED → GREEN → REFACTOR cycle
- [ ] Test coverage meets minimum 80% threshold
- [ ] Tests are independent and can run in any order
- [ ] Test names clearly describe expected behavior
- [ ] Edge cases and error paths are tested
- [ ] Refactoring maintained green tests

### CI/CD Integration
- Tests MUST pass before merge
- Coverage MUST meet threshold (80% minimum)
- No commits with failing tests to main/develop branches
- Pre-commit hooks to run tests locally

## Summary

**Golden Rule**: Never write production code without a failing test first.

**TDD Workflow**:
1. 🔴 RED: Write a failing test
2. 🟢 GREEN: Write minimal code to pass
3. 🔵 REFACTOR: Improve code quality
4. ↻ Repeat for next feature

**Benefits**:
- ✅ Code meets requirements by design
- ✅ Refactoring is safe (tests catch regressions)
- ✅ Better code design (testable code is often better structured)
- ✅ Living documentation (tests show how code should work)
- ✅ Fewer bugs in production

Generated on: ${new Date().toISOString()}
