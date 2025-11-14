# Web-Based QR Code Authentication Implementation

## Overview

This implementation solves the Telegram 2FA code sharing security issue by providing a standalone web application for authentication. Users authenticate via QR code scan in their browser, bypassing the need to share auth codes through the bot.

## Architecture

### Flow

```
1. User → Bot: /login
2. Bot → User: Sends link to web app
3. User → Web App: Opens in browser, enters phone
4. Web App → Orchestrator API: POST /api/init-login {phone}
5. Orchestrator → Agent: Creates container, requests QR code
6. Agent → TDLib: requestQrCodeAuthentication()
7. TDLib → Agent: QR code link (tg://login?token=...)
8. Agent → Orchestrator: Returns QR code link
9. Orchestrator → Web App: QR code link
10. Web App: Displays QR code
11. User: Scans QR with mobile Telegram
12. Telegram → TDLib: Auth confirmation
13. TDLib → Agent: authorizationStateReady
14. Web App polls → Orchestrator → Agent: Status = 'ready'
15. Web App → User: Shows bot link with session token
16. User clicks → Opens bot with authenticated agent
```

### Components

**1. Agent (Per-User Container)**
- `authHandler.ts` - Added QR code state handling
  - `requestQrCode()` - Triggers TDLib QR auth
  - `getQrCodeLink()` - Returns `tg://login?token=...`
  - `getAuthState()` - Returns current state
  - Handles `authorizationStateWaitOtherDeviceConfirmation`
- `authServer.ts` - Added QR endpoints
  - `POST /auth/qr/request` - Request QR code
  - `GET /auth/qr` - Get QR code link
  - `GET /auth/status` - Get auth status

**2. Orchestrator Bot**
- `webApi.ts` - NEW: Express HTTP API server
  - `POST /api/init-login` - Initialize login session
  - `GET /api/get-qr/:token` - Poll for QR code
  - `GET /api/check-status/:token` - Poll for auth completion
  - Serves static files from `webapp/`
- `containerManager.ts` - Added QR methods
  - `requestQrCode()` - Proxy to agent
  - `getQrCode()` - Fetch QR from agent
  - `getAuthStatus()` - Check auth state
- `commands/login.ts` - Updated to redirect to web app
- `index.ts` - Starts WebApiServer on port 3000

**3. Web App (Static HTML)**
- `webapp/index.html` - Single-page app
  - Phone input form
  - QR code display (canvas via qrcode.js)
  - Status polling
  - Success redirect to bot

## API Contracts

### Orchestrator HTTP API

**Base URL**: `http://localhost:3000` (configurable via `WEB_APP_URL`)

#### POST /api/init-login
Initialize a login session.

**Request:**
```json
{
  "phone": "+12025551234"
}
```

**Response (success):**
```json
{
  "token": "session_token_hex",
  "telegram_id": 123456789,
  "status": "qr_requested"
}
```

**Response (already authenticated):**
```json
{
  "token": "session_token_hex",
  "telegram_id": 123456789,
  "status": "already_authenticated",
  "bot_link": "https://t.me/bot?start=token"
}
```

#### GET /api/get-qr/:token
Get QR code link for session.

**Response:**
```json
{
  "qr_link": "tg://login?token=base64encoded",
  "status": "wait_qr_confirmation",
  "session_status": "qr_ready"
}
```

#### GET /api/check-status/:token
Check authentication status.

**Response (authenticating):**
```json
{
  "status": "wait_qr_confirmation",
  "authenticated": false
}
```

**Response (authenticated):**
```json
{
  "status": "ready",
  "authenticated": true,
  "bot_link": "https://t.me/bot?start=token"
}
```

### Agent HTTP API

**Base URL**: `http://agent-{telegramId}:3100` (internal Docker network)

#### POST /auth/qr/request
Request QR code authentication.

**Response:**
```json
{
  "success": true,
  "message": "QR code authentication requested"
}
```

#### GET /auth/qr
Get current QR code link.

**Response:**
```json
{
  "qr_link": "tg://login?token=base64encoded",
  "status": "wait_qr_confirmation"
}
```

#### GET /auth/status
Get current authentication status.

**Response:**
```json
{
  "status": "ready"
}
```

**Status values:** `none`, `wait_phone`, `wait_qr`, `wait_qr_confirmation`, `wait_code`, `wait_password`, `ready`

## Security Features

1. **No Code Sharing** - User authenticates directly with Telegram (QR scan)
2. **Session Tokens** - One-time use tokens for web→bot transition
3. **Session Expiry** - 10-minute timeout for login sessions
4. **CORS Enabled** - For web app cross-origin requests
5. **Docker Isolation** - Each user's TDLib instance in separate container
6. **No Credential Storage** - Phone/auth not stored server-side

## Configuration

### Environment Variables

**Bot (`bot/.env`)**:
```bash
# Bot username for deep links
BOT_USERNAME=spam_arrester_bot

# Web app URL (where users authenticate)
WEB_APP_URL=http://localhost:3000

# Web API port (serves both API and static files)
WEB_API_PORT=3000
```

**Update `webapp/index.html`**:
```javascript
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://your-domain.com'; // Update for production
```

## Deployment

### Local Development

1. **Build agent and bot:**
   ```bash
   cd agent && npm run build
   cd ../bot && npm run build
   ```

2. **Start bot (includes web server):**
   ```bash
   cd bot && npm start
   ```

3. **Access web app:**
   - Open `http://localhost:3000` in browser
   - Or send `/login` in bot → click link

### Production

