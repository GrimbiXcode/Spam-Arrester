# Spam Arrester Bot (Orchestrator)

The Telegram bot that manages user authentication and agent container lifecycle.

## Setup

### 1. Install Dependencies

```bash
cd bot
npm install
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `BOT_TOKEN`: Get from [@BotFather](https://t.me/BotFather)
- `TG_API_ID` and `TG_API_HASH`: Get from [my.telegram.org/apps](https://my.telegram.org/apps)

### 3. Build Agent Image

Before running the bot, build the agent Docker image:

```bash
cd ../agent
docker build -t spam-arrester-agent:latest -f ../docker/Dockerfile .
```

### 4. Create Docker Network

```bash
docker network create agent-network
```

## Development

### Run in Development Mode

```bash
npm run dev
```

This uses `ts-node` to run TypeScript directly without compilation.

### Build and Run

```bash
npm run build
npm start
```

## Commands

The bot supports the following commands:

- `/start` - Welcome message and introduction
- `/login` - Start Telegram authentication (TODO)
- `/status` - Check agent status and statistics
- `/stats` - View detailed metrics history (TODO)
- `/settings` - Configure spam detection (TODO)
- `/pause` - Temporarily stop agent (TODO)
- `/resume` - Restart paused agent (TODO)
- `/stop` - Stop and remove agent (TODO)
- `/reset` - Delete session and start over (TODO)
- `/help` - Show command list

## Architecture

```
Bot (orchestrator)
├── Telegram Bot API
├── SQLite Database (user metadata)
└── Docker API (container management)
    └── Per-user agent containers
```

### Database

Uses SQLite (`better-sqlite3`) for:
- User registration and settings
- Container lifecycle tracking
- Authentication state management
- Audit logs
- Metrics snapshots

Schema is automatically initialized from `src/db/schema.sql`.

### Container Management

Uses `dockerode` to:
- Create isolated per-user containers
- Mount user-specific TDLib session volumes
- Apply resource limits (CPU, memory)
- Monitor container health
- Collect logs and metrics

## Security

- Each user's session isolated in separate Docker volume
- Containers run with minimal privileges (`cap-drop: ALL`)
- No cleartext credentials stored
- Audit logs for all actions

## Next Steps

Phase 2 implementation remaining:
- [ ] Authentication flow (phone/code)
- [ ] Pause/resume/stop commands
- [ ] Settings configuration UI
- [ ] Detailed stats visualization
- [ ] Container-to-bot metrics streaming

## Troubleshooting

### "Cannot connect to Docker daemon"

Ensure Docker is running and the socket path is correct in `.env`:

```bash
DOCKER_SOCKET=/var/run/docker.sock
```

### "Bot token is invalid"

Get a new token from @BotFather and update `.env`.

### Database errors

Delete and recreate:

```bash
rm ../data/orchestrator.db
npm run dev  # Will recreate schema
```
