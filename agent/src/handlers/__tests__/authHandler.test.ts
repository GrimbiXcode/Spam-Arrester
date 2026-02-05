import { AuthHandler } from '../authHandler';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock TDLib Client
const mockInvoke = jest.fn();
const mockOn = jest.fn();
const mockClient = {
  invoke: mockInvoke,
  on: mockOn,
};

describe('AuthHandler', () => {
  let authHandler: AuthHandler;
  let updateHandler: (update: any) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    authHandler = new AuthHandler();
    
    // Capture the update handler when setupAuthHandler is called
    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'update') {
        updateHandler = handler;
      }
    });
    
    authHandler.setupAuthHandler(mockClient as any);
  });

  describe('QR Code Generation', () => {
    it('should correctly use the raw tg://login?token= link for QR code generation', async () => {
      const rawTgLink = 'tg://login?token=abc123xyz789';
      
      // Simulate TDLib sending authorizationStateWaitOtherDeviceConfirmation
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateWaitOtherDeviceConfirmation',
          link: rawTgLink,
        },
      });

      // Verify the raw tg:// link is stored without modification
      expect(authHandler.getQrCodeLink()).toBe(rawTgLink);
      expect(authHandler.getAuthState()).toBe('wait_qr_confirmation');
    });

    it('should store tg://login link with complex token correctly', async () => {
      const complexToken = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6';
      const rawTgLink = `tg://login?token=${complexToken}`;
      
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateWaitOtherDeviceConfirmation',
          link: rawTgLink,
        },
      });

      expect(authHandler.getQrCodeLink()).toBe(rawTgLink);
      expect(authHandler.getQrCodeLink()?.startsWith('tg://login?token=')).toBe(true);
    });

    it('should handle missing link in authorizationStateWaitOtherDeviceConfirmation', async () => {
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateWaitOtherDeviceConfirmation',
          // link is missing/undefined
        },
      });

      expect(authHandler.getQrCodeLink()).toBeNull();
      expect(authHandler.getAuthState()).toBe('wait_qr_confirmation');
    });

    it('should clear QR code link when authentication becomes ready', async () => {
      // First, set up QR code
      const rawTgLink = 'tg://login?token=testtoken123';
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateWaitOtherDeviceConfirmation',
          link: rawTgLink,
        },
      });

      expect(authHandler.getQrCodeLink()).toBe(rawTgLink);

      // Then authentication completes
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateReady',
        },
      });

      expect(authHandler.getQrCodeLink()).toBeNull();
      expect(authHandler.getAuthState()).toBe('ready');
    });

    it('should preserve tg:// protocol scheme exactly as received from TDLib', async () => {
      const links = [
        'tg://login?token=short',
        'tg://login?token=verylongtokenwithnumbers123456789',
        'tg://login?token=TOKEN_WITH_UNDERSCORES_AND_NUMBERS_123',
      ];

      for (const link of links) {
        await updateHandler({
          _: 'updateAuthorizationState',
          authorization_state: {
            _: 'authorizationStateWaitOtherDeviceConfirmation',
            link,
          },
        });

        const storedLink = authHandler.getQrCodeLink();
        expect(storedLink).toBe(link);
        expect(storedLink).toMatch(/^tg:\/\/login\?token=/);
      }
    });
  });

  describe('requestQrCode', () => {
    it('should request QR code authentication from TDLib', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await authHandler.requestQrCode(mockClient as any);

      expect(mockInvoke).toHaveBeenCalledWith({
        _: 'requestQrCodeAuthentication',
        other_user_ids: [],
      });
      expect(authHandler.getAuthState()).toBe('wait_qr');
    });

    it('should throw error if QR code request fails', async () => {
      const error = new Error('TDLib error');
      mockInvoke.mockRejectedValue(error);

      await expect(authHandler.requestQrCode(mockClient as any)).rejects.toThrow('TDLib error');
    });
  });

  describe('Authorization State Transitions', () => {
    it('should set state to wait_phone on authorizationStateWaitPhoneNumber', async () => {
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateWaitPhoneNumber',
        },
      });

      expect(authHandler.getAuthState()).toBe('wait_phone');
    });

    it('should set state to wait_code on authorizationStateWaitCode', async () => {
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateWaitCode',
        },
      });

      expect(authHandler.getAuthState()).toBe('wait_code');
    });

    it('should set state to wait_password on authorizationStateWaitPassword', async () => {
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateWaitPassword',
        },
      });

      expect(authHandler.getAuthState()).toBe('wait_password');
    });

    it('should set state to ready on authorizationStateReady', async () => {
      await updateHandler({
        _: 'updateAuthorizationState',
        authorization_state: {
          _: 'authorizationStateReady',
        },
      });

      expect(authHandler.getAuthState()).toBe('ready');
    });
  });
});
