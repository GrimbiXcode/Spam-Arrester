-- Users and their active sessions
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  registered_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL,
  status TEXT CHECK(status IN ('active', 'paused', 'stopped')) DEFAULT 'stopped'
);

-- Container lifecycle tracking
CREATE TABLE IF NOT EXISTS containers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  container_id TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  stopped_at INTEGER,
  status TEXT CHECK(status IN ('starting', 'running', 'stopped', 'failed')) DEFAULT 'starting',
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- TDLib authentication state (NOT session files, just status)
CREATE TABLE IF NOT EXISTS auth_sessions (
  telegram_id INTEGER PRIMARY KEY,
  auth_state TEXT CHECK(auth_state IN ('none', 'wait_phone', 'wait_code', 'wait_password', 'ready')) DEFAULT 'none',
  phone_number TEXT,
  last_auth_attempt INTEGER,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- User-specific configuration overrides
CREATE TABLE IF NOT EXISTS user_settings (
  telegram_id INTEGER PRIMARY KEY,
  low_threshold REAL DEFAULT 0.3,
  action_threshold REAL DEFAULT 0.85,
  default_action TEXT CHECK(default_action IN ('log', 'archive', 'block')) DEFAULT 'archive',
  enable_deletion INTEGER DEFAULT 0,
  enable_blocking INTEGER DEFAULT 0,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- Audit log (metadata only, no message content)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  details TEXT,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- Metrics snapshots (periodic dumps from containers)
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  messages_processed INTEGER DEFAULT 0,
  spam_detected INTEGER DEFAULT 0,
  spam_archived INTEGER DEFAULT 0,
  spam_blocked INTEGER DEFAULT 0,
  spam_rate REAL DEFAULT 0.0,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_containers_telegram_id ON containers(telegram_id);
CREATE INDEX IF NOT EXISTS idx_containers_status ON containers(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_telegram_id ON audit_log(telegram_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_telegram_id ON metrics(telegram_id);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
