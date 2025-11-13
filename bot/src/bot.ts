import { Telegraf } from 'telegraf';
import { DatabaseManager } from './db/database';
import { ContainerManager } from './services/containerManager';
import { startCommand } from './commands/start';
import { statusCommand } from './commands/status';
import { logger } from './utils/logger';

export function createBot(
  token: string,
  db: DatabaseManager,
  containerMgr: ContainerManager
): Telegraf {
  const bot = new Telegraf(token);

  // Error handling
  bot.catch((err, ctx) => {
    logger.error({ err, userId: ctx.from?.id }, 'Bot error');
    ctx.reply('An error occurred. Please try again or contact support.');
  });

  // Command: /start
  bot.command('start', async (ctx) => {
    await startCommand(ctx, db);
  });

  // Command: /status
  bot.command('status', async (ctx) => {
    await statusCommand(ctx, db, containerMgr);
  });

  // Command: /help
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📚 **Available Commands:**\n\n` +
      `/start - Welcome message and introduction\n` +
      `/login - Start authentication process\n` +
      `/status - Check agent status and statistics\n` +
      `/stats - View detailed metrics history\n` +
      `/settings - Configure spam detection behavior\n` +
      `/pause - Temporarily stop agent\n` +
      `/resume - Restart paused agent\n` +
      `/stop - Stop and remove agent (keeps session)\n` +
      `/reset - Delete session and start over\n` +
      `/help - Show this message\n\n` +
      `Need help? Contact @your_support_channel`,
      { parse_mode: 'Markdown' }
    );
  });

  // TODO: Implement remaining commands
  bot.command('login', async (ctx) => {
    await ctx.reply(
      '🚧 Login flow coming soon!\n\n' +
      'This will guide you through Telegram authentication.'
    );
  });

  bot.command('stats', async (ctx) => {
    await ctx.reply('🚧 Detailed stats coming soon!');
  });

  bot.command('settings', async (ctx) => {
    await ctx.reply('🚧 Settings configuration coming soon!');
  });

  bot.command('pause', async (ctx) => {
    await ctx.reply('🚧 Pause command coming soon!');
  });

  bot.command('resume', async (ctx) => {
    await ctx.reply('🚧 Resume command coming soon!');
  });

  bot.command('stop', async (ctx) => {
    await ctx.reply('🚧 Stop command coming soon!');
  });

  bot.command('reset', async (ctx) => {
    await ctx.reply('🚧 Reset command coming soon!');
  });

  // Handle unknown commands
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) {
      await ctx.reply('Unknown command. Send /help to see available commands.');
    }
  });

  return bot;
}
