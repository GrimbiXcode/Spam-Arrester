import { Client } from 'tdl';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RateLimiter } from '../utils/rateLimiter';
import { metrics } from '../utils/metrics';
import { SpamDetectionResult } from './spamDetector';

export class ActionHandler {
  private deleteRateLimiter: RateLimiter;
  private blockRateLimiter: RateLimiter;

  constructor() {
    this.deleteRateLimiter = new RateLimiter(config.rateLimits.maxDeletesPerMinute);
    this.blockRateLimiter = new RateLimiter(config.rateLimits.maxBlocksPerMinute);
  }

  async handleSpam(
    client: Client,
    chatId: number,
    userId: number,
    detection: SpamDetectionResult
  ): Promise<void> {
    const action = this.determineAction(detection);

    logger.info({
      chatId,
      userId,
      action,
      score: detection.score,
      reasons: detection.reasons,
    }, 'Taking action on spam');

    switch (action) {
      case 'block':
        await this.blockAndDelete(client, chatId, userId);
        break;
      case 'archive':
        await this.archiveChat(client, chatId);
        break;
      case 'log':
        logger.info({ chatId, userId }, 'Logging spam (no action taken)');
        break;
    }
  }

  private determineAction(detection: SpamDetectionResult): 'block' | 'archive' | 'log' {
    if (detection.score >= config.thresholds.actionThreshold) {
      return config.actions.enableDeletion ? 'block' : 'archive';
    }
    const defaultAction = config.actions.defaultAction;
    // Ensure defaultAction is compatible with our return type
    if (defaultAction === 'delete') {
      return 'block'; // Map 'delete' to 'block' for backwards compatibility
    }
    return defaultAction;
  }

  private async blockAndDelete(client: Client, chatId: number, userId: number): Promise<void> {
    try {
      // Check rate limits
      if (!this.blockRateLimiter.canPerformAction() || !this.deleteRateLimiter.canPerformAction()) {
        logger.warn({ chatId, userId }, 'Rate limit exceeded, archiving instead');
        metrics.incrementRateLimitHits();
        await this.archiveChat(client, chatId);
        return;
      }

      // Block user
      if (config.actions.enableBlocking) {
        await client.invoke({
          _: 'setMessageSenderBlockList',
          sender_id: { _: 'messageSenderUser', user_id: userId },
          block_list: { _: 'blockListMain' },
        });
        this.blockRateLimiter.recordAction();
        logger.info({ userId }, 'User blocked');
      }

      // Delete chat history
      await client.invoke({
        _: 'deleteChatHistory',
        chat_id: chatId,
        remove_from_chat_list: config.actions.removeFromChatList,
        revoke: config.actions.revokeMessages,
      });
      this.deleteRateLimiter.recordAction();
      metrics.incrementSpamBlocked();

      logger.info({ chatId, userId }, 'Chat deleted and user blocked');
    } catch (error) {
      logger.error({ chatId, userId, error }, 'Error blocking/deleting spam');
      throw error;
    }
  }

  private async archiveChat(client: Client, chatId: number): Promise<void> {
    try {
      await client.invoke({
        _: 'addChatToList',
        chat_id: chatId,
        chat_list: { _: 'chatListArchive' },
      });
      metrics.incrementSpamArchived();
      logger.info({ chatId }, 'Chat archived');
    } catch (error) {
      logger.error({ chatId, error }, 'Error archiving chat');
      throw error;
    }
  }

  getRemainingActions(): { deletes: number; blocks: number } {
    return {
      deletes: this.deleteRateLimiter.getRemainingActions(),
      blocks: this.blockRateLimiter.getRemainingActions(),
    };
  }
}
