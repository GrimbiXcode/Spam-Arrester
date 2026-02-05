import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';
import { logger } from '../utils/logger';

export async function resetCommand(
  ctx: Context,
  db: DatabaseManager
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

  // Show first confirmation dialog
  await ctx.reply(
    '⚠️ *DANGER: Reset Session*\n\n' +
    'This will:\n' +
    '• Stop and remove your agent container\n' +
    '• *DELETE ALL SESSION DATA*\n' +
    '• *YOU WILL NEED TO RE-AUTHENTICATE*\n\n' +
    '⚠️ This action CANNOT be undone!\n\n' +
    'Are you absolutely sure?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('⚠️ Yes, Reset Everything', 'reset_confirm_1'),
        ],
        [
          Markup.button.callback('❌ Cancel', 'reset_cancel'),
        ],
      ])
    }
  );
}

export async function confirmReset1(
  ctx: Context,
  _db: DatabaseManager
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.answerCbQuery('Error: Could not identify user.');
    return;
  }

  // Show second confirmation
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '🚨 *FINAL WARNING*\n\n' +
    'This will permanently delete:\n' +
    '• Your Telegram session\n' +
    '• All authentication data\n' +
    '• Container and logs\n\n' +
    '*This CANNOT be recovered!*\n\n' +
    'Click "CONFIRM DELETE" to proceed:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🗑️ CONFIRM DELETE', 'reset_confirm_2'),
        ],
        [
          Markup.button.callback('❌ Cancel', 'reset_cancel'),
        ],
      ])
    }
  );
}

export async function confirmReset2(
  ctx: Context,
  db: DatabaseManager,
  containerMgr: ContainerManager
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.answerCbQuery('Error: Could not identify user.');
    return;
  }

  try {
    await ctx.answerCbQuery('Processing reset...');
    await ctx.editMessageText('🔄 Resetting your session...');

    // Stop and remove container if exists
    const container = db.getActiveContainer(telegramId);
    if (container) {
      try {
        const containerName = `agent-${telegramId}`;
        await containerMgr.stopContainer(containerName);
        await containerMgr.removeContainer(containerName);
        db.updateContainerStatus(container.container_id, 'stopped');
      } catch (error) {
        logger.warn({ telegramId, error }, 'Error stopping container during reset');
      }
    }

    // Delete session directory
    const sessionsDir = process.env.SESSIONS_DIR || '../sessions';
    const sessionPath = join(sessionsDir, telegramId.toString());
    
    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
      logger.info({ telegramId, sessionPath }, 'Deleted session directory');
    } catch (error) {
      logger.warn({ telegramId, error }, 'Error deleting session directory');
    }

    // Reset auth session in database
    db.initializeAuthSession(telegramId);
    db.updateUserStatus(telegramId, 'stopped');
    db.addAuditLog(telegramId, 'session_reset');

    logger.info({ telegramId }, 'Session reset by user');

    await ctx.editMessageText(
      '✅ *Session Reset Complete*\n\n' +
      'All data has been deleted:\n' +
      '✓ Container removed\n' +
      '✓ Session data deleted\n' +
      '✓ Authentication cleared\n\n' +
      'You can start fresh with /login',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ telegramId, error }, 'Failed to reset session');
    await ctx.editMessageText(
      '❌ Failed to complete reset.\n\n' +
      'Some data may have been partially deleted. Please contact support.'
    );
  }
}

export async function cancelReset(ctx: Context): Promise<void> {
  await ctx.answerCbQuery('Cancelled');
  await ctx.editMessageText('✅ Reset cancelled. Your data is safe.');
}
