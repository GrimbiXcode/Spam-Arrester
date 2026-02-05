import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';
import { logger } from '../utils/logger';

export async function stopCommand(
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

  const container = db.getActiveContainer(telegramId);
  if (!container) {
    await ctx.reply('❌ No active container to stop.');
    return;
  }

  // Show confirmation dialog
  await ctx.reply(
    '⚠️ *Stop Agent*\n\n' +
    'This will:\n' +
    '• Stop your spam-arrester agent\n' +
    '• Remove the container\n' +
    '• Keep your session data for future use\n\n' +
    'Are you sure?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Yes, Stop', 'stop_confirm'),
          Markup.button.callback('❌ Cancel', 'stop_cancel'),
        ],
      ])
    }
  );
}

export async function confirmStop(
  ctx: Context,
  db: DatabaseManager,
  containerMgr: ContainerManager
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.answerCbQuery('Error: Could not identify user.');
    return;
  }

  const container = db.getActiveContainer(telegramId);
  if (!container) {
    await ctx.answerCbQuery('No active container found.');
    await ctx.editMessageText('❌ No active container to stop.');
    return;
  }

  try {
    const containerName = `agent-${telegramId}`;
    
    // Stop and remove container
    await containerMgr.stopContainer(containerName);
    await containerMgr.removeContainer(containerName);
    
    // Update database
    db.updateContainerStatus(container.container_id, 'stopped');
    db.updateUserStatus(telegramId, 'stopped');
    db.addAuditLog(telegramId, 'agent_stopped', { container_id: container.container_id });

    logger.info({ telegramId, containerId: container.container_id }, 'Agent stopped by user');

    await ctx.answerCbQuery('✅ Agent stopped');
    await ctx.editMessageText(
      '🛑 *Agent Stopped*\n\n' +
      'Your spam-arrester agent has been stopped and removed.\n' +
      'Your session data is preserved.\n\n' +
      'Send /login to start a new agent.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ telegramId, error }, 'Failed to stop agent');
    await ctx.answerCbQuery('❌ Failed to stop agent');
    await ctx.editMessageText('❌ Failed to stop agent. Please try again or contact support.');
  }
}

export async function cancelStop(ctx: Context): Promise<void> {
  await ctx.answerCbQuery('Cancelled');
  await ctx.editMessageText('❌ Stop cancelled. Your agent continues running.');
}
