# Spam Arrester MVP - Setup Guide

## Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose (for containerized deployment)
- Telegram API credentials (API ID and API Hash)

## Getting Your Telegram API Credentials

1. Go to https://my.telegram.org/apps
2. Log in with your Telegram account
3. Create a new application
4. Copy your `api_id` and `api_hash`

## Local Development Setup

### 1. Install Dependencies

```bash
cd agent
npm install
```

### 2. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your credentials
# TG_API_ID=your_api_id
# TG_API_HASH=your_api_hash
# TG_PHONE_NUMBER=+1234567890 (optional)
```

### 3. Configure Detection Settings

Edit `config/default.json` to adjust:
- **Thresholds**: Spam detection sensitivity
- **Rate Limits**: Maximum actions per minute
- **Actions**: Default behavior (archive/delete/log)
- **Detection**: Which heuristics to enable

**Important**: By default, deletion is DISABLED for safety. The agent will only **archive** suspected spam.

### 4. Run in Development Mode

```bash
cd agent
npm run dev
```

On first run, you'll need to authenticate:
- Enter your phone number
- Enter the confirmation code sent to Telegram
- If you have 2FA, enter your password

### 5. Build for Production

```bash
cd agent
npm run build
npm start
```

## Docker Deployment

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 2. Build and Run

```bash
docker-compose up -d
```

### 3. View Logs

```bash
docker-compose logs -f spam-arrester-agent
```

### 4. Stop the Agent

```bash
docker-compose down
```

## Configuration Guide

### Detection Thresholds

In `config/default.json`:

```json
{
  "thresholds": {
    "lowThreshold": 0.3,        // Minimum score to flag as spam
    "actionThreshold": 0.85     // Score required for automatic action
  }
}
```

### Spam Detection Heuristics

The agent scores messages based on:
- **Not in contacts** (+0.3)
- **No common groups** (+0.2)
- **No profile photo** (+0.15)
- **Contains suspicious patterns** (+0.4)
  - Links (http://, https://, t.me/)
  - Handles (@username)
  - Phone numbers

A message with score ≥ 0.3 is flagged as spam.

### Action Modes

Set `defaultAction` in config:
- **`archive`** (recommended): Moves chat to archive
- **`log`**: Only logs detection, no action
- **`delete`**: Deletes chat (requires `enableDeletion: true`)

### Enabling Deletion

⚠️ **Use with caution!** To enable automatic deletion:

```json
{
  "actions": {
    "enableDeletion": true,
    "enableBlocking": true
  }
}
```

### Rate Limits

To avoid Telegram restrictions:

```json
{
  "rateLimits": {
    "maxDeletesPerMinute": 5,
    "maxBlocksPerMinute": 10
  }
}
```

When limits are exceeded, the agent falls back to archiving.

## Monitoring

### View Metrics

Metrics are logged every minute:
- `msgProcessedTotal`: Total messages analyzed
- `spamDetectedTotal`: Messages flagged as spam
- `spamBlockedTotal`: Users blocked
- `spamArchivedTotal`: Chats archived
- `spamRate`: Percentage of spam detected

### Log Levels

Set `LOG_LEVEL` in `.env`:
- `debug`: Verbose logging
- `info`: Standard logging (default)
- `warn`: Warnings only
- `error`: Errors only

## Testing Spam Detection

### Safe Testing Mode

Keep `enableDeletion: false` and `defaultAction: "log"` to test without taking actions:

```json
{
  "actions": {
    "defaultAction": "log",
    "enableDeletion": false
  }
}
```

All detections will be logged but no chats will be modified.

### Test with a Known Contact

Temporarily disable contact checking:

```json
{
  "detection": {
    "checkContacts": false
  }
}
```

Send yourself a message with spam patterns to test detection.

## Troubleshooting

### Authentication Issues

If you can't authenticate:
1. Delete `tdlib-data/` directory
2. Restart the agent
3. Try authenticating again

### TDLib Errors

The project uses `prebuilt-tdlib` which includes TDLib binaries automatically. If you encounter issues:

1. Make sure you're using Node.js 20+
2. Clear and reinstall dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
3. Check that the build completes: `npm run build`

### Rate Limit Warnings

If you see frequent rate limit warnings:
1. Reduce `maxDeletesPerMinute` in config
2. Consider using archive mode instead of delete
3. Check if you're receiving unusually high spam volume

## Security Best Practices

1. **Never share** your API credentials or session files (`tdlib-data/`)
2. **Start with archive mode** before enabling deletion
3. **Monitor logs** regularly for false positives
4. **Use rate limits** to avoid Telegram restrictions
5. **Keep TDLib updated** for security patches

## Next Steps

Once the MVP is working:
1. Monitor for false positives
2. Collect labeled data for ML training
3. Consider implementing Phase 2 (ML integration)
4. Add human review dashboard for borderline cases

## Support

For issues or questions, check the main README or open an issue in the repository.
