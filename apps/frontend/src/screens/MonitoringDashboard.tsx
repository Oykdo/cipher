import { useState, useEffect } from 'react';
import { metricsCollector } from '@/core/telemetry/MetricsCollector';
import { healthChecker } from '@/core/health/HealthChecker';
import type { AggregatedMetric } from '@/core/telemetry/MetricsCollector';
import type { SystemHealth, HealthStatus } from '@/core/health/HealthChecker';
import '../styles/fluidCrypto.css';

function CosmicConstellationLogo() {
  return (
    <svg viewBox="0 0 96 96" className="cosmic-constellation" aria-hidden="true">
      <defs>
        <linearGradient id="monitorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="100%" stopColor="#7b2fff" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="19" fill="none" stroke="rgba(0,240,255,0.28)" strokeWidth="1.5" />
      <path d="M20 30L48 48L73 20M48 48L25 73L74 74M48 48L76 46" fill="none" stroke="rgba(200,220,255,0.4)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="48" cy="48" r="7" fill="url(#monitorGradient)" />
      <circle cx="20" cy="30" r="3.5" fill="#d9e3ff" />
      <circle cx="73" cy="20" r="3" fill="#8ce8ff" />
      <circle cx="25" cy="73" r="3" fill="#b78fff" />
      <circle cx="74" cy="74" r="2.8" fill="#d9e3ff" />
      <circle cx="76" cy="46" r="2.5" fill="#8ce8ff" />
    </svg>
  );
}

export default function MonitoringDashboard() {
  const [metrics, setMetrics] = useState<AggregatedMetric[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

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
        return 'OK';
      case 'degraded':
        return 'WARN';
      case 'unhealthy':
        return 'FAIL';
    }
  };

  return (
    <div className="cosmic-scene min-h-screen p-6 relative overflow-hidden">
      <div className="cosmic-nebula" aria-hidden="true" />
      <div className="cosmic-stars" aria-hidden="true" />
      <div className="cosmic-p2p-grid" aria-hidden="true" />
      <div className="cosmic-volumetric" aria-hidden="true" />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <CosmicConstellationLogo />
            <h1 className="cosmic-title text-3xl font-bold">
              <span className="cosmic-title-cipher">Monitoring Dashboard</span>
            </h1>
            <p className="text-slate-400 mt-1">Real-time system observability</p>
          </div>
          <button onClick={() => window.location.href = '/conversations'} className="cosmic-btn-ghost">
            Back
          </button>
        </div>

        {health && (
          <div className="cosmic-glass-card rounded-lg p-6 relative">
            <div className="cosmic-glow-border" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-white mb-4">System Health</h2>

            <div className={`p-4 rounded-lg border mb-4 ${getStatusColor(health.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="cosmic-badge-cyan">{getStatusIcon(health.status)}</span>
                  <div>
                    <div className="text-lg font-semibold">{health.status.toUpperCase()}</div>
                    <div className="text-sm opacity-75">Last check: {new Date(health.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {health.checks.map((check) => (
                <div key={check.name} className={`p-4 rounded-lg border ${getStatusColor(check.status)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold capitalize">{check.name}</span>
                    <span>{getStatusIcon(check.status)}</span>
                  </div>
                  <div className="text-sm opacity-75">{check.message}</div>
                  {check.metadata && (
                    <div className="mt-2 text-xs opacity-60">
                      {Object.entries(check.metadata).map(([key, value]) => (
                        <div key={key}>{key}: {value}</div>
                      ))}
                    </div>
                  )}
                  <div className="text-xs opacity-50 mt-2">{check.duration.toFixed(0)}ms</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="cosmic-glass-card rounded-lg p-6 relative">
          <div className="cosmic-glow-border" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-white mb-4">Performance Metrics (Last 60s)</h2>

          {metrics.length === 0 ? (
            <div className="text-center text-slate-400 py-8">No metrics available yet. Use the application to generate metrics.</div>
          ) : (
            <div className="space-y-4">
              {metrics.map((metric) => (
                <div
                  key={metric.name}
                  className="p-4 bg-[rgba(6,12,26,0.7)] rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-[rgba(0,240,255,0.24)] cursor-pointer transition-colors"
                  onClick={() => setSelectedMetric(selectedMetric === metric.name ? null : metric.name)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-white">{metric.name}</span>
                    <span className="text-slate-400 text-sm">{metric.count} samples</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <Stat label="Average" value={metric.avg.toFixed(2)} />
                    <Stat label="P50" value={metric.p50.toFixed(2)} />
                    <Stat label="P95" value={metric.p95.toFixed(2)} />
                    <Stat label="P99" value={metric.p99.toFixed(2)} />
                  </div>

                  {selectedMetric === metric.name && (
                    <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.08)] grid grid-cols-2 gap-4 text-sm">
                      <Stat label="Min" value={metric.min.toFixed(2)} />
                      <Stat label="Max" value={metric.max.toFixed(2)} />
                      <Stat label="Sum" value={metric.sum.toFixed(2)} />
                      <Stat label="Count" value={String(metric.count)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickStat label="Total Metrics" value={String(metrics.reduce((sum, m) => sum + m.count, 0))} />
          <QuickStat label="Metric Types" value={String(metrics.length)} />
          <QuickStat label="Health Checks" value={String(health?.checks.length || 0)} />
        </div>

        <div className="p-4 bg-[rgba(59,130,246,0.10)] border border-[rgba(59,130,246,0.20)] rounded-lg">
          <h3 className="text-blue-400 font-semibold mb-2">INFO About Monitoring</h3>
          <ul className="text-slate-300 text-sm space-y-1">
            <li>- Metrics are collected automatically during application use</li>
            <li>- Health checks run every 30 seconds</li>
            <li>- Data is aggregated over 60-second windows</li>
            <li>- Click on metrics to see detailed statistics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="text-white font-semibold">{value}</div>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="cosmic-glass-card rounded-lg p-6 relative">
      <div className="cosmic-glow-border" aria-hidden="true" />
      <div className="text-slate-400 text-sm mb-1">{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}
