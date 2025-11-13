import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

export interface User {
  telegram_id: number;
  username: string | null;
  registered_at: number;
  last_active: number;
  status: 'active' | 'paused' | 'stopped';
}

export interface Container {
  id: number;
  telegram_id: number;
  container_id: string;
  created_at: number;
  stopped_at: number | null;
  status: 'starting' | 'running' | 'stopped' | 'failed';
}

export interface AuthSession {
  telegram_id: number;
  auth_state: 'none' | 'wait_phone' | 'wait_code' | 'wait_password' | 'ready';
  phone_number: string | null;
  last_auth_attempt: number | null;
}

export interface UserSettings {
  telegram_id: number;
  low_threshold: number;
  action_threshold: number;
  default_action: 'log' | 'archive' | 'block';
  enable_deletion: number;
  enable_blocking: number;
}

export interface AuditLogEntry {
  id: number;
  telegram_id: number;
  timestamp: number;
  event_type: string;
  details: string | null;
}

export interface MetricsSnapshot {
  id: number;
  telegram_id: number;
  timestamp: number;
  messages_processed: number;
  spam_detected: number;
  spam_archived: number;
  spam_blocked: number;
  spam_rate: number;
}

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    logger.info({ dbPath }, 'Initializing database');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
    logger.info('Database schema initialized');
  }

  // User operations
  createUser(telegramId: number, username: string | null): User {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO users (telegram_id, username, registered_at, last_active, status)
      VALUES (?, ?, ?, ?, 'stopped')
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        last_active = excluded.last_active
    `);
    stmt.run(telegramId, username, now, now);
    
    // Initialize default settings
    this.initializeUserSettings(telegramId);
    
    return this.getUser(telegramId)!;
  }

  getUser(telegramId: number): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE telegram_id = ?');
    return stmt.get(telegramId) as User | undefined;
  }

  updateUserStatus(telegramId: number, status: User['status']): void {
    const stmt = this.db.prepare('UPDATE users SET status = ?, last_active = ? WHERE telegram_id = ?');
    stmt.run(status, Math.floor(Date.now() / 1000), telegramId);
  }

  updateUserActivity(telegramId: number): void {
    const stmt = this.db.prepare('UPDATE users SET last_active = ? WHERE telegram_id = ?');
    stmt.run(Math.floor(Date.now() / 1000), telegramId);
  }

  // Container operations
  createContainer(telegramId: number, containerId: string): Container {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO containers (telegram_id, container_id, created_at, status)
      VALUES (?, ?, ?, 'starting')
    `);
    const result = stmt.run(telegramId, containerId, now);
    return this.getContainerById(result.lastInsertRowid as number)!;
  }

  getContainerById(id: number): Container | undefined {
    const stmt = this.db.prepare('SELECT * FROM containers WHERE id = ?');
    return stmt.get(id) as Container | undefined;
  }

  getActiveContainer(telegramId: number): Container | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM containers
      WHERE telegram_id = ? AND status IN ('starting', 'running')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(telegramId) as Container | undefined;
  }

  getAllActiveContainers(): Container[] {
    const stmt = this.db.prepare(`
      SELECT * FROM containers
      WHERE status IN ('starting', 'running')
      ORDER BY created_at DESC
    `);
    return stmt.all() as Container[];
  }

  updateContainerStatus(containerId: string, status: Container['status']): void {
    const stmt = this.db.prepare('UPDATE containers SET status = ? WHERE container_id = ?');
    stmt.run(status, containerId);
    
    if (status === 'stopped' || status === 'failed') {
      const stopStmt = this.db.prepare('UPDATE containers SET stopped_at = ? WHERE container_id = ?');
      stopStmt.run(Math.floor(Date.now() / 1000), containerId);
    }
  }

  // Auth session operations
  initializeAuthSession(telegramId: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO auth_sessions (telegram_id, auth_state, last_auth_attempt)
      VALUES (?, 'none', ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        auth_state = 'none',
        phone_number = NULL,
        last_auth_attempt = excluded.last_auth_attempt
    `);
    stmt.run(telegramId, Math.floor(Date.now() / 1000));
  }

  getAuthSession(telegramId: number): AuthSession | undefined {
    const stmt = this.db.prepare('SELECT * FROM auth_sessions WHERE telegram_id = ?');
    return stmt.get(telegramId) as AuthSession | undefined;
  }

  updateAuthState(telegramId: number, state: AuthSession['auth_state'], phoneNumber?: string): void {
    const stmt = this.db.prepare(`
      UPDATE auth_sessions
      SET auth_state = ?, phone_number = COALESCE(?, phone_number), last_auth_attempt = ?
      WHERE telegram_id = ?
    `);
    stmt.run(state, phoneNumber || null, Math.floor(Date.now() / 1000), telegramId);
  }

  // User settings operations
  initializeUserSettings(telegramId: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_settings (telegram_id)
      VALUES (?)
      ON CONFLICT(telegram_id) DO NOTHING
    `);
    stmt.run(telegramId);
  }

  getUserSettings(telegramId: number): UserSettings | undefined {
    const stmt = this.db.prepare('SELECT * FROM user_settings WHERE telegram_id = ?');
    return stmt.get(telegramId) as UserSettings | undefined;
  }

  updateUserSettings(telegramId: number, settings: Partial<Omit<UserSettings, 'telegram_id'>>): void {
    const fields = Object.keys(settings).map(key => `${key} = ?`).join(', ');
    const values = Object.values(settings);
    const stmt = this.db.prepare(`UPDATE user_settings SET ${fields} WHERE telegram_id = ?`);
    stmt.run(...values, telegramId);
  }

  // Audit log operations
  addAuditLog(telegramId: number, eventType: string, details?: Record<string, any>): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (telegram_id, timestamp, event_type, details)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      telegramId,
      Math.floor(Date.now() / 1000),
      eventType,
      details ? JSON.stringify(details) : null
    );
  }

  getAuditLogs(telegramId: number, limit = 50): AuditLogEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM audit_log
      WHERE telegram_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(telegramId, limit) as AuditLogEntry[];
  }

  // Metrics operations
  addMetricsSnapshot(telegramId: number, metrics: Omit<MetricsSnapshot, 'id' | 'telegram_id' | 'timestamp'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (telegram_id, timestamp, messages_processed, spam_detected, spam_archived, spam_blocked, spam_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      telegramId,
      Math.floor(Date.now() / 1000),
      metrics.messages_processed,
      metrics.spam_detected,
      metrics.spam_archived,
      metrics.spam_blocked,
      metrics.spam_rate
    );
  }

  getLatestMetrics(telegramId: number): MetricsSnapshot | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM metrics
      WHERE telegram_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    return stmt.get(telegramId) as MetricsSnapshot | undefined;
  }

  getMetricsHistory(telegramId: number, hours = 24): MetricsSnapshot[] {
    const cutoff = Math.floor(Date.now() / 1000) - (hours * 3600);
    const stmt = this.db.prepare(`
      SELECT * FROM metrics
      WHERE telegram_id = ? AND timestamp >= ?
      ORDER BY timestamp DESC
    `);
    return stmt.all(telegramId, cutoff) as MetricsSnapshot[];
  }

  // Cleanup operations
  cleanOldAuditLogs(days = 30): void {
    const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);
    const stmt = this.db.prepare('DELETE FROM audit_log WHERE timestamp < ?');
    const result = stmt.run(cutoff);
    logger.info({ deletedRows: result.changes }, 'Cleaned old audit logs');
  }

  cleanOldMetrics(days = 90): void {
    const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);
    const stmt = this.db.prepare('DELETE FROM metrics WHERE timestamp < ?');
    const result = stmt.run(cutoff);
    logger.info({ deletedRows: result.changes }, 'Cleaned old metrics');
  }

  close(): void {
    this.db.close();
    logger.info('Database closed');
  }
}
