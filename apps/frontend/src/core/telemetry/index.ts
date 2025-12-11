/**
 * Telemetry Module
 * 
 * Metrics collection and performance monitoring
 */

export { MetricsCollector, metricsCollector } from './MetricsCollector';
export type { Metric, AggregatedMetric } from './MetricsCollector';

export { PerformanceMonitor, performanceMonitor, Measure } from './PerformanceMonitor';
export type { PerformanceMark } from './PerformanceMonitor';
