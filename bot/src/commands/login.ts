import { Context } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';
import { logger } from '../utils/logger';

export async function loginCommand(
  ctx: Context,
  db: DatabaseManager,
  containerMgr: ContainerManager
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  db.updateUserActivity(telegramId);

  const user = db.getUser(telegramId);
  if (!user) {
    await ctx.reply('You are not registered. Send /start first.');
    return;
  }

  // Check if already has an active container
  const existingContainer = db.getActiveContainer(telegramId);
  if (existingContainer) {
    // Check if container is authenticated
    const containerName = `agent-${telegramId}`;
    try {
      const authStatus = await containerMgr.getAuthStatus(containerName);
      if (authStatus === 'ready') {
        await ctx.reply(
          '✅ You already have an authenticated agent running.\n\n' +
          'Use /status to check it, or /stop to shut it down first.'
        );
        return;
      }
    } catch (error) {
      // Container might not be running, continue
      logger.debug({ telegramId, error }, 'Failed to get auth status');
    }
  }

  // Redirect to web app for authentication
  const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
  
  await ctx.reply(
    '🔐 **Authentication Required**\n\n' +
    'To set up your spam detection agent, please authenticate via our secure web interface.\n\n' +
    '👉 Click the link below to continue:\n' +
    `${webAppUrl}\n\n` +
    '**How it works:**\n' +
    '1️⃣ Enter your phone number\n' +
    '2️⃣ Scan the QR code with your Telegram mobile app\n' +
    '3️⃣ Confirm the login in Telegram\n' +
    '4️⃣ Return here to use the bot\n\n' +
    '✅ Your credentials are never shared with us!',
    { 
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: false }
    }
  );
  
  logger.info({ telegramId }, 'User redirected to web app for login');
}
