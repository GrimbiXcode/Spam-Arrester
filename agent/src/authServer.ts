import express, { Express, Request, Response } from 'express';
import { Client } from 'tdl';
import { AuthHandler } from './handlers/authHandler';
import { logger } from './utils/logger';

/**
 * Simple HTTP server to receive authentication commands from orchestrator bot
 */
export class AuthServer {
  private app: Express;
  private server: any;
  private port: number;
  private authHandler: AuthHandler;
  private client: Client;

  constructor(client: Client, authHandler: AuthHandler, port = 3100) {
    this.client = client;
    this.authHandler = authHandler;
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Submit phone number
    this.app.post('/auth/phone', async (req: Request, res: Response) => {
      const { phone_number } = req.body;
      
      if (!phone_number) {
        return res.status(400).json({ error: 'phone_number is required' });
      }

      try {
        await this.authHandler.setPhoneNumber(this.client, phone_number);
        res.json({ success: true, message: 'Phone number submitted' });
      } catch (error) {
        logger.error({ error }, 'Failed to submit phone number');
        res.status(500).json({ 
          error: 'Failed to submit phone number',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Submit authentication code
    this.app.post('/auth/code', async (req: Request, res: Response) => {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({ error: 'code is required' });
      }

      try {
        await this.authHandler.submitCode(this.client, code);
        res.json({ success: true, message: 'Authentication code submitted' });
      } catch (error) {
        logger.error({ error }, 'Failed to submit authentication code');
        res.status(500).json({ 
          error: 'Failed to submit authentication code',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Submit 2FA password
    this.app.post('/auth/password', async (req: Request, res: Response) => {
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: 'password is required' });
      }

      try {
        await this.authHandler.submitPassword(this.client, password);
        res.json({ success: true, message: '2FA password submitted' });
      } catch (error) {
        logger.error({ error }, 'Failed to submit 2FA password');
        res.status(500).json({ 
          error: 'Failed to submit 2FA password',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Request QR code authentication
    this.app.post('/auth/qr/request', async (req: Request, res: Response) => {
      try {
        await this.authHandler.requestQrCode(this.client);
        res.json({ success: true, message: 'QR code authentication requested' });
      } catch (error) {
        logger.error({ error }, 'Failed to request QR code');
        res.status(500).json({ 
          error: 'Failed to request QR code',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get QR code link
    this.app.get('/auth/qr', (req: Request, res: Response) => {
      const qrLink = this.authHandler.getQrCodeLink();
      const authState = this.authHandler.getAuthState();
      
      res.json({ 
        qr_link: qrLink,
        status: authState
      });
    });

    // Get current authentication status
    this.app.get('/auth/status', (req: Request, res: Response) => {
      const authState = this.authHandler.getAuthState();
      res.json({ status: authState });
    });
  }

  /**
   * Start the HTTP server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        logger.info({ port: this.port }, 'Auth server listening');
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: Error) => {
          if (err) {
            reject(err);
          } else {
            logger.info('Auth server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
