/**
 * Monitoring Dashboard
 * 
 * Real-time monitoring and observability dashboard
 */

import { useState, useEffect } from 'react';
import { metricsCollector } from '@/core/telemetry/MetricsCollector';
import { healthChecker } from '@/core/health/HealthChecker';
import type { AggregatedMetric } from '@/core/telemetry/MetricsCollector';
import type { SystemHealth, HealthStatus } from '@/core/health/HealthChecker';

export default function MonitoringDashboard() {
  const [metrics, setMetrics] = useState<AggregatedMetric[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  // Refresh data periodically
  useEffect(() => {
    const refresh = () => {
      setMetrics(metricsCollector.getAggregatedMetrics(undefined, 60000));
      setHealth(healthChecker.getLastResults());
    };

    refresh();
    const interval = setInterval(refresh, 5000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'degraded':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'unhealthy':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
    }
  };

  const getStatusIcon = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return '✅';
      case 'degraded':
        return '⚠️';
      case 'unhealthy':
        return '❌';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              📊 Monitoring Dashboard
            </h1>
            <p className="text-slate-400 mt-1">
              Real-time system observability
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/conversations'}
            className="btn-secondary"
          >
            ← Back
          </button>
        </div>

        {/* System Health */}
        {health && (
          <div className="glass-panel rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              System Health
            </h2>

            {/* Overall Status */}
            <div className={`p-4 rounded-lg border mb-4 ${getStatusColor(health.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{getStatusIcon(health.status)}</span>
                  <div>
                    <div className="text-lg font-semibold">
                      {health.status.toUpperCase()}
                    </div>
                    <div className="text-sm opacity-75">
                      Last check: {new Date(health.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Individual Checks */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {health.checks.map((check) => (
                <div
                  key={check.name}
                  className={`p-4 rounded-lg border ${getStatusColor(check.status)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold capitalize">{check.name}</span>
                    <span>{getStatusIcon(check.status)}</span>
                  </div>
                  <div className="text-sm opacity-75">{check.message}</div>
                  {check.metadata && (
                    <div className="mt-2 text-xs opacity-60">
                      {Object.entries(check.metadata).map(([key, value]) => (
                        <div key={key}>
                          {key}: {value}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-xs opacity-50 mt-2">
                    {check.duration.toFixed(0)}ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metrics */}
        <div className="glass-panel rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Performance Metrics (Last 60s)
          </h2>

          {metrics.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              No metrics available yet. Use the application to generate metrics.
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.map((metric) => (
                <div
                  key={metric.name}
                  className="p-4 bg-slate-900/50 rounded-lg border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors"
                  onClick={() => setSelectedMetric(
                    selectedMetric === metric.name ? null : metric.name
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-white">{metric.name}</span>
                    <span className="text-slate-400 text-sm">
                      {metric.count} samples
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500">Average</div>
                      <div className="text-white font-semibold">
                        {metric.avg.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">P50</div>
                      <div className="text-white font-semibold">
                        {metric.p50.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">P95</div>
                      <div className="text-white font-semibold">
                        {metric.p95.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">P99</div>
                      <div className="text-white font-semibold">
                        {metric.p99.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {selectedMetric === metric.name && (
                    <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500">Min</div>
                        <div className="text-white">{metric.min.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Max</div>
                        <div className="text-white">{metric.max.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Sum</div>
                        <div className="text-white">{metric.sum.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Count</div>
                        <div className="text-white">{metric.count}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-panel rounded-lg p-6">
            <div className="text-slate-400 text-sm mb-1">Total Metrics</div>
            <div className="text-3xl font-bold text-white">
              {metrics.reduce((sum, m) => sum + m.count, 0)}
            </div>
          </div>

          <div className="glass-panel rounded-lg p-6">
            <div className="text-slate-400 text-sm mb-1">Metric Types</div>
            <div className="text-3xl font-bold text-white">
              {metrics.length}
            </div>
          </div>

          <div className="glass-panel rounded-lg p-6">
            <div className="text-slate-400 text-sm mb-1">Health Checks</div>
            <div className="text-3xl font-bold text-white">
              {health?.checks.length || 0}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h3 className="text-blue-400 font-semibold mb-2">
            📊 About Monitoring
          </h3>
          <ul className="text-slate-300 text-sm space-y-1">
            <li>• Metrics are collected automatically during application use</li>
            <li>• Health checks run every 30 seconds</li>
            <li>• Data is aggregated over 60-second windows</li>
            <li>• Click on metrics to see detailed statistics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
