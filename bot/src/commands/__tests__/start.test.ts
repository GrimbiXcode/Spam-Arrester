import { startCommand, setWebApiRef } from '../start';
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
  createUser: jest.fn().mockImplementation((id, username) => ({
    telegram_id: id,
    username,
    status: 'stopped',
    registered_at: Math.floor(Date.now() / 1000),
    last_active: Math.floor(Date.now() / 1000),
  })),
  updateUserActivity: jest.fn(),
  addAuditLog: jest.fn(),
};

// Mock WebApiServer
const mockWebApi = {
  verifyToken: jest.fn(),
};

// Mock Context factory
const createMockContext = (
  telegramId: number | undefined,
  username: string | undefined,
  messageText: string
) => ({
  from: telegramId ? { id: telegramId, username } : undefined,
  message: { text: messageText },
  reply: jest.fn().mockResolvedValue(undefined),
});

describe('startCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setWebApiRef(mockWebApi as any);
  });

  describe('Deep Link Processing with Pre-auth Tokens', () => {
    it('should successfully process deep link with valid pre-auth token', async () => {
      const telegramId = 12345;
      const token = 'valid_session_token';
      const ctx = createMockContext(telegramId, 'testuser', `/start ${token}`);

      // Token verification returns the same telegram ID (user matches)
      mockWebApi.verifyToken.mockReturnValue(telegramId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockWebApi.verifyToken).toHaveBeenCalledWith(token);
      expect(mockDb.createUser).toHaveBeenCalledWith(telegramId, 'testuser');
      expect(mockDb.addAuditLog).toHaveBeenCalledWith(telegramId, 'web_auth_completed');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Authentication Successful'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      );
    });

    it('should reject deep link when token belongs to different user', async () => {
      const currentUserId = 12345;
      const tokenOwnerId = 67890; // Different user
      const token = 'token_for_different_user';
      const ctx = createMockContext(currentUserId, 'currentuser', `/start ${token}`);

      // Token is valid but belongs to different user
      mockWebApi.verifyToken.mockReturnValue(tokenOwnerId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockWebApi.verifyToken).toHaveBeenCalledWith(token);
      expect(mockDb.addAuditLog).not.toHaveBeenCalledWith(currentUserId, 'web_auth_completed');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('This authentication link was generated for a different account')
      );
    });

    it('should fall through to normal welcome when token is invalid/expired', async () => {
      const telegramId = 12345;
      const token = 'invalid_or_expired_token';
      const ctx = createMockContext(telegramId, 'testuser', `/start ${token}`);

      // Token verification returns null (invalid/expired)
      mockWebApi.verifyToken.mockReturnValue(null);

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockWebApi.verifyToken).toHaveBeenCalledWith(token);
      // Should show normal welcome message
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Welcome to **Spam Arrester**'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      );
      expect(mockDb.addAuditLog).toHaveBeenCalledWith(telegramId, 'bot_started');
    });

    it('should handle start command without deep link payload', async () => {
      const telegramId = 12345;
      const ctx = createMockContext(telegramId, 'testuser', '/start');

      await startCommand(ctx as unknown as Context, mockDb as any);

      // No token verification should occur
      expect(mockWebApi.verifyToken).not.toHaveBeenCalled();
      // Should show normal welcome message
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Welcome to **Spam Arrester**'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      );
    });

    it('should show success message with quick commands on valid auth', async () => {
      const telegramId = 11111;
      const token = 'auth_success_token';
      const ctx = createMockContext(telegramId, 'testuser', `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(telegramId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      const replyText = ctx.reply.mock.calls[0][0] as string;
      expect(replyText).toContain('Authentication Successful');
      expect(replyText).toContain('/status');
      expect(replyText).toContain('/settings');
      expect(replyText).toContain('/stats');
      expect(replyText).toContain('/pause');
      expect(replyText).toContain('/stop');
    });
  });

  describe('Token Validation via WebApiRef', () => {
    it('should call verifyToken with extracted payload', async () => {
      const telegramId = 22222;
      const token = 'abc123def456';
      const ctx = createMockContext(telegramId, 'user', `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(telegramId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockWebApi.verifyToken).toHaveBeenCalledTimes(1);
      expect(mockWebApi.verifyToken).toHaveBeenCalledWith('abc123def456');
    });

    it('should skip deep link processing if webApiRef is not set', async () => {
      // Clear the webApiRef
      setWebApiRef(null as any);

      const telegramId = 33333;
      const token = 'some_token';
      const ctx = createMockContext(telegramId, 'user', `/start ${token}`);

      await startCommand(ctx as unknown as Context, mockDb as any);

      // Should show normal welcome (no token verification possible)
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Welcome to **Spam Arrester**'),
        expect.any(Object)
      );

      // Restore webApiRef for other tests
      setWebApiRef(mockWebApi as any);
    });

    it('should handle verifyToken returning undefined', async () => {
      const telegramId = 44444;
      const token = 'undefined_return_token';
      const ctx = createMockContext(telegramId, 'user', `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(undefined);

      await startCommand(ctx as unknown as Context, mockDb as any);

      // Should fall through to normal welcome
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Welcome to **Spam Arrester**'),
        expect.any(Object)
      );
    });
  });

  describe('User Registration on Successful Auth', () => {
    it('should create/update user on successful deep link authentication', async () => {
      const telegramId = 55555;
      const username = 'authuser';
      const token = 'valid_token';
      const ctx = createMockContext(telegramId, username, `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(telegramId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockDb.createUser).toHaveBeenCalledWith(telegramId, username);
    });

    it('should add web_auth_completed audit log on success', async () => {
      const telegramId = 66666;
      const token = 'audit_log_token';
      const ctx = createMockContext(telegramId, 'audituser', `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(telegramId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockDb.addAuditLog).toHaveBeenCalledWith(telegramId, 'web_auth_completed');
    });

    it('should add bot_started audit log on normal start', async () => {
      const telegramId = 77777;
      const ctx = createMockContext(telegramId, 'normaluser', '/start');

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockDb.addAuditLog).toHaveBeenCalledWith(telegramId, 'bot_started');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing user ID', async () => {
      const ctx = createMockContext(undefined, undefined, '/start sometoken');

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(ctx.reply).toHaveBeenCalledWith('Error: Could not identify user.');
      expect(mockDb.createUser).not.toHaveBeenCalled();
    });

    it('should handle empty payload after /start', async () => {
      const telegramId = 88888;
      const ctx = createMockContext(telegramId, 'user', '/start ');

      await startCommand(ctx as unknown as Context, mockDb as any);

      // Empty string after split should be falsy, show normal welcome
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Welcome to **Spam Arrester**'),
        expect.any(Object)
      );
    });

    it('should handle null username gracefully', async () => {
      const telegramId = 99999;
      const token = 'null_username_token';
      const ctx = createMockContext(telegramId, undefined, `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(telegramId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockDb.createUser).toHaveBeenCalledWith(telegramId, null);
    });

    it('should extract token correctly from message with extra spaces', async () => {
      const telegramId = 10101;
      const token = 'spaced_token';
      // Note: Telegram typically handles this, but test edge case
      const ctx = createMockContext(telegramId, 'user', `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(telegramId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      expect(mockWebApi.verifyToken).toHaveBeenCalledWith(token);
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should complete full auth flow: token valid + user matches', async () => {
      const telegramId = 20202;
      const token = 'full_flow_token';
      const ctx = createMockContext(telegramId, 'flowuser', `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(telegramId);

      await startCommand(ctx as unknown as Context, mockDb as any);

      // Verify complete flow
      expect(mockWebApi.verifyToken).toHaveBeenCalledWith(token);
      expect(mockDb.createUser).toHaveBeenCalledWith(telegramId, 'flowuser');
      expect(mockDb.addAuditLog).toHaveBeenCalledWith(telegramId, 'web_auth_completed');
      
      const replyCall = ctx.reply.mock.calls[0];
      expect(replyCall[0]).toContain('Authentication Successful');
      expect(replyCall[0]).toContain('spam detection agent is now active');
    });

    it('should not complete auth flow when tokens do not match users', async () => {
      const currentUser = 30303;
      const tokenOwner = 40404;
      const token = 'mismatched_token';
      const ctx = createMockContext(currentUser, 'wronguser', `/start ${token}`);

      mockWebApi.verifyToken.mockReturnValue(tokenOwner);

      await startCommand(ctx as unknown as Context, mockDb as any);

      // Should not complete auth
      expect(mockDb.addAuditLog).not.toHaveBeenCalledWith(currentUser, 'web_auth_completed');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('different account')
      );
    });
  });
});
