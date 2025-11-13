import { DatabaseManager } from '../database';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  let dbPath: string;

  beforeEach(() => {
    // Create a unique temporary database for each test
    dbPath = join(tmpdir(), `test-db-${Date.now()}-${Math.random()}.sqlite`);
    db = new DatabaseManager(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('User operations', () => {
    describe('createUser', () => {
      it('should correctly create a new user and initialize their settings', () => {
        const telegramId = 12345;
        const username = 'testuser';

        const user = db.createUser(telegramId, username);

        // Verify user was created
        expect(user).toBeDefined();
        expect(user.telegram_id).toBe(telegramId);
        expect(user.username).toBe(username);
        expect(user.status).toBe('stopped');
        expect(user.registered_at).toBeGreaterThan(0);
        expect(user.last_active).toBeGreaterThan(0);

        // Verify settings were initialized
        const settings = db.getUserSettings(telegramId);
        expect(settings).toBeDefined();
        expect(settings!.telegram_id).toBe(telegramId);
        expect(settings!.low_threshold).toBe(0.3);
        expect(settings!.action_threshold).toBe(0.85);
        expect(settings!.default_action).toBe('archive');
        expect(settings!.enable_deletion).toBe(0);
        expect(settings!.enable_blocking).toBe(0);
      });

      it('should handle user creation with null username', () => {
        const telegramId = 54321;

        const user = db.createUser(telegramId, null);

        expect(user).toBeDefined();
        expect(user.telegram_id).toBe(telegramId);
        expect(user.username).toBeNull();
        expect(user.status).toBe('stopped');
      });

      it('should update existing user on conflict', () => {
        const telegramId = 99999;
        const username1 = 'oldusername';
        const username2 = 'newusername';

        // Create user first time
        const user1 = db.createUser(telegramId, username1);
        const firstCreatedAt = user1.registered_at;

        // Wait a bit to ensure timestamp difference
        const before = Date.now();
        while (Date.now() - before < 10) {
          // Small delay
        }

        // Create again with different username
        const user2 = db.createUser(telegramId, username2);

        expect(user2.telegram_id).toBe(telegramId);
        expect(user2.username).toBe(username2);
        expect(user2.registered_at).toBe(firstCreatedAt); // Should not change
        expect(user2.last_active).toBeGreaterThanOrEqual(user1.last_active);
      });
    });

    describe('getUser', () => {
      it('should retrieve existing user', () => {
        const telegramId = 11111;
        db.createUser(telegramId, 'testuser');

        const user = db.getUser(telegramId);

        expect(user).toBeDefined();
        expect(user!.telegram_id).toBe(telegramId);
      });

      it('should return undefined for non-existent user', () => {
        const user = db.getUser(99999);
        expect(user).toBeUndefined();
      });
    });

    describe('updateUserStatus', () => {
      it('should update user status', () => {
        const telegramId = 22222;
        db.createUser(telegramId, 'testuser');

        db.updateUserStatus(telegramId, 'active');

        const user = db.getUser(telegramId);
        expect(user!.status).toBe('active');
      });

      it('should update last_active when updating status', () => {
        const telegramId = 33333;
        const user1 = db.createUser(telegramId, 'testuser');
        const initialLastActive = user1.last_active;

        // Wait a bit
        const before = Date.now();
        while (Date.now() - before < 10) {
          // Small delay
        }

        db.updateUserStatus(telegramId, 'paused');

        const user2 = db.getUser(telegramId);
        expect(user2!.last_active).toBeGreaterThanOrEqual(initialLastActive);
      });
    });

    describe('updateUserActivity', () => {
      it('should update last_active timestamp', async () => {
        const telegramId = 44444;
        const user1 = db.createUser(telegramId, 'testuser');
        const initialLastActive = user1.last_active;

        // Wait to ensure timestamp difference (at least 1 second)
        await new Promise(resolve => setTimeout(resolve, 1100));

        db.updateUserActivity(telegramId);

        const user2 = db.getUser(telegramId);
        expect(user2!.last_active).toBeGreaterThan(initialLastActive);
      });
    });
  });

  describe('Container operations', () => {
    beforeEach(() => {
      // Create a user for container tests
      db.createUser(12345, 'testuser');
    });

    describe('createContainer', () => {
      it('should correctly record container lifecycle event', () => {
        const telegramId = 12345;
        const containerId = 'abc123def456';

        const container = db.createContainer(telegramId, containerId);

        expect(container).toBeDefined();
        expect(container.telegram_id).toBe(telegramId);
        expect(container.container_id).toBe(containerId);
        expect(container.status).toBe('starting');
        expect(container.created_at).toBeGreaterThan(0);
        expect(container.stopped_at).toBeNull();
      });

      it('should auto-increment container IDs', () => {
        const telegramId = 12345;

        const container1 = db.createContainer(telegramId, 'container1');
        const container2 = db.createContainer(telegramId, 'container2');

        expect(container2.id).toBe(container1.id + 1);
      });
    });

    describe('getContainerById', () => {
      it('should retrieve container by ID', () => {
        const telegramId = 12345;
        const containerId = 'test-container-id';

        const created = db.createContainer(telegramId, containerId);
        const retrieved = db.getContainerById(created.id);

        expect(retrieved).toBeDefined();
        expect(retrieved!.container_id).toBe(containerId);
      });

      it('should return undefined for non-existent container ID', () => {
        const container = db.getContainerById(99999);
        expect(container).toBeUndefined();
      });
    });

    describe('getActiveContainer', () => {
      it('should retrieve the most recent active container', async () => {
        const telegramId = 12345;

        // Create multiple containers
        db.createContainer(telegramId, 'container1');
        db.updateContainerStatus('container1', 'running');

        // Wait to ensure different timestamps (at least 1 second)
        await new Promise(resolve => setTimeout(resolve, 1100));

        db.createContainer(telegramId, 'container2');
        db.updateContainerStatus('container2', 'running');

        const active = db.getActiveContainer(telegramId);

        expect(active).toBeDefined();
        expect(active!.container_id).toBe('container2'); // Most recent
      });

      it('should only return containers with starting or running status', () => {
        const telegramId = 12345;

        db.createContainer(telegramId, 'stopped-container');
        db.updateContainerStatus('stopped-container', 'stopped');

        const active = db.getActiveContainer(telegramId);
        expect(active).toBeUndefined();
      });

      it('should return undefined when no active containers exist', () => {
        const telegramId = 12345;
        const active = db.getActiveContainer(telegramId);
        expect(active).toBeUndefined();
      });
    });

    describe('getAllActiveContainers', () => {
      it('should retrieve all active containers across users', () => {
        db.createUser(11111, 'user1');
        db.createUser(22222, 'user2');

        db.createContainer(11111, 'container1');
        db.updateContainerStatus('container1', 'running');

        db.createContainer(22222, 'container2');
        db.updateContainerStatus('container2', 'starting');

        db.createContainer(22222, 'container3');
        db.updateContainerStatus('container3', 'stopped');

        const activeContainers = db.getAllActiveContainers();

        expect(activeContainers).toHaveLength(2);
        expect(activeContainers.map(c => c.container_id)).toContain('container1');
        expect(activeContainers.map(c => c.container_id)).toContain('container2');
        expect(activeContainers.map(c => c.container_id)).not.toContain('container3');
      });

      it('should return empty array when no active containers exist', () => {
        const activeContainers = db.getAllActiveContainers();
        expect(activeContainers).toEqual([]);
      });
    });

    describe('updateContainerStatus', () => {
      it('should update container status', () => {
        const telegramId = 12345;
        const containerId = 'test-container';

        db.createContainer(telegramId, containerId);
        db.updateContainerStatus(containerId, 'running');

        const container = db.getActiveContainer(telegramId);
        expect(container!.status).toBe('running');
      });

      it('should set stopped_at timestamp when status is stopped', () => {
        const telegramId = 12345;
        const containerId = 'test-container';

        const container1 = db.createContainer(telegramId, containerId);
        expect(container1.stopped_at).toBeNull();

        db.updateContainerStatus(containerId, 'stopped');

        const container2 = db.getContainerById(container1.id);
        expect(container2!.stopped_at).toBeGreaterThan(0);
      });

      it('should set stopped_at timestamp when status is failed', () => {
        const telegramId = 12345;
        const containerId = 'failed-container';

        const container1 = db.createContainer(telegramId, containerId);
        db.updateContainerStatus(containerId, 'failed');

        const container2 = db.getContainerById(container1.id);
        expect(container2!.stopped_at).toBeGreaterThan(0);
      });
    });
  });

  describe('User settings operations', () => {
    beforeEach(() => {
      db.createUser(12345, 'testuser');
    });

    describe('getUserSettings', () => {
      it('should retrieve default settings after user creation', () => {
        const telegramId = 12345;
        const settings = db.getUserSettings(telegramId);

        expect(settings).toBeDefined();
        expect(settings!.low_threshold).toBe(0.3);
        expect(settings!.action_threshold).toBe(0.85);
        expect(settings!.default_action).toBe('archive');
      });
    });

    describe('updateUserSettings', () => {
      it('should update specific settings fields', () => {
        const telegramId = 12345;

        db.updateUserSettings(telegramId, {
          low_threshold: 0.5,
          enable_deletion: 1,
        });

        const settings = db.getUserSettings(telegramId);
        expect(settings!.low_threshold).toBe(0.5);
        expect(settings!.enable_deletion).toBe(1);
        // Other fields should remain unchanged
        expect(settings!.action_threshold).toBe(0.85);
        expect(settings!.default_action).toBe('archive');
      });

      it('should update all settings fields', () => {
        const telegramId = 12345;

        db.updateUserSettings(telegramId, {
          low_threshold: 0.2,
          action_threshold: 0.9,
          default_action: 'block',
          enable_deletion: 1,
          enable_blocking: 1,
        });

        const settings = db.getUserSettings(telegramId);
        expect(settings!.low_threshold).toBe(0.2);
        expect(settings!.action_threshold).toBe(0.9);
        expect(settings!.default_action).toBe('block');
        expect(settings!.enable_deletion).toBe(1);
        expect(settings!.enable_blocking).toBe(1);
      });

      it('should handle attempts to update settings for non-existent user without error', () => {
        const nonExistentTelegramId = 99999999;

        // This should not throw an error, but silently do nothing
        expect(() => {
          db.updateUserSettings(nonExistentTelegramId, {
            low_threshold: 0.5,
            enable_deletion: 1,
          });
        }).not.toThrow();

        // Verify that no settings were created for the non-existent user
        const settings = db.getUserSettings(nonExistentTelegramId);
        expect(settings).toBeUndefined();
      });
    });
  });

  describe('Audit log operations', () => {
    beforeEach(() => {
      db.createUser(12345, 'testuser');
    });

    describe('addAuditLog', () => {
      it('should add audit log entry without details', () => {
        const telegramId = 12345;

        db.addAuditLog(telegramId, 'container_started');

        const logs = db.getAuditLogs(telegramId);
        expect(logs).toHaveLength(1);
        expect(logs[0].event_type).toBe('container_started');
        expect(logs[0].details).toBeNull();
      });

      it('should add audit log entry with details', () => {
        const telegramId = 12345;
        const details = { container_id: 'abc123', status: 'running' };

        db.addAuditLog(telegramId, 'container_started', details);

        const logs = db.getAuditLogs(telegramId);
        expect(logs).toHaveLength(1);
        expect(logs[0].event_type).toBe('container_started');
        expect(logs[0].details).toBe(JSON.stringify(details));
      });

      it('should handle details object containing non-JSON-serializable data', () => {
        const telegramId = 12345;
        const circularReference: any = { name: 'test' };
        circularReference.self = circularReference; // Create circular reference

        // JSON.stringify will throw TypeError for circular references
        expect(() => {
          db.addAuditLog(telegramId, 'test_event', circularReference);
        }).toThrow(TypeError);
      });
    });

    describe('getAuditLogs', () => {
      it('should retrieve audit logs in reverse chronological order', async () => {
        const telegramId = 12345;

        db.addAuditLog(telegramId, 'event1');
        await new Promise(resolve => setTimeout(resolve, 1100));
        db.addAuditLog(telegramId, 'event2');
        await new Promise(resolve => setTimeout(resolve, 1100));
        db.addAuditLog(telegramId, 'event3');

        const logs = db.getAuditLogs(telegramId);

        expect(logs).toHaveLength(3);
        expect(logs[0].event_type).toBe('event3'); // Most recent first
        expect(logs[1].event_type).toBe('event2');
        expect(logs[2].event_type).toBe('event1');
      });

      it('should respect limit parameter', () => {
        const telegramId = 12345;

        for (let i = 0; i < 100; i++) {
          db.addAuditLog(telegramId, `event${i}`);
        }

        const logs = db.getAuditLogs(telegramId, 10);
        expect(logs).toHaveLength(10);
      });

      it('should only return logs for specified user', () => {
        db.createUser(11111, 'user1');
        db.createUser(22222, 'user2');

        db.addAuditLog(11111, 'user1_event');
        db.addAuditLog(22222, 'user2_event');

        const user1Logs = db.getAuditLogs(11111);
        expect(user1Logs).toHaveLength(1);
        expect(user1Logs[0].event_type).toBe('user1_event');

        const user2Logs = db.getAuditLogs(22222);
        expect(user2Logs).toHaveLength(1);
        expect(user2Logs[0].event_type).toBe('user2_event');
      });
    });
  });

  describe('Metrics operations', () => {
    beforeEach(() => {
      db.createUser(12345, 'testuser');
    });

    describe('addMetricsSnapshot', () => {
      it('should add metrics snapshot', () => {
        const telegramId = 12345;
        const metrics = {
          messages_processed: 100,
          spam_detected: 25,
          spam_archived: 20,
          spam_blocked: 5,
          spam_rate: 0.25,
        };

        db.addMetricsSnapshot(telegramId, metrics);

        const latest = db.getLatestMetrics(telegramId);
        expect(latest).toBeDefined();
        expect(latest!.messages_processed).toBe(100);
        expect(latest!.spam_detected).toBe(25);
        expect(latest!.spam_rate).toBe(0.25);
      });
    });

    describe('getLatestMetrics', () => {
      it('should retrieve most recent metrics', async () => {
        const telegramId = 12345;

        db.addMetricsSnapshot(telegramId, {
          messages_processed: 100,
          spam_detected: 25,
          spam_archived: 20,
          spam_blocked: 5,
          spam_rate: 0.25,
        });

        await new Promise(resolve => setTimeout(resolve, 1100));

        db.addMetricsSnapshot(telegramId, {
          messages_processed: 200,
          spam_detected: 50,
          spam_archived: 40,
          spam_blocked: 10,
          spam_rate: 0.25,
        });

        const latest = db.getLatestMetrics(telegramId);
        expect(latest!.messages_processed).toBe(200);
      });

      it('should return undefined when no metrics exist', () => {
        const telegramId = 12345;
        const latest = db.getLatestMetrics(telegramId);
        expect(latest).toBeUndefined();
      });
    });

    describe('getMetricsHistory', () => {
      it('should retrieve metrics within time window', () => {
        const telegramId = 12345;

        // Add multiple metrics
        for (let i = 0; i < 5; i++) {
          db.addMetricsSnapshot(telegramId, {
            messages_processed: i * 10,
            spam_detected: i * 2,
            spam_archived: i * 2,
            spam_blocked: 0,
            spam_rate: 0.2,
          });
        }

        const history = db.getMetricsHistory(telegramId, 24);
        expect(history).toHaveLength(5);
      });

      it('should return empty array when no metrics in time window', () => {
        const telegramId = 12345;
        const history = db.getMetricsHistory(telegramId, 0);
        expect(history).toEqual([]);
      });
    });
  });

  describe('Cleanup operations', () => {
    beforeEach(() => {
      db.createUser(12345, 'testuser');
    });

    describe('cleanOldAuditLogs', () => {
      it('should accurately clean up old audit logs', () => {
        const telegramId = 12345;
        const now = Math.floor(Date.now() / 1000);
        const thirtyDaysAgo = now - (30 * 86400);
        const fortyDaysAgo = now - (40 * 86400);

        // Manually insert old audit logs using direct SQL
        const stmt = (db as any).db.prepare(`
          INSERT INTO audit_log (telegram_id, timestamp, event_type, details)
          VALUES (?, ?, ?, ?)
        `);

        // Add old logs (should be deleted)
        stmt.run(telegramId, fortyDaysAgo, 'old_event_1', null);
        stmt.run(telegramId, fortyDaysAgo - 86400, 'old_event_2', null);

        // Add recent logs (should be kept)
        stmt.run(telegramId, now, 'recent_event_1', null);
        stmt.run(telegramId, thirtyDaysAgo + 86400, 'recent_event_2', null);

        // Verify all logs exist
        const beforeCleanup = db.getAuditLogs(telegramId, 100);
        expect(beforeCleanup).toHaveLength(4);

        // Clean old logs (older than 30 days)
        db.cleanOldAuditLogs(30);

        // Verify only recent logs remain
        const afterCleanup = db.getAuditLogs(telegramId, 100);
        expect(afterCleanup).toHaveLength(2);
        expect(afterCleanup.map(l => l.event_type)).toContain('recent_event_1');
        expect(afterCleanup.map(l => l.event_type)).toContain('recent_event_2');
        expect(afterCleanup.map(l => l.event_type)).not.toContain('old_event_1');
      });

      it('should handle default parameter of 30 days', () => {
        const telegramId = 12345;
        const now = Math.floor(Date.now() / 1000);
        const fortyDaysAgo = now - (40 * 86400);

        const stmt = (db as any).db.prepare(`
          INSERT INTO audit_log (telegram_id, timestamp, event_type, details)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run(telegramId, fortyDaysAgo, 'old_event', null);
        stmt.run(telegramId, now, 'recent_event', null);

        db.cleanOldAuditLogs(); // Use default 30 days

        const logs = db.getAuditLogs(telegramId);
        expect(logs).toHaveLength(1);
        expect(logs[0].event_type).toBe('recent_event');
      });

      it('should handle gracefully when no old records are present', () => {
        const telegramId = 12345;

        // Add only recent logs
        db.addAuditLog(telegramId, 'recent_event_1');
        db.addAuditLog(telegramId, 'recent_event_2');

        const beforeCleanup = db.getAuditLogs(telegramId);
        expect(beforeCleanup).toHaveLength(2);

        // Clean old logs - should not affect recent ones
        expect(() => {
          db.cleanOldAuditLogs(30);
        }).not.toThrow();

        const afterCleanup = db.getAuditLogs(telegramId);
        expect(afterCleanup).toHaveLength(2);
      });
    });

    describe('cleanOldMetrics', () => {
      it('should accurately clean up old metrics', () => {
        const telegramId = 12345;
        const now = Math.floor(Date.now() / 1000);
        const ninetyDaysAgo = now - (90 * 86400);
        const hundredDaysAgo = now - (100 * 86400);

        // Manually insert old metrics using direct SQL
        const stmt = (db as any).db.prepare(`
          INSERT INTO metrics (telegram_id, timestamp, messages_processed, spam_detected, spam_archived, spam_blocked, spam_rate)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        // Add old metrics (should be deleted)
        stmt.run(telegramId, hundredDaysAgo, 100, 10, 10, 0, 0.1);
        stmt.run(telegramId, hundredDaysAgo - 86400, 50, 5, 5, 0, 0.1);

        // Add recent metrics (should be kept)
        stmt.run(telegramId, now, 200, 20, 20, 0, 0.1);
        stmt.run(telegramId, ninetyDaysAgo + 86400, 150, 15, 15, 0, 0.1);

        // Verify metrics exist
        const beforeCleanup = db.getMetricsHistory(telegramId, 24 * 365); // Get all
        expect(beforeCleanup.length).toBeGreaterThanOrEqual(2);

        // Clean old metrics (older than 90 days)
        db.cleanOldMetrics(90);

        // Verify only recent metrics remain
        const afterCleanup = db.getMetricsHistory(telegramId, 24 * 365);
        expect(afterCleanup.length).toBeLessThan(beforeCleanup.length);

        // Check that recent metrics are still there
        const latest = db.getLatestMetrics(telegramId);
        expect(latest).toBeDefined();
        expect(latest!.messages_processed).toBe(200);
      });

      it('should handle default parameter of 90 days', () => {
        const telegramId = 12345;
        const now = Math.floor(Date.now() / 1000);
        const hundredDaysAgo = now - (100 * 86400);

        const stmt = (db as any).db.prepare(`
          INSERT INTO metrics (telegram_id, timestamp, messages_processed, spam_detected, spam_archived, spam_blocked, spam_rate)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(telegramId, hundredDaysAgo, 100, 10, 10, 0, 0.1);
        stmt.run(telegramId, now, 200, 20, 20, 0, 0.1);

        db.cleanOldMetrics(); // Use default 90 days

        const latest = db.getLatestMetrics(telegramId);
        expect(latest).toBeDefined();
        expect(latest!.messages_processed).toBe(200);
      });

      it('should not delete metrics within retention period', () => {
        const telegramId = 12345;

        // Add current metrics
        db.addMetricsSnapshot(telegramId, {
          messages_processed: 100,
          spam_detected: 10,
          spam_archived: 10,
          spam_blocked: 0,
          spam_rate: 0.1,
        });

        db.cleanOldMetrics(90);

        const latest = db.getLatestMetrics(telegramId);
        expect(latest).toBeDefined();
        expect(latest!.messages_processed).toBe(100);
      });

      it('should handle gracefully when no old records are present', () => {
        const telegramId = 12345;

        // Add only recent metrics
        db.addMetricsSnapshot(telegramId, {
          messages_processed: 50,
          spam_detected: 5,
          spam_archived: 5,
          spam_blocked: 0,
          spam_rate: 0.1,
        });

        const beforeCleanup = db.getLatestMetrics(telegramId);
        expect(beforeCleanup).toBeDefined();

        // Clean old metrics - should not affect recent ones
        expect(() => {
          db.cleanOldMetrics(90);
        }).not.toThrow();

        const afterCleanup = db.getLatestMetrics(telegramId);
        expect(afterCleanup).toBeDefined();
        expect(afterCleanup!.messages_processed).toBe(50);
      });
    });
  });

  describe('Auth session operations', () => {
    beforeEach(() => {
      db.createUser(12345, 'testuser');
    });

    describe('initializeAuthSession', () => {
      it('should create auth session with none state', () => {
        const telegramId = 12345;

        db.initializeAuthSession(telegramId);

        const session = db.getAuthSession(telegramId);
        expect(session).toBeDefined();
        expect(session!.auth_state).toBe('none');
        expect(session!.phone_number).toBeNull();
        expect(session!.last_auth_attempt).toBeGreaterThan(0);
      });

      it('should reset existing auth session', () => {
        const telegramId = 12345;

        db.initializeAuthSession(telegramId);
        db.updateAuthState(telegramId, 'wait_code', '+1234567890');

        db.initializeAuthSession(telegramId);

        const session = db.getAuthSession(telegramId);
        expect(session!.auth_state).toBe('none');
        expect(session!.phone_number).toBeNull();
      });
    });

    describe('updateAuthState', () => {
      it('should update auth state with phone number', () => {
        const telegramId = 12345;
        db.initializeAuthSession(telegramId);

        db.updateAuthState(telegramId, 'wait_code', '+1234567890');

        const session = db.getAuthSession(telegramId);
        expect(session!.auth_state).toBe('wait_code');
        expect(session!.phone_number).toBe('+1234567890');
      });

      it('should preserve phone number when not provided', () => {
        const telegramId = 12345;
        db.initializeAuthSession(telegramId);
        db.updateAuthState(telegramId, 'wait_code', '+1234567890');

        db.updateAuthState(telegramId, 'wait_password');

        const session = db.getAuthSession(telegramId);
        expect(session!.auth_state).toBe('wait_password');
        expect(session!.phone_number).toBe('+1234567890');
      });
    });
  });
});
