import { ActionHandler } from '../actionHandler';
import { SpamDetectionResult } from '../spamDetector';
import { Client } from 'tdl';

// Mock dependencies
jest.mock('../../config', () => ({
  config: {
    thresholds: {
      actionThreshold: 0.85,
    },
    rateLimits: {
      maxDeletesPerMinute: 5,
      maxBlocksPerMinute: 10,
    },
    actions: {
      defaultAction: 'log',
      enableBlocking: true,
      enableDeletion: false,
      removeFromChatList: true,
      revokeMessages: true,
    },
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../utils/metrics', () => ({
  metrics: {
    incrementSpamBlocked: jest.fn(),
    incrementSpamArchived: jest.fn(),
    incrementRateLimitHits: jest.fn(),
  },
}));

const { logger } = require('../../utils/logger');
const { metrics } = require('../../utils/metrics');
const { config } = require('../../config');

describe('ActionHandler', () => {
  let actionHandler: ActionHandler;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    actionHandler = new ActionHandler();
    mockClient = {
      invoke: jest.fn(),
    } as any;
    jest.clearAllMocks();
  });

  describe('handleSpam', () => {
    it('should log only when score is below action threshold and default action is log', async () => {
      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.5,
        reasons: ['sender_not_in_contacts'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      expect(mockClient.invoke).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'log' }),
        'Taking action on spam'
      );
    });

    it('should archive when score is above action threshold but deletion is disabled', async () => {
      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.9,
        reasons: ['sender_not_in_contacts', 'suspicious_content_pattern'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      expect(mockClient.invoke).toHaveBeenCalledWith({
        _: 'addChatToList',
        chat_id: 12345,
        chat_list: { _: 'chatListArchive' },
      });
      expect(metrics.incrementSpamArchived).toHaveBeenCalled();
    });

    it('should block and delete when score is above action threshold and deletion is enabled', async () => {
      // Enable deletion for this test
      config.actions.enableDeletion = true;

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.95,
        reasons: ['sender_not_in_contacts', 'no_common_groups', 'suspicious_content_pattern'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      expect(mockClient.invoke).toHaveBeenCalledWith({
        _: 'setMessageSenderBlockList',
        sender_id: { _: 'messageSenderUser', user_id: 67890 },
        block_list: { _: 'blockListMain' },
      });

      expect(mockClient.invoke).toHaveBeenCalledWith({
        _: 'deleteChatHistory',
        chat_id: 12345,
        remove_from_chat_list: true,
        revoke: true,
      });

      expect(metrics.incrementSpamBlocked).toHaveBeenCalled();

      // Reset config
      config.actions.enableDeletion = false;
    });

    it('should respect rate limits and fallback to archive', async () => {
      config.actions.enableDeletion = true;

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.95,
        reasons: ['sender_not_in_contacts'],
      };

      // Exhaust the rate limit (5 deletes per minute)
      for (let i = 0; i < 5; i++) {
        await actionHandler.handleSpam(mockClient, 10000 + i, 20000 + i, detection);
      }

      // Clear mock to check next call
      mockClient.invoke.mockClear();
      metrics.incrementSpamBlocked.mockClear();

      // Next call should fallback to archive
      await actionHandler.handleSpam(mockClient, 99999, 88888, detection);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: 99999 }),
        'Rate limit exceeded, archiving instead'
      );
      expect(mockClient.invoke).toHaveBeenCalledWith({
        _: 'addChatToList',
        chat_id: 99999,
        chat_list: { _: 'chatListArchive' },
      });
      expect(metrics.incrementRateLimitHits).toHaveBeenCalled();
      expect(metrics.incrementSpamArchived).toHaveBeenCalled();
      expect(metrics.incrementSpamBlocked).not.toHaveBeenCalled();

      config.actions.enableDeletion = false;
    });

    it('should not block if blocking is disabled', async () => {
      config.actions.enableDeletion = true;
      config.actions.enableBlocking = false;

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.95,
        reasons: ['sender_not_in_contacts'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      // Should still delete chat history but not block
      expect(mockClient.invoke).not.toHaveBeenCalledWith(
        expect.objectContaining({ _: 'setMessageSenderBlockList' })
      );
      expect(mockClient.invoke).toHaveBeenCalledWith({
        _: 'deleteChatHistory',
        chat_id: 12345,
        remove_from_chat_list: true,
        revoke: true,
      });

      config.actions.enableDeletion = false;
      config.actions.enableBlocking = true;
    });

    it('should handle errors gracefully', async () => {
      config.actions.enableDeletion = true;
      mockClient.invoke.mockRejectedValueOnce(new Error('TDLib error'));

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.95,
        reasons: ['sender_not_in_contacts'],
      };

      await expect(
        actionHandler.handleSpam(mockClient, 12345, 67890, detection)
      ).rejects.toThrow('TDLib error');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error blocking/deleting spam'
      );

      config.actions.enableDeletion = false;
    });

    it('should use default action for medium scores', async () => {
      config.actions.defaultAction = 'archive';

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.5, // Below action threshold
        reasons: ['sender_not_in_contacts'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      expect(mockClient.invoke).toHaveBeenCalledWith({
        _: 'addChatToList',
        chat_id: 12345,
        chat_list: { _: 'chatListArchive' },
      });

      config.actions.defaultAction = 'log';
    });
  });

  describe('getRemainingActions', () => {
    it('should return initial remaining actions', () => {
      const remaining = actionHandler.getRemainingActions();

      expect(remaining.deletes).toBe(5);
      expect(remaining.blocks).toBe(10);
    });

    it('should decrease remaining actions after operations', async () => {
      config.actions.enableDeletion = true;

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.95,
        reasons: ['sender_not_in_contacts'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      const remaining = actionHandler.getRemainingActions();
      expect(remaining.deletes).toBe(4);
      expect(remaining.blocks).toBe(9);

      config.actions.enableDeletion = false;
    });

    it('should track delete and block limits independently', async () => {
      config.actions.enableDeletion = true;

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.95,
        reasons: ['sender_not_in_contacts'],
      };

      // Perform 3 block+delete operations
      for (let i = 0; i < 3; i++) {
        await actionHandler.handleSpam(mockClient, 10000 + i, 20000 + i, detection);
      }

      const remaining = actionHandler.getRemainingActions();
      expect(remaining.deletes).toBe(2); // 5 - 3 = 2
      expect(remaining.blocks).toBe(7);  // 10 - 3 = 7

      config.actions.enableDeletion = false;
    });
  });

  describe('determineAction', () => {
    it('should return block when score exceeds action threshold and deletion enabled', async () => {
      config.actions.enableDeletion = true;

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.9,
        reasons: ['sender_not_in_contacts'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'block' }),
        'Taking action on spam'
      );

      config.actions.enableDeletion = false;
    });

    it('should return archive when score exceeds threshold but deletion disabled', async () => {
      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.9,
        reasons: ['sender_not_in_contacts'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'archive' }),
        'Taking action on spam'
      );
    });

    it('should map legacy "delete" action to "block"', async () => {
      // Reset to fresh handler to avoid rate limit issues from previous tests
      actionHandler = new ActionHandler();
      config.actions.defaultAction = 'delete';
      config.actions.enableDeletion = true;

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.5,
        reasons: ['sender_not_in_contacts'],
      };

      await actionHandler.handleSpam(mockClient, 12345, 67890, detection);

      // Since score < actionThreshold and defaultAction is 'delete', it maps to 'block'
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'block' }),
        'Taking action on spam'
      );
      // When enableDeletion is true, block action will actually block and delete
      expect(mockClient.invoke).toHaveBeenCalledWith({
        _: 'setMessageSenderBlockList',
        sender_id: { _: 'messageSenderUser', user_id: 67890 },
        block_list: { _: 'blockListMain' },
      });

      config.actions.defaultAction = 'log';
      config.actions.enableDeletion = false;
    });
  });
});
