# Bot Test Suite

This directory contains comprehensive unit tests for the Spam Arrester bot orchestration layer.

## Test Coverage

### DatabaseManager Tests (`db/__tests__/database.test.ts`)

Tests for the SQLite database management layer covering:

1. **User Operations**
   - ✅ Creating new users and initializing their settings with default values
   - Retrieving users by Telegram ID
   - Updating user status and activity timestamps
   - Handling duplicate user creation with ON CONFLICT clauses

2. **Container Lifecycle Tracking**
   - ✅ Recording container creation events with proper timestamps
   - ✅ Retrieving active containers by user and globally
   - Updating container status with automatic stopped_at timestamps
   - Tracking container state transitions (starting → running → stopped/failed)

3. **User Settings Management**
   - Retrieving default settings after user creation
   - Updating specific or all settings fields
   - Preserving unchanged fields during partial updates

4. **Audit Logging**
   - Adding audit log entries with/without details
   - Retrieving logs in reverse chronological order
   - Respecting pagination limits
   - User isolation (logs only for specific users)

5. **Metrics Tracking**
   - Adding metrics snapshots with timestamps
   - Retrieving latest metrics per user
   - Querying metrics history within time windows

6. **Cleanup Operations**
   - ✅ Accurately cleaning up old audit logs (default 30 days)
   - ✅ Accurately cleaning up old metrics (default 90 days)
   - Respecting retention periods
   - Handling custom retention periods

7. **Authentication Session Management**
   - Initializing auth sessions with 'none' state
   - Updating auth state with phone number persistence
   - Resetting auth sessions

**Total: 42 tests**

### ContainerManager Tests (`services/__tests__/containerManager.test.ts`)

Tests for the Docker container orchestration layer covering:

1. **Resource Limit Parsing**
   - ✅ Correctly parsing CPU limits from string to NanoCPUs (0.5 → 500000000)
   - ✅ Handling various CPU values (0.25, 0.5, 1, 2.5, 4 CPUs)
   - ✅ Correctly parsing memory limits from string to bytes (512M → 536870912)
   - ✅ Supporting K/M/G units with case-insensitive matching
   - Throwing errors for invalid formats

2. **Container Lifecycle**
   - Creating containers with correct configuration (env vars, binds, security)
   - Applying CPU and memory limits from environment variables
   - Removing existing containers before creating new ones
   - Converting boolean settings (enable_deletion) to string env vars
   - Stopping running containers with grace period
   - Removing stopped containers without unnecessary stop calls

3. **Container Status Management**
   - Retrieving running status with uptime calculation
   - Retrieving stopped status
   - Handling non-existent containers (not_found status)
   - Handling missing health information

4. **Container Operations**
   - Restarting containers with grace period
   - Retrieving container logs with configurable tail
   - Handling errors gracefully (non-existent containers)

5. **Integration Tests**
   - Applying both CPU and memory limits when creating containers
   - Verifying environment variable propagation

**Total: 33 tests**

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test database.test.ts
npm test containerManager.test.ts

# Run in watch mode
npm test -- --watch

# Run with verbose output
npm test -- --verbose
```

## Test Configuration

- **Framework**: Jest 29.7.0 with ts-jest
- **Environment**: Node.js
- **Test Pattern**: `**/__tests__/**/*.test.ts`
- **Coverage**: Enabled for all `src/**/*.ts` except entry points

## Key Testing Patterns

### Database Tests
- Uses temporary SQLite databases created per test
- Proper cleanup with `afterEach` hooks
- Tests timestamp-dependent operations with appropriate delays (1100ms)
- Verifies foreign key constraints and data integrity

### Container Manager Tests
- Mocks Docker API using Jest mocks
- Tests private methods via type assertions for internal logic
- Verifies environment variable propagation
- Tests error handling and edge cases

## Coverage Summary

- **Statements**: 56.33% (160/284)
- **Branches**: 47.05% (32/68)
- **Functions**: 69.23% (36/52)
- **Lines**: 56.18% (159/283)

## Dependencies

- `jest`: ^29.7.0
- `@types/jest`: ^29.5.13
- `ts-jest`: ^29.1.2
- `better-sqlite3`: ^11.3.0 (for database tests)
- `dockerode`: ^4.0.2 (mocked in container tests)

## Notes

- Timestamp-based tests include appropriate delays to ensure distinct Unix timestamps
- Temporary test databases are automatically cleaned up after each test
- Container manager tests use comprehensive mocking to avoid Docker dependencies
- All tests follow the existing patterns from the agent test suite
