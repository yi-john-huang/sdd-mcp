---
name: error-handling
description: Error handling patterns and best practices
priority: 90
alwaysActive: true
---

# Error Handling Rules

## Error Types

### Custom Error Classes
Define domain-specific errors for better handling:

```typescript
class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} with id "${id}" not found`);
    this.name = 'NotFoundError';
  }
}

class AuthorizationError extends Error {
  constructor(action: string) {
    super(`Not authorized to ${action}`);
    this.name = 'AuthorizationError';
  }
}
```

## Error Handling Patterns

### Try-Catch Best Practices
```typescript
// Good: Specific error handling
try {
  await saveUser(user);
} catch (error) {
  if (error instanceof ValidationError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof DuplicateError) {
    return { status: 409, message: 'User already exists' };
  }
  // Re-throw unexpected errors
  throw error;
}

// Bad: Swallowing all errors
try {
  await saveUser(user);
} catch (error) {
  console.log('Something went wrong');
  // Error lost, no recovery, no logging
}
```

### Async Error Handling
```typescript
// Always use try-catch with async/await
async function fetchData(): Promise<Data> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new HttpError(response.status, response.statusText);
    }
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch data', { error, url });
    throw error;
  }
}
```

### Error Propagation
- Let errors bubble up to appropriate handlers
- Add context when re-throwing
- Don't catch errors you can't handle

```typescript
// Good: Add context when re-throwing
async function processOrder(orderId: string): Promise<void> {
  try {
    await validateOrder(orderId);
    await chargePayment(orderId);
    await fulfillOrder(orderId);
  } catch (error) {
    throw new OrderProcessingError(
      `Failed to process order ${orderId}`,
      { cause: error }
    );
  }
}
```

## Logging Errors

### What to Log
- Error message and stack trace
- Request/operation context
- User identifier (not PII)
- Timestamp

### What NOT to Log
- Passwords or tokens
- Personal identifiable information (PII)
- Full credit card numbers
- Internal implementation details in production

### Log Levels
- **ERROR**: Unexpected failures requiring attention
- **WARN**: Handled issues that may indicate problems
- **INFO**: Normal operations, significant events
- **DEBUG**: Detailed information for troubleshooting

## User-Facing Errors

### Never Expose
- Stack traces
- Database errors
- Internal paths
- Implementation details

### Always Provide
- Clear, actionable message
- Error code for support reference
- Next steps when possible
