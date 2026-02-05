# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Spam Arrester is a modular, privacy-first Telegram spam detection and cleanup system. It uses TDLib, local LLMs, and vector similarity learning to automatically detect and delete spam messages in private Telegram chats while continuously improving detection accuracy.

**Current Status**: Phase 2 complete with bot orchestrator and multi-user support. ML integration planned for Phase 3.

## Essential Commands

### Development Workflow - Agent
```bash
# Navigate to agent directory
cd agent

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode (with ts-node)
npm run dev

# Run compiled version
npm start

# Lint TypeScript code
npm run lint

# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run a specific test file
npm test -- src/handlers/__tests__/spamDetector.test.ts

# Run tests in watch mode
npm test -- --watch
```

### Development Workflow - Bot (Phase 2)
```bash
# Navigate to bot directory
cd bot

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode (with ts-node)
npm run dev

# Run compiled version
npm start

# Lint TypeScript code
npm run lint

# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run a specific test file
npm test -- src/commands/__tests__/status.test.ts

# Run tests in watch mode
npm test -- --watch
```

### Docker Deployment
```bash
# From repository root
docker-compose up -d              # Start orchestrator bot
docker-compose logs -f            # View logs
docker-compose down               # Stop orchestrator
docker-compose build              # Rebuild after changes

# Build agent image manually (for development)
cd agent && docker build -t spam-arrester-agent:latest -f ../docker/Dockerfile .

# Build bot image manually
cd bot && docker build -t spam-arrester-bot:latest -f ../docker/Dockerfile.bot ..

# Agent containers are managed automatically by the bot
# View agent container logs:
docker logs spam-arrester-agent-<telegram-id>

# List all agent containers
docker ps -a --filter "name=spam-arrester-agent"

# Inspect agent container
docker inspect spam-arrester-agent-<telegram-id>

# Clean up stopped agent containers
docker container prune -f --filter "label=spam-arrester=agent"
```

### Setup
```bash
# First-time setup - Agent (Phase 1 standalone)
cd agent
cp .env.example .env              # Create environment file
# Edit .env with TG_API_ID and TG_API_HASH from https://my.telegram.org/apps

# First-time setup - Bot (Phase 2 orchestrator)
cd bot
cp .env.example .env              # Create environment file
# Edit .env with BOT_TOKEN, TG_API_ID, and TG_API_HASH

# Create required directories
mkdir -p data sessions config
```

### Testing & Debugging
```bash
# Clean authentication and restart (from agent directory)
rm -rf tdlib-data/
npm start

# Clean install if dependencies are corrupted (from agent directory)
rm -rf node_modules package-lock.json
npm install

# Inspect SQLite database (from repository root)
sqlite3 data/orchestrator.db "SELECT * FROM users;"
sqlite3 data/orchestrator.db "SELECT * FROM containers;"
sqlite3 data/orchestrator.db "SELECT * FROM settings;"

# View database schema
sqlite3 data/orchestrator.db ".schema"

# Export database to SQL dump
sqlite3 data/orchestrator.db .dump > backup.sql
```

## Architecture

### System Architecture (Phase 2)

**Multi-User Orchestration**:
```
User (Telegram) → Orchestrator Bot → Container Manager → Docker API
                         ↓                    ↓
                    SQLite DB         Per-User Agent Containers
                                              ↓
                                         TDLib + Detection
```

**Key Features**:
- Each user gets isolated container with dedicated TDLib session
- Bot manages container lifecycle (create, start, stop, remove)
- Database tracks users, containers, auth state, settings, metrics
- Session data persisted in per-user volumes
- Resource limits per container (0.5 CPU, 512M RAM)

### Two-Stage Detection Pipeline (Per-Agent)

1. **Heuristic Filter (Fast Path)** - Scoring system:
   - Sender not in contacts: +0.3
   - No common groups: +0.2
   - No profile photo: +0.15
   - Suspicious content (links/handles/phones): +0.4
   - Threshold: ≥0.3 flags as spam

2. **LLM Classifier (Slow Path)** - Planned for Phase 3:
   - Generate embeddings (SBERT-like)
   - Vector similarity lookup
   - Binary spam/ham classification

### Core Components

**Agent (Per-User Container)**:
- **TDLib Client** (`agent/src/index.ts`): Main entry point, connects to Telegram, handles lifecycle
- **MessageHandler** (`agent/src/handlers/messageHandler.ts`): Processes incoming messages, orchestrates detection
- **SpamDetector** (`agent/src/handlers/spamDetector.ts`): Implements heuristic scoring system
- **ActionHandler** (`agent/src/handlers/actionHandler.ts`): Executes actions (archive/block/delete) with rate limiting
- **RateLimiter** (`agent/src/utils/rateLimiter.ts`): Prevents hitting Telegram API limits
- **Metrics** (`agent/src/utils/metrics.ts`): Tracks processed messages, spam detections, actions taken

