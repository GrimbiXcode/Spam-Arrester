import { Context } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';
import { logger } from '../utils/logger';

export async function resumeCommand(
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

  if (user.status !== 'paused') {
    await ctx.reply('❌ Agent is not paused. Use /status to check current state.');
    return;
  }

  // Get the most recent container (should be in stopped state)
  const container = db.getActiveContainer(telegramId);
  if (!container) {
    await ctx.reply(
      '❌ No container found to resume.\n' +
      'Your session may have been removed. Use /login to start fresh.'
    );
    return;
  }

  try {
    // Restart the container
    const containerName = `agent-${telegramId}`;
    await containerMgr.restartContainer(containerName);
    
    // Update database
    db.updateContainerStatus(container.container_id, 'running');
    db.updateUserStatus(telegramId, 'active');
    db.addAuditLog(telegramId, 'agent_resumed', { container_id: container.container_id });

    logger.info({ telegramId, containerId: container.container_id }, 'Agent resumed by user');

    await ctx.reply(
      '▶️ **Agent Resumed**\n\n' +
      'Your spam-arrester agent is now running again.\n' +
      'It will continue monitoring your private chats.\n\n' +
      'Use /status to check statistics.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ telegramId, error }, 'Failed to resume agent');
    await ctx.reply(
      '❌ Failed to resume agent.\n\n' +
      'The container may no longer exist. Try /login to start a new one.'
    );
  }
}
