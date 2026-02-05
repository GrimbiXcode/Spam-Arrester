import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import type { DatabaseManager } from '../db/database';

export async function statsCommand(
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

  // Show time period selection
  await ctx.reply(
    '📊 *Statistics*\n\nSelect a time period:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('24 hours', 'stats_24h'),
          Markup.button.callback('7 days', 'stats_7d'),
        ],
        [
          Markup.button.callback('30 days', 'stats_30d'),
          Markup.button.callback('All time', 'stats_all'),
        ],
      ])
    }
  );
}

export async function displayStats(
  ctx: Context,
  db: DatabaseManager,
  hours: number | null
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.answerCbQuery('Error: Could not identify user.');
    return;
  }

  let metrics;
  let periodLabel;

  if (hours === null) {
    // All time - get all metrics
    metrics = db.getMetricsHistory(telegramId, 24 * 365); // ~1 year max
    periodLabel = 'All Time';
  } else {
    metrics = db.getMetricsHistory(telegramId, hours);
    if (hours === 24) {
      periodLabel = 'Last 24 Hours';
    } else if (hours === 168) {
      periodLabel = 'Last 7 Days';
    } else if (hours === 720) {
      periodLabel = 'Last 30 Days';
    } else {
      periodLabel = `Last ${hours} Hours`;
    }
  }

  if (metrics.length === 0) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `📊 *Statistics - ${periodLabel}*\n\n` +
      '❌ No data available for this period.\n\n' +
      'Your agent needs to be running to collect metrics.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Calculate aggregated statistics
  const latest = metrics[0]; // Most recent
  const oldest = metrics[metrics.length - 1]; // Oldest in period

  const totalMessages = latest.messages_processed - (oldest.messages_processed || 0);
  const totalSpam = latest.spam_detected - (oldest.spam_detected || 0);
  const totalArchived = latest.spam_archived - (oldest.spam_archived || 0);
  const totalBlocked = latest.spam_blocked - (oldest.spam_blocked || 0);
  
  const avgSpamRate = totalMessages > 0 
    ? (totalSpam / totalMessages * 100).toFixed(1) 
    : '0.0';

  // Create simple text-based chart for spam rate over time
  let chart = '';
  if (metrics.length >= 5) {
    const samples = 10;
    const step = Math.max(1, Math.floor(metrics.length / samples));
    const sampled = [];
    
    for (let i = metrics.length - 1; i >= 0; i -= step) {
      sampled.push(metrics[i].spam_rate * 100);
    }
    
    chart = '\n📈 *Spam Rate Trend:*\n';
    const maxRate = Math.max(...sampled, 1);
    
    for (const rate of sampled.reverse()) {
      const barLength = Math.round((rate / maxRate) * 15);
      const bar = '█'.repeat(barLength) + '░'.repeat(15 - barLength);
      chart += `${bar} ${rate.toFixed(1)}%\n`;
    }
  }

  let message = `📊 *Statistics - ${periodLabel}*\n\n`;
  message += `📨 *Messages Processed:* ${totalMessages}\n`;
  message += `🚨 *Spam Detected:* ${totalSpam}\n`;
  message += `📁 *Archived:* ${totalArchived}\n`;
  message += `🚫 *Blocked:* ${totalBlocked}\n`;
  message += `📈 *Average Spam Rate:* ${avgSpamRate}%\n`;
  
  if (chart) {
    message += chart;
  }

  message += `\n🕐 *Data Points:* ${metrics.length} snapshots\n`;
  message += `\nUse /status for current statistics.`;

  await ctx.answerCbQuery();
  await ctx.editMessageText(message, { parse_mode: 'Markdown' });
}
