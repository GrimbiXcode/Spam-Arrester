import request from 'supertest';
import express from 'express';
import { preAuthTokens, stopTokenCleanup } from '../commands/login';

// Use fake timers for deterministic time-based tests
const MOCK_NOW = 1700000000000; // Fixed timestamp for tests

// Mock logger
jest.mock('../utils/logger', () => ({
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
  getUserSettings: jest.fn(),
  getActiveContainer: jest.fn(),
  createContainer: jest.fn(),
  updateContainerStatus: jest.fn(),
  updateAuthState: jest.fn(),
};


// We'll create a minimal test app that simulates WebApiServer endpoints
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Validate pre-auth token endpoint
  app.get('/api/validate-token/:preAuthToken', async (req, res) => {
    try {
      const { preAuthToken } = req.params;
      const tokenData = preAuthTokens.get(preAuthToken);

      if (!tokenData) {
        res.status(404).json({ valid: false, error: 'Token not found or expired' });
        return;
      }

      // Check if token is expired (10 minutes)
      if (Date.now() - tokenData.createdAt > 600000) {
        preAuthTokens.delete(preAuthToken);
        res.status(410).json({ valid: false, error: 'Token expired' });
        return;
      }

      res.json({ valid: true, telegram_id: tokenData.telegramId });
    } catch (error) {
      res.status(500).json({ valid: false, error: 'Internal error' });
    }
  });

  // Initialize login with pre-auth token endpoint
  app.post('/api/init-login-with-token', async (req, res) => {
    try {
      const { preAuthToken } = req.body;

      if (!preAuthToken) {
        res.status(400).json({ error: 'Pre-auth token is required' });
        return;
      }

      // Validate the pre-auth token
      const tokenData = preAuthTokens.get(preAuthToken);
      if (!tokenData) {
        res.status(404).json({ error: 'Invalid or expired token. Please use /login in the bot to get a new link.' });
        return;
      }

      // Check if token is expired (10 minutes)
      if (Date.now() - tokenData.createdAt > 600000) {
        preAuthTokens.delete(preAuthToken);
        res.status(410).json({ error: 'Token expired. Please use /login in the bot to get a new link.' });
        return;
      }

      const telegramId = tokenData.telegramId;

      // Check user exists
      const user = mockDb.getUser(telegramId);
      if (!user) {
        res.status(400).json({ error: 'User not found. Please send /start to the bot first.' });
        return;
      }

      // Consume the pre-auth token (one-time use)
      preAuthTokens.delete(preAuthToken);

      res.json({
        token: 'mock-session-token',
        telegram_id: telegramId,
        status: 'qr_requested',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to initialize login' });
    }
  });

  return app;
}

describe('WebApiServer - Pre-auth Token Endpoints', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(MOCK_NOW);
    jest.clearAllMocks();
    preAuthTokens.clear();
    app = createTestApp();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    stopTokenCleanup();
  });

  describe('GET /api/validate-token/:preAuthToken', () => {
    it('should return valid: true for a fresh token', async () => {
      const telegramId = 12345;
      const token = 'valid_fresh_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW,
      });

      const response = await request(app)
        .get(`/api/validate-token/${token}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.telegram_id).toBe(telegramId);
    });

    it('should return 404 for non-existent token', async () => {
      const response = await request(app)
        .get('/api/validate-token/nonexistent_token')
        .expect(404);

      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBe('Token not found or expired');
    });

    it('should return 410 for expired token (older than 10 minutes)', async () => {
      const telegramId = 67890;
      const token = 'expired_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW - (11 * 60 * 1000), // 11 minutes ago
      });

      const response = await request(app)
        .get(`/api/validate-token/${token}`)
        .expect(410);

      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBe('Token expired');
      
      // Token should be deleted after expiration check
      expect(preAuthTokens.has(token)).toBe(false);
    });

    it('should accept token just under 10-minute boundary', async () => {
      const telegramId = 11111;
      const token = 'boundary_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW - 599999, // 1ms under 10-minute limit
      });

      const response = await request(app)
        .get(`/api/validate-token/${token}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.telegram_id).toBe(telegramId);
    });

    it('should reject token at 10 minutes + 1ms', async () => {
      const telegramId = 22222;
      const token = 'just_expired_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW - 600001, // 10 minutes + 1ms ago
      });

      const response = await request(app)
        .get(`/api/validate-token/${token}`)
        .expect(410);

      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBe('Token expired');
    });

    it('should return correct telegram_id for token', async () => {
      const telegramId = 99999;
      const token = 'user_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW - (5 * 60 * 1000), // 5 minutes ago (valid)
      });

      const response = await request(app)
        .get(`/api/validate-token/${token}`)
        .expect(200);

      expect(response.body.telegram_id).toBe(99999);
    });
  });

  describe('POST /api/init-login-with-token', () => {
    it('should successfully initialize login with valid pre-auth token', async () => {
      const telegramId = 12345;
      const token = 'valid_preauth_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW,
      });

      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });

      const response = await request(app)
        .post('/api/init-login-with-token')
        .send({ preAuthToken: token })
        .expect(200);

      expect(response.body.telegram_id).toBe(telegramId);
      expect(response.body.status).toBe('qr_requested');
      
      // Token should be consumed (deleted) after use
      expect(preAuthTokens.has(token)).toBe(false);
    });

    it('should return 400 when pre-auth token is missing', async () => {
      const response = await request(app)
        .post('/api/init-login-with-token')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Pre-auth token is required');
    });

    it('should return 404 for invalid/non-existent token', async () => {
      const response = await request(app)
        .post('/api/init-login-with-token')
        .send({ preAuthToken: 'invalid_token' })
        .expect(404);

      expect(response.body.error).toContain('Invalid or expired token');
    });

    it('should return 410 for expired token', async () => {
      const telegramId = 67890;
      const token = 'expired_login_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW - (15 * 60 * 1000), // 15 minutes ago
      });

      const response = await request(app)
        .post('/api/init-login-with-token')
        .send({ preAuthToken: token })
        .expect(410);

      expect(response.body.error).toContain('Token expired');
      
      // Token should be deleted
      expect(preAuthTokens.has(token)).toBe(false);
    });

    it('should return 400 when user is not found in database', async () => {
      const telegramId = 44444;
      const token = 'valid_token_no_user';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW,
      });

      mockDb.getUser.mockReturnValue(null);

      const response = await request(app)
        .post('/api/init-login-with-token')
        .send({ preAuthToken: token })
        .expect(400);

      expect(response.body.error).toContain('User not found');
    });

    it('should consume token on successful login initialization (one-time use)', async () => {
      const telegramId = 55555;
      const token = 'one_time_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW,
      });

      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });

      // First request should succeed
      await request(app)
        .post('/api/init-login-with-token')
        .send({ preAuthToken: token })
        .expect(200);

      // Second request with same token should fail
      const response = await request(app)
        .post('/api/init-login-with-token')
        .send({ preAuthToken: token })
        .expect(404);

      expect(response.body.error).toContain('Invalid or expired token');
    });

    it('should handle multiple tokens for same user correctly', async () => {
      const telegramId = 66666;
      const token1 = 'token_1';
      const token2 = 'token_2';
      
      preAuthTokens.set(token1, {
        telegramId,
        createdAt: MOCK_NOW - (5 * 60 * 1000), // 5 minutes ago
      });
      preAuthTokens.set(token2, {
        telegramId,
        createdAt: MOCK_NOW, // Fresh
      });

      mockDb.getUser.mockReturnValue({ telegram_id: telegramId });

      // Use first token
      await request(app)
        .post('/api/init-login-with-token')
        .send({ preAuthToken: token1 })
        .expect(200);

      expect(preAuthTokens.has(token1)).toBe(false);
      expect(preAuthTokens.has(token2)).toBe(true); // Second token still valid

      // Use second token
      await request(app)
        .post('/api/init-login-with-token')
        .send({ preAuthToken: token2 })
        .expect(200);

      expect(preAuthTokens.has(token2)).toBe(false);
    });
  });

  describe('Token Expiration Edge Cases', () => {
    it('should handle validation request at the moment of expiration', async () => {
      const telegramId = 77777;
      const token = 'edge_case_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW - (9 * 60 * 1000), // 9 minutes ago, safely under 10
      });

      // Should still be valid
      const response = await request(app)
        .get(`/api/validate-token/${token}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
    });

    it('should properly delete expired tokens during validation', async () => {
      const token = 'to_be_deleted';
      preAuthTokens.set(token, {
        telegramId: 88888,
        createdAt: MOCK_NOW - (12 * 60 * 1000), // 12 minutes ago
      });

      expect(preAuthTokens.size).toBe(1);

      await request(app)
        .get(`/api/validate-token/${token}`)
        .expect(410);

      expect(preAuthTokens.size).toBe(0);
    });

    it('should handle concurrent token validation requests', async () => {
      const telegramId = 99999;
      const token = 'concurrent_token';
      preAuthTokens.set(token, {
        telegramId,
        createdAt: MOCK_NOW,
      });

      // Multiple concurrent requests
      const requests = Array(5).fill(null).map(() =>
        request(app).get(`/api/validate-token/${token}`)
      );

      const responses = await Promise.all(requests);
      
      // All should succeed (validation doesn't consume the token)
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.valid).toBe(true);
      });
    });
  });
});
