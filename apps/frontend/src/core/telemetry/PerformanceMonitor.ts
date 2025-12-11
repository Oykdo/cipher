/**
 * Performance Monitor
 * 
 * OBSERVABILITY: Track performance metrics
 * - Function execution time
 * - Resource timing
 * - User interactions
 * - Render performance
 * 
 * @module PerformanceMonitor
 */

import { metricsCollector } from './MetricsCollector';
import { logger } from '@/core/logger';

export interface PerformanceMark {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Monitors application performance
 */
export class PerformanceMonitor {
  private marks: Map<string, PerformanceMark> = new Map();

  constructor() {
    logger.info('PerformanceMonitor initialized');
    this.observeResourceTiming();
  }

  /**
   * Start timing an operation
   */
  start(name: string, metadata?: Record<string, any>): void {
    this.marks.set(name, {
      name,
      startTime: performance.now(),
      metadata,
    });
  }

  /**
   * End timing an operation
   */
  end(name: string, tags?: Record<string, string>): number | null {
    const mark = this.marks.get(name);

    if (!mark) {
      logger.warn('Performance mark not found', { name });
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - mark.startTime;

    mark.endTime = endTime;
    mark.duration = duration;

    // Record metric
    metricsCollector.recordTiming(name, duration, tags);

    // Clean up
    this.marks.delete(name);

    logger.debug('Performance measured', {
      name,
      duration: duration.toFixed(2),
    });

    return duration;
  }

  /**
   * Measure a function execution
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    this.start(name);
    try {
      const result = await fn();
      this.end(name, tags);
      return result;
    } catch (error) {
      this.end(name, { ...tags, error: 'true' });
      throw error;
    }
  }

  /**
   * Measure synchronous function
   */
  measureSync<T>(
    name: string,
    fn: () => T,
    tags?: Record<string, string>
  ): T {
    this.start(name);
    try {
      const result = fn();
      this.end(name, tags);
      return result;
    } catch (error) {
      this.end(name, { ...tags, error: 'true' });
      throw error;
    }
  }

  /**
   * Get navigation timing
   */
  getNavigationTiming(): Record<string, number> | null {
    if (!performance.timing) {
      return null;
    }

    const timing = performance.timing;
    const navigationStart = timing.navigationStart;

    return {
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      request: timing.responseStart - timing.requestStart,
      response: timing.responseEnd - timing.responseStart,
      dom: timing.domComplete - timing.domLoading,
      load: timing.loadEventEnd - timing.loadEventStart,
      total: timing.loadEventEnd - navigationStart,
    };
  }

  /**
   * Get resource timing
   */
  getResourceTiming(type?: string): PerformanceResourceTiming[] {
    const resources = performance.getEntriesByType(
      'resource'
    ) as PerformanceResourceTiming[];

    if (!type) {
      return resources;
    }

    return resources.filter((r) => r.initiatorType === type);
  }

  /**
   * Clear performance marks
   */
  clear(): void {
    this.marks.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }

  // Private methods

  /**
   * Observe resource timing
   */
  private observeResourceTiming(): void {
    if (!('PerformanceObserver' in window)) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const resource = entry as PerformanceResourceTiming;

            // Record resource load time
            metricsCollector.recordTiming(
              'resource.load',
              resource.duration,
              {
                type: resource.initiatorType,
                name: this.getResourceName(resource.name),
              }
            );
          }
        }
      });

      observer.observe({ entryTypes: ['resource'] });
    } catch (error) {
      logger.warn('Failed to observe resource timing', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get resource name (without query params)
   */
  private getResourceName(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname.split('/').pop() || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for measuring method performance
 */
export function Measure(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const measureName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return performanceMonitor.measure(measureName, () =>
        originalMethod.apply(this, args)
      );
    };

    return descriptor;
  };
}
