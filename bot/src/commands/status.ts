import { Context } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';

export async function statusCommand(
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
    await ctx.reply(
      `📊 **Status: Not Running**\n\n` +
      `Your spam-arrester agent is not active.\n` +
      `Send /login to start it.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Get container status from Docker
  const containerName = `agent-${telegramId}`;
  const dockerStatus = await containerMgr.getContainerStatus(containerName);

  // Get latest metrics
  const metrics = db.getLatestMetrics(telegramId);

  // Format uptime
  let uptimeStr = 'unknown';
  if (dockerStatus.uptime) {
    const hours = Math.floor(dockerStatus.uptime / 3600);
    const minutes = Math.floor((dockerStatus.uptime % 3600) / 60);
    uptimeStr = `${hours}h ${minutes}m`;
  }

  // Build status message
  let statusIcon = '🟢';
  let statusText = 'Running';
  
  if (dockerStatus.status === 'stopped') {
    statusIcon = '🔴';
    statusText = 'Stopped';
  } else if (container.status === 'starting') {
    statusIcon = '🟡';
    statusText = 'Starting';
  } else if (container.status === 'failed') {
    statusIcon = '🔴';
    statusText = 'Failed';
  }

  let message = `${statusIcon} **Status: ${statusText}**\n\n`;
  
  if (dockerStatus.status === 'running') {
    message += `⏱️ Uptime: ${uptimeStr}\n`;
  }

  if (metrics) {
    message += `\n📈 **Statistics:**\n`;
    message += `• Messages processed: ${metrics.messages_processed}\n`;
    message += `• Spam detected: ${metrics.spam_detected}\n`;
    message += `• Spam archived: ${metrics.spam_archived}\n`;
    message += `• Spam blocked: ${metrics.spam_blocked}\n`;
    if (metrics.messages_processed > 0) {
      message += `• Spam rate: ${(metrics.spam_rate * 100).toFixed(1)}%\n`;
    }
  }

  const settings = db.getUserSettings(telegramId);
  if (settings) {
    message += `\n⚙️ **Settings:**\n`;
    message += `• Mode: ${settings.default_action}\n`;
    message += `• Deletion: ${settings.enable_deletion ? '✅ enabled' : '❌ disabled'}\n`;
    message += `• Blocking: ${settings.enable_blocking ? '✅ enabled' : '❌ disabled'}\n`;
  }

  message += `\nUse /settings to configure or /stats for detailed history.`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
