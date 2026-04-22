/**
 * Pure-function helpers consumed by `HolographicAvatar` and the Genesis
 * ceremony's phase-9 scene. Kept in a separate file so fast-refresh can
 * hot-reload the component module cleanly.
 */

export type BaseTint = {
  hue: number;
  spinSpeed: number;
  isFounder: boolean;
};

export function deriveBaseTint(seed: string, tier: string | null | undefined): BaseTint {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const founderTiers = new Set(['supreme', 'genesis', 'elite']);
  return {
    hue: (h % 360) / 360,
    spinSpeed: 0.25 + ((h >> 8) % 100) / 400,
    isFounder: Boolean(tier && founderTiers.has(tier)),
  };
}

/**
 * Derive 7 phases + 7 amplitudes from a hex spinor signature.
 *
 * Lower-fidelity than `avatar_visualization.py::build_avatar_dna` which mixes
 * the vault_key as secret material — we only have the public digest. Still
 * deterministic per vault and visually matches the reference band.
 */
export function deriveSpinorPhasesAmplitudes(hex: string): {
  phases: number[];
  amplitudes: number[];
} {
  const clean = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(Math.max(32, clean.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    const j = (i * 2) % Math.max(2, clean.length);
    bytes[i] = parseInt(clean.substr(j, 2), 16) || 0;
  }
  const phases: number[] = [];
  const amplitudes: number[] = [];
  for (let i = 0; i < 7; i++) {
    const off = i * 4;
    const raw =
      (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
    const phase = ((raw >>> 0) / 0xffffffff) * 2 * Math.PI;
    const ampRaw = ((bytes[i] ^ bytes[(i + 7) % bytes.length]) & 0xff) / 0xff;
    phases.push(phase);
    amplitudes.push(0.2 + ampRaw * 0.8);
  }
  return { phases, amplitudes };
}
