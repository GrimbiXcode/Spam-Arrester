import { Client } from 'tdl';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';
import { detectSpam, getUserProfile } from './spamDetector';
import { ActionHandler } from './actionHandler';

export class MessageHandler {
  private actionHandler: ActionHandler;

  constructor() {
    this.actionHandler = new ActionHandler();
  }

  async handleNewMessage(client: Client, update: any): Promise<void> {
    try {
      const { message } = update;

      // Ignore outgoing messages
      if (message.is_outgoing) {
        return;
      }

      // Get chat information
      const chat = await client.invoke({
        _: 'getChat',
        chat_id: message.chat_id,
      });

      // Only process private chats
      if (chat.type._ !== 'chatTypePrivate') {
        return;
      }

      metrics.incrementMessagesProcessed();

      const userId = chat.type.user_id;

      // Get user profile information
      const userProfile = await getUserProfile(client, userId, message.chat_id);

      // Detect spam using heuristics
      const detection = await detectSpam(client, message, userProfile);

      if (detection.isSpam) {
        metrics.incrementSpamDetected();
        await this.actionHandler.handleSpam(client, message.chat_id, userId, detection);
      } else {
        logger.debug({
          chatId: message.chat_id,
          userId,
          score: detection.score,
        }, 'Message is not spam');
      }
    } catch (error) {
      logger.error({ error, update }, 'Error handling message');
    }
  }

  getMetrics() {
    return {
      ...metrics.getMetrics(),
      spamRate: metrics.getSpamRate(),
      remainingActions: this.actionHandler.getRemainingActions(),
    };
  }
}
