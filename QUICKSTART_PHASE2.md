# Phase 2 Quick Start

**⚡ Get the orchestrator bot running in 5 minutes.**

---

## Prerequisites

- Docker running
- Node.js 20+ installed
- Bot token from [@BotFather](https://t.me/BotFather)
- API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)

---

## Steps

### 1️⃣ Configure Bot (2 min)

```bash
cd bot
cp .env.example .env
```

Edit `.env`:
```bash
BOT_TOKEN=your_bot_token_here
TG_API_ID=your_api_id
TG_API_HASH=your_api_hash
```

### 2️⃣ Build Agent Image (2 min)

```bash
cd ../agent
docker build -t spam-arrester-agent:latest -f ../docker/Dockerfile .
```

### 3️⃣ Create Network

```bash
docker network create agent-network
```

### 4️⃣ Start Bot (1 min)

```bash
cd ../bot
npm install
npm run dev
```

### 5️⃣ Test

Open Telegram → Find your bot → `/start`

---

## What Works Now

✅ `/start` - Onboarding
✅ `/status` - Check status
✅ `/help` - Command list
✅ Database creation
✅ User registration
✅ Health monitoring

## What's Next

🚧 `/login` - Authentication flow
🚧 `/settings` - Configuration
🚧 `/stats` - Detailed metrics
🚧 Container lifecycle commands

---

## Troubleshooting

**"Bot token is invalid"**
→ Get new token from @BotFather

**"Cannot connect to Docker daemon"**
→ Ensure Docker is running

**"Agent image not found"**
→ Run step 2 again

---

## Full Documentation

- **Setup**: `PHASE2_SETUP.md`
- **Architecture**: `PHASE2_DESIGN.md`
- **Summary**: `PHASE2_SUMMARY.md`
- **Bot Docs**: `bot/README.md`
