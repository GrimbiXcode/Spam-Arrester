# Quick Start Guide

Get the Spam Arrester MVP running in 5 minutes!

## Step 1: Get Telegram API Credentials (2 minutes)

1. Visit https://my.telegram.org/apps
2. Log in with your phone number
3. Create a new application
4. Copy your `api_id` and `api_hash`

## Step 2: Install and Configure (1 minute)

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

## Step 3: Run in Safe Mode (2 minutes)

First, let's run in **log-only mode** to test without taking any actions:

```bash
# Build the project
npm run build

# Run the agent
npm start
```

### First-Time Authentication

The agent will prompt you to authenticate:
1. Enter your phone number (with country code, e.g., +1234567890)
2. Check Telegram for a login code
3. Enter the code
4. If you have 2FA enabled, enter your password

## Step 4: Test Detection

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

## View Full Documentation

- **SETUP.md** - Complete configuration guide
- **MVP_SUMMARY.md** - Feature overview
- **README.md** - Project architecture

## Ready to Go!

Your agent is now monitoring private messages and archiving spam. Check the logs regularly to fine-tune detection!