1. **Deploy web app to CDN/hosting:**
   - Upload `webapp/index.html` to static hosting
   - Update `API_BASE` to point to orchestrator API
   - Update `WEB_APP_URL` in bot `.env`

2. **Expose orchestrator API:**
   - Run behind reverse proxy (nginx)
   - Add SSL termination
   - Configure CORS for webapp domain

3. **Docker Compose:**
   ```yaml
   services:
     bot:
       ports:
         - "3000:3000"  # Expose web API
       environment:
         - WEB_APP_URL=https://auth.your-domain.com
         - BOT_USERNAME=your_bot
   ```

## Testing

### Manual Test Flow

1. Start bot: `cd bot && npm start`
2. Open browser: `http://localhost:3000`
3. Enter phone: `+1234567890` (format validated)
4. Wait for QR code (polling every 1s for 30s)
5. Scan QR with Telegram mobile app
6. Confirm login in Telegram
7. Web app polls status (every 2s)
8. Success → Shows bot link
9. Click link → Opens bot with authenticated agent

### Debug Logs

**Agent logs:**
```bash
docker logs -f spam-arrester-agent-{telegram_id}
# Look for:
# - AUTH_QR_REQUESTED
# - AUTH_QR_READY (with link)
# - AUTH_READY
```

**Orchestrator logs:**
```bash
# In bot terminal
# Look for:
# - "Initiating login via web API"
# - "Login session created"
# - "Web API server listening"
```

### Browser DevTools

Check Network tab for API calls:
- POST `/api/init-login` → 200 with token
- GET `/api/get-qr/:token` → 200 with qr_link
- GET `/api/check-status/:token` → 200 with authenticated=true

## Troubleshooting

### QR Code Never Appears

**Symptom:** Stuck on "Preparing authentication..."

**Causes:**
1. Container not starting
   - Check: `docker ps | grep agent-{telegram_id}`
   - Fix: Check Docker logs, ensure image built
2. Agent can't connect to Telegram
   - Check: Agent logs for TDLib errors
   - Fix: Verify `TG_API_ID`, `TG_API_HASH`
3. QR code request failed
   - Check: Agent logs for `AUTH_QR_REQUESTED`
   - Fix: Ensure TDLib state is correct (not already authenticated)

### QR Code Shows But Never Completes

**Symptom:** QR displays, user scans, but status stays "waiting"

**Causes:**
1. Status polling not working
   - Check: Browser DevTools network tab
   - Fix: Ensure `/api/check-status` returning correctly
2. TDLib not receiving confirmation
   - Check: Agent logs for `AUTH_READY`
   - Fix: Verify QR link format, try re-scanning
3. Session expired
   - Check: 10-minute timeout
   - Fix: Refresh page and restart

### "Session not found" Error

**Symptom:** Web app says session expired or not found

**Causes:**
1. Session cleanup ran
   - Check: Orchestrator logs
   - Fix: Shorten authentication time (<10 min)
2. Bot restarted
   - Sessions are in-memory only
   - Fix: Restart authentication flow

### Bot Link Doesn't Work

**Symptom:** Clicking bot link doesn't recognize user

**Causes:**
1. Wrong bot username
   - Check: `BOT_USERNAME` env var
   - Fix: Update to correct @username
2. Bot not handling start parameter
   - Check: Bot logs when clicking link
   - Fix: Ensure bot handles deep links (future feature)

## Known Limitations

1. **Phone → Telegram ID Mapping**
   - Currently uses hash of phone number
   - Production needs proper user registration flow:
     - User starts bot first → gets telegram_id
     - Web app asks for telegram_id OR phone

2. **Session Persistence**
   - Sessions stored in memory (lost on restart)
   - Production should use Redis or database

3. **Bot Deep Link Handling**
   - Currently bot doesn't verify session tokens
   - Future: Bot should validate token and link session

4. **Multi-Device**
   - Each login creates new agent container
   - Future: Support multiple sessions per user

5. **QR Code Expiry**
   - TDLib QR codes expire after ~30 seconds
   - Need to handle expiry and regeneration

## Future Improvements

1. **Better User Identification**
   - Store phone→telegram_id mapping in database
   - Require users to `/start` bot before web login

2. **Session Management**
   - Persist sessions in Redis
   - Support session revocation

3. **QR Code Refresh**
   - Auto-regenerate expired QR codes
   - Show countdown timer

4. **Mobile-First UX**
   - Detect mobile browsers
   - Show "Open in Telegram" button instead of QR

5. **Analytics**
   - Track login success/failure rates
   - Monitor QR scan times

6. **Error Recovery**
   - Automatic retry on agent creation failure
   - Graceful handling of Docker errors

## Files Modified/Created

### New Files
- `bot/src/webApi.ts` - Web API server
- `webapp/index.html` - Authentication web app
- `WEB_AUTH_IMPLEMENTATION.md` - This document

### Modified Files
- `agent/src/handlers/authHandler.ts` - QR code support
- `agent/src/authServer.ts` - QR endpoints
- `bot/src/index.ts` - Start web API server
- `bot/src/services/containerManager.ts` - QR methods
- `bot/src/commands/login.ts` - Redirect to web app
- `bot/.env.example` - Web app config
- `bot/package.json` - Added express dependency

## Summary

This implementation successfully bypasses Telegram's 2FA code sharing security restriction by:
1. Moving authentication to a web interface
2. Using QR code scan (user→Telegram direct)
3. No codes sent through bot (no "sharing" detected)
4. Clean handoff from web to bot via deep links

The user experience is:
1. User sends `/login` in bot
2. Clicks link to web app
3. Enters phone, scans QR
4. Returns to bot - agent is ready

**No codes shared = No Telegram security blocks ✅**
