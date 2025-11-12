import { detectSpam, UserProfile } from '../spamDetector';
import { Client } from 'tdl';

// Mock dependencies
jest.mock('../../config', () => ({
  config: {
    detection: {
      checkContacts: true,
      checkCommonGroups: true,
      checkProfilePhoto: true,
      checkLinks: true,
    },
    thresholds: {
      lowThreshold: 0.3,
      actionThreshold: 0.85,
    },
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../utils/heuristics', () => ({
  looksSpam: jest.fn((text: string) => {
    // Simple mock: detect if text contains common spam indicators
    return /https?:\/\/|t\.me\/|@\w{3,}|\+?\d[\d\s().-]{7,}/.test(text);
  }),
}));

describe('SpamDetector', () => {
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    mockClient = {} as jest.Mocked<Client>;
    jest.clearAllMocks();
  });

  describe('detectSpam', () => {
    it('should not flag as spam when score is below threshold', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: true,
        isMutualContact: true,
        hasProfilePhoto: true,
        hasCommonGroups: true,
      };

      const message = {
        content: {
          text: {
            text: 'Hello, how are you?',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).toHaveLength(0);
    });

    it('should flag as spam when sender is not in contacts', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: true,
        hasCommonGroups: true,
      };

      const message = {
        content: {
          text: {
            text: 'Hello',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(true);
      expect(result.score).toBe(0.3);
      expect(result.reasons).toContain('sender_not_in_contacts');
    });

    it('should add score for no common groups', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: true,
        hasCommonGroups: false,
      };

      const message = {
        content: {
          text: {
            text: 'Hello',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(true);
      expect(result.score).toBe(0.5); // 0.3 (not contact) + 0.2 (no common groups)
      expect(result.reasons).toContain('sender_not_in_contacts');
      expect(result.reasons).toContain('no_common_groups');
    });

    it('should add score for no profile photo', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: false,
        hasCommonGroups: true,
      };

      const message = {
        content: {
          text: {
            text: 'Hello',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(true);
      expect(result.score).toBeCloseTo(0.45); // 0.3 (not contact) + 0.15 (no photo)
      expect(result.reasons).toContain('sender_not_in_contacts');
      expect(result.reasons).toContain('no_profile_photo');
    });

    it('should add score for suspicious content patterns', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: true,
        isMutualContact: true,
        hasProfilePhoto: true,
        hasCommonGroups: true,
      };

      const message = {
        content: {
          text: {
            text: 'Check out https://spam-site.com for deals!',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(true);
      expect(result.score).toBe(0.4);
      expect(result.reasons).toContain('suspicious_content_pattern');
    });

    it('should accumulate scores from multiple indicators', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: false,
        hasCommonGroups: false,
      };

      const message = {
        content: {
          text: {
            text: 'Contact me @spammer or visit https://scam.com',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(true);
      // 0.3 (not contact) + 0.2 (no groups) + 0.15 (no photo) + 0.4 (suspicious content) = 1.05
      expect(result.score).toBe(1.05);
      expect(result.reasons).toHaveLength(4);
      expect(result.reasons).toContain('sender_not_in_contacts');
      expect(result.reasons).toContain('no_common_groups');
      expect(result.reasons).toContain('no_profile_photo');
      expect(result.reasons).toContain('suspicious_content_pattern');
    });

    it('should handle messages with empty text content', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: true,
        hasCommonGroups: true,
      };

      const message = {
        content: {
          text: {
            text: '',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(true);
      expect(result.score).toBe(0.3); // Only not-in-contacts
      expect(result.reasons).toContain('sender_not_in_contacts');
      expect(result.reasons).not.toContain('suspicious_content_pattern');
    });

    it('should handle messages with no text content', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: true,
        hasCommonGroups: true,
      };

      const message = {
        content: {},
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(true);
      expect(result.score).toBe(0.3);
      expect(result.reasons).toContain('sender_not_in_contacts');
    });

    it('should respect mutual contact status', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: true, // Mutual contact, even if not in contacts
        hasProfilePhoto: true,
        hasCommonGroups: true,
      };

      const message = {
        content: {
          text: {
            text: 'Hello',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).not.toContain('sender_not_in_contacts');
    });

    it('should flag high-risk spam with maximum score', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: false,
        hasCommonGroups: false,
      };

      const message = {
        content: {
          text: {
            text: 'URGENT! Contact @scammer123 at +1234567890 or visit https://phishing-site.com/steal-data t.me/scamchannel',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result.isSpam).toBe(true);
      expect(result.score).toBeGreaterThan(0.85); // Above action threshold
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should return correct structure for spam result', async () => {
      const userProfile: UserProfile = {
        userId: 123,
        isContact: false,
        isMutualContact: false,
        hasProfilePhoto: false,
        hasCommonGroups: false,
      };

      const message = {
        content: {
          text: {
            text: 'Visit https://spam.com',
          },
        },
      };

      const result = await detectSpam(mockClient, message, userProfile);

      expect(result).toHaveProperty('isSpam');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('reasons');
      expect(typeof result.isSpam).toBe('boolean');
      expect(typeof result.score).toBe('number');
      expect(Array.isArray(result.reasons)).toBe(true);
    });
  });
});
