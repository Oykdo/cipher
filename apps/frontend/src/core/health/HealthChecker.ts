/**
 * Health Checker
 * 
 * OBSERVABILITY: Monitor system health
 * - Component health checks
 * - Dependency checks
 * - Performance checks
 * - Security checks
 * 
 * @module HealthChecker
 */

import { logger } from '@/core/logger';
import { metricsCollector } from '@/core/telemetry/MetricsCollector';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message?: string;
  lastCheck: number;
  duration: number;
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  status: HealthStatus;
  checks: HealthCheck[];
  timestamp: number;
}

type HealthCheckFunction = () => Promise<HealthCheck>;

/**
 * Monitors system health with configurable checks
 */
export class HealthChecker {
  private checks: Map<string, HealthCheckFunction> = new Map();
  private lastResults: Map<string, HealthCheck> = new Map();
  private checkInterval = 30000; // 30 seconds
  private checkTimer?: NodeJS.Timeout;

  constructor() {
    logger.info('HealthChecker initialized');
    this.registerDefaultChecks();
    this.startHealthChecks();
  }

  /**
   * Register a health check
   */
  registerCheck(name: string, checkFn: HealthCheckFunction): void {
    this.checks.set(name, checkFn);
    logger.debug('Health check registered', { name });
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<SystemHealth> {
    const startTime = Date.now();
    const results: HealthCheck[] = [];

    // Run all checks in parallel
    const checkPromises = Array.from(this.checks.entries()).map(
      async ([name, checkFn]) => {
        try {
          const result = await checkFn();
          this.lastResults.set(name, result);
          return result;
        } catch (error) {
          const errorResult: HealthCheck = {
            name,
            status: 'unhealthy',
            message: (error as Error).message,
            lastCheck: Date.now(),
            duration: 0,
          };
          this.lastResults.set(name, errorResult);
          return errorResult;
        }
      }
    );

    results.push(...(await Promise.all(checkPromises)));

    // Determine overall status
    const overallStatus = this.determineOverallStatus(results);

    // Record metrics
    metricsCollector.recordTiming('health_check', Date.now() - startTime);
    metricsCollector.gauge('health_status', this.statusToNumber(overallStatus));

    return {
      status: overallStatus,
      checks: results,
      timestamp: Date.now(),
    };
  }

  /**
   * Get last health check results
   */
  getLastResults(): SystemHealth {
    const results = Array.from(this.lastResults.values());
    return {
      status: this.determineOverallStatus(results),
      checks: results,
      timestamp: Date.now(),
    };
  }

  /**
   * Get specific check result
   */
  getCheckResult(name: string): HealthCheck | null {
    return this.lastResults.get(name) || null;
  }

  /**
   * Destroy health checker
   */
  destroy(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    this.checks.clear();
    this.lastResults.clear();
  }

  // Private methods

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    // Storage check
    this.registerCheck('storage', async () => {
      const start = Date.now();
      try {
        // Test localStorage
        const testKey = '__health_check__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);

        // Test IndexedDB
        const dbTest = indexedDB.open('__health_check__', 1);
        await new Promise((resolve, reject) => {
          dbTest.onsuccess = resolve;
          dbTest.onerror = reject;
        });
        indexedDB.deleteDatabase('__health_check__');

        return {
          name: 'storage',
          status: 'healthy',
          message: 'Storage accessible',
          lastCheck: Date.now(),
          duration: Date.now() - start,
        };
      } catch (error) {
        return {
          name: 'storage',
          status: 'unhealthy',
          message: `Storage error: ${(error as Error).message}`,
          lastCheck: Date.now(),
          duration: Date.now() - start,
        };
      }
    });

    // Crypto check
    this.registerCheck('crypto', async () => {
      const start = Date.now();
      try {
        // Test WebCrypto API
        const key = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );

        if (!key) {
          throw new Error('Failed to generate key');
        }

        return {
          name: 'crypto',
          status: 'healthy',
          message: 'Crypto API available',
          lastCheck: Date.now(),
          duration: Date.now() - start,
        };
      } catch (error) {
        return {
          name: 'crypto',
          status: 'unhealthy',
          message: `Crypto error: ${(error as Error).message}`,
          lastCheck: Date.now(),
          duration: Date.now() - start,
        };
      }
    });

    // Memory check
    this.registerCheck('memory', async () => {
      const start = Date.now();
      try {
        // @ts-expect-error - performance.memory is Chrome-specific
        const memory = performance.memory;

        if (!memory) {
          return {
            name: 'memory',
            status: 'healthy',
            message: 'Memory API not available',
            lastCheck: Date.now(),
            duration: Date.now() - start,
          };
        }

        const usedPercent =
          (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

        let status: HealthStatus = 'healthy';
        if (usedPercent > 90) {
          status = 'unhealthy';
        } else if (usedPercent > 75) {
          status = 'degraded';
        }

        return {
          name: 'memory',
          status,
          message: `Memory usage: ${usedPercent.toFixed(1)}%`,
          lastCheck: Date.now(),
          duration: Date.now() - start,
          metadata: {
            usedMB: (memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
            limitMB: (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
            usedPercent: usedPercent.toFixed(1),
          },
        };
      } catch (error) {
        return {
          name: 'memory',
          status: 'healthy',
          message: 'Memory check not supported',
          lastCheck: Date.now(),
          duration: Date.now() - start,
        };
      }
    });

    // Performance check
    this.registerCheck('performance', async () => {
      const start = Date.now();
      try {
        const metrics = metricsCollector.getAggregatedMetrics(
          undefined,
          60000 // Last minute
        );

        // Check P2P latency
        const p2pLatency = metrics.find((m) =>
          m.name.includes('p2p') && m.name.includes('duration')
        );

        let status: HealthStatus = 'healthy';
        let message = 'Performance normal';

        if (p2pLatency) {
          if (p2pLatency.p95 > 1000) {
            status = 'unhealthy';
            message = `High P2P latency: ${p2pLatency.p95.toFixed(0)}ms`;
          } else if (p2pLatency.p95 > 500) {
            status = 'degraded';
            message = `Elevated P2P latency: ${p2pLatency.p95.toFixed(0)}ms`;
          }
        }

        return {
          name: 'performance',
          status,
          message,
          lastCheck: Date.now(),
          duration: Date.now() - start,
          metadata: p2pLatency
            ? {
                p2pLatencyP50: p2pLatency.p50.toFixed(0),
                p2pLatencyP95: p2pLatency.p95.toFixed(0),
                p2pLatencyP99: p2pLatency.p99.toFixed(0),
              }
            : undefined,
        };
      } catch (error) {
        return {
          name: 'performance',
          status: 'healthy',
          message: 'Performance metrics not available',
          lastCheck: Date.now(),
          duration: Date.now() - start,
        };
      }
    });
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(checks: HealthCheck[]): HealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) {
      return 'unhealthy';
    }
    if (checks.some((c) => c.status === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Convert status to number for metrics
   */
  private statusToNumber(status: HealthStatus): number {
    switch (status) {
      case 'healthy':
        return 1;
      case 'degraded':
        return 0.5;
      case 'unhealthy':
        return 0;
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    // Run immediately
    this.runChecks().catch((error) => {
      logger.error('Health check failed', error);
    });

    // Run periodically
    this.checkTimer = setInterval(() => {
      this.runChecks().catch((error) => {
        logger.error('Health check failed', error);
      });
    }, this.checkInterval);
  }
}

// Export singleton instance
export const healthChecker = new HealthChecker();
