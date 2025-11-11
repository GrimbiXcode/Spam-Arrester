export class MetricsTracker {
  private metrics = {
    msgProcessedTotal: 0,
    spamDetectedTotal: 0,
    spamBlockedTotal: 0,
    spamArchivedTotal: 0,
    rateLimitHits: 0,
  };

  incrementMessagesProcessed(): void {
    this.metrics.msgProcessedTotal++;
  }

  incrementSpamDetected(): void {
    this.metrics.spamDetectedTotal++;
  }

  incrementSpamBlocked(): void {
    this.metrics.spamBlockedTotal++;
  }

  incrementSpamArchived(): void {
    this.metrics.spamArchivedTotal++;
  }

  incrementRateLimitHits(): void {
    this.metrics.rateLimitHits++;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getSpamRate(): number {
    return this.metrics.msgProcessedTotal > 0
      ? this.metrics.spamDetectedTotal / this.metrics.msgProcessedTotal
      : 0;
  }
}

export const metrics = new MetricsTracker();
