/**
 * Metrics Collector
 * 
 * OBSERVABILITY: Collect and aggregate metrics
 * - P2P performance metrics
 * - Cryptography metrics
 * - Transport metrics
 * - User experience metrics
 * 
 * @module MetricsCollector
 */

import { logger } from '@/core/logger';

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface AggregatedMetric {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  tags?: Record<string, string>;
}

/**
 * Collects and aggregates metrics for monitoring
 */
export class MetricsCollector {
  private metrics: Map<string, Metric[]> = new Map();
  private maxMetricsPerName = 1000;
  private aggregationInterval = 60000; // 1 minute
  private aggregationTimer?: NodeJS.Timeout;

  constructor() {
    logger.info('MetricsCollector initialized');
    this.startAggregation();
  }

  /**
   * Record a metric
   */
  record(name: string, value: number, tags?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
    };

    const key = this.getMetricKey(name, tags);
    const existing = this.metrics.get(key) || [];
    existing.push(metric);

    // Keep only recent metrics
    if (existing.length > this.maxMetricsPerName) {
      existing.shift();
    }

    this.metrics.set(key, existing);
  }

  /**
   * Record timing (convenience method)
   */
  recordTiming(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.record(`${name}.duration`, durationMs, tags);
  }

  /**
   * Record counter increment
   */
  increment(name: string, tags?: Record<string, string>): void {
    this.record(`${name}.count`, 1, tags);
  }

  /**
   * Record gauge (current value)
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.record(`${name}.gauge`, value, tags);
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(
    name?: string,
    timeWindow?: number
  ): AggregatedMetric[] {
    const results: AggregatedMetric[] = [];
    const now = Date.now();
    const cutoff = timeWindow ? now - timeWindow : 0;

    this.metrics.forEach((metrics, _key) => {
      const metricName = metrics[0]?.name;

      if (name && metricName !== name) {
        return;
      }

      // Filter by time window
      const filtered = metrics.filter((m) => m.timestamp >= cutoff);

      if (filtered.length === 0) {
        return;
      }

      // Calculate aggregations
      const values = filtered.map((m) => m.value).sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);

      results.push({
        name: metricName,
        count: values.length,
        sum,
        min: values[0],
        max: values[values.length - 1],
        avg: sum / values.length,
        p50: this.percentile(values, 0.5),
        p95: this.percentile(values, 0.95),
        p99: this.percentile(values, 0.99),
        tags: filtered[0].tags,
      });
    });

    return results;
  }

  /**
   * Get raw metrics
   */
  getRawMetrics(name?: string, limit = 100): Metric[] {
    const results: Metric[] = [];

    this.metrics.forEach((metrics) => {
      const metricName = metrics[0]?.name;

      if (name && metricName !== name) {
        return;
      }

      results.push(...metrics.slice(-limit));
    });

    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /**
   * Get metric names
   */
  getMetricNames(): string[] {
    const names = new Set<string>();
    this.metrics.forEach((metrics) => {
      if (metrics.length > 0) {
        names.add(metrics[0].name);
      }
    });
    return Array.from(names).sort();
  }

  /**
   * Clear metrics
   */
  clear(name?: string): void {
    if (name) {
      // Clear specific metric
      const keysToDelete: string[] = [];
      this.metrics.forEach((metrics, key) => {
        if (metrics[0]?.name === name) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.metrics.delete(key));
    } else {
      // Clear all
      this.metrics.clear();
    }

    logger.info('Metrics cleared', { name: name || 'all' });
  }

  /**
   * Export metrics for external monitoring
   */
  export(): string {
    const aggregated = this.getAggregatedMetrics();
    return JSON.stringify({
      timestamp: Date.now(),
      metrics: aggregated,
    });
  }

  /**
   * Destroy collector
   */
  destroy(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
    }
    this.metrics.clear();
  }

  // Private methods

  /**
   * Get metric key (name + tags)
   */
  private getMetricKey(name: string, tags?: Record<string, string>): string {
    if (!tags) {
      return name;
    }

    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');

    return `${name}{${tagStr}}`;
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) {
      return 0;
    }

    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Start aggregation timer
   */
  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      const aggregated = this.getAggregatedMetrics();

      if (aggregated.length > 0) {
        logger.debug('Metrics aggregated', {
          count: aggregated.length,
          metrics: aggregated.slice(0, 5).map((m) => ({
            name: m.name,
            avg: m.avg.toFixed(2),
            p95: m.p95.toFixed(2),
          })),
        });
      }
    }, this.aggregationInterval);
  }
}

// Export singleton instance
export const metricsCollector = new MetricsCollector();
