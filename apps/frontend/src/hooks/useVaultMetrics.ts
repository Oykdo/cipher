import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';

export interface VaultMetrics {
  resonance: number;
  entropy: number;
  eidolonBalance: number;
  holographicDepth: number;
  pioneerTier: string;
  rosettaBonus: boolean;
  dailyYield: number;
}

const DEFAULT_METRICS: VaultMetrics = {
  resonance: 50,
  entropy: 0,
  eidolonBalance: 0,
  holographicDepth: 0,
  pioneerTier: 'standard',
  rosettaBonus: false,
  dailyYield: 0,
};

// Base yield per tier (EIDOLON tokens/tick)
// Aligned with PSNX tokenomics (21M supply)
const TIER_BASE_YIELD: Record<string, number> = {
  genesis: 25,     // Supreme (#1-33)
  primordial: 25,
  supreme: 25,
  elite: 15,       // Founder 100 (#34-100)
  veteran: 8,      // Founder 1000 (#101-1000)
  early: 3,        // Pioneer (#1001-10000)
  pioneer: 3,
  standard: 1,     // Standard (#10001+)
};

function computeDailyYield(resonance: number, entropy: number, tier: string, rosetta: boolean): number {
  const base = TIER_BASE_YIELD[tier] ?? 1;
  const resonanceFactor = 0.85 + (resonance / 100) * 0.30; // 0.85 - 1.15
  const entropyPenalty = 1 - (entropy / 100) * 0.30; // 1.0 - 0.70
  const rosettaMultiplier = rosetta ? 1.2 : 1.0;
  return base * resonanceFactor * entropyPenalty * rosettaMultiplier;
}

export function useVaultMetrics(pollIntervalMs = 30_000): VaultMetrics | null {
  const linkedVault = useAuthStore((s) => s.session?.user?.linkedVault);
  const [metrics, setMetrics] = useState<VaultMetrics | null>(null);

  useEffect(() => {
    if (!linkedVault?.vaultId) {
      setMetrics(null);
      return;
    }

    let cancelled = false;

    const fetchMetrics = async () => {
      // Desktop: use Electron IPC to read local vault registry
      if (window.electron?.getEidolonVaultMetrics) {
        try {
          const result = await window.electron.getEidolonVaultMetrics({
            vaultId: linkedVault.vaultId,
            vaultNumber: linkedVault.vaultNumber,
          });
          if (!cancelled && result?.ok && result.metrics) {
            const m = result.metrics;
            const tier = m.pioneerTier || 'standard';
            const resonance = m.resonanceScore ?? 50;
            const entropy = m.operationalEntropy ?? 0;
            const rosetta = false; // TODO: check Rosetta Stone ownership
            setMetrics({
              resonance,
              entropy,
              eidolonBalance: m.eidolonBalance ?? 0,
              holographicDepth: m.holographicDepthLevel ?? 0,
              pioneerTier: tier,
              rosettaBonus: rosetta,
              dailyYield: computeDailyYield(resonance, entropy, tier, rosetta),
            });
          }
        } catch {
          // Eidolon not available — keep last known or default
        }
        return;
      }

      // Browser/Mobile: fetch from VPS API
      try {
        const connectUrl = import.meta.env.VITE_EIDOLON_CONNECT_URL || 'https://eidolon-connect.xyz';
        const connectSecret = import.meta.env.VITE_EIDOLON_CONNECT_SESSION_SECRET || '';
        const headers: Record<string, string> = {};
        if (connectSecret) headers['X-Eidolon-Connect-Secret'] = connectSecret;

        const resp = await fetch(`${connectUrl}/connect/vault/economy/${linkedVault.vaultId}`, { headers });
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          const tier = data.pioneer_tier || 'standard';
          const resonance = data.resonance_score ?? 50;
          const entropy = data.operational_entropy ?? 0;
          const rosetta = false;
          setMetrics({
            resonance,
            entropy,
            eidolonBalance: data.eidolon_balance ?? 0,
            holographicDepth: data.holographic_depth_level ?? 0,
            pioneerTier: tier,
            rosettaBonus: rosetta,
            dailyYield: computeDailyYield(resonance, entropy, tier, rosetta),
          });
          return;
        }
      } catch {
        // VPS unreachable
      }

      // Last resort: defaults
      if (!cancelled) {
        setMetrics(DEFAULT_METRICS);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [linkedVault?.vaultId, linkedVault?.vaultNumber, pollIntervalMs]);

  return metrics;
}
