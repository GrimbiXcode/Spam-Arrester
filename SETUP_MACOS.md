# macOS Setup Guide for Spam Arrester Bot

## Prerequisites Fixed ✅

The following setup steps have been completed:

### 1. Docker Socket Path ✅
- **Issue**: macOS uses a different Docker socket path
- **Fix**: Updated `bot/.env` to use `/Users/davidgrimbichler/.docker/run/docker.sock`

### 2. Required Directories ✅
```bash
mkdir -p data sessions config logs
```

### 3. Docker Network ✅
```bash
docker network create agent-network
```

### 4. Agent Image Built ✅
```bash
docker build -f docker/Dockerfile -t spam-arrester-agent:latest .
```

---

## How to Restart the Bot

If your bot is running, you need to restart it to pick up the new Docker socket path.

### Option 1: Running in Docker
```bash
docker-compose -f docker-compose.phase2.yml restart orchestrator
```

### Option 2: Running Locally
```bash
# Stop the current bot process (Ctrl+C if in terminal)

# Then restart it
cd bot
npm start
```

### Option 3: Running with Development Mode
```bash
cd bot
npm run dev
```

---

## Testing the /login Command

After restarting the bot:

1. Open Telegram and find your bot
2. Send `/start` (if you haven't already)
3. Send `/login`
4. The bot should now successfully create a container

Expected output:
```
🚀 Starting Your Agent

Creating your spam-arrester container...
This may take a moment.

✅ Agent Started!

Your spam-arrester agent is now running.
It will monitor your private chats for spam.

**Note:** On first run, the agent will need to authenticate with Telegram.
Check the container logs with /logs if needed.

Use /status to monitor statistics.
```

---

## Verifying Everything Works

### Check if container was created:
```bash
docker ps -a | grep agent-
```

You should see a container named `agent-<your_telegram_id>`

### Check container logs:
```bash
docker logs agent-<your_telegram_id>
```

Or use the bot command:
```
/logs
```

### Check container is on the right network:
```bash
docker network inspect agent-network
```

---

## Troubleshooting

### Issue: "Error: connect EACCES /var/run/docker.sock"
**Solution**: The bot is using the wrong Docker socket path.
- Verify `bot/.env` has: `DOCKER_SOCKET=/Users/davidgrimbichler/.docker/run/docker.sock`
- Restart the bot after changing

### Issue: "Error: (HTTP code 404) no such image"
**Solution**: The agent image wasn't built.
```bash
docker build -f docker/Dockerfile -t spam-arrester-agent:latest .
```

### Issue: Container starts but fails immediately
**Check logs**:
```bash
docker logs agent-<your_telegram_id>
```

Common causes:
- Missing `TG_API_ID` or `TG_API_HASH` in environment
- Authentication required (expected on first run)

### Issue: "Error: (HTTP code 404) network agent-network not found"
**Solution**:
```bash
docker network create agent-network
```

---

## Environment Variables

Make sure your `bot/.env` has:

```bash
# Required
BOT_TOKEN=your_bot_token_from_botfather
TG_API_ID=your_api_id
TG_API_HASH=your_api_hash

# macOS-specific
DOCKER_SOCKET=/Users/davidgrimbichler/.docker/run/docker.sock

# Optional (defaults shown)
DB_PATH=../data/orchestrator.db
SESSIONS_DIR=../sessions
CONFIG_DIR=../config
AGENT_IMAGE=spam-arrester-agent:latest
LOG_LEVEL=info
CONTAINER_CPU_LIMIT=0.5
CONTAINER_MEMORY_LIMIT=512M
```

---

## What Happens When You /login

1. **Bot checks** if you have an existing container
2. **Creates a new Docker container** with:
   - Your Telegram API credentials
   - Your settings (thresholds, actions, etc.)
   - Mounted session directory
   - Network connection to `agent-network`
3. **Container starts** the spam-arrester agent
4. **Agent authenticates** with Telegram (on first run, it will need your phone/code)
5. **Agent begins monitoring** your private chats

---

## Monitoring Your Agent

### Check status:
```
/status
```

### View logs:
```
/logs
```

### View statistics:
```
/stats
```

### Configure behavior:
```
/settings
```

---

## Next Steps

1. **Restart your bot** to apply the socket path fix
2. **Test /login** command
3. **Check container logs** to see if authentication is needed
4. **Configure settings** via `/settings` command
5. **Monitor performance** with `/status` and `/stats`

---

## Production Deployment

For production, consider using Docker Compose:

```bash
# Create production environment file
cp bot/.env.example bot/.env
# Edit bot/.env with your credentials

# Start the orchestrator
docker-compose -f docker-compose.phase2.yml up -d orchestrator

# View logs
docker-compose -f docker-compose.phase2.yml logs -f orchestrator
```

Note: When running in Docker, the socket path should be `/var/run/docker.sock` (the standard path), as the compose file handles the mapping to the correct macOS path.

---

## Summary of Changes Made

1. ✅ Fixed Docker socket path in `bot/.env`
2. ✅ Created required directories (data, sessions, config, logs)
3. ✅ Created Docker network `agent-network`
4. ✅ Built agent Docker image with native module support
5. ✅ Updated Dockerfile to include build dependencies

**You're now ready to restart the bot and test /login!**
