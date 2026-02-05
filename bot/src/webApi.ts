import express, { Express, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import { DatabaseManager } from './db/database';
import { ContainerManager } from './services/containerManager';
import { logger } from './utils/logger';
import { preAuthTokens } from './commands/login';

interface LoginSession {
  token: string;
  phone: string;
  telegramId: number;
  containerName: string;
  createdAt: number;
  status: 'pending' | 'qr_ready' | 'authenticated' | 'expired';
}

/**
 * Web API server for QR code authentication
 * Allows users to authenticate via web interface instead of bot
 */
export class WebApiServer {
  private app: Express;
  private server: any;
  private port: number;
  private db: DatabaseManager;
  private containerMgr: ContainerManager;
  private sessions: Map<string, LoginSession> = new Map();
  private sessionCleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    db: DatabaseManager,
    containerMgr: ContainerManager,
    port = 3000
  ) {
    this.db = db;
    this.containerMgr = containerMgr;
    this.port = port;
    this.app = express();
    
    // Middleware
    this.app.use(express.json());
    this.app.use((_req, res, next) => {
      // CORS headers for web app
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      
      // Handle OPTIONS preflight
      if (_req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      
      next();
    });
    
    // Setup routes first
    this.setupRoutes();
    
    // Serve static files from webapp directory (must be after API routes)
    const webappDir = resolve(__dirname, '../../webapp');
    logger.info({ webappDir }, 'Serving static files from webapp directory');
    this.app.use(express.static(webappDir));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Validate pre-auth token from bot and return telegram ID
    this.app.get('/api/validate-token/:preAuthToken', async (req: Request, res: Response): Promise<void> => {
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
        logger.error({ error }, 'Failed to validate pre-auth token');
        res.status(500).json({ valid: false, error: 'Internal error' });
      }
    });

    // Initialize login with pre-auth token (from bot) - preferred method
    this.app.post('/api/init-login-with-token', async (req: Request, res: Response): Promise<void> => {
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
        logger.info({ telegramId, preAuthToken }, 'Initiating login via pre-auth token');

        // Ensure user exists
        let user = this.db.getUser(telegramId);
        if (!user) {
          res.status(400).json({ error: 'User not found. Please send /start to the bot first.' });
          return;
        }

        // Generate session token
        const sessionToken = randomBytes(32).toString('hex');
        const containerName = `agent-${telegramId}`;

        // Check if container exists and is authenticated
        let containerStatus = await this.containerMgr.getContainerStatus(containerName);
        if (containerStatus.status === 'running') {
          const authStatus = await this.containerMgr.getAuthStatus(containerName);
          if (authStatus === 'ready') {
            res.json({
              token: sessionToken,
              telegram_id: telegramId,
              status: 'already_authenticated',
              bot_link: this.getBotLink(sessionToken),
            });
            return;
          }
        }

        // Create container if needed
        if (containerStatus.status === 'not_found') {
          const settings = this.db.getUserSettings(telegramId);
          if (!settings) {
            throw new Error('User settings not found');
          }

          const dockerContainerId = await this.containerMgr.createContainer({
            telegramId,
            apiId: process.env.TG_API_ID!,
            apiHash: process.env.TG_API_HASH!,
            settings,
          });

          const existingContainer = this.db.getActiveContainer(telegramId);
          if (existingContainer) {
            this.db.updateContainerStatus(existingContainer.container_id, 'failed');
          }

          this.db.createContainer(telegramId, dockerContainerId);
          await this.waitForContainer(containerName, 30000);
          
          // Request QR code from agent
          const authStatus = await this.containerMgr.getAuthStatus(containerName);
          if (authStatus === 'wait_phone' || authStatus === 'none') {
            await this.containerMgr.requestQrCode(containerName);
          }
        } else if (containerStatus.status === 'running') {
          // Container exists and is running, check if we need to request QR
          const authStatus = await this.containerMgr.getAuthStatus(containerName);
          if (authStatus === 'wait_phone' || authStatus === 'none') {
            await this.containerMgr.requestQrCode(containerName);
          }
        }

        // Store session (no phone needed since we have real telegram ID)
        const session: LoginSession = {
          token: sessionToken,
          phone: '', // Not needed with pre-auth
          telegramId,
          containerName,
          createdAt: Date.now(),
          status: 'pending',
        };
        this.sessions.set(sessionToken, session);

        // Consume the pre-auth token (one-time use)
        preAuthTokens.delete(preAuthToken);

        logger.info({ sessionToken, telegramId }, 'Login session created from pre-auth token');

        res.json({
          token: sessionToken,
          telegram_id: telegramId,
          status: 'qr_requested',
        });

      } catch (error) {
        logger.error({ error }, 'Failed to initialize login with pre-auth token');
        res.status(500).json({
          error: 'Failed to initialize login',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Initialize login with phone number (legacy - kept for backwards compatibility)
    this.app.post('/api/init-login', async (req: Request, res: Response): Promise<void> => {
      try {
        const { phone } = req.body;

        if (!phone || !this.isValidPhone(phone)) {
          res.status(400).json({ 
            error: 'Invalid phone number format. Use international format (e.g., +12025551234)' 
          });
        }

        logger.info({ phone }, 'Initiating login via web API');

        // Generate session token
        const token = randomBytes(32).toString('hex');

        // Calculate telegram_id from phone (simple hash for now)
        // In production, you'd want a better mapping
        const telegramId = this.phoneToTelegramId(phone);

        // Check if user already exists
        let user = this.db.getUser(telegramId);
        if (!user) {
          user = this.db.createUser(telegramId, null);
          logger.info({ telegramId }, 'Created new user from web login');
        }

        // Check if container exists
        const containerName = `agent-${telegramId}`;
        let containerStatus = await this.containerMgr.getContainerStatus(containerName);

        // If authenticated, return success immediately
        if (containerStatus.status === 'running') {
          const authStatus = await this.containerMgr.getAuthStatus(containerName);
          if (authStatus === 'ready') {
            res.json({
              token,
              telegram_id: telegramId,
              status: 'already_authenticated',
              bot_link: this.getBotLink(token),
            });
          }
        }

        // Create container if needed
        if (containerStatus.status === 'not_found') {
          const settings = this.db.getUserSettings(telegramId);
          if (!settings) {
            throw new Error('User settings not found');
          }
          
          // Create Docker container and get its ID
          const dockerContainerId = await this.containerMgr.createContainer({
            telegramId,
            apiId: process.env.TG_API_ID!,
            apiHash: process.env.TG_API_HASH!,
            settings,
          });

          // Check if there's an existing container record and clean it up
          const existingContainer = this.db.getActiveContainer(telegramId);
          if (existingContainer) {
            logger.warn({ telegramId, existingContainerId: existingContainer.container_id }, 'Cleaning up old container record');
            this.db.updateContainerStatus(existingContainer.container_id, 'failed');
          }
          
          // Save new container to database with actual Docker ID
          this.db.createContainer(telegramId, dockerContainerId);
          
          // Wait for container to start
          await this.waitForContainer(containerName, 30000);
          
          // Request QR code from agent (only if not already in QR mode)
          const authStatus = await this.containerMgr.getAuthStatus(containerName);
          if (authStatus === 'wait_phone' || authStatus === 'none') {
            // Agent is waiting for phone, request QR code instead
            await this.containerMgr.requestQrCode(containerName);
          }
          // Otherwise, agent already started in QR mode, no need to request
        } else if (containerStatus.status === 'running') {
          // Container exists and is running, check if we need to request QR
          const authStatus = await this.containerMgr.getAuthStatus(containerName);
          if (authStatus === 'wait_phone' || authStatus === 'none') {
            await this.containerMgr.requestQrCode(containerName);
          }
        }

        // Store session
        const session: LoginSession = {
          token,
          phone,
          telegramId,
          containerName,
          createdAt: Date.now(),
          status: 'pending',
        };
        this.sessions.set(token, session);

        logger.info({ token, telegramId }, 'Login session created');

        res.json({
          token,
          telegram_id: telegramId,
          status: 'qr_requested',
        });

      } catch (error) {
        logger.error({ error }, 'Failed to initialize login');
        res.status(500).json({ 
          error: 'Failed to initialize login',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Get QR code for session
    this.app.get('/api/get-qr/:token', async (req: Request, res: Response): Promise<void> => {
      try {
        const { token } = req.params;
        const session = this.sessions.get(token);

        if (!session) {
          res.status(404).json({ error: 'Session not found or expired' });
          return;
        }

        // Check if session expired (10 minutes)
        if (Date.now() - session.createdAt > 600000) {
          this.sessions.delete(token);
          res.status(410).json({ error: 'Session expired' });
          return;
        }

        // Get QR code from agent
        const qrData = await this.containerMgr.getQrCode(session.containerName);

        if (qrData.qr_link) {
          session.status = 'qr_ready';
        }

        res.json({
          qr_link: qrData.qr_link,
          status: qrData.status,
          session_status: session.status,
        });

      } catch (error) {
        logger.error({ error }, 'Failed to get QR code');
        res.status(500).json({ 
          error: 'Failed to get QR code',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Submit 2FA password
    this.app.post('/api/submit-password/:token', async (req: Request, res: Response): Promise<void> => {
      try {
        const { token } = req.params;
        const { password } = req.body;
        const session = this.sessions.get(token);

        if (!session) {
          res.status(404).json({ error: 'Session not found or expired' });
          return;
        }

        if (!password) {
          res.status(400).json({ error: 'Password is required' });
          return;
        }

        // Submit password to agent
        await this.containerMgr.submit2FAPassword(session.containerName, password);

        res.json({
          success: true,
          message: 'Password submitted',
        });

      } catch (error) {
        logger.error({ error }, 'Failed to submit password');
        res.status(500).json({ 
          error: 'Failed to submit password',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Check authentication status
    this.app.get('/api/check-status/:token', async (req: Request, res: Response): Promise<void> => {
      try {
        const { token } = req.params;
        const session = this.sessions.get(token);

        if (!session) {
          res.status(404).json({ error: 'Session not found or expired' });
          return;
        }

        // Get auth status from agent
        const authStatus = await this.containerMgr.getAuthStatus(session.containerName);

        if (authStatus === 'ready') {
          session.status = 'authenticated';
          
          // Update database
          const container = this.db.getActiveContainer(session.telegramId);
          if (container) {
            this.db.updateContainerStatus(container.container_id, 'running');
          }
          
          this.db.updateAuthState(session.telegramId, 'ready', session.phone);

          // Return bot link
          res.json({
            status: 'ready',
            authenticated: true,
            bot_link: this.getBotLink(token),
          });
          return;
        }

        res.json({
          status: authStatus,
          authenticated: false,
        });

      } catch (error) {
        logger.error({ error }, 'Failed to check status');
        res.status(500).json({ 
          error: 'Failed to check status',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Validate phone number format
   */
  private isValidPhone(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }

  /**
   * Convert phone to telegram ID (temporary - needs proper implementation)
   */
  private phoneToTelegramId(phone: string): number {
    // This is a temporary solution - in production you'd need to:
    // 1. Have user provide telegram_id from bot first
    // 2. Or use a different identifier system
    // For now, we'll use a hash
    let hash = 0;
    for (let i = 0; i < phone.length; i++) {
      hash = ((hash << 5) - hash) + phone.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Generate bot deep link with session token
   */
  private getBotLink(token: string): string {
    const botUsername = process.env.BOT_USERNAME || 'spam_arrester_bot';
    return `https://t.me/${botUsername}?start=${token}`;
  }

  /**
   * Wait for container to start and agent HTTP server to be ready
   */
  private async waitForContainer(containerName: string, timeout: number): Promise<void> {
    const startTime = Date.now();
    
    // First, wait for container to be running
    while (Date.now() - startTime < timeout) {
      const status = await this.containerMgr.getContainerStatus(containerName);
      if (status.status === 'running') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (Date.now() - startTime >= timeout) {
      throw new Error('Container start timeout');
    }
    
    // Then, wait for agent HTTP server to be ready
    logger.info({ containerName }, 'Waiting for agent HTTP server to be ready');
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://${containerName}:3100/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          logger.info({ containerName }, 'Agent HTTP server is ready');
          return;
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Agent HTTP server start timeout');
  }

  /**
   * Clean up expired sessions
   */
  private cleanupSessions(): void {
    const now = Date.now();
    const expiredTokens: string[] = [];

    for (const [token, session] of this.sessions.entries()) {
      // Remove sessions older than 10 minutes
      if (now - session.createdAt > 600000) {
        expiredTokens.push(token);
      }
    }

    for (const token of expiredTokens) {
      this.sessions.delete(token);
      logger.debug({ token }, 'Cleaned up expired session');
    }
  }

  /**
   * Start the HTTP server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        logger.info({ port: this.port }, 'Web API server listening');
        resolve();
      });

      // Start session cleanup interval (every 5 minutes)
      this.sessionCleanupInterval = setInterval(() => {
        this.cleanupSessions();
      }, 300000);
    });
  }

  /**
   * Stop the HTTP server
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.sessionCleanupInterval) {
        clearInterval(this.sessionCleanupInterval);
      }

      if (this.server) {
        this.server.close((err: Error) => {
          if (err) {
            reject(err);
          } else {
            logger.info('Web API server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Verify session token and get telegram ID
   */
  verifyToken(token: string): number | null {
    const session = this.sessions.get(token);
    if (session && session.status === 'authenticated') {
      return session.telegramId;
    }
    return null;
  }
}
