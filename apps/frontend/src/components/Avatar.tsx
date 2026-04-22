import type { CSSProperties } from 'react';
import { HolographicAvatar } from './HolographicAvatar';
import type { VaultFingerprint } from '../hooks/useVaultFingerprint';

type AvatarProps = {
  name: string;
  size?: number;
  /** If provided, render the holographic R3F avatar seeded on this value. */
  vaultSeed?: string | null;
  /** Vault tier — tints the outer ring gold for founder tiers. */
  vaultTier?: string | null;
  /**
   * Crypto fingerprints from the vault (spinor / Bell / prism). When provided,
   * the holographic avatar renders the higher-order layers (L8-L10) faithfully
   * instead of a pure seed-hash visual.
   */
  fingerprint?: VaultFingerprint | null;
  /** Bypass epoch-gating and render every available layer. */
  forceMaxDetail?: boolean;
};

/**
 * Renders a holographic R3F avatar when `vaultSeed` is provided, otherwise
 * falls back to the lightweight initial + gradient chip (used for contacts
 * whose vault is unknown).
 */
export function Avatar({ name, size = 36, vaultSeed, vaultTier, fingerprint, forceMaxDetail }: AvatarProps) {
  if (vaultSeed) {
    return (
      <HolographicAvatar
        seed={vaultSeed}
        size={size}
        tier={vaultTier}
        spinorSignature={fingerprint?.spinorSignature}
        bellMax={fingerprint?.bellMax}
        bellIsQuantum={fingerprint?.bellIsQuantum}
        prismHueOffset={fingerprint?.prismHueOffset}
        depthLevel={fingerprint?.depthLevel}
        createdAt={fingerprint?.createdAt}
        forceMaxDetail={forceMaxDetail}
      />
    );
  }
  const initial = (name?.trim()[0] || '?').toUpperCase();
  const hue = (name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360);
  const bg = `linear-gradient(135deg, hsl(${hue} 80% 40% / 0.9), hsl(${(hue+40)%360} 80% 45% / 0.9))`;
  const style: CSSProperties = { width: size, height: size, background: bg };
  return (
    <div className="rounded-full flex items-center justify-center text-white font-semibold shadow-elevated border border-white/10" style={style} aria-hidden>
      {initial}
    </div>
  );
}