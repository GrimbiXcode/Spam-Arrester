import { Context } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import { logger } from '../utils/logger';

export async function startCommand(ctx: Context, db: DatabaseManager): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  const username = ctx.from?.username || null;

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
