/**
 * Rate Limiter
 * 
 * PATTERN: Token Bucket Algorithm
 * Prevents flooding and abuse by limiting request rate
 * 
 * @module RateLimiter
 */

import { logger } from '@/core/logger';

export interface RateLimiterConfig {
  /**
   * Maximum requests per window
   */
  maxRequests?: number;

  /**
   * Time window in milliseconds
   */
  windowMs?: number;

  /**
   * Burst capacity (tokens)
   */
  burstCapacity?: number;

  /**
   * Refill rate (tokens per second)
   */
  refillRate?: number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private requestCount = 0;
  private windowStart: number;

  private config: Required<RateLimiterConfig>;

  constructor(config: RateLimiterConfig = {}) {
    this.config = {
      maxRequests: config.maxRequests ?? 10,
      windowMs: config.windowMs ?? 1000,
      burstCapacity: config.burstCapacity ?? 20,
      refillRate: config.refillRate ?? 10,
    };

    this.tokens = this.config.burstCapacity;
    this.lastRefill = Date.now();
    this.windowStart = Date.now();

    logger.debug('RateLimiter created', this.config);
  }

  /**
   * Acquire a token (wait if necessary)
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    // Check sliding window
    const now = Date.now();
    if (now - this.windowStart >= this.config.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Check rate limit
    if (this.requestCount >= this.config.maxRequests) {
      const waitTime = this.config.windowMs - (now - this.windowStart);
      
      logger.warn('Rate limit exceeded, waiting', { waitTime });
      
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      
      // Reset window
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    // Check token bucket
    if (this.tokens < 1) {
      const waitTime = 1000 / this.config.refillRate;
      
      logger.warn('Token bucket empty, waiting', { waitTime });
      
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refillTokens();
    }

    // Consume token
    this.tokens--;
    this.requestCount++;
  }

  /**
   * Try to acquire without waiting
   */
  tryAcquire(): boolean {
    this.refillTokens();

    const now = Date.now();
    if (now - this.windowStart >= this.config.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.config.maxRequests || this.tokens < 1) {
      return false;
    }

    this.tokens--;
    this.requestCount++;
    return true;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      tokens: this.tokens,
      requestCount: this.requestCount,
      windowRemaining: this.config.windowMs - (Date.now() - this.windowStart),
    };
  }

  // Private methods

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / 1000) * this.config.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(
        this.config.burstCapacity,
        this.tokens + tokensToAdd
      );
      this.lastRefill = now;
    }
  }
}
