---
name: testing
description: Testing requirements and best practices
priority: 95
alwaysActive: true
---

# Testing Rules

## Test-Driven Development (TDD)

1. **RED**: write a focused test and watch it fail on an assertion, not on a setup error.
2. **GREEN**: write the least code that makes it pass.
3. **REFACTOR**: simplify while the tests stay green.

## Test Quality

- Name the behavior and the condition: `should <result> when <condition>`.
- Test behavior through public interfaces, not implementation details.
- Cover boundaries, error paths, and state transitions.
- Keep tests independent; reset shared state in `beforeEach`.
- Mock only at boundaries: network, clock, process, and external services.

## Evidence

Report only test runs you observed. Never claim a pass you did not see.
