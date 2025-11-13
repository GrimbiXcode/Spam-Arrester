# Phase 2 Setup Guide

This guide will help you set up and run the **Phase 2 orchestrator bot** that manages per-user spam-arrester agents.

---

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local development)
- Telegram account
- API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)

---

## Quick Start

### 1. Create Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow prompts
3. Save your bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Send `/setcommands` to BotFather and paste:

```
start - Welcome message and introduction
login - Start authentication process
status - Check agent status and statistics
stats - View detailed metrics history
settings - Configure spam detection behavior
pause - Temporarily stop agent
resume - Restart paused agent
stop - Stop and remove agent (keeps session)
reset - Delete session and start over
help - Show command list
```

### 2. Configure Bot

```bash
cd bot
cp .env.example .env
```

Edit `bot/.env`:

```bash
# Your bot token from BotFather
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# API credentials from my.telegram.org/apps
TG_API_ID=12345678
TG_API_HASH=abcdef1234567890abcdef1234567890

# Other settings (defaults are fine)
DB_PATH=../data/orchestrator.db
DOCKER_SOCKET=/var/run/docker.sock
AGENT_IMAGE=spam-arrester-agent:latest
SESSIONS_DIR=../sessions
CONFIG_DIR=../config
LOG_LEVEL=info
```

### 3. Build Agent Docker Image

The orchestrator spawns agent containers, so we need the agent image ready:

```bash
cd agent
docker build -t spam-arrester-agent:latest -f ../docker/Dockerfile .
```

Verify image exists:

```bash
docker images | grep spam-arrester-agent
```

### 4. Create Docker Network

```bash
docker network create agent-network
```

### 5. Run Bot Locally (Development)

```bash
cd bot
npm install
npm run dev
```

You should see:

```
[INFO] Database initialized
[INFO] Container manager initialized
[INFO] Bot created
[INFO] Bot launched successfully
```

### 6. Test Bot

1. Open Telegram and find your bot (search for the username you set in BotFather)
2. Send `/start`
3. You should receive a welcome message
4. Send `/status` - should show "Not Running"
5. Send `/help` - should list all commands

---

## Production Deployment

### Option 1: Docker Compose (Recommended)

```bash
# Build and start orchestrator
docker-compose -f docker-compose.phase2.yml up -d orchestrator

# View logs
docker-compose -f docker-compose.phase2.yml logs -f orchestrator

# Stop
docker-compose -f docker-compose.phase2.yml down
```

### Option 2: Native Node.js

```bash
cd bot
npm install
npm run build
npm start
```

Run as systemd service (Linux):

```ini
# /etc/systemd/system/spam-arrester-bot.service
[Unit]
Description=Spam Arrester Orchestrator Bot
After=network.target docker.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/spam-arrester/bot
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable spam-arrester-bot
sudo systemctl start spam-arrester-bot
sudo systemctl status spam-arrester-bot
```

---

## User Workflow

### New User Onboarding

1. User finds bot on Telegram and sends `/start`
2. Bot creates user record in database
3. User sends `/login` (TODO: not implemented yet)
4. Bot spawns isolated Docker container for user
5. User completes Telegram authentication (phone/code)
6. Agent container starts monitoring private messages
7. User can check status with `/status` and configure with `/settings`

### Container Lifecycle

```
/login → Container created → Authentication → Running
   ↓
/pause → Container stopped (session preserved)
   ↓
/resume → Container restarted → Running
   ↓
/stop → Container removed (session kept in volume)
   ↓
/reset → Container + session deleted
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│        User (via Telegram)              │
└──────────────┬──────────────────────────┘
               │
     ┌─────────▼─────────┐
     │  Orchestrator Bot  │
     │  (Telegraf)        │
     │                    │
     │  • Commands        │
     │  • Auth handler    │
     │  • Settings UI     │
     └─────┬────┬────┬────┘
           │    │    │
    ┌──────▼─┐  │  ┌─▼──────┐
    │ SQLite │  │  │ Docker │
    │   DB   │  │  │  API   │
    └────────┘  │  └────┬───┘
                │       │
         ┌──────▼───────▼──────┐
         │  Per-user Containers │
         │  ┌────────────────┐  │
         │  │ agent-1234567  │  │
         │  │ (TDLib agent)  │  │
         │  └────────────────┘  │
         │  ┌────────────────┐  │
         │  │ agent-9876543  │  │
         │  │ (TDLib agent)  │  │
         │  └────────────────┘  │
         └──────────────────────┘
```

---

## Database

Located at `data/orchestrator.db` (SQLite).

### Tables

