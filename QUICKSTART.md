# Quick Start Guide

Get Spam Arrester running in 5 minutes! Choose your deployment mode:

- **Option A: Bot Orchestrator** (Recommended) - Multi-user, managed containers
- **Option B: Standalone Agent** - Single-user, direct TDLib client

---

## Option A: Bot Orchestrator (Phase 2) ✅ Recommended

**Best for**: Multiple users, managed deployment, easy monitoring

### Step 1: Get Bot Token & API Credentials (2 minutes)

1. **Create bot**: Message [@BotFather](https://t.me/BotFather) on Telegram
   - Send `/newbot`
   - Follow prompts to get your bot token

2. **Get API credentials**: Visit https://my.telegram.org/apps
   - Log in and create application
   - Copy `api_id` and `api_hash`

### Step 2: Configure Bot (1 minute)

```bash
cd bot
cp .env.example .env
# Edit .env with your credentials
```

Add to `.env`:
```
BOT_TOKEN=your_bot_token_here
TG_API_ID=your_api_id
TG_API_HASH=your_api_hash
```

### Step 3: Build Agent Image (1 minute)

```bash
cd ../agent
docker build -t spam-arrester-agent:latest -f ../docker/Dockerfile .
```

### Step 4: Setup Environment

```bash
cd ..
# Create required directories
mkdir -p data sessions config logs

# Create Docker network
docker network create agent-network
```

### Step 5: Start Bot (1 minute)

```bash
cd bot
npm install
npm run dev
```

### Step 6: Use Your Bot

1. Open Telegram and find your bot
2. Send `/start` to register
3. Send `/login` to create your agent container
4. Check container logs: `/logs`
5. Authenticate with Telegram (first run only)
6. Monitor with `/status` and configure with `/settings`

**Done!** Your agent is running in an isolated container.

---

## Option B: Standalone Agent (Phase 1)

**Best for**: Single user, testing, development

## Step 1: Get Telegram API Credentials (2 minutes)

1. Visit https://my.telegram.org/apps
2. Log in with your phone number
3. Create a new application
4. Copy your `api_id` and `api_hash`

### Step 2: Install and Configure (1 minute)

```bash
# Navigate to agent directory
cd agent

# Install dependencies
npm install

# Create environment file
cp ../.env.example ../.env

# Edit .env file with your credentials
nano ../.env  # or use your preferred editor
```

Add your credentials to `.env`:
```
TG_API_ID=your_api_id_here
TG_API_HASH=your_api_hash_here
LOG_LEVEL=info
```

### Step 3: Run in Safe Mode (2 minutes)

First, let's run in **log-only mode** to test without taking any actions:

```bash
# Build the project
npm run build

# Run the agent
npm start
```

#### First-Time Authentication

The agent will prompt you to authenticate:
1. Enter your phone number (with country code, e.g., +1234567890)
2. Check Telegram for a login code
3. Enter the code
4. If you have 2FA enabled, enter your password

### Step 4: Test Detection

1. Send yourself a message from a non-contact with spam patterns:
   - Include a link: `Check out https://example.com`
   - Or a handle: `Contact @someuser`
   - Or a phone number: `Call me at +1234567890`

2. Watch the logs to see detection in action

## What's Happening?

By default, the agent is configured to:
- ✅ **Archive** suspected spam (safe, reversible)
- ❌ **NOT delete** anything (enabled only when you're ready)
- ✅ **Block** persistent spammers (if enabled in config)
- ✅ **Log** all decisions for review

## Current Configuration

Check `../config/default.json` for:
```json
{
  "actions": {
    "defaultAction": "archive",
    "enableBlocking": true,
    "enableDeletion": false
  }
}
```

This means:
- Spam messages are **archived** (not deleted)
- Deletion is **disabled** for safety
- You can review archived chats at any time

## Monitoring

The agent logs metrics every minute:
```
{
  "msgProcessedTotal": 10,
  "spamDetectedTotal": 2,
  "spamRate": 0.2,
  "spamArchivedTotal": 2
}
```

## Next Steps

### Enable More Aggressive Actions

Once you're confident in the detection:

1. Edit `../config/default.json`:
```json
{
  "actions": {
    "enableDeletion": true,
    "enableBlocking": true
  }
}
```

2. Restart the agent:
```bash
npm start
```

### Adjust Detection Sensitivity

Edit thresholds in `../config/default.json`:
```json
{
  "thresholds": {
    "lowThreshold": 0.3,     // Lower = more sensitive
    "actionThreshold": 0.85   // Higher = more conservative
  }
}
```

### Run in Background (macOS/Linux)

```bash
# Using nohup
nohup npm start > ../logs/agent.log 2>&1 &

# Or use Docker
cd ..
docker-compose up -d
```

## Stopping the Agent

Press `Ctrl+C` to gracefully shutdown the agent. It will log final metrics before exiting.

## Troubleshooting

### "No matching version found for..."
```bash
rm -rf node_modules package-lock.json
npm install
```

### Can't authenticate
```bash
rm -rf tdlib-data/
npm start  # Try authentication again
```

### Not detecting spam
- Check that messages are from non-contacts
- Verify the message contains links, handles, or phone numbers
- Lower the `lowThreshold` in config (try 0.2)

---

## Next Steps

### For Bot Users (Option A)

- **Commands**: See `BOT_IMPLEMENTATION_SUMMARY.md` for all bot commands
- **Configuration**: Use `/settings` command to adjust behavior
- **Monitoring**: Use `/status` and `/stats` for insights
- **Troubleshooting**: Check `PHASE2_SUMMARY.md`

### For Standalone Users (Option B)

- **Configuration**: Edit `config/default.json` for thresholds
- **Docker**: See `SETUP.md` for Docker deployment
- **Monitoring**: Check logs for metrics

---

## Documentation Reference

| Document | Description |
|----------|-------------|
| **README.md** | Overall project concept and architecture |
| **AGENT_SUMMARY.md** | Agent component features and configuration |
| **BOT_IMPLEMENTATION_SUMMARY.md** | Complete bot command reference |
| **PHASE2_SUMMARY.md** | Phase 2 architecture and status |
| **SETUP.md** | Detailed setup and configuration guide |
| **WARP.md** | Development guide for AI assistants |

---

## Ready to Go!

You're now protected from spam! The system will:
- Monitor private messages
- Archive suspected spam (safe by default)
- Learn from patterns
- Provide metrics and insights

Check logs regularly to fine-tune detection!
