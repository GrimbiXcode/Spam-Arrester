import { Context } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';
import { logger } from '../utils/logger';

export async function logsCommand(
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

  const container = db.getActiveContainer(telegramId);
  if (!container) {
    await ctx.reply('❌ No active container. Send /login to start one.');
    return;
  }

  try {
    const containerName = `agent-${telegramId}`;
    const logs = await containerMgr.getContainerLogs(containerName, 50);

    if (!logs || logs.trim().length === 0) {
      await ctx.reply('📄 No logs available yet.');
      return;
    }

    // Telegram has a message length limit of 4096 characters
    const maxLength = 4000; // Leave some room for formatting
    let logContent = logs.trim();
    
    if (logContent.length > maxLength) {
      logContent = logContent.slice(-maxLength);
      logContent = '...(truncated)\n' + logContent;
    }

    await ctx.reply(
      `📄 **Container Logs** (last 50 lines)\n\n\`\`\`\n${logContent}\n\`\`\``,
      { parse_mode: 'Markdown' }
    );

    logger.info({ telegramId }, 'User viewed container logs');
  } catch (error) {
    logger.error({ telegramId, error }, 'Failed to fetch logs');
    await ctx.reply('❌ Failed to fetch logs. The container may not be running.');
  }
}
