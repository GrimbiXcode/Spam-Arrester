# Phase 2: Bot Interface & Orchestration — Design

## Overview

Phase 2 introduces a **Telegram bot** that allows users to onboard, authenticate, and manage their personal spam-arrester agents. Each user gets an isolated Docker container running the Phase 1 agent, orchestrated by a central bot service.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Bot API                         │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │   Orchestrator Bot      │
         │   (Node.js + Telegraf)  │
         │                         │
         │  - User authentication  │
         │  - Container lifecycle  │
         │  - Settings management  │
         │  - Metrics aggregation  │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │   Management DB         │
         │   (SQLite/Postgres)     │
         │                         │
         │  - User sessions        │
         │  - Container mappings   │
         │  - Audit logs           │
         │  - User settings        │
         └─────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │   Docker Engine         │
         │                         │
         │  ┌──────────────────┐  │
         │  │ Agent Container  │  │  (per user)
         │  │ - TDLib instance │  │
         │  │ - Spam detector  │  │
         │  │ - Rate limiter   │  │
         │  └──────────────────┘  │
         │                         │
         │  ┌──────────────────┐  │
         │  │ Agent Container  │  │  (per user)
         │  └──────────────────┘  │
         └─────────────────────────┘
```

---

## Components

### 1. Orchestrator Bot (`bot/`)

**Purpose**: Central service that users interact with via Telegram bot interface.

**Responsibilities**:
- Handle user commands (`/start`, `/login`, `/status`, `/settings`, `/stop`)
- Manage TDLib authentication flows (QR code, phone/code)
- Spawn/stop/restart per-user agent containers
- Store user preferences and session metadata
- Aggregate metrics from running containers
- Provide audit logs and transparency

**Tech Stack**:
- **Telegraf**: Modern Telegram bot framework for Node.js
- **Dockerode**: Docker API client for container management
- **Better-SQLite3**: Embedded database for user/session data
- **TypeScript**: Type-safe development

---

### 2. Management Database

**Schema**:

```sql
-- Users and their active sessions
CREATE TABLE users (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  registered_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL,
  status TEXT CHECK(status IN ('active', 'paused', 'stopped')) DEFAULT 'stopped'
);

