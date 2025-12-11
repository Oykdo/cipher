/**
 * Circuit Breaker Pattern
 * 
 * PATTERN: Circuit Breaker
 * Prevents cascading failures by stopping requests to failing services
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service failing, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 * 
 * @module CircuitBreaker
 */

import { logger } from '@/core/logger';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /**
   * Number of failures before opening circuit
   */
  failureThreshold?: number;

  /**
   * Time window for counting failures (ms)
   */
  failureWindow?: number;

  /**
   * Time to wait before attempting recovery (ms)
   */
  resetTimeout?: number;

  /**
   * Number of successful requests to close circuit
   */
  successThreshold?: number;

  /**
   * Timeout for individual requests (ms)
   */
  requestTimeout?: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailure?: number;
  lastSuccess?: number;
  stateChangedAt: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private lastFailure?: number;
  private lastSuccess?: number;
  private stateChangedAt = Date.now();
  private resetTimer?: NodeJS.Timeout;

  private config: Required<CircuitBreakerConfig>;

  constructor(
    private name: string,
    config: CircuitBreakerConfig = {}
  ) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      failureWindow: config.failureWindow ?? 60000, // 1 minute
      resetTimeout: config.resetTimeout ?? 30000, // 30 seconds
      successThreshold: config.successThreshold ?? 2,
      requestTimeout: config.requestTimeout ?? 10000, // 10 seconds
    };

    logger.info('CircuitBreaker created', {
      name: this.name,
      config: this.config,
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check circuit state
    if (this.state === 'OPEN') {
      // Check if reset timeout elapsed
      if (Date.now() - this.stateChangedAt >= this.config.resetTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);

      // Record success
      this.onSuccess();

      return result;
    } catch (error) {
      // Record failure
      this.onFailure(error as Error);

      throw error;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      stateChangedAt: this.stateChangedAt,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    logger.info('CircuitBreaker manually reset', { name: this.name });
    this.transitionTo('CLOSED');
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Destroy circuit breaker
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
  }

  // Private methods

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timeout')),
          this.config.requestTimeout
        )
      ),
    ]);
  }

  private onSuccess(): void {
    this.lastSuccess = Date.now();
    this.successes++;

    if (this.state === 'HALF_OPEN') {
      // Check if we can close the circuit
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
        this.failures = 0;
        this.successes = 0;
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  private onFailure(error: Error): void {
    this.lastFailure = Date.now();
    this.failures++;

    logger.warn('CircuitBreaker failure', {
      name: this.name,
      failures: this.failures,
      threshold: this.config.failureThreshold,
      error: error.message,
    });

    if (this.state === 'HALF_OPEN') {
      // Failure in half-open state, reopen circuit
      this.transitionTo('OPEN');
      this.successes = 0;
    } else if (this.state === 'CLOSED') {
      // Check if we should open the circuit
      if (this.shouldOpen()) {
        this.transitionTo('OPEN');
      }
    }
  }

  private shouldOpen(): boolean {
    // Check if failures exceed threshold within time window
    if (this.failures < this.config.failureThreshold) {
      return false;
    }

    if (!this.lastFailure) {
      return false;
    }

    const timeSinceFirstFailure = Date.now() - this.lastFailure;
    return timeSinceFirstFailure <= this.config.failureWindow;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = Date.now();

    logger.info('CircuitBreaker state changed', {
      name: this.name,
      from: oldState,
      to: newState,
    });

    // Schedule reset timer for OPEN state
    if (newState === 'OPEN') {
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
      }

      this.resetTimer = setTimeout(() => {
        if (this.state === 'OPEN') {
          this.transitionTo('HALF_OPEN');
        }
      }, this.config.resetTimeout);
    }
  }
}
