# Unit Tests for Spam Arrester

This directory contains comprehensive unit tests for the spam detection system.

## Test Coverage

### 1. **heuristics.test.ts** - Pattern Detection Tests
Tests for `looksSpam()` and `normalizeText()` functions:
- Empty/null input handling
- URL detection (http/https/t.me)
- Handle detection (@username)
- Phone number detection (various formats)
- Combined spam patterns
- Text normalization

### 2. **rateLimiter.test.ts** - Rate Limiting Tests
Tests for `RateLimiter` class:
- Action limit enforcement
- Sliding window implementation
- Remaining action tracking
- Time-based expiration
- Custom window sizes
- Edge cases (zero limit, rapid calls)

### 3. **spamDetector.test.ts** - Spam Detection Tests
Tests for `detectSpam()` function:
- Score calculation for each heuristic
- Threshold-based spam flagging
- Multiple indicator accumulation
- Contact/mutual contact handling
- Empty message handling
- High-risk spam scenarios

### 4. **actionHandler.test.ts** - Action Execution Tests
Tests for `ActionHandler` class:
- Action determination (log/archive/block)
- Rate limit enforcement
- Fallback behavior when limits exceeded
- Config flag respect (enableDeletion, enableBlocking)
- Error handling
- Remaining action tracking

### 5. **messageHandler.test.ts** - Message Processing Tests
Tests for `MessageHandler` class:
- Outgoing message filtering
- Private chat filtering
- Integration with SpamDetector
- Integration with ActionHandler
- Error handling
- Metrics collection

## Running Tests

### Run all tests
```bash
cd agent
npm test
```

### Run specific test file
```bash
npm test -- heuristics.test.ts
npm test -- rateLimiter.test.ts
npm test -- spamDetector.test.ts
npm test -- actionHandler.test.ts
npm test -- messageHandler.test.ts
```

### Run with coverage
```bash
npm test -- --coverage
```

### Run in watch mode
```bash
npm test -- --watch
```

### Run verbose
```bash
npm test -- --verbose
```

## Test Structure

All tests follow the same pattern:

1. **Arrange** - Set up test data and mocks
2. **Act** - Execute the function/method under test
3. **Assert** - Verify expected behavior

### Example

```typescript
it('should detect spam with URL', async () => {
  // Arrange
  const userProfile = { isContact: true, ... };
  const message = { content: { text: { text: 'Visit https://spam.com' } } };

  // Act
  const result = await detectSpam(mockClient, message, userProfile);

  // Assert
  expect(result.isSpam).toBe(true);
  expect(result.score).toBe(0.4);
});
```

## Mocking Strategy

- **Config**: Mocked with known values to ensure consistent test behavior
- **Logger**: Mocked to suppress logs and verify logging calls
- **Metrics**: Mocked to verify metric increments
- **TDLib Client**: Mocked to avoid actual Telegram API calls
- **Time**: Jest fake timers used for rate limiter tests

## Configuration for Tests

Tests use mocked configuration values:
- `lowThreshold`: 0.3
- `actionThreshold`: 0.85
- `maxDeletesPerMinute`: 5
- `maxBlocksPerMinute`: 10

## Continuous Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: |
    cd agent
    npm install
    npm test -- --coverage --ci
```

## Writing New Tests

When adding new functionality:

1. Create test file in same directory as source: `__tests__/myModule.test.ts`
2. Mock external dependencies
3. Test happy path, edge cases, and error scenarios
4. Aim for >80% code coverage
5. Use descriptive test names

## Debugging Tests

```bash
# Run single test
npm test -- -t "should detect spam when sender is not in contacts"

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Notes

- Tests are isolated and don't share state
- Each test creates fresh instances of classes
- Mocks are cleared between tests with `jest.clearAllMocks()`
- Tests don't require actual Telegram credentials or network access
