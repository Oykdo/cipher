import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../store/auth';

const TICK_INTERVAL_SECONDS = 3600;
const GOLDEN_ANGLE_DEG = 137.508;

// Mirrors Eidolon's HOLOGRAPHIC_DEPTH_STAGES (eidolon_economy.py):
// depth_level_from_epoch() returns the highest level whose threshold is met.
const DEPTH_EPOCH_THRESHOLDS = [0, 6, 24, 72, 168, 336, 720, 1080, 1440, 2160, 4320];

export type VaultFingerprint = {
  vaultId: string;
  pioneerTier: string | null;
  spinorSignature: string | null;
  bellMax: number | null;
  bellViolations: number | null;
  bellIsQuantum: boolean | null;
  /** Eons elapsed since genesis, recomputed live (not the cached blend_data value). */
  prismEpoch: number;
  /** Golden-angle hue rotation in degrees, mod 360 — drives the L4-onwards glow drift. */
  prismHueOffset: number;
  /** Highest depth layer the vault has earned based on its age. */
  depthLevel: number;
  createdAt: string | null;
};

/**
 * Compute eons elapsed since vault genesis. Mirrors
 * `Eidolon/src/crypto/temporal_prism.py::compute_eons`.
 */
function computeEons(createdAtIso: string | null): number {
  if (!createdAtIso) return 0;
  const genesis = Date.parse(
    createdAtIso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(createdAtIso)
      ? createdAtIso
      : `${createdAtIso}Z`,
  );
  if (Number.isNaN(genesis)) return 0;
  const delta = (Date.now() - genesis) / 1000;
  if (delta < 0) return 0;
  return Math.floor(delta / TICK_INTERVAL_SECONDS);
}

/** Mirrors `src/holo/eidolon_economy.py::depth_level_from_epoch`. */
function depthLevelFromEpoch(prismEpoch: number): number {
  let earned = 0;
  for (let level = 0; level < DEPTH_EPOCH_THRESHOLDS.length; level++) {
    if (prismEpoch >= DEPTH_EPOCH_THRESHOLDS[level]) {
      earned = level;
    } else {
      break;
    }
  }
  return earned;
}

// Narrow the Electron metrics result to the shape we actually read, without
// requiring `getEidolonVaultMetrics` to be defined at the type level (it's
// optional on window.electron).
type RawMetrics = {
  pioneerTier?: string | null;
  spinorSignature?: string | null;
  bellMax?: number | null;
  bellViolations?: number | null;
  bellIsQuantum?: boolean | null;
  prismEpoch?: number | null;
  createdAt?: string | null;
};

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; raw: RawMetrics }
  | { kind: 'error'; message: string };

/**
 * One-shot fetch of crypto fingerprints for the linked vault. Fingerprints are
 * immutable once the vault is generated (spinor signature, Bell violations),
 * so we cache the result per vaultId and only recompute prismEpoch live.
 *
 * Returns null when no vault is linked or fingerprints aren't available yet
 * (e.g. browser context without Electron IPC).
 */
export function useVaultFingerprint(): VaultFingerprint | null {
  const linkedVault = useAuthStore((s) => s.session?.user?.linkedVault);
  const [state, setState] = useState<FetchState>({ kind: 'idle' });
  const [epochTick, setEpochTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!linkedVault?.vaultId) {
      setState({ kind: 'idle' });
      return;
    }
    if (!window.electron?.getEidolonVaultMetrics) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading' });
    (async () => {
      try {
        const res = await window.electron!.getEidolonVaultMetrics!({
          vaultId: linkedVault.vaultId,
          vaultNumber: linkedVault.vaultNumber,
        });
        if (cancelled) return;
        if (res?.ok && res.metrics) {
          setState({ kind: 'ready', raw: res.metrics });
        } else {
          setState({ kind: 'error', message: res?.error ?? 'fingerprint fetch failed' });
        }
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkedVault?.vaultId, linkedVault?.vaultNumber]);

  // Re-tick prism every minute so the eon drift stays live without re-fetching.
  useEffect(() => {
    const id = setInterval(() => setEpochTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo<VaultFingerprint | null>(() => {
    if (state.kind !== 'ready' || !linkedVault?.vaultId) return null;
    const m = state.raw;
    const prismEpoch = computeEons(m.createdAt ?? null);
    const prismHueOffset = (prismEpoch * GOLDEN_ANGLE_DEG) % 360;
    return {
      vaultId: linkedVault.vaultId,
      pioneerTier: m.pioneerTier ?? null,
      spinorSignature: m.spinorSignature ?? null,
      bellMax: m.bellMax ?? null,
      bellViolations: m.bellViolations ?? null,
      bellIsQuantum: m.bellIsQuantum ?? null,
      prismEpoch,
      prismHueOffset,
      depthLevel: depthLevelFromEpoch(prismEpoch),
      createdAt: m.createdAt ?? null,
    };
    // epochTick invalidates the memo so the live drift recomputes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, linkedVault?.vaultId, epochTick]);
}
