import { Context, Markup } from 'telegraf';
import { randomBytes } from 'crypto';
import type { DatabaseManager } from '../db/database';
import type { ContainerManager } from '../services/containerManager';
import { logger } from '../utils/logger';

// Store pre-auth tokens (token -> telegramId mapping)
// This is exported so webApi can access it
export const preAuthTokens = new Map<string, { telegramId: number; createdAt: number }>();

// Clean up expired tokens (older than 10 minutes)
const tokenCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, data] of preAuthTokens.entries()) {
    if (now - data.createdAt > 600000) {
      preAuthTokens.delete(token);
    }
  }
}, 60000);

// Export for testing - allows stopping the interval
export function stopTokenCleanup(): void {
  clearInterval(tokenCleanupInterval);
}

export async function loginCommand(
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

  // Check if already has an active container
  const existingContainer = db.getActiveContainer(telegramId);
  if (existingContainer) {
    // Check if container is authenticated
    const containerName = `agent-${telegramId}`;
    try {
      const authStatus = await containerMgr.getAuthStatus(containerName);
      if (authStatus === 'ready') {
        await ctx.reply(
          '✅ You already have an authenticated agent running.\n\n' +
          'Use /status to check it, or /stop to shut it down first.'
        );
        return;
      }
    } catch (error) {
      // Container might not be running, continue
      logger.debug({ telegramId, error }, 'Failed to get auth status');
    }
  }

  // Generate a pre-auth token linked to this user's real Telegram ID
  const preAuthToken = randomBytes(32).toString('hex');
  preAuthTokens.set(preAuthToken, { telegramId, createdAt: Date.now() });

  // Redirect to web app for authentication with pre-auth token
  const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
  const loginUrl = `${webAppUrl}?token=${preAuthToken}`;

  const isLocalhost = loginUrl.includes('localhost') || loginUrl.includes('127.0.0.1');

  const messageText =
    '🔐 <b>Authentication Required</b>\n\n' +
    'To set up your spam detection agent, please authenticate via our secure web interface.\n\n' +
    (isLocalhost ? `👉 Open this link in your browser:\n<code>${loginUrl}</code>\n\n` : '') +
    '<b>How it works:</b>\n' +
    '1️⃣ Scan the QR code with your Telegram mobile app\n' +
    '2️⃣ Confirm the login in Telegram\n' +
    '3️⃣ Enter 2FA password if prompted\n' +
    '4️⃣ Return here to use the bot\n\n' +
    '✅ Your credentials are never shared with us!';

  // Telegram doesn't allow localhost URLs in inline buttons, so only add button for public URLs
  if (isLocalhost) {
    await ctx.reply(messageText, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(messageText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        Markup.button.url('🔗 Open Login Page', loginUrl)
      ])
    });
  }

  logger.info({ telegramId, preAuthToken }, 'User redirected to web app for login with pre-auth token');
}
