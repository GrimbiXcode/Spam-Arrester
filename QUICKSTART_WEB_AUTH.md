# Quick Start: Web-Based QR Authentication

## Local Development (Without Docker)

1. **Configure environment**:
   ```bash
   cp bot/.env.example bot/.env
   # Edit bot/.env and set:
   # - BOT_TOKEN (from @BotFather)
   # - TG_API_ID and TG_API_HASH (from https://my.telegram.org/apps)
   # - BOT_USERNAME (your bot's @username)
   # - WEB_APP_URL=http://localhost:3000
   ```

2. **Build everything**:
   ```bash
   cd agent && npm install && npm run build
   cd ../bot && npm install && npm run build
   cd ..
   ```

3. **Start the bot** (includes web server on port 3000):
   ```bash
   cd bot && npm start
   ```

4. **Test the web app**:
   - Open browser: http://localhost:3000
   - Or message your bot: `/login` → click the link

5. **Authenticate**:
   - Enter phone number (e.g., +12025551234)
   - Scan QR code with Telegram mobile app
   - Confirm in Telegram
   - Success! Click link to open bot

## Docker Deployment

1. **Configure environment**:
   ```bash
   cp .env.example .env
   cp bot/.env.example bot/.env
   # Edit .env and set WEB_API_PORT=3000
   # Edit bot/.env with your credentials
   ```

2. **Build images**:
   ```bash
   # Build agent image
   docker build -t spam-arrester-agent:latest -f docker/Dockerfile .
   
   # Build bot image
   docker build -t spam-arrester-bot:latest -f docker/Dockerfile.bot .
   ```

3. **Start orchestrator**:
   ```bash
   docker-compose up -d
   ```

4. **Check logs**:
   ```bash
   docker-compose logs -f orchestrator
   # Should see: "Web API server listening" on port 3000
   ```

5. **Access web app**:
   - Open: http://localhost:3000
   - Or message bot: `/login`

6. **Verify container**:
   ```bash
   # Check orchestrator is running
   docker ps | grep orchestrator
   
   # Verify port 3000 is exposed
   docker port spam-arrester-orchestrator
   # Should show: 3000/tcp -> 0.0.0.0:3000
   ```

## Production Deployment

### Option 1: Same Server (Simple)

Use the same host for both bot and webapp:

```bash
# In .env
WEB_API_PORT=3000

# In bot/.env
WEB_APP_URL=http://your-server-ip:3000
BOT_USERNAME=your_bot_name
```

**Access**: `http://your-server-ip:3000`

### Option 2: Reverse Proxy (Recommended)

Run bot behind nginx with SSL:

1. **Setup nginx**:
   ```nginx
   server {
       listen 443 ssl;
       server_name auth.yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
       
       location /api/ {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

2. **Update bot/.env**:
   ```bash
   WEB_APP_URL=https://auth.yourdomain.com
   ```

**Access**: `https://auth.yourdomain.com`

### Option 3: Separate Hosting (Advanced)

Host webapp on CDN/static hosting:

1. **Upload `webapp/index.html`** to static hosting (Netlify, Vercel, S3, etc.)

2. **Edit `webapp/index.html`** line 238:
   ```javascript
   const API_BASE = 'https://api.yourdomain.com'; // Your bot API
   ```

3. **Update bot CORS** in `bot/src/webApi.ts` line 43:
   ```typescript
   res.header('Access-Control-Allow-Origin', 'https://webapp.yourdomain.com');
   ```

4. **Configure bot/.env**:
   ```bash
   WEB_APP_URL=https://webapp.yourdomain.com
   WEB_API_PORT=3000  # Internal bot API
   ```

5. **Expose bot API** via reverse proxy at `api.yourdomain.com:443` → `localhost:3000`

## Troubleshooting

### Port Not Accessible

**Symptom**: Cannot reach http://localhost:3000

**Check**:
```bash
# Local dev
lsof -i :3000  # Should show node process

# Docker
docker-compose ps  # Check orchestrator is running
docker port spam-arrester-orchestrator  # Should show 3000
curl http://localhost:3000/health  # Should return {"status":"ok"}
```

**Fix**:
- Local: Check bot process is running
- Docker: Ensure port mapping in docker-compose.yml
- Firewall: Allow port 3000

### Container Can't Create Agents

**Symptom**: Web app gets stuck on "Preparing authentication..."

**Check**:
```bash
# Check Docker socket access
docker exec spam-arrester-orchestrator docker ps
# Should list containers (not permission error)
```

**Fix**: Ensure orchestrator has Docker socket access (volumes in docker-compose.yml)

### Web App Shows But QR Never Appears

**Symptom**: Phone submitted, but QR code doesn't show

**Check agent logs**:
```bash
docker logs spam-arrester-agent-{telegram_id}
# Look for: AUTH_QR_REQUESTED, AUTH_QR_READY
```

**Fix**:
- Check TG_API_ID and TG_API_HASH are correct
- Verify agent container started (docker ps)
- Check network connectivity between bot and agent

### CORS Errors in Browser

**Symptom**: Console shows "CORS policy" errors

**Fix**: If webapp is on different domain:
1. Update CORS origin in `bot/src/webApi.ts`
2. Rebuild bot image
3. Restart containers

## Testing Checklist

- [ ] Bot starts without errors
- [ ] Web server responds at http://localhost:3000
- [ ] Health endpoint works: http://localhost:3000/health
- [ ] Web page loads correctly
- [ ] Phone validation works (try invalid format)
- [ ] QR code appears after entering valid phone
- [ ] QR code is scannable with Telegram mobile app
- [ ] Status updates after scanning QR
- [ ] Success page shows bot link
- [ ] Bot link opens Telegram with correct bot
- [ ] Agent container is running after authentication
- [ ] `/status` command in bot shows active agent

## Next Steps

Once basic auth works:

1. **Setup proper domain** with HTTPS (Let's Encrypt)
2. **Implement phone→telegram_id mapping** (see WEB_AUTH_IMPLEMENTATION.md)
3. **Add bot deep link handling** to verify session tokens
4. **Monitor logs** for errors and authentication success rate
5. **Setup monitoring** (health checks, uptime)

## Support

For detailed documentation see:
- `WEB_AUTH_IMPLEMENTATION.md` - Full architecture and API docs
- `WARP.md` - General project documentation
- `BOT_IMPLEMENTATION_SUMMARY.md` - Bot commands reference
