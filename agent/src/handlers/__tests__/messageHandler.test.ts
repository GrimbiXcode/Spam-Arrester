import { MessageHandler } from '../messageHandler';
import { ActionHandler } from '../actionHandler';
import { detectSpam, getUserProfile, SpamDetectionResult, UserProfile } from '../spamDetector';
import { Client } from 'tdl';

// Mocks
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../utils/metrics', () => ({
  metrics: {
    incrementMessagesProcessed: jest.fn(),
    incrementSpamDetected: jest.fn(),
    getMetrics: jest.fn(() => ({
      msgProcessedTotal: 42,
      spamDetectedTotal: 10,
      spamBlockedTotal: 3,
      spamArchivedTotal: 7,
      rateLimitHits: 1,
    })),
    getSpamRate: jest.fn(() => 10 / 42),
  },
}));

jest.mock('../spamDetector', () => ({
  detectSpam: jest.fn(),
  getUserProfile: jest.fn(),
}));

// Spy on ActionHandler to intercept instance methods
jest.mock('../actionHandler');

const { metrics } = require('../../utils/metrics');
const { logger } = require('../../utils/logger');

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;
  let mockClient: jest.Mocked<Client>;
  let mockActionHandlerInstance: jest.Mocked<ActionHandler>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock client with invoke
    mockClient = {
      invoke: jest.fn(),
    } as any;

    // Mock ActionHandler constructor to return a mock instance
    (ActionHandler as jest.Mock).mockImplementation(() => {
      mockActionHandlerInstance = {
        handleSpam: jest.fn().mockResolvedValue(undefined),
        getRemainingActions: jest.fn(() => ({ deletes: 5, blocks: 10 })),
      } as any;
      return mockActionHandlerInstance;
    });

    messageHandler = new MessageHandler();
  });

  describe('handleNewMessage', () => {
    it('should ignore outgoing messages', async () => {
      const update = {
        message: {
          is_outgoing: true,
          chat_id: 123,
        },
      };

      await messageHandler.handleNewMessage(mockClient, update);

      expect(mockClient.invoke).not.toHaveBeenCalled();
      expect(metrics.incrementMessagesProcessed).not.toHaveBeenCalled();
    });

    it('should ignore non-private chats', async () => {
      mockClient.invoke.mockResolvedValueOnce({
        type: { _: 'chatTypeBasicGroup' },
      } as any);

      const update = {
        message: {
          is_outgoing: false,
          chat_id: 123,
        },
      };

      await messageHandler.handleNewMessage(mockClient, update);

      expect(mockClient.invoke).toHaveBeenCalledWith({ _: 'getChat', chat_id: 123 });
      expect(metrics.incrementMessagesProcessed).not.toHaveBeenCalled();
    });

    it('should process private chat messages and call SpamDetector and ActionHandler when spam', async () => {
      mockClient.invoke.mockResolvedValueOnce({
        type: { _: 'chatTypePrivate', user_id: 999 },
      } as any);

      const userProfile: UserProfile = {
        userId: 999,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: false,
        hasCommonGroups: false,
      };

      (getUserProfile as jest.Mock).mockResolvedValueOnce(userProfile);

      const detection: SpamDetectionResult = {
        isSpam: true,
        score: 0.9,
        reasons: ['sender_not_in_contacts', 'suspicious_content_pattern'],
      };
      (detectSpam as jest.Mock).mockResolvedValueOnce(detection);

      const update = {
        message: {
          is_outgoing: false,
          chat_id: 123,
          content: { text: { text: 'Visit https://spam.com' } },
        },
      };

      await messageHandler.handleNewMessage(mockClient, update);

      expect(mockClient.invoke).toHaveBeenCalledWith({ _: 'getChat', chat_id: 123 });
      expect(metrics.incrementMessagesProcessed).toHaveBeenCalled();
      expect(getUserProfile).toHaveBeenCalledWith(mockClient, 999, 123);
      expect(detectSpam).toHaveBeenCalled();
      expect(mockActionHandlerInstance.handleSpam).toHaveBeenCalledWith(
        mockClient,
        123,
        999,
        detection
      );
      expect(metrics.incrementSpamDetected).toHaveBeenCalled();
    });

    it('should not call ActionHandler when not spam', async () => {
      mockClient.invoke.mockResolvedValueOnce({
        type: { _: 'chatTypePrivate', user_id: 555 },
      } as any);

      const userProfile: UserProfile = {
        userId: 555,
        isContact: true,
        isMutualContact: true,
        hasProfilePhoto: true,
        hasCommonGroups: true,
      };
      (getUserProfile as jest.Mock).mockResolvedValueOnce(userProfile);

      const detection: SpamDetectionResult = {
        isSpam: false,
        score: 0.1,
        reasons: [],
      };
      (detectSpam as jest.Mock).mockResolvedValueOnce(detection);

      const update = {
        message: {
          is_outgoing: false,
          chat_id: 999,
          content: { text: { text: 'Hello' } },
        },
      };

      await messageHandler.handleNewMessage(mockClient, update);

      expect(metrics.incrementMessagesProcessed).toHaveBeenCalled();
      expect(mockActionHandlerInstance.handleSpam).not.toHaveBeenCalled();
    });

    it('should handle errors from getUserProfile gracefully', async () => {
      mockClient.invoke.mockResolvedValueOnce({
        type: { _: 'chatTypePrivate', user_id: 777 },
      } as any);

      (getUserProfile as jest.Mock).mockRejectedValueOnce(new Error('TDLib error'));

      const update = {
        message: {
          is_outgoing: false,
          chat_id: 321,
          content: { text: { text: 'Hello' } },
        },
      };

      await messageHandler.handleNewMessage(mockClient, update);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error handling message'
      );
    });
  });

  describe('getMetrics', () => {
    it('should return metrics including remaining actions', () => {
      const result = messageHandler.getMetrics();
      expect(result).toMatchObject({
        msgProcessedTotal: 42,
        spamDetectedTotal: 10,
        remainingActions: { deletes: 5, blocks: 10 },
      });
      expect(result.spamRate).toBeCloseTo(10 / 42);
    });
  });
});