-- Container lifecycle tracking
CREATE TABLE containers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  container_id TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  stopped_at INTEGER,
  status TEXT CHECK(status IN ('starting', 'running', 'stopped', 'failed')) DEFAULT 'starting',
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- TDLib authentication state (NOT session files, just status)
CREATE TABLE auth_sessions (
  telegram_id INTEGER PRIMARY KEY,
  auth_state TEXT CHECK(auth_state IN ('none', 'wait_phone', 'wait_code', 'wait_password', 'ready')) DEFAULT 'none',
  phone_number TEXT,
  last_auth_attempt INTEGER,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- User-specific configuration overrides
CREATE TABLE user_settings (
  telegram_id INTEGER PRIMARY KEY,
  low_threshold REAL DEFAULT 0.3,
  action_threshold REAL DEFAULT 0.85,
  default_action TEXT CHECK(default_action IN ('log', 'archive', 'block')) DEFAULT 'archive',
  enable_deletion INTEGER DEFAULT 0,
  enable_blocking INTEGER DEFAULT 0,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- Audit log (metadata only, no message content)
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL, -- 'container_started', 'spam_detected', 'user_blocked', etc.
  details TEXT, -- JSON metadata
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

-- Metrics snapshots (periodic dumps from containers)
CREATE TABLE metrics (
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
```

---

### 3. Agent Container (Modified Phase 1)

**Changes from Phase 1**:
- Accept runtime configuration via environment variables (user-specific settings)
- Expose metrics endpoint (HTTP or stdout JSON logs)
- Accept control signals (graceful shutdown, reload config)
- Store TDLib session in mounted volume (per-user isolation)

**Docker Setup**:
```yaml
services:
  agent-user-123456789:
    image: spam-arrester-agent:latest
    container_name: agent-123456789
    environment:
      - TG_API_ID=${TG_API_ID}
      - TG_API_HASH=${TG_API_HASH}
      - USER_ID=123456789
      - LOW_THRESHOLD=0.3
      - ACTION_THRESHOLD=0.85
      - DEFAULT_ACTION=archive
      - ENABLE_DELETION=false
      - ENABLE_BLOCKING=false
    volumes:
      - ./sessions/123456789:/app/tdlib-data:rw
      - ./config:/app/config:ro
    networks:
      - agent-network
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

---

## User Flows

### 1. Initial Onboarding

```
User → Bot: /start
Bot → User: "Welcome! I'll help you set up spam protection. Send /login to begin."

User → Bot: /login
Bot → User: "Starting authentication. I'll spawn your agent container."
Bot: Creates container, waits for TDLib to initialize
Bot → User: "Please send your phone number (e.g., +1234567890)"

User → Bot: +1234567890
Bot: Forwards to TDLib in user's container
Bot → User: "Code sent to Telegram. Please send the code here."

User → Bot: 12345
Bot: Forwards to TDLib
Bot → User: "Authentication successful! Your agent is now running."
Bot → User: "Current mode: archive (safe mode). Use /settings to configure."
```

### 2. Authentication Methods

**A. Phone + Code (Standard)**
1. User sends phone number
2. Bot forwards to TDLib
3. TDLib sends code via Telegram
4. User sends code to bot
5. Bot forwards to TDLib
6. Optional: 2FA password prompt

**B. QR Code (Advanced)**
1. Bot generates QR code auth link
2. User scans with Telegram mobile app
3. TDLib confirms authentication
4. Bot notifies user

**Implementation Note**: Start with phone/code (simpler), add QR in v2.

---

### 3. Management Commands

```
/status
→ Shows container status, uptime, metrics summary

/stats
→ Detailed metrics: messages processed, spam rate, actions taken

/settings
→ Interactive menu to configure thresholds, actions, safety settings

/pause
→ Stops agent container without deleting session

/resume
→ Restarts agent container

/stop
→ Stops and removes agent container (keeps session data)

/reset
→ Deletes session data and removes container (requires confirmation)
```

---

## Security Considerations

### Session Isolation
- Each user's TDLib session stored in separate volume (`./sessions/{telegram_id}/`)
- Containers cannot access other users' data
- Docker network isolation prevents inter-container communication

### Authentication Flow Security
- Bot never stores raw phone numbers or codes (forwards to TDLib immediately)
- 2FA passwords handled securely (never logged, cleared from memory)
- Session tokens never leave container volumes

### Rate Limiting
- Limit container creation per user (1 active container max)
- Cooldown period after failed authentications (5 min)
- Global rate limits on bot commands (prevent abuse)

### Data Retention
- Audit logs: 30 days (configurable)
- Metrics: 90 days aggregated, 7 days detailed
- Session data: deleted only on explicit user request

---

## Container Lifecycle Management

### States
1. **Starting**: Container created, TDLib initializing
2. **Authenticating**: Waiting for user credentials
3. **Running**: Fully operational, processing messages
4. **Paused**: Stopped but session preserved
5. **Failed**: Error state (auth failed, crashed, resource limits)
6. **Stopped**: User-initiated shutdown

### Health Checks
- Ping agent container every 60s (HTTP endpoint or log monitoring)
- If unresponsive for 5 min → mark as failed, notify user
- Auto-restart on crash (max 3 attempts per hour)

### Resource Limits
```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 256M
```

### Idle Timeout
- Auto-pause after 7 days of inactivity (no messages processed)
- Notify user 24h before auto-pause
- User can extend or disable timeout via `/settings`

---

## Implementation Plan

### Directory Structure
```
spam-arrester/
├── bot/                      # NEW: Orchestrator bot
│   ├── src/
│   │   ├── index.ts         # Bot entry point
│   │   ├── bot.ts           # Telegraf bot setup
│   │   ├── commands/        # Command handlers
│   │   │   ├── start.ts
│   │   │   ├── login.ts
│   │   │   ├── status.ts
│   │   │   ├── settings.ts
│   │   │   └── stop.ts
│   │   ├── services/
│   │   │   ├── containerManager.ts  # Docker orchestration
│   │   │   ├── authHandler.ts       # TDLib auth flow
│   │   │   └── metricsAggregator.ts # Collect from containers
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── database.ts          # Better-SQLite3 wrapper
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── security.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── agent/                    # MODIFIED: Phase 1 agent
│   └── (existing files, minor changes for metrics export)
├── sessions/                 # NEW: Per-user TDLib data
│   └── .gitkeep
├── data/                     # NEW: Management DB
│   └── .gitkeep
├── docker-compose.yml        # MODIFIED: Add bot service
└── PHASE2_DESIGN.md          # This file
```

---

## Development Approach

1. **Bot scaffold**: Set up Telegraf, basic command routing
2. **Database layer**: Implement schema, CRUD operations
3. **Container manager**: Dockerode integration, lifecycle methods
4. **Auth handler**: TDLib auth flow orchestration (phone/code only)
5. **Command handlers**: Implement each bot command
6. **Metrics aggregation**: Collect and display stats
7. **Testing**: Manual testing with test Telegram account
8. **Docker setup**: Update compose file, build orchestrator image

---

## Deployment

### Development
```bash
# Start orchestrator bot
cd bot && npm run dev

# Bot spawns agent containers dynamically via Docker API
```

### Production
```bash
# Run bot as service
docker-compose up -d orchestrator

# Agent containers started on-demand by orchestrator
```

---

## Next Steps After Phase 2

- **Phase 3**: Integrate LLM embeddings and vector similarity
- **Phase 4**: Multi-user verification and public spam DB
- **Phase 5**: Web dashboard for human review

---

## Open Questions

1. **Database Choice**: SQLite (simple, embedded) vs Postgres (scalable)?
   → **Decision**: Start with SQLite, migrate to Postgres if >100 users

2. **Metrics Collection**: HTTP endpoint vs log parsing?
   → **Decision**: Start with log parsing (simpler), add HTTP later

3. **QR vs Phone Auth**: Which to implement first?
   → **Decision**: Phone/code (easier to test), QR code in v2

4. **Session Persistence**: How long to keep inactive sessions?
   → **Decision**: 30 days, then prompt user to re-authenticate

5. **Multi-Telegram Account Support**: Same user, multiple phone numbers?
   → **Decision**: Out of scope for Phase 2 (future enhancement)
