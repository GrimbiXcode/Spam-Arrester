import { Context } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';
import { logger } from '../utils/logger';

export async function pauseCommand(
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

  if (user.status === 'paused') {
    await ctx.reply('⏸️ Your agent is already paused.');
    return;
  }

  const container = db.getActiveContainer(telegramId);
  if (!container) {
    await ctx.reply('❌ No active agent to pause. Send /login to start one.');
    return;
  }

  try {
    // Stop the container
    const containerName = `agent-${telegramId}`;
    await containerMgr.stopContainer(containerName);
    
    // Update database
    db.updateContainerStatus(container.container_id, 'stopped');
    db.updateUserStatus(telegramId, 'paused');
    db.addAuditLog(telegramId, 'agent_paused', { container_id: container.container_id });

    logger.info({ telegramId, containerId: container.container_id }, 'Agent paused by user');

    await ctx.reply(
      '⏸️ **Agent Paused**\n\n' +
      'Your spam-arrester agent has been stopped.\n' +
      'Your session is preserved.\n\n' +
      'Send /resume to restart it.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ telegramId, error }, 'Failed to pause agent');
    await ctx.reply('❌ Failed to pause agent. Please try again or contact support.');
  }
}