- `users` - User registration and status
- `containers` - Container lifecycle tracking
- `auth_sessions` - TDLib authentication state
- `user_settings` - Per-user configuration
- `audit_log` - Action history
- `metrics` - Statistics snapshots

### Backup

```bash
# Create backup
cp data/orchestrator.db data/orchestrator.db.backup

# Restore from backup
cp data/orchestrator.db.backup data/orchestrator.db
```

---

## Troubleshooting

### Bot not starting

```bash
# Check logs
docker logs spam-arrester-orchestrator

# Or if running locally
cd bot && npm run dev
```

Common issues:
- Invalid `BOT_TOKEN` → Get new token from @BotFather
- Missing `TG_API_ID`/`TG_API_HASH` → Get from my.telegram.org/apps
- Docker socket permission denied → Add user to `docker` group

### Agent containers not starting

```bash
# Check if image exists
docker images | grep spam-arrester-agent

# Rebuild if needed
cd agent
docker build -t spam-arrester-agent:latest -f ../docker/Dockerfile .

# Check network exists
docker network ls | grep agent-network
docker network create agent-network
```

### Database errors

```bash
# Reset database (WARNING: deletes all data)
rm data/orchestrator.db
cd bot && npm run dev  # Will recreate schema
```

### Container health check failures

```bash
# View all active containers
docker ps -a | grep agent-

# Check specific container logs
docker logs agent-1234567

# Manual health check
cd bot
npm run dev
# Bot will auto-check and mark failed containers
```

---

## Monitoring

### Bot Logs

```bash
# Docker
docker logs -f spam-arrester-orchestrator

# Native
cd bot && npm run dev  # Development with pretty logs
```

### Container Logs

```bash
# List active agent containers
docker ps | grep agent-

# View specific container logs
docker logs -f agent-1234567
```

### Database Queries

```bash
sqlite3 data/orchestrator.db

# Active users
SELECT telegram_id, username, status FROM users WHERE status != 'stopped';

# Container status
SELECT telegram_id, container_id, status, created_at FROM containers WHERE status IN ('starting', 'running');

# Recent metrics
SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 10;
```

---

## Security

### Session Isolation

Each user's TDLib session stored in:
```
sessions/1234567/  # User 1234567
sessions/9876543/  # User 9876543
```

Mounted read-write only to that user's container. Never shared between users.

### Container Security

- Run with `no-new-privileges`
- Drop capabilities (`cap-drop: ALL`)
- Resource limits (CPU: 0.5, Memory: 512M)
- Isolated network (`agent-network`)

### Data Retention

- Audit logs: 30 days (auto-cleanup)
- Metrics: 90 days (auto-cleanup)
- Session data: only deleted on explicit user request (`/reset`)

---

## Next Steps

### Remaining Phase 2 Work

- [ ] **Authentication flow** - Implement `/login` with phone/code input
- [ ] **Container control** - Implement `/pause`, `/resume`, `/stop`, `/reset`
- [ ] **Settings UI** - Interactive configuration via `/settings`
- [ ] **Stats visualization** - Detailed metrics via `/stats`
- [ ] **Metrics streaming** - Agent containers push metrics to bot

### Phase 3 Preview

- Local LLM integration for semantic spam detection
- Vector database (FAISS) for similarity search
- Embedding generation service (Python FastAPI)

---

## Development

### Project Structure

```
bot/
├── src/
│   ├── index.ts              # Entry point
│   ├── bot.ts                # Telegraf setup
│   ├── commands/             # Command handlers
│   │   ├── start.ts
│   │   ├── status.ts
│   │   └── ... (TODO)
│   ├── services/
│   │   ├── containerManager.ts   # Docker orchestration
│   │   ├── authHandler.ts        # TDLib auth (TODO)
│   │   └── metricsAggregator.ts  # Metrics collection (TODO)
│   ├── db/
│   │   ├── schema.sql
│   │   └── database.ts
│   └── utils/
│       ├── logger.ts
│       └── security.ts (TODO)
├── package.json
├── tsconfig.json
└── README.md
```

### Adding New Commands

1. Create handler in `bot/src/commands/<command>.ts`
2. Export async function accepting `(ctx, db, containerMgr)`
3. Register in `bot/src/bot.ts`:

```typescript
import { myCommand } from './commands/mycommand.js';

bot.command('mycommand', async (ctx) => {
  await myCommand(ctx, db, containerMgr);
});
```

### Testing

```bash
cd bot
npm test  # TODO: Add tests
```

---

## Support

- Documentation: See `PHASE2_DESIGN.md` for architecture details
- Issues: Open GitHub issue
- Logs: Always include logs when reporting problems
