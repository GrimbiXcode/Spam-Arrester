import { Context } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import type { WebApiServer } from '../webApi';
import { logger } from '../utils/logger';

// Reference to webApi for token verification (set by bot.ts)
let webApiRef: WebApiServer | null = null;

export function setWebApiRef(webApi: WebApiServer): void {
  webApiRef = webApi;
}

export async function startCommand(ctx: Context, db: DatabaseManager): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  const username = ctx.from?.username || null;

  // Check for deep link payload (web auth completion)
  const message = ctx.message as any;
  const startPayload = message?.text?.split(' ')[1]; // Extract token from "/start TOKEN"

  if (startPayload && webApiRef) {
    // User came from web auth deep link
    const verifiedTelegramId = webApiRef.verifyToken(startPayload);
    
    if (verifiedTelegramId && verifiedTelegramId === telegramId) {
      logger.info({ telegramId, token: startPayload }, 'User completed web authentication');
      
      // Ensure user exists
      db.createUser(telegramId, username);
      db.addAuditLog(telegramId, 'web_auth_completed');
      
      await ctx.reply(
        `✅ **Authentication Successful!**\n\n` +
        `Your spam detection agent is now active and protecting your private chats.\n\n` +
        `**Quick Commands:**\n` +
        `• /status - Check agent status and metrics\n` +
        `• /settings - Configure detection thresholds\n` +
        `• /stats - View spam detection statistics\n` +
        `• /pause - Temporarily pause the agent\n` +
        `• /stop - Stop and remove the agent\n\n` +
        `Your agent is monitoring incoming private messages for spam patterns.`,
        { parse_mode: 'Markdown' }
      );
      return;
    } else if (verifiedTelegramId) {
      // Token valid but wrong user
      logger.warn({ telegramId, verifiedTelegramId, token: startPayload }, 'Token mismatch - different user');
      await ctx.reply(
        `⚠️ This authentication link was generated for a different account.\n\n` +
        `Please use /login to get your own authentication link.`
      );
      return;
    }
    // Token invalid/expired - fall through to normal welcome
  }

  logger.info({ telegramId, username }, 'User started bot');

  // Create or update user
  db.createUser(telegramId, username);
  db.addAuditLog(telegramId, 'bot_started');

  await ctx.reply(
    `👋 Welcome to **Spam Arrester**!\n\n` +
    `I'll help you set up automatic spam protection for your Telegram private chats.\n\n` +
    `**How it works:**\n` +
    `1. You connect your Telegram account (via /login)\n` +
    `2. I spawn a private agent container just for you\n` +
    `3. Your agent monitors private messages and detects spam\n` +
    `4. Spam is automatically archived, blocked, or logged (your choice)\n\n` +
    `**Privacy First:**\n` +
    `• Your session is isolated in a dedicated container\n` +
    `• No message content is stored (only metadata)\n` +
    `• You control all settings via this bot\n\n` +
    `Ready to start? Send /login to begin authentication.`,
    { parse_mode: 'Markdown' }
  );
}
