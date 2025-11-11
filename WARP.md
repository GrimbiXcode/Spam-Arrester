# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Spam Arrester is a modular, privacy-first Telegram spam detection and cleanup system. It uses TDLib, local LLMs, and vector similarity learning to automatically detect and delete spam messages in private Telegram chats while continuously improving detection accuracy.

**Current Status**: MVP complete with heuristic-based detection. ML integration planned for Phase 2.

## Essential Commands

### Development Workflow
```bash
# Navigate to agent directory (all commands run from here)
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

# Run tests
npm test
```

### Docker Deployment
```bash
# From repository root
docker-compose up -d              # Start container
docker-compose logs -f            # View logs
docker-compose down               # Stop container
docker-compose build              # Rebuild after changes
```

### Setup
```bash
# First-time setup
cp .env.example .env              # Create environment file
# Edit .env with TG_API_ID and TG_API_HASH from https://my.telegram.org/apps
```

### Testing & Debugging
```bash
# Clean authentication and restart
rm -rf agent/tdlib-data/
cd agent && npm start

# Clean install if dependencies are corrupted
rm -rf agent/node_modules agent/package-lock.json
cd agent && npm install
```

## Architecture

### Two-Stage Detection Pipeline

1. **Heuristic Filter (Fast Path)** - Scoring system:
   - Sender not in contacts: +0.3
   - No common groups: +0.2
   - No profile photo: +0.15
   - Suspicious content (links/handles/phones): +0.4
   - Threshold: ≥0.3 flags as spam

2. **LLM Classifier (Slow Path)** - Planned for Phase 2:
   - Generate embeddings (SBERT-like)
   - Vector similarity lookup
   - Binary spam/ham classification

### Core Components

- **TDLib Client** (`agent/src/index.ts`): Main entry point, connects to Telegram, handles lifecycle
- **MessageHandler** (`agent/src/handlers/messageHandler.ts`): Processes incoming messages, orchestrates detection
- **SpamDetector** (`agent/src/handlers/spamDetector.ts`): Implements heuristic scoring system
- **ActionHandler** (`agent/src/handlers/actionHandler.ts`): Executes actions (archive/block/delete) with rate limiting
- **RateLimiter** (`agent/src/utils/rateLimiter.ts`): Prevents hitting Telegram API limits
- **Metrics** (`agent/src/utils/metrics.ts`): Tracks processed messages, spam detections, actions taken

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
Required in `.env`:
- `TG_API_ID` - Get from https://my.telegram.org/apps
- `TG_API_HASH` - Get from https://my.telegram.org/apps
- `LOG_LEVEL` - Optional: debug|info|warn|error (default: info)

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

## Testing Approach

1. **Log-only mode**: Set `defaultAction: "log"` and `enableDeletion: false`
2. **Send test messages**: From non-contact with links/handles/phones
3. **Review logs**: Check detection accuracy and scores
4. **Archive mode**: Set `defaultAction: "archive"` when confident
5. **Monitor metrics**: Logged every 60 seconds
6. **Enable blocking**: Set `enableBlocking: true` after validation
7. **Final step**: Enable `enableDeletion: true` only after extensive testing

## Roadmap Context

### Phase 1: MVP ✅ Complete
- Single TDLib agent with heuristic rules
- Archive/block/delete actions with rate limiting
- Metrics and logging
- Docker deployment

### Phase 2: Bot Interface & Orchestration (Planned)
- Telegram bot for user login and initialization
- Container orchestration for per-user TDLib instances
- Session lifecycle management (QR/phone/code flows)
- User settings and monitoring interface
- Audit/management database for non-sensitive metadata

### Phase 3: ML Integration (Planned)
- Embedding generation service (Python FastAPI)
- Vector DB (FAISS → Milvus/Weaviate)
- Classifier training pipeline
- Dry-run mode for model validation

### Phase 4: Learning System (Planned)
- Multi-user verification backend
- Feedback loop for model improvement
- Human review dashboard
- Public spam DB with hashed fingerprints

## Key Metrics

Logged every minute via `messageHandler.getMetrics()`:
- `msgProcessedTotal`: Total messages analyzed
- `spamDetectedTotal`: Messages flagged as spam
- `spamBlockedTotal`: Users blocked
- `spamArchivedTotal`: Chats archived
- `spamRate`: Percentage of spam detected (0-1)
- `remainingActions.deletes`: Remaining deletes this minute
- `remainingActions.blocks`: Remaining blocks this minute

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
│   └── default.json           # All behavior configuration
├── agent/                     # Node.js TDLib agent
│   ├── src/
│   │   ├── index.ts          # Entry point, TDLib client setup
│   │   ├── config.ts         # Config loader
│   │   ├── handlers/
│   │   │   ├── messageHandler.ts    # Message processing orchestration
│   │   │   ├── spamDetector.ts      # Heuristic scoring logic
│   │   │   └── actionHandler.ts     # Action execution with rate limiting
│   │   └── utils/
│   │       ├── logger.ts            # Pino structured logging
│   │       ├── metrics.ts           # Metrics tracking
│   │       ├── rateLimiter.ts       # Rate limit enforcement
│   │       └── heuristics.ts        # Spam pattern regex matching
│   ├── package.json          # Dependencies (tdl, prebuilt-tdlib, pino)
│   └── tsconfig.json         # TypeScript config (strict mode)
├── docker/
│   └── Dockerfile            # Container build
├── docker-compose.yml        # Orchestration with security hardening
├── .env.example              # Environment template
└── logs/                     # Runtime logs (gitignored)
```
