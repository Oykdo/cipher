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
  evolvingSpheres: number;
  mythicalOrHigherSpheres: number;
  consecutiveActiveEpochs: number;
  rosettaSource: 'streak' | 'spheres' | 'server' | null;
}

const DEFAULT_METRICS: VaultMetrics = {
  resonance: 50,
  entropy: 0,
  eidolonBalance: 0,
  holographicDepth: 0,
  pioneerTier: 'standard',
  rosettaBonus: false,
  dailyYield: 0,
  evolvingSpheres: 0,
  mythicalOrHigherSpheres: 0,
  consecutiveActiveEpochs: 0,
  rosettaSource: null,
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

function tierFromVaultNumber(vaultNumber: number | null | undefined): string {
  if (!vaultNumber) return 'standard';
  if (vaultNumber <= 33) return 'supreme';
  if (vaultNumber <= 100) return 'elite';
  if (vaultNumber <= 1000) return 'veteran';
  if (vaultNumber <= 10000) return 'pioneer';
  return 'standard';
}

function computeDailyYield(resonance: number, entropy: number, tier: string, rosetta: boolean): number {
  const base = TIER_BASE_YIELD[tier] ?? 1;
  // P2: wider activity influence (0.50 - 1.50 instead of 0.85 - 1.15)
  const resonanceFactor = 0.50 + (resonance / 100) * 1.00;
  // Entropy penalty (unchanged): 1.0 - 0.70
  const entropyPenalty = 1 - (entropy / 100) * 0.30;
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
      // Production: fetch from VPS API (Eidolon Connect)
      try {
        const connectUrl = import.meta.env.VITE_EIDOLON_CONNECT_URL || 'https://eidolon-connect.xyz';
        const connectSecret = import.meta.env.VITE_EIDOLON_CONNECT_SESSION_SECRET || '';
        const headers: Record<string, string> = {};
        if (connectSecret) headers['X-Eidolon-Connect-Secret'] = connectSecret;

        const resp = await fetch(`${connectUrl}/connect/vault/economy/${linkedVault.vaultId}`, { headers });
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          const tier = linkedVault.vaultNumber
            ? tierFromVaultNumber(linkedVault.vaultNumber)
            : (data.pioneer_tier || 'standard');
          const resonance = data.resonance_score ?? 50;
          const entropy = data.operational_entropy ?? 0;
          // Rosetta (+20% yield) eligibility — comes from the VPS:
          //  - explicit `rosetta_active` flag
          //  - or streak >= 42 active 4h-epochs (7 days)
          //  - or holding >= 10 mythical-or-higher unique spheres
          const streak = data.consecutive_active_epochs ?? 0;
          const mythicalCount = data.mythical_or_higher_spheres ?? 0;
          const evolvingSpheres = data.evolving_spheres ?? 0;
          let rosetta = false;
          let rosettaSource: VaultMetrics['rosettaSource'] = null;
          if (data.rosetta_active === true) {
            rosetta = true;
            rosettaSource = 'server';
          } else if (streak >= 42) {
            rosetta = true;
            rosettaSource = 'streak';
          } else if (mythicalCount >= 10) {
            rosetta = true;
            rosettaSource = 'spheres';
          }
          setMetrics({
            resonance,
            entropy,
            eidolonBalance: data.eidolon_balance ?? 0,
            holographicDepth: data.holographic_depth_level ?? 0,
            pioneerTier: tier,
            rosettaBonus: rosetta,
            dailyYield: computeDailyYield(resonance, entropy, tier, rosetta),
            evolvingSpheres,
            mythicalOrHigherSpheres: mythicalCount,
            consecutiveActiveEpochs: streak,
            rosettaSource,
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
