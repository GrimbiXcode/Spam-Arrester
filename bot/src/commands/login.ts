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
    await ctx.reply(
      '⚠️ You already have an active agent.\n\n' +
      'Use /status to check it, or /stop to shut it down first.'
    );
    return;
  }

  // Get or initialize auth session
  let authSession = db.getAuthSession(telegramId);
  if (!authSession) {
    db.initializeAuthSession(telegramId);
    authSession = db.getAuthSession(telegramId);
  }

  try {
    await ctx.reply(
      '🚀 **Starting Your Agent**\n\n' +
      'Creating your spam-arrester container...\n' +
      'This may take a moment.',
      { parse_mode: 'Markdown' }
    );

    const settings = db.getUserSettings(telegramId);
    if (!settings) {
      await ctx.reply('❌ Settings not found. Try /start to reinitialize.');
      return;
    }

    // Get API credentials from environment
    const apiId = process.env.TG_API_ID;
    const apiHash = process.env.TG_API_HASH;

    if (!apiId || !apiHash) {
      await ctx.reply('❌ Server configuration error. Contact support.');
      logger.error('Missing TG_API_ID or TG_API_HASH');
      return;
    }

    // Create container
    const containerId = await containerMgr.createContainer({
      telegramId,
      apiId,
      apiHash,
      settings,
    });

    // Record in database
    db.createContainer(telegramId, containerId);
    db.updateUserStatus(telegramId, 'active');
    db.addAuditLog(telegramId, 'agent_started', { container_id: containerId });

    logger.info({ telegramId, containerId }, 'Agent container created');

    // Wait a moment for container to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check auth state
    const containerName = `agent-${telegramId}`;
    const authState = await containerMgr.getAuthStateFromLogs(containerName);

    if (authState === 'wait_phone' || authState === 'none') {
      db.updateAuthState(telegramId, 'wait_phone');
      await ctx.reply(
        '📱 **Phone Number Required**\n\n' +
        'Please send your phone number in international format.\n' +
        'Example: +12025551234\n\n' +
        '⚠️ Send it as a regular message (not using Telegram\'s phone sharing feature).',
        { parse_mode: 'Markdown' }
      );
    } else if (authState === 'ready') {
      db.updateAuthState(telegramId, 'ready');
      await ctx.reply(
        '✅ **Agent Started!**\n\n' +
        'Your spam-arrester agent is now running.\n' +
        'It will monitor your private chats for spam.\n\n' +
        'Use /status to monitor statistics.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        '⚠️ **Authentication Required**\n\n' +
        'Your agent is starting. Check auth state with /status.',
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    logger.error({ telegramId, error }, 'Failed to start agent');
    await ctx.reply(
      '❌ Failed to start agent.\n\n' +
      'Error: ' + (error instanceof Error ? error.message : 'Unknown error') + '\n\n' +
      'Please try again or contact support.'
    );
  }
}
