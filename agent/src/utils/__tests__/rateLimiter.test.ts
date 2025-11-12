import { RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('canPerformAction', () => {
    it('should allow actions up to the limit', () => {
      const limiter = new RateLimiter(3, 60000);
      
      expect(limiter.canPerformAction()).toBe(true);
      limiter.recordAction();
      
      expect(limiter.canPerformAction()).toBe(true);
      limiter.recordAction();
      
      expect(limiter.canPerformAction()).toBe(true);
      limiter.recordAction();
      
      expect(limiter.canPerformAction()).toBe(false);
    });

    it('should block actions when limit is reached', () => {
      const limiter = new RateLimiter(2, 60000);
      
      limiter.recordAction();
      limiter.recordAction();
      
      expect(limiter.canPerformAction()).toBe(false);
    });

    it('should allow actions after window expires', () => {
      const limiter = new RateLimiter(2, 60000);
      
      limiter.recordAction();
      limiter.recordAction();
      expect(limiter.canPerformAction()).toBe(false);
      
      // Advance time by 61 seconds
      jest.advanceTimersByTime(61000);
      
      expect(limiter.canPerformAction()).toBe(true);
    });

    it('should use sliding window correctly', () => {
      const limiter = new RateLimiter(3, 60000);
      
      // Record 2 actions
      limiter.recordAction();
      limiter.recordAction();
      expect(limiter.getRemainingActions()).toBe(1);
      
      // Advance time by 30 seconds
      jest.advanceTimersByTime(30000);
      
      // Record 1 more action (3 total in window)
      limiter.recordAction();
      expect(limiter.canPerformAction()).toBe(false);
      
      // Advance time by 31 more seconds (61 total)
      // First 2 actions should expire
      jest.advanceTimersByTime(31000);
      
      expect(limiter.canPerformAction()).toBe(true);
      expect(limiter.getRemainingActions()).toBe(2);
    });
  });

  describe('recordAction', () => {
    it('should record action timestamps', () => {
      const limiter = new RateLimiter(5, 60000);
      
      expect(limiter.getRemainingActions()).toBe(5);
      
      limiter.recordAction();
      expect(limiter.getRemainingActions()).toBe(4);
      
      limiter.recordAction();
      expect(limiter.getRemainingActions()).toBe(3);
    });

    it('should not affect rate limit until recorded', () => {
      const limiter = new RateLimiter(2, 60000);
      
      expect(limiter.canPerformAction()).toBe(true);
      expect(limiter.canPerformAction()).toBe(true);
      expect(limiter.canPerformAction()).toBe(true); // Still true, nothing recorded
      
      limiter.recordAction();
      expect(limiter.canPerformAction()).toBe(true);
      
      limiter.recordAction();
      expect(limiter.canPerformAction()).toBe(false);
    });
  });

  describe('getRemainingActions', () => {
    it('should return max actions when no actions recorded', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.getRemainingActions()).toBe(10);
    });

    it('should return correct remaining count', () => {
      const limiter = new RateLimiter(5, 60000);
      
      expect(limiter.getRemainingActions()).toBe(5);
      
      limiter.recordAction();
      expect(limiter.getRemainingActions()).toBe(4);
      
      limiter.recordAction();
      limiter.recordAction();
      expect(limiter.getRemainingActions()).toBe(2);
    });

    it('should return 0 when limit is reached', () => {
      const limiter = new RateLimiter(3, 60000);
      
      limiter.recordAction();
      limiter.recordAction();
      limiter.recordAction();
      
      expect(limiter.getRemainingActions()).toBe(0);
    });

    it('should update remaining count as window slides', () => {
      const limiter = new RateLimiter(3, 60000);
      
      limiter.recordAction(); // t=0
      expect(limiter.getRemainingActions()).toBe(2);
      
      jest.advanceTimersByTime(30000); // t=30s
      limiter.recordAction();
      expect(limiter.getRemainingActions()).toBe(1);
      
      jest.advanceTimersByTime(31000); // t=61s, first action expires
      expect(limiter.getRemainingActions()).toBe(2);
      
      jest.advanceTimersByTime(30000); // t=91s, second action expires
      expect(limiter.getRemainingActions()).toBe(3);
    });

    it('should never return negative values', () => {
      const limiter = new RateLimiter(1, 60000);
      
      limiter.recordAction();
      expect(limiter.getRemainingActions()).toBe(0);
      
      limiter.recordAction(); // Exceed limit
      expect(limiter.getRemainingActions()).toBe(0); // Not negative
    });
  });

  describe('custom window sizes', () => {
    it('should work with short windows', () => {
      const limiter = new RateLimiter(2, 1000); // 1 second window
      
      limiter.recordAction();
      limiter.recordAction();
      expect(limiter.canPerformAction()).toBe(false);
      
      jest.advanceTimersByTime(1100);
      expect(limiter.canPerformAction()).toBe(true);
    });

    it('should work with long windows', () => {
      const limiter = new RateLimiter(5, 300000); // 5 minute window
      
      limiter.recordAction(); // t=0
      limiter.recordAction(); // t=0
      
      jest.advanceTimersByTime(60000); // t=60s (1 minute)
      expect(limiter.getRemainingActions()).toBe(3); // 2 actions still in 5-min window
      
      jest.advanceTimersByTime(239999); // t=299.999s (just before 5 minutes)
      expect(limiter.getRemainingActions()).toBe(3); // Still in window
      
      jest.advanceTimersByTime(2); // t=300.001s (past 5 minute window)
      expect(limiter.getRemainingActions()).toBe(5); // Both actions expired
    });
  });

  describe('edge cases', () => {
    it('should handle zero max actions', () => {
      const limiter = new RateLimiter(0, 60000);
      
      expect(limiter.canPerformAction()).toBe(false);
      expect(limiter.getRemainingActions()).toBe(0);
    });

    it('should handle single action limit', () => {
      const limiter = new RateLimiter(1, 60000);
      
      expect(limiter.canPerformAction()).toBe(true);
      limiter.recordAction();
      expect(limiter.canPerformAction()).toBe(false);
      
      jest.advanceTimersByTime(61000);
      expect(limiter.canPerformAction()).toBe(true);
    });

    it('should handle rapid successive calls', () => {
      const limiter = new RateLimiter(10, 60000);
      
      for (let i = 0; i < 10; i++) {
        expect(limiter.canPerformAction()).toBe(true);
        limiter.recordAction();
      }
      
      expect(limiter.canPerformAction()).toBe(false);
      expect(limiter.getRemainingActions()).toBe(0);
    });
  });
});