**Orchestrator Bot (Phase 2)**:
- **Bot** (`bot/src/bot.ts`): Telegraf setup, command routing, callback handlers
- **DatabaseManager** (`bot/src/db/database.ts`): SQLite operations for users, containers, settings, metrics
- **ContainerManager** (`bot/src/services/containerManager.ts`): Docker API integration, container lifecycle
- **WebApiServer** (`bot/src/webApi.ts`): Express server for web-based QR authentication
- **Commands** (`bot/src/commands/*.ts`): Bot command handlers (start, status, stats, settings, login, pause, resume, stop, reset, logs)
- **Logger** (`bot/src/utils/logger.ts`): Pino structured logging

**Web Authentication (Phase 2)**:
- **Web App** (`webapp/index.html`): Single-page app for QR code login flow
- **Web API** (`bot/src/webApi.ts`): REST endpoints for authentication (phone submission, QR retrieval, status polling)

### Data Flow

1. TDLib receives new private message
2. MessageHandler checks if message is outgoing or from group (ignore if so)
3. Get user profile (contact status, common groups, profile photo)
4. SpamDetector calculates spam score using heuristics
5. If score ≥ low threshold → ActionHandler determines action
6. Execute action based on score and config (log/archive/block+delete)
7. Update metrics
8. Log decision for transparency

### Configuration System

All behavior configured via `config/default.json`:

- **thresholds**: `lowThreshold` (0.3), `actionThreshold` (0.85)
- **rateLimits**: `maxDeletesPerMinute` (5), `maxBlocksPerMinute` (10)
- **detection**: Feature flags for each heuristic check
- **actions**: `defaultAction`, `enableBlocking`, `enableDeletion` (safety controls)
- **tdlib**: TDLib client configuration

## Important Development Notes

### Safety First
- Deletion is **disabled by default** (`enableDeletion: false` in config)
- Start with `defaultAction: "log"` for testing without side effects
- Use `defaultAction: "archive"` for safe production
- Only enable deletion after thorough testing and validation
- Rate limits protect against Telegram bans

### Authentication
- First run requires interactive authentication (phone → code → optional 2FA password)
- Session persists in `agent/tdlib-data/` (gitignored)
- Delete `tdlib-data/` to re-authenticate

### Environment Variables

**Agent** (`agent/.env`):
- `TG_API_ID` - Get from https://my.telegram.org/apps
- `TG_API_HASH` - Get from https://my.telegram.org/apps
- `LOG_LEVEL` - Optional: debug|info|warn|error (default: info)

