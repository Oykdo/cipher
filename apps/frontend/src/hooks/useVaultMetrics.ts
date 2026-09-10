import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
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
      // Authoritative economy state, proxied by the bridge from Eidolon's
      // vault registry (GET /api/v2/vault/economy).
      //
      // This used to poll the standalone Connect server directly. That server
      // keeps its own stub economy — resonance nudged +2 per activity ping and
      // truncated to an int, balance 0, tier "standard" — so Cipher displayed
      // 51 "Steady" for a vault whose Eidolon summary read 46.70. The registry
      // is what Eidolon itself shows, and the bridge holds the shared secret
      // that route requires, which has no place in a renderer bundle.
      try {
        const base = API_BASE_URL.replace(/\/$/, '');
        const accessToken = useAuthStore.getState().session?.accessToken;
        const resp = await fetch(
          `${base}/api/v2/vault/economy?vaultId=${encodeURIComponent(linkedVault.vaultId)}`,
          { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined },
        );
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          const tier = linkedVault.vaultNumber
            ? tierFromVaultNumber(linkedVault.vaultNumber)
            : (data.pioneer_tier || 'standard');
          // The bridge rejects a payload without these two, so a missing
          // value here means the contract drifted — keep whatever we had
          // instead of publishing a default dressed up as a reading.
          if (
            typeof data.resonance_score !== 'number' ||
            typeof data.operational_entropy !== 'number'
          ) {
            return;
          }
          const resonance: number = data.resonance_score;
          const entropy: number = data.operational_entropy;
          // Rosetta (+20% yield) eligibility — comes from the server:
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
        // Bridge unreachable
      }

      // A failed read leaves the previous value in place, and shows nothing
      // at all until the first success. Substituting defaults here is what
      // made an unreadable economy look like a vault sitting at 50.
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
