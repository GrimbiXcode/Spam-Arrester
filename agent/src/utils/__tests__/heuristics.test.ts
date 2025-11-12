import { looksSpam, normalizeText } from '../heuristics';

describe('heuristics', () => {
  describe('looksSpam', () => {
    it('should return false for empty or null text', () => {
      expect(looksSpam('')).toBe(false);
      expect(looksSpam(null as any)).toBe(false);
      expect(looksSpam(undefined as any)).toBe(false);
    });

    it('should return false for normal messages without spam patterns', () => {
      expect(looksSpam('Hello, how are you?')).toBe(false);
      expect(looksSpam('Just checking in')).toBe(false);
      expect(looksSpam('Thanks for the help yesterday')).toBe(false);
    });

    describe('URL detection', () => {
      it('should detect http URLs', () => {
        expect(looksSpam('Check out http://example.com')).toBe(true);
        expect(looksSpam('Visit http://spam-site.net for deals')).toBe(true);
      });

      it('should detect https URLs', () => {
        expect(looksSpam('Click here: https://example.com')).toBe(true);
        expect(looksSpam('HTTPS://EXAMPLE.COM in caps')).toBe(true);
      });

      it('should detect t.me links', () => {
        expect(looksSpam('Join t.me/spamchannel')).toBe(true);
        expect(looksSpam('Contact me at T.ME/username')).toBe(true);
        expect(looksSpam('t.me/joinchat/abc123')).toBe(true);
      });
    });

    describe('Handle detection', () => {
      it('should detect @ mentions with valid usernames', () => {
        expect(looksSpam('Contact @spammer for deals')).toBe(true);
        expect(looksSpam('DM @user123 now')).toBe(true);
        expect(looksSpam('@spam_channel has offers')).toBe(true);
      });

      it('should not detect short handles (less than 3 chars)', () => {
        expect(looksSpam('Email is me at company')).toBe(false);
        expect(looksSpam('at is too short')).toBe(false);
      });

      it('should detect handles with underscores and numbers', () => {
        expect(looksSpam('Follow @user_name_123')).toBe(true);
        expect(looksSpam('@test_user')).toBe(true);
      });
    });

    describe('Phone number detection', () => {
      it('should detect phone numbers with country codes', () => {
        expect(looksSpam('Call me +1234567890')).toBe(true);
        expect(looksSpam('+44 20 1234 5678')).toBe(true);
        expect(looksSpam('+7 (999) 123-45-67')).toBe(true);
      });

      it('should detect phone numbers without country codes', () => {
        expect(looksSpam('Call 123-456-7890')).toBe(true);
        expect(looksSpam('Phone: (555) 123-4567')).toBe(true);
        expect(looksSpam('Contact: 555.123.4567')).toBe(true);
      });

      it('should detect phone numbers with various formats', () => {
        expect(looksSpam('123 456 7890')).toBe(true);
        expect(looksSpam('(123)456-7890')).toBe(true);
        expect(looksSpam('1-800-555-5555')).toBe(true);
      });

      it('should not detect short digit sequences', () => {
        expect(looksSpam('I have 3 cats')).toBe(false);
        expect(looksSpam('Room 42')).toBe(false);
      });
    });

    describe('Combined patterns', () => {
      it('should detect messages with multiple spam indicators', () => {
        expect(looksSpam('Contact @spammer at +1234567890 or visit https://spam.com')).toBe(true);
        expect(looksSpam('Join t.me/channel and call +44 123 456 7890')).toBe(true);
      });

      it('should detect messages with any single spam indicator', () => {
        expect(looksSpam('Only has @username here')).toBe(true);
        expect(looksSpam('Only has https://link.com')).toBe(true);
        expect(looksSpam('Only has +1234567890')).toBe(true);
      });
    });
  });

  describe('normalizeText', () => {
    it('should convert text to lowercase', () => {
      expect(normalizeText('HELLO WORLD')).toBe('hello world');
      expect(normalizeText('MiXeD CaSe')).toBe('mixed case');
    });

    it('should remove URLs', () => {
      expect(normalizeText('Check https://example.com for info')).toBe('check for info');
      expect(normalizeText('Visit http://test.org now')).toBe('visit now');
    });

    it('should remove t.me links', () => {
      expect(normalizeText('Join t.me/channel today')).toBe('join today');
      expect(normalizeText('Contact t.me/user123')).toBe('contact');
    });

    it('should remove phone numbers', () => {
      expect(normalizeText('Call +1234567890 now')).toBe('call now');
      expect(normalizeText('Phone: (555) 123-4567')).toBe('phone');
    });

    it('should remove special characters', () => {
      expect(normalizeText('Hello!!! World???')).toBe('hello world');
      expect(normalizeText('test@#$%^&*test')).toBe('test test');
    });

    it('should normalize whitespace', () => {
      expect(normalizeText('too    many     spaces')).toBe('too many spaces');
      expect(normalizeText('  leading and trailing  ')).toBe('leading and trailing');
    });

    it('should handle complex spam messages', () => {
      const spamText = 'URGENT!!! Call +1-800-555-1234 or visit https://scam.com @contact_now';
      const normalized = normalizeText(spamText);
      expect(normalized).toBe('urgent call or visit contact now');
      expect(normalized).not.toContain('+');
      expect(normalized).not.toContain('http');
      expect(normalized).not.toContain('@');
    });
  });
});
