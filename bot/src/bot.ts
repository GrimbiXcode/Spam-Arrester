import { Telegraf } from 'telegraf';
import { DatabaseManager } from './db/database';
import { ContainerManager } from './services/containerManager';
import { startCommand } from './commands/start';
import { statusCommand } from './commands/status';
import { statsCommand, displayStats } from './commands/stats';
import { settingsCommand, displaySettingsMenu, handleActionSetting, handleThresholdsSetting, updateSetting, toggleSetting } from './commands/settings';
import { pauseCommand } from './commands/pause';
import { resumeCommand } from './commands/resume';
import { stopCommand, confirmStop, cancelStop } from './commands/stop';
import { resetCommand, confirmReset1, confirmReset2, cancelReset } from './commands/reset';
import { loginCommand } from './commands/login';
import { logsCommand } from './commands/logs';
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

  // Command: /stats
  bot.command('stats', async (ctx) => {
    await statsCommand(ctx, db);
  });

  // Command: /settings
  bot.command('settings', async (ctx) => {
    await settingsCommand(ctx, db);
  });

  // Command: /pause
  bot.command('pause', async (ctx) => {
    await pauseCommand(ctx, db, containerMgr);
  });

  // Command: /resume
  bot.command('resume', async (ctx) => {
    await resumeCommand(ctx, db, containerMgr);
  });

  // Command: /stop
  bot.command('stop', async (ctx) => {
    await stopCommand(ctx, db);
  });

  // Command: /reset
  bot.command('reset', async (ctx) => {
    await resetCommand(ctx, db);
  });

  // Command: /login
  bot.command('login', async (ctx) => {
    await loginCommand(ctx, db, containerMgr);
  });

  // Command: /logs
  bot.command('logs', async (ctx) => {
    await logsCommand(ctx, db, containerMgr);
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
      `/logs - View container logs\n` +
      `/help - Show this message\n\n` +
      `Need help? Contact @your_support_channel`,
      { parse_mode: 'Markdown' }
    );
  });

  // Callback query handlers for inline keyboards
  bot.action(/.*/, async (ctx) => {
    const action = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';

    // Stats callbacks
    if (action === 'stats_24h') {
      await displayStats(ctx, db, 24);
    } else if (action === 'stats_7d') {
      await displayStats(ctx, db, 168);
    } else if (action === 'stats_30d') {
      await displayStats(ctx, db, 720);
    } else if (action === 'stats_all') {
      await displayStats(ctx, db, null);
    }

    // Settings callbacks
    else if (action === 'settings_menu') {
      await displaySettingsMenu(ctx, db);
    } else if (action === 'settings_action') {
      await handleActionSetting(ctx, db, containerMgr);
    } else if (action === 'settings_thresholds') {
      await handleThresholdsSetting(ctx, db);
    } else if (action === 'settings_deletion') {
      await toggleSetting(ctx, db, containerMgr, 'enable_deletion');
    } else if (action === 'settings_blocking') {
      await toggleSetting(ctx, db, containerMgr, 'enable_blocking');
    } else if (action === 'settings_close') {
      await ctx.answerCbQuery();
      await ctx.deleteMessage();
    }

    // Action setting callbacks
    else if (action === 'action_log') {
      await updateSetting(ctx, db, containerMgr, 'default_action', 'log');
    } else if (action === 'action_archive') {
      await updateSetting(ctx, db, containerMgr, 'default_action', 'archive');
    } else if (action === 'action_block') {
      await updateSetting(ctx, db, containerMgr, 'default_action', 'block');
    }

    // Threshold callbacks
    else if (action.startsWith('threshold_')) {
      const parts = action.split('_');
      const type = parts[1]; // 'low' or 'action'
      const value = parseFloat(parts[2]);
      const setting = type === 'low' ? 'low_threshold' : 'action_threshold';
      await updateSetting(ctx, db, containerMgr, setting, value);
    }

    // Stop callbacks
    else if (action === 'stop_confirm') {
      await confirmStop(ctx, db, containerMgr);
    } else if (action === 'stop_cancel') {
      await cancelStop(ctx);
    }

    // Reset callbacks
    else if (action === 'reset_confirm_1') {
      await confirmReset1(ctx, db);
    } else if (action === 'reset_confirm_2') {
      await confirmReset2(ctx, db, containerMgr);
    } else if (action === 'reset_cancel') {
      await cancelReset(ctx);
    }

    // Unknown callback
    else {
      await ctx.answerCbQuery('Unknown action');
    }
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
