export class RateLimiter {
  private actions: number[] = [];
  private maxActions: number;
  private windowMs: number;

  constructor(maxActions: number, windowMs: number = 60000) {
    this.maxActions = maxActions;
    this.windowMs = windowMs;
  }

  canPerformAction(): boolean {
    const now = Date.now();
    // Remove expired timestamps
    this.actions = this.actions.filter(timestamp => now - timestamp < this.windowMs);
    return this.actions.length < this.maxActions;
  }

  recordAction(): void {
    this.actions.push(Date.now());
  }

  getRemainingActions(): number {
    const now = Date.now();
    this.actions = this.actions.filter(timestamp => now - timestamp < this.windowMs);
    return Math.max(0, this.maxActions - this.actions.length);
  }
}
