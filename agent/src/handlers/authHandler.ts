import { Client } from 'tdl';
import { logger } from '../utils/logger';

/**
 * Handles TDLib authorization states and authentication flow.
 * Logs auth state changes for the orchestrator bot to monitor.
 */
export class AuthHandler {
  private phoneNumber: string | null = null;
  private qrCodeLink: string | null = null;
  private authState: string = 'none';

  /**
   * Set up authorization state handler for TDLib client
   */
  setupAuthHandler(client: Client): void {
    client.on('update', async (update) => {
      if (update._ === 'updateAuthorizationState') {
        await this.handleAuthState(client, update.authorization_state);
      }
    });
  }

  /**
   * Handle different authorization states from TDLib
   */
  private async handleAuthState(client: Client, authState: any): Promise<void> {
    logger.info({ authState: authState._ }, 'Authorization state changed');

    switch (authState._) {
      case 'authorizationStateWaitTdlibParameters':
        // TDLib parameters are set automatically by tdl library
        break;

      case 'authorizationStateWaitPhoneNumber':
        // Signal to orchestrator that we need phone number
        this.authState = 'wait_phone';
        logger.info({ event: 'AUTH_WAIT_PHONE' }, 'Waiting for phone number');
        break;

      case 'authorizationStateWaitOtherDeviceConfirmation':
        // QR code is ready - extract and convert the link
        this.authState = 'wait_qr_confirmation';
        const rawLink = authState.link || null;
        
        // Convert tg://login?token=... to https://t.me/login/...
        if (rawLink && rawLink.startsWith('tg://login?token=')) {
          const token = rawLink.replace('tg://login?token=', '');
          this.qrCodeLink = `https://t.me/login/${token}`;
        } else {
          this.qrCodeLink = rawLink;
        }
        
        logger.info({ 
          event: 'AUTH_QR_READY', 
          link: this.qrCodeLink,
          rawLink 
        }, 'QR code ready for scanning');
        break;

      case 'authorizationStateWaitCode':
        // Signal to orchestrator that we need SMS/Telegram code
        this.authState = 'wait_code';
        logger.info({ event: 'AUTH_WAIT_CODE' }, 'Waiting for authentication code');
        break;

      case 'authorizationStateWaitPassword':
        // Signal to orchestrator that we need 2FA password
        this.authState = 'wait_password';
        logger.info({ event: 'AUTH_WAIT_PASSWORD' }, 'Waiting for 2FA password');
        break;

      case 'authorizationStateReady':
        // Successfully authenticated
        this.authState = 'ready';
        this.qrCodeLink = null; // Clear QR code
        logger.info({ event: 'AUTH_READY' }, 'Successfully authenticated');
        break;

      case 'authorizationStateLoggingOut':
        logger.info('Logging out...');
        break;

      case 'authorizationStateClosing':
        logger.info('Closing...');
        break;

      case 'authorizationStateClosed':
        logger.info('Closed');
        break;

      default:
        logger.warn({ authState: authState._ }, 'Unknown authorization state');
    }
  }

  /**
   * Submit phone number for authentication
   */
  async setPhoneNumber(client: Client, phoneNumber: string): Promise<void> {
    this.phoneNumber = phoneNumber;
    logger.info({ event: 'AUTH_PHONE_SUBMITTED' }, 'Submitting phone number');
    
    try {
      await client.invoke({
        _: 'setAuthenticationPhoneNumber',
        phone_number: phoneNumber,
      });
      logger.info('Phone number submitted successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to submit phone number');
      throw error;
    }
  }

  /**
   * Submit authentication code (SMS or Telegram)
   */
  async submitCode(client: Client, code: string): Promise<void> {
    logger.info({ event: 'AUTH_CODE_SUBMITTED' }, 'Submitting authentication code');
    
    try {
      await client.invoke({
        _: 'checkAuthenticationCode',
        code,
      });
      logger.info('Authentication code submitted successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to submit authentication code');
      throw error;
    }
  }

  /**
   * Submit 2FA password
   */
  async submitPassword(client: Client, password: string): Promise<void> {
    logger.info({ event: 'AUTH_PASSWORD_SUBMITTED' }, 'Submitting 2FA password');
    
    try {
      await client.invoke({
        _: 'checkAuthenticationPassword',
        password,
      });
      logger.info('2FA password submitted successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to submit 2FA password');
      throw error;
    }
  }

  /**
   * Request QR code login
   */
  async requestQrCode(client: Client): Promise<void> {
    logger.info({ event: 'AUTH_QR_REQUESTED' }, 'Requesting QR code authentication');
    
    try {
      // Request QR code authentication
      await client.invoke({
        _: 'requestQrCodeAuthentication',
        other_user_ids: [], // Empty means any user can log in
      });
      this.authState = 'wait_qr';
      logger.info('QR code authentication requested');
    } catch (error) {
      logger.error({ error }, 'Failed to request QR code');
      throw error;
    }
  }

  /**
   * Get current QR code link
   */
  getQrCodeLink(): string | null {
    return this.qrCodeLink;
  }

  /**
   * Get current authentication state
   */
  getAuthState(): string {
    return this.authState;
  }

  /**
   * Get current phone number
   */
  getPhoneNumber(): string | null {
    return this.phoneNumber;
  }
}
