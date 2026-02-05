import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';
import { logger } from '../utils/logger';

export async function settingsCommand(
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

  const settings = db.getUserSettings(telegramId);
  if (!settings) {
    await ctx.reply('❌ Settings not found. Try /start to reinitialize.');
    return;
  }

  await displaySettingsMenu(ctx, db);
}

export async function displaySettingsMenu(
  ctx: Context,
  db: DatabaseManager
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const settings = db.getUserSettings(telegramId);
  if (!settings) return;

  const deletionIcon = settings.enable_deletion ? '✅' : '❌';
  const blockingIcon = settings.enable_blocking ? '✅' : '❌';

  const message = 
    '⚙️ *Settings*\n\n' +
    `🎯 *Default Action:* ${settings.default_action}\n` +
    `📊 *Low Threshold:* ${settings.low_threshold}\n` +
    `📊 *Action Threshold:* ${settings.action_threshold}\n` +
    `🗑️ *Deletion:* ${deletionIcon} ${settings.enable_deletion ? 'Enabled' : 'Disabled'}\n` +
    `🚫 *Blocking:* ${blockingIcon} ${settings.enable_blocking ? 'Enabled' : 'Disabled'}\n\n` +
    'Choose what to configure:';

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🎯 Default Action', 'settings_action')],
    [
      Markup.button.callback('📊 Thresholds', 'settings_thresholds'),
    ],
    [
      Markup.button.callback(`🗑️ Deletion (${settings.enable_deletion ? 'ON' : 'OFF'})`, 'settings_deletion'),
      Markup.button.callback(`🚫 Blocking (${settings.enable_blocking ? 'ON' : 'OFF'})`, 'settings_blocking'),
    ],
    [Markup.button.callback('🔙 Close', 'settings_close')],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
  }
}

export async function handleActionSetting(
  ctx: Context,
  db: DatabaseManager,
  _containerMgr: ContainerManager
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const settings = db.getUserSettings(telegramId);
  if (!settings) return;

  const message = 
    '🎯 *Default Action*\n\n' +
    'Choose what happens when spam is detected:\n\n' +
    '*log* - Only log detection (safest)\n' +
    '*archive* - Archive the chat (recommended)\n' +
    '*block* - Block and delete (most aggressive)\n\n' +
    `Current: ${settings.default_action}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📝 Log only', 'action_log')],
    [Markup.button.callback('📁 Archive', 'action_archive')],
    [Markup.button.callback('🚫 Block', 'action_block')],
    [Markup.button.callback('🔙 Back', 'settings_menu')],
  ]);

  await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
}

export async function handleThresholdsSetting(
  ctx: Context,
  db: DatabaseManager
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const settings = db.getUserSettings(telegramId);
  if (!settings) return;

  const message = 
    '📊 *Detection Thresholds*\n\n' +
    `*Low Threshold:* ${settings.low_threshold}\n` +
    `Minimum score to flag as spam\n\n` +
    `*Action Threshold:* ${settings.action_threshold}\n` +
    `Score to take blocking action\n\n` +
    'Adjust thresholds:';

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('Low: 0.2', 'threshold_low_0.2'),
      Markup.button.callback('Low: 0.3', 'threshold_low_0.3'),
      Markup.button.callback('Low: 0.4', 'threshold_low_0.4'),
    ],
    [
      Markup.button.callback('Action: 0.7', 'threshold_action_0.7'),
      Markup.button.callback('Action: 0.85', 'threshold_action_0.85'),
      Markup.button.callback('Action: 0.9', 'threshold_action_0.9'),
    ],
    [Markup.button.callback('🔙 Back', 'settings_menu')],
  ]);

  await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
}

export async function updateSetting(
  ctx: Context,
  db: DatabaseManager,
  _containerMgr: ContainerManager,
  setting: string,
  value: any
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const updates: any = {};
    updates[setting] = value;
    
    db.updateUserSettings(telegramId, updates);
    db.addAuditLog(telegramId, 'settings_changed', { setting, value });

    // If there's an active container, it will pick up new settings on restart
    // For immediate effect, user would need to restart the container

    logger.info({ telegramId, setting, value }, 'User updated settings');

    await ctx.answerCbQuery(`✅ Updated ${setting}`);
    
    // Refresh the settings menu
    await displaySettingsMenu(ctx, db);
  } catch (error) {
    logger.error({ telegramId, error }, 'Failed to update settings');
    await ctx.answerCbQuery('❌ Failed to update settings');
  }
}

export async function toggleSetting(
  ctx: Context,
  db: DatabaseManager,
  containerMgr: ContainerManager,
  setting: 'enable_deletion' | 'enable_blocking'
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const settings = db.getUserSettings(telegramId);
  if (!settings) return;

  const currentValue = settings[setting];
  const newValue = currentValue ? 0 : 1;

  await updateSetting(ctx, db, containerMgr, setting, newValue);
}