**Bot** (`bot/.env`):
- `BOT_TOKEN` - Get from @BotFather on Telegram
- `TG_API_ID` - Get from https://my.telegram.org/apps (used for agent containers)
- `TG_API_HASH` - Get from https://my.telegram.org/apps (used for agent containers)
- `BOT_USERNAME` - Optional: bot's @username for deep links
- `WEB_APP_URL` - Optional: URL for web authentication (default: http://localhost:3000)
- `WEB_API_PORT` - Optional: port for web API server (default: 3000)
- `DB_PATH` - Optional: path to SQLite database (default: ../data/orchestrator.db)
- `DOCKER_SOCKET` - Optional: Docker socket path (default: /var/run/docker.sock)
- `SESSIONS_DIR` - Optional: sessions directory (default: ../sessions)
- `CONFIG_DIR` - Optional: config directory (default: ../config)
- `HOST_SESSIONS_DIR` - Optional: host path for sessions (Docker-in-Docker)
- `HOST_CONFIG_DIR` - Optional: host path for config (Docker-in-Docker)
- `AGENT_IMAGE` - Optional: agent Docker image (default: spam-arrester-agent:latest)
- `AGENT_NETWORK` - Optional: Docker network for agents (default: spam-arrester_agent-network)
- `LOG_LEVEL` - Optional: debug|info|warn|error (default: info)
- `MAX_CONTAINERS_PER_USER` - Optional: max containers per user (default: 1)
- `AUTH_COOLDOWN_MINUTES` - Optional: cooldown between auth attempts (default: 5)
- `CONTAINER_CPU_LIMIT` - Optional: CPU limit per container (default: 0.5)
- `CONTAINER_MEMORY_LIMIT` - Optional: memory limit per container (default: 512M)

### TypeScript Patterns
- Strict mode enabled
- Use `Client` from 'tdl' for TDLib operations
- All TDLib operations use `client.invoke({ _: 'methodName', params })` pattern
- Async/await throughout
- Structured logging with pino

### Rate Limiting
- Actions tracked per minute window
- When limit exceeded, falls back to archive mode
- Prevents Telegram API restrictions and temporary bans
- Configurable per action type (delete vs block)

### Message Processing
- Only processes **private chats** (not groups/channels)
- Ignores **outgoing messages**
- Only analyzes messages from **non-contacts** (configurable)
- Text extraction handles different message content types

## Bot Commands (Phase 2)

### User Commands

- **`/start`** - Welcome message, creates user record, initializes default settings
- **`/status`** - Shows agent status (running/stopped/paused/failed), uptime, current metrics, and settings
- **`/stats`** - Interactive historical statistics with time period selection (24h/7d/30d/all), includes spam rate trends
- **`/settings`** - Interactive configuration menu:
  - Adjust default action (log/archive/block)
  - Configure detection thresholds (low: 0.2/0.3/0.4, action: 0.7/0.85/0.9)
  - Toggle deletion on/off
  - Toggle blocking on/off
  - All changes persist to database and require container restart
- **`/login`** - Redirects to web app for QR-based Telegram authentication, then creates agent container
- **`/pause`** - Stops agent container while preserving session
- **`/resume`** - Restarts a paused agent container
- **`/stop`** - Stops and removes container with confirmation dialog (preserves session data)
- **`/reset`** - Complete reset with double confirmation (deletes ALL session data - cannot be undone)
- **`/logs`** - Fetches last 50 lines of agent container logs
- **`/help`** - Lists all available commands

### Interactive Features

- **Inline keyboards** for settings and stats
- **Confirmation dialogs** for destructive actions (stop, reset)
- **Real-time updates** when adjusting settings
- **Emoji indicators** for visual clarity (✅ ❌ 🔴 🟢 🟡)
- **Markdown formatting** for readability

### Safety Features

- Confirmation required for stop (1 step)
- Double confirmation for reset (2 steps with warnings)
- Clear messaging about data loss
- Cancel options at all stages

## Testing Approach

### Agent Testing (Phase 1 - Standalone)

1. **Log-only mode**: Set `defaultAction: "log"` and `enableDeletion: false`
2. **Send test messages**: From non-contact with links/handles/phones
3. **Review logs**: Check detection accuracy and scores
4. **Archive mode**: Set `defaultAction: "archive"` when confident
5. **Monitor metrics**: Logged every 60 seconds
6. **Enable blocking**: Set `enableBlocking: true` after validation
7. **Final step**: Enable `enableDeletion: true` only after extensive testing

### Bot Testing (Phase 2 - Orchestrator)

1. **Unit tests**: Run `cd bot && npm test` (85/85 tests passing)
2. **Build verification**: Run `cd bot && npm run build` (should compile cleanly)
3. **Lint check**: Run `cd bot && npm run lint` (check for errors)
4. **Bot interaction**:
   - Send `/start` to register
   - Send `/login` to create container
   - Send `/status` to verify agent is running
   - Send `/settings` to adjust configuration
   - Send `/stats` to view metrics
   - Send `/pause` and `/resume` to test lifecycle
   - Send `/logs` to view agent output
5. **Database verification**: Check `data/orchestrator.db` has correct entries
6. **Container verification**: Run `docker ps` to see running agent containers

## Roadmap Context

### Phase 1: MVP ✅ Complete
- Single TDLib agent with heuristic rules
- Archive/block/delete actions with rate limiting
- Metrics and logging
- Docker deployment

### Phase 2: Bot Interface & Orchestration ✅ Complete
- ✅ Telegram bot for user interaction
- ✅ Container orchestration for per-user TDLib instances
- ✅ User settings and monitoring interface
- ✅ Audit/management database for non-sensitive metadata
- ✅ All bot commands implemented (start, status, stats, settings, login, pause, resume, stop, reset, logs, help)
- ✅ Interactive settings menus with inline keyboards
- ✅ Container lifecycle management
- ✅ Docker integration
- ✅ Health monitoring system
- ✅ Web-based QR authentication flow

### Phase 3: ML Integration (Planned)
- Embedding generation service (Python FastAPI)
- Vector DB (FAISS → Milvus/Weaviate)
- Classifier training pipeline
- Dry-run mode for model validation
- Agent → Bot metrics streaming

### Phase 4: Learning System (Planned)
- Multi-user verification backend
- Feedback loop for model improvement
- Human review dashboard
- Public spam DB with hashed fingerprints

## Key Metrics

### Agent Metrics (Per-Container)

Logged every minute via `messageHandler.getMetrics()`:
- `msgProcessedTotal`: Total messages analyzed
- `spamDetectedTotal`: Messages flagged as spam
- `spamBlockedTotal`: Users blocked
- `spamArchivedTotal`: Chats archived
- `spamRate`: Percentage of spam detected (0-1)
- `remainingActions.deletes`: Remaining deletes this minute
- `remainingActions.blocks`: Remaining blocks this minute

### Bot Metrics (Orchestrator)

Tracked in SQLite database:
- Active containers per user
- Container health status
- Settings changes (audit log)
- Historical metrics snapshots (90-day retention)
- User activity (audit log with 30-day retention)

## Privacy & Security Principles

- No cleartext message storage
- All user identifiers will be hashed (Phase 2+)
- Minimal data retention
- Rate-limited destructive actions
- Per-container network isolation (future)
- Public DB will contain only verified, hashed identifiers (future)

## Common Issues

### "No matching version found" during npm install
```bash
rm -rf agent/node_modules agent/package-lock.json
cd agent && npm install
```

### Can't authenticate / TDLib errors
```bash
rm -rf agent/tdlib-data/
cd agent && npm start
```

### Not detecting spam
- Verify message is from non-contact
- Check message contains links/handles/phones
- Lower `lowThreshold` in config (try 0.2)
- Verify `detection.*` flags are enabled in config

### Rate limit warnings
- Reduce `maxDeletesPerMinute` in config
- Use archive mode instead of delete
- Check for unusual spam volume

## File Structure Reference

```
spam-arrester/
├── config/
│   └── default.json                 # All behavior configuration
├── agent/                           # Node.js TDLib agent (Phase 1)
│   ├── src/
│   │   ├── index.ts                # Entry point, TDLib client setup
│   │   ├── config.ts               # Config loader
│   │   ├── handlers/
│   │   │   ├── messageHandler.ts  # Message processing orchestration
│   │   │   ├── spamDetector.ts    # Heuristic scoring logic
│   │   │   └── actionHandler.ts   # Action execution with rate limiting
│   │   ├── utils/
│   │   │   ├── logger.ts          # Pino structured logging
│   │   │   ├── metrics.ts         # Metrics tracking
│   │   │   ├── rateLimiter.ts     # Rate limit enforcement
│   │   │   └── heuristics.ts      # Spam pattern regex matching
│   │   └── __tests__/             # Jest tests
│   ├── package.json                # Dependencies (tdl, prebuilt-tdlib, pino)
│   ├── tsconfig.json               # TypeScript config (strict mode)
│   └── .env.example                # Agent environment template
├── bot/                            # Telegram bot orchestrator (Phase 2)
│   ├── src/
│   │   ├── index.ts               # Entry point
│   │   ├── bot.ts                 # Telegraf setup, callback handlers
│   │   ├── webApi.ts              # Web API server for QR authentication
│   │   ├── commands/              # Bot command handlers
│   │   │   ├── start.ts          # Welcome & registration
│   │   │   ├── status.ts         # Agent status & metrics
│   │   │   ├── stats.ts          # Historical statistics
│   │   │   ├── settings.ts       # Interactive configuration
│   │   │   ├── login.ts          # Web auth redirect
│   │   │   ├── pause.ts          # Pause agent
│   │   │   ├── resume.ts         # Resume agent
│   │   │   ├── stop.ts           # Stop with confirmation
│   │   │   ├── reset.ts          # Reset with double confirmation
│   │   │   └── logs.ts           # View container logs
│   │   ├── db/
│   │   │   ├── database.ts       # DatabaseManager class
│   │   │   └── schema.sql        # SQLite schema
│   │   ├── services/
│   │   │   └── containerManager.ts  # Docker integration
│   │   ├── utils/
│   │   │   └── logger.ts         # Pino logger
│   │   └── __tests__/            # Jest tests
│   ├── package.json               # Dependencies (telegraf, dockerode, better-sqlite3)
│   ├── tsconfig.json              # TypeScript config
│   ├── .env.example               # Bot environment template
│   └── README.md                  # Bot documentation
├── webapp/                         # Web-based authentication (Phase 2)
│   └── index.html                 # Single-page app for QR login flow
├── sessions/                       # Per-user TDLib sessions (gitignored)
│   └── {telegram_id}/             # Isolated per user
├── data/                          # Management database (gitignored)
│   └── orchestrator.db            # SQLite database
├── docker/
│   ├── Dockerfile                 # Agent container build
│   └── Dockerfile.bot             # Bot container build
├── docker-compose.yml             # Orchestrator deployment
├── .env.example                   # Root environment template
├── logs/                          # Runtime logs (gitignored)
├── QUICKSTART.md                  # Quick start guide
├── QUICKSTART_WEB_AUTH.md         # Web authentication setup guide
├── SETUP.md                       # Detailed setup guide
├── PHASE2_SUMMARY.md              # Phase 2 summary
├── AGENT_SUMMARY.md               # Agent component documentation
├── BOT_IMPLEMENTATION_SUMMARY.md  # Bot commands documentation
├── AUTH_IMPLEMENTATION.md         # Authentication architecture
└── WEB_AUTH_IMPLEMENTATION.md     # Web auth API documentation
```
