---
name: testing
description: Testing requirements and best practices
priority: 95
alwaysActive: true
---

# Testing Rules

## Test-Driven Development (TDD)

Follow the Red-Green-Refactor cycle:
1. **RED**: Write a failing test that defines expected behavior
2. **GREEN**: Write minimum code to make the test pass
3. **REFACTOR**: Clean up code while keeping tests green

## Test Organization

### File Structure
- Test files should mirror source structure
- Name test files as `{source-file}.test.ts`
- Group tests in `__tests__` directories or alongside source files

### Test Structure
```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should describe expected behavior', () => {
      // Arrange - Set up test data
      // Act - Execute the code
      // Assert - Verify results
    });
  });
});
```

## Test Quality

### Test Naming
- Use descriptive names that explain the scenario
- Pattern: `should {expected behavior} when {condition}`
- Examples:
  - `should return empty array when directory is empty`
  - `should throw error for invalid input`

### Test Independence
- Each test should be independent and isolated
- Use `beforeEach` to reset state between tests
- Never rely on test execution order

### Assertions
- One logical assertion per test (can have multiple `expect` calls)
- Test behavior, not implementation
- Include both positive and negative test cases

## Coverage Requirements

### Minimum Coverage
- Aim for 80% code coverage for new code
- Critical paths require 100% coverage
- Cover edge cases and error conditions

### What to Test
- Public API methods
- Edge cases and boundary conditions
- Error handling paths
- Integration points

### What Not to Test
- Third-party library internals
- Simple getters/setters without logic
- Framework-generated code

## Mocking

### When to Mock
- External services and APIs
- File system operations
- Network requests
- Time-dependent code

### Mock Best Practices
- Mock at the boundary, not internal implementation
- Verify mock interactions when relevant
- Reset mocks in `beforeEach`
