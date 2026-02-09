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

      it('should detect t.me links with another indicator', () => {
        // Single t.me link is one indicator; need 2 indicators to flag spam
        expect(looksSpam('Join t.me/spamchannel now!!!')).toBe(true); // link + excess punct
        expect(looksSpam('Contact me at T.ME/username @user123')).toBe(true); // link + handle
        expect(looksSpam('t.me/joinchat/abc123 +1234567890')).toBe(true); // link + phone
      });
    });

    describe('Handle detection', () => {
      it('should detect @ mentions with another indicator', () => {
        // Single handle is one indicator; need 2 indicators to flag spam
        expect(looksSpam('Contact @spammer for deals!!!')).toBe(true); // handle + excess punct
        expect(looksSpam('DM @user123 now URGENT')).toBe(true); // handle + urgency
        expect(looksSpam('@spam_channel has crypto offers')).toBe(true); // handle + money bait (high risk)
      });

      it('should not detect short handles (less than 3 chars)', () => {
        expect(looksSpam('Email is me at company')).toBe(false);
        expect(looksSpam('at is too short')).toBe(false);
      });

      it('should detect handles with underscores and numbers combined with other indicators', () => {
        // Single handle is one indicator; need 2 indicators to flag spam
        expect(looksSpam('Follow @user_name_123 ASAP')).toBe(true); // handle + urgency
        expect(looksSpam('@test_user earn money now')).toBe(true); // handle + money bait (high risk)
      });
    });

    describe('Phone number detection', () => {
      it('should detect phone numbers with country codes and another indicator', () => {
        // Single phone is one indicator; need 2 indicators to flag spam
        expect(looksSpam('Call me +1234567890 URGENT')).toBe(true); // phone + urgency
        expect(looksSpam('+44 20 1234 5678 contact me')).toBe(true); // phone + contact bait
        expect(looksSpam('+7 (999) 123-45-67 @username')).toBe(true); // phone + handle
      });

      it('should detect phone numbers without country codes with another indicator', () => {
        // Single phone is one indicator; need 2 indicators to flag spam
        expect(looksSpam('Call 123-456-7890 NOW!!!')).toBe(true); // phone + excess punct
        expect(looksSpam('Phone: (555) 123-4567 dm me')).toBe(true); // phone + contact bait
        expect(looksSpam('Contact: 555.123.4567 URGENT')).toBe(true); // phone + urgency
      });

      it('should detect phone numbers with various formats and another indicator', () => {
        // Single phone is one indicator; need 2 indicators to flag spam
        expect(looksSpam('123 456 7890 act now')).toBe(true); // phone + urgency
        expect(looksSpam('(123)456-7890 message me')).toBe(true); // phone + contact bait
        expect(looksSpam('1-800-555-5555 URGENT')).toBe(true); // phone + urgency
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

      it('should require at least two indicators for non-high-risk patterns', () => {
        // Single indicators alone should NOT trigger spam
        expect(looksSpam('Only has @username here')).toBe(false);
        expect(looksSpam('Only has +1234567890')).toBe(false);
        // Note: URLs trigger both hasLink and hasObfuscatedUrl (2 indicators), so they flag spam
        expect(looksSpam('Only has https://link.com')).toBe(true);
        // Multiple indicators together should trigger spam
        expect(looksSpam('@username https://link.com')).toBe(true);
      });
    });

    describe('Additional patterns', () => {
      it('should detect money/crypto bait', () => {
        expect(looksSpam('Bitcoin giveaway! Earn $500 now')).toBe(true);
        expect(looksSpam('USDT airdrop is live, claim bonus')).toBe(true);
      });

      it('should detect delivery phishing language', () => {
        expect(looksSpam('DHL delivery pending, pay fee via link')).toBe(true);
        expect(looksSpam('UPS parcel: confirm tracking link')).toBe(true);
      });

      it('should detect scam keyword prompts', () => {
        expect(looksSpam('Verify your account now to avoid suspension')).toBe(true);
        expect(looksSpam('Confirm your login credentials ASAP')).toBe(true);
      });

      it('should detect obfuscated URLs', () => {
        expect(looksSpam('Visit hxxp://bad.site now')).toBe(true);
        expect(looksSpam('go to example dot com for bonus')).toBe(true);
      });

      it('should require multiple weak indicators', () => {
        // "URGENT!!!" has urgency + excess punctuation = 2 indicators
        expect(looksSpam('URGENT!!!')).toBe(true);
        // "CONTACT ME ASAP" only has urgency (asap) = 1 indicator
        expect(looksSpam('CONTACT ME ASAP')).toBe(false);
        expect(looksSpam('URGENT!!! Contact @spam_now')).toBe(true);
      });

      it('should not flag very short messages alone (needs 2 indicators)', () => {
        // Very short (<=3 chars) is only 1 indicator; need 2 to flag spam
        expect(looksSpam('hi')).toBe(false);
        expect(looksSpam('ok')).toBe(false);
        expect(looksSpam('yo')).toBe(false);
        // Short message with another indicator
        expect(looksSpam('hi!')).toBe(false); // short but only 1 exclamation mark, not 3+
        // "yo!!!" is 5 chars, so isVeryShort=false; only hasExcessPunct=true (1 indicator)
        expect(looksSpam('yo!!!')).toBe(false);
        // Truly short + excess punct: "a!!!" is 4 chars > 3, so not short enough
        // Need 2 indicators: short (<=3) + something else
        expect(looksSpam('hi!!! URGENT')).toBe(true); // excess punct + urgency = 2 indicators
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
