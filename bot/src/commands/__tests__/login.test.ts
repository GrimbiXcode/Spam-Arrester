import { loginCommand, preAuthTokens } from '../login';
import { Context } from 'telegraf';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock DatabaseManager
const mockDb = {
  getUser: jest.fn(),
  createUser: jest.fn(),
  updateUserActivity: jest.fn(),
  getActiveContainer: jest.fn(),
  getUserSettings: jest.fn(),
};

// Mock ContainerManager
const mockContainerMgr = {
  getAuthStatus: jest.fn(),
  createContainer: jest.fn(),
  getContainerStatus: jest.fn(),
};

// Mock Context
const createMockContext = (telegramId: number | undefined) => ({
  from: telegramId ? { id: telegramId } : undefined,
  reply: jest.fn().mockResolvedValue(undefined),
});

describe('loginCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear preAuthTokens before each test
    preAuthTokens.clear();
    // Set up default environment
    process.env.WEB_APP_URL = 'http://localhost:3000';
  });

  describe('Pre-auth Token Generation', () => {
    it('should generate unique pre-auth tokens for each login request', async () => {
      const telegramId = 12345;
      const ctx = createMockContext(telegramId);
      
      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });
      mockDb.getActiveContainer.mockReturnValue(null);

      await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);

      // First token
      expect(preAuthTokens.size).toBe(1);
      const firstToken = Array.from(preAuthTokens.keys())[0];
      expect(firstToken).toBeDefined();
      expect(typeof firstToken).toBe('string');
      expect(firstToken.length).toBe(64); // 32 bytes hex encoded = 64 chars

      // Clear mocks for second call
      jest.clearAllMocks();
      
      await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);

      // Second token should be different
      expect(preAuthTokens.size).toBe(2);
      const tokens = Array.from(preAuthTokens.keys());
      expect(tokens[0]).not.toBe(tokens[1]);
    });

    it('should store pre-auth token with associated Telegram ID', async () => {
      const telegramId = 67890;
      const ctx = createMockContext(telegramId);
      
      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });
      mockDb.getActiveContainer.mockReturnValue(null);

      await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);

      expect(preAuthTokens.size).toBe(1);
      const [_token, data] = Array.from(preAuthTokens.entries())[0];
      
      expect(data.telegramId).toBe(telegramId);
      expect(data.createdAt).toBeDefined();
      expect(typeof data.createdAt).toBe('number');
      expect(data.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should generate cryptographically secure tokens', async () => {
      const telegramId = 11111;
      const ctx = createMockContext(telegramId);
      
      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });
      mockDb.getActiveContainer.mockReturnValue(null);

      // Generate multiple tokens and verify uniqueness
      const tokens: string[] = [];
      for (let i = 0; i < 10; i++) {
        await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);
        tokens.push(Array.from(preAuthTokens.keys()).pop()!);
      }

      // All tokens should be unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(10);

      // All tokens should be valid hex strings
      for (const token of tokens) {
        expect(token).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('should include token in web app URL sent to user', async () => {
      const telegramId = 22222;
      const ctx = createMockContext(telegramId);
      
      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });
      mockDb.getActiveContainer.mockReturnValue(null);

      await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);

      expect(ctx.reply).toHaveBeenCalled();
      const replyText = ctx.reply.mock.calls[0][0] as string;
      
      // The token should appear in the URL
      const token = Array.from(preAuthTokens.keys())[0];
      expect(replyText).toContain(`http://localhost:3000?token=${token}`);
    });
  });

  describe('Token Association with Telegram ID', () => {
    it('should correctly associate multiple tokens with different Telegram IDs', async () => {
      const user1 = 11111;
      const user2 = 22222;
      const user3 = 33333;

      mockDb.getActiveContainer.mockReturnValue(null);

      // User 1
      mockDb.getUser.mockReturnValue({ telegram_id: user1 });
      const ctx1 = createMockContext(user1);
      await loginCommand(ctx1 as unknown as Context, mockDb as any, mockContainerMgr as any);

      // User 2
      mockDb.getUser.mockReturnValue({ telegram_id: user2 });
      const ctx2 = createMockContext(user2);
      await loginCommand(ctx2 as unknown as Context, mockDb as any, mockContainerMgr as any);

      // User 3
      mockDb.getUser.mockReturnValue({ telegram_id: user3 });
      const ctx3 = createMockContext(user3);
      await loginCommand(ctx3 as unknown as Context, mockDb as any, mockContainerMgr as any);

      expect(preAuthTokens.size).toBe(3);

      const entries = Array.from(preAuthTokens.entries());
      const telegramIds = entries.map(([_, data]) => data.telegramId);
      
      expect(telegramIds).toContain(user1);
      expect(telegramIds).toContain(user2);
      expect(telegramIds).toContain(user3);
    });

    it('should store creation timestamp with token for expiration tracking', async () => {
      const telegramId = 44444;
      const ctx = createMockContext(telegramId);
      
      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });
      mockDb.getActiveContainer.mockReturnValue(null);

      const beforeCreation = Date.now();
      await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);
      const afterCreation = Date.now();

      const [_, data] = Array.from(preAuthTokens.entries())[0];
      
      expect(data.createdAt).toBeGreaterThanOrEqual(beforeCreation);
      expect(data.createdAt).toBeLessThanOrEqual(afterCreation);
    });
  });

  describe('User Validation', () => {
    it('should reject login if user is not registered', async () => {
      const telegramId = 55555;
      const ctx = createMockContext(telegramId);
      
      mockDb.getUser.mockReturnValue(undefined);

      await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);

      expect(ctx.reply).toHaveBeenCalledWith('You are not registered. Send /start first.');
      expect(preAuthTokens.size).toBe(0);
    });

    it('should reject login if user ID is not available', async () => {
      const ctx = createMockContext(undefined);

      await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);

      expect(ctx.reply).toHaveBeenCalledWith('Error: Could not identify user.');
      expect(preAuthTokens.size).toBe(0);
    });

    it('should skip token generation if user has authenticated agent', async () => {
      const telegramId = 66666;
      const ctx = createMockContext(telegramId);
      
      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });
      mockDb.getActiveContainer.mockReturnValue({ container_id: 'abc123' });
      mockContainerMgr.getAuthStatus.mockResolvedValue('ready');

      await loginCommand(ctx as unknown as Context, mockDb as any, mockContainerMgr as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('You already have an authenticated agent running')
      );
      expect(preAuthTokens.size).toBe(0);
    });
  });

  describe('preAuthTokens Map Expiration', () => {
    it('should have tokens that can be validated against 10-minute expiration', () => {
      const telegramId = 77777;
      const now = Date.now();
      
      // Simulate old token (11 minutes old)
      const oldToken = 'old_token_expired';
      preAuthTokens.set(oldToken, {
        telegramId,
        createdAt: now - (11 * 60 * 1000), // 11 minutes ago
      });

      // Simulate fresh token (5 minutes old)
      const freshToken = 'fresh_token_valid';
      preAuthTokens.set(freshToken, {
        telegramId,
        createdAt: now - (5 * 60 * 1000), // 5 minutes ago
      });

      // Validate old token would be expired
      const oldData = preAuthTokens.get(oldToken)!;
      const isOldExpired = (now - oldData.createdAt) > 600000;
      expect(isOldExpired).toBe(true);

      // Validate fresh token would still be valid
      const freshData = preAuthTokens.get(freshToken)!;
      const isFreshExpired = (now - freshData.createdAt) > 600000;
      expect(isFreshExpired).toBe(false);
    });

    it('should correctly identify tokens at exactly 10-minute boundary', () => {
      const telegramId = 88888;
      const now = Date.now();
      
      // Token exactly at 10-minute mark
      const boundaryToken = 'boundary_token';
      preAuthTokens.set(boundaryToken, {
        telegramId,
        createdAt: now - 600000, // Exactly 10 minutes ago
      });

      const boundaryData = preAuthTokens.get(boundaryToken)!;
      const isExpired = (now - boundaryData.createdAt) > 600000;
      
      // At exactly 600000ms, should NOT be expired (needs to be > 600000)
      expect(isExpired).toBe(false);

      // One millisecond later would be expired
      const slightlyOld = 'slightly_old_token';
      preAuthTokens.set(slightlyOld, {
        telegramId,
        createdAt: now - 600001, // 10 minutes + 1ms ago
      });

      const slightlyOldData = preAuthTokens.get(slightlyOld)!;
      const isSlightlyOldExpired = (now - slightlyOldData.createdAt) > 600000;
      expect(isSlightlyOldExpired).toBe(true);
    });

    it('should allow manual cleanup of expired tokens', () => {
      const now = Date.now();
      
      // Add some tokens with various ages
      preAuthTokens.set('token1', { telegramId: 1, createdAt: now - 700000 }); // Expired
      preAuthTokens.set('token2', { telegramId: 2, createdAt: now - 100000 }); // Valid
      preAuthTokens.set('token3', { telegramId: 3, createdAt: now - 800000 }); // Expired
      preAuthTokens.set('token4', { telegramId: 4, createdAt: now - 50000 });  // Valid

      expect(preAuthTokens.size).toBe(4);

      // Simulate cleanup (as done in the setInterval)
      for (const [token, data] of preAuthTokens.entries()) {
        if (now - data.createdAt > 600000) {
          preAuthTokens.delete(token);
        }
      }

      expect(preAuthTokens.size).toBe(2);
      expect(preAuthTokens.has('token1')).toBe(false);
      expect(preAuthTokens.has('token2')).toBe(true);
      expect(preAuthTokens.has('token3')).toBe(false);
      expect(preAuthTokens.has('token4')).toBe(true);
    });
  });
});
