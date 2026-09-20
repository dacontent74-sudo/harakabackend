import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly processedWebhooks = new Map<string, Date>();

  // Clean up old entries every hour
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  // Keep entries for 24 hours
  private readonly ENTRY_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Start cleanup timer
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  /**
   * Check if webhook was already processed
   * @param depositId - Unique identifier for the payment
   * @param status - Payment status (COMPLETED, FAILED, etc.)
   * @returns true if already processed, false otherwise
   */
  isProcessed(depositId: string, status: string): boolean {
    const key = `${depositId}-${status}`;
    const exists = this.processedWebhooks.has(key);

    if (exists) {
      this.logger.warn(`⚠️ Duplicate webhook detected: ${key}`);
    }

    return exists;
  }

  /**
   * Mark webhook as processed
   * @param depositId - Unique identifier for the payment
   * @param status - Payment status
   */
  markProcessed(depositId: string, status: string): void {
    const key = `${depositId}-${status}`;
    this.processedWebhooks.set(key, new Date());
    this.logger.log(`✅ Webhook marked as processed: ${key}`);
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timestamp] of this.processedWebhooks.entries()) {
      if (now - timestamp.getTime() > this.ENTRY_TTL) {
        this.processedWebhooks.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`🧹 Cleaned up ${cleaned} old idempotency entries`);
    }
  }

  /**
   * Get statistics
   */
  getStats(): { totalEntries: number; oldestEntry: Date | null } {
    let oldest: Date | null = null;

    for (const timestamp of this.processedWebhooks.values()) {
      if (!oldest || timestamp < oldest) {
        oldest = timestamp;
      }
    }

    return {
      totalEntries: this.processedWebhooks.size,
      oldestEntry: oldest,
    };
  }
}
