/**
 * What a sphere looks like, from what its revealed template says — the same
 * tables the Eidolon desktop visualizer draws with (theme palette, shell
 * material, rarity effects), ported so Cipher can render each sphere as a
 * WebGL orb from a few hundred bytes of data: no image, no cache, no runtime
 * spawn. Pure functions: template fields in, a `SphereVisualSpec` out.
 *
 * The signature strings (`exoticPrimordialPattern_v5162`…) are hashed into a
 * per-sphere seed that sets rotation, phase and small hue drifts, so two
 * spheres of the same theme and rarity still differ.
 */

import type { SphereState, SphereStatus, SphereVisual } from './spheres';

export type ThemeColors = { primary: string; secondary: string; glow: string };

/** Genesis themes (9) and primordial era themes (8): high-contrast by type, like the visualizer. */
export const THEME_COLORS: Record<string, ThemeColors> = {
  void: { primary: '#7a1cff', secondary: '#18002f', glow: '#b15cff' },
  quantum: { primary: '#00d8ff', secondary: '#00324d', glow: '#7df6ff' },
  temporal: { primary: '#ffb21a', secondary: '#5a2400', glow: '#ffd36a' },
  spatial: { primary: '#19ff91', secondary: '#003f28', glow: '#7dffca' },
  entropic: { primary: '#ff2f78', secondary: '#3d001b', glow: '#ff78b0' },
  harmonic: { primary: '#38ffd6', secondary: '#005048', glow: '#b0fff1' },
  celestial: { primary: '#fff04a', secondary: '#574b00', glow: '#fff9a8' },
  spinorial: { primary: '#5b7cff', secondary: '#101947', glow: '#9fd1ff' },
  exotic: { primary: '#c7ff2e', secondary: '#2d0036', glow: '#ff58f7' },
  divine: { primary: '#ffd700', secondary: '#6b4c00', glow: '#fff2a8' },
  balance: { primary: '#e5e7ff', secondary: '#34384a', glow: '#ffffff' },
  trinity: { primary: '#ff4b4b', secondary: '#4d0000', glow: '#ffb0b0' },
  order: { primary: '#4d84ff', secondary: '#07154f', glow: '#9fc1ff' },
  essence: { primary: '#a86bff', secondary: '#260052', glow: '#e0bdff' },
  perfection: { primary: '#ff8c1a', secondary: '#4f1f00', glow: '#ffd08a' },
  completion: { primary: '#26d98f', secondary: '#003d35', glow: '#9fffe1' },
  ascension: { primary: '#ff2faf', secondary: '#4f0036', glow: '#ffa6df' },
};

const THEME_ALIASES: Record<string, string> = {
  space: 'spatial',
  entropy: 'entropic',
  chaos: 'entropic',
  harmony: 'harmonic',
  celest: 'celestial',
  spinor: 'spinorial',
  exotic_void: 'exotic',
  unknown: 'exotic',
};

export type ShellChrome = {
  type: string;
  specular: number;
  roughness: number;
  metallic: number;
  iridescence: number;
  shell: string;
  highlight: string;
  rim: string;
};

/** Shell material per theme: obsidian, holographic, bronze, jade, plasma, crystal, gold, pearl, black opal… */
export const SHELL_CHROME: Record<string, ShellChrome> = {
  void: { type: 'obsidian', specular: 0.9, roughness: 0.1, metallic: 0.3, iridescence: 0.0, shell: '#3a007a', highlight: '#d09bff', rim: '#9b35ff' },
  quantum: { type: 'holographic', specular: 0.85, roughness: 0.15, metallic: 0.5, iridescence: 0.8, shell: '#005d7d', highlight: '#adffff', rim: '#00d8ff' },
  temporal: { type: 'bronze', specular: 0.7, roughness: 0.3, metallic: 0.9, iridescence: 0.1, shell: '#9a4b00', highlight: '#ffe095', rim: '#ffb21a' },
  spatial: { type: 'jade', specular: 0.6, roughness: 0.25, metallic: 0.2, iridescence: 0.3, shell: '#006b42', highlight: '#a7ffd8', rim: '#19ff91' },
  entropic: { type: 'plasma', specular: 0.95, roughness: 0.05, metallic: 0.4, iridescence: 0.6, shell: '#66002c', highlight: '#ff9ac4', rim: '#ff2f78' },
  harmonic: { type: 'crystal', specular: 0.85, roughness: 0.1, metallic: 0.1, iridescence: 0.5, shell: '#00766a', highlight: '#d4fff7', rim: '#38ffd6' },
  celestial: { type: 'gold', specular: 0.8, roughness: 0.2, metallic: 1.0, iridescence: 0.0, shell: '#7a6800', highlight: '#fffbc0', rim: '#fff04a' },
  spinorial: { type: 'pearl', specular: 0.75, roughness: 0.2, metallic: 0.3, iridescence: 0.7, shell: '#17246a', highlight: '#c8dcff', rim: '#5b7cff' },
  exotic: { type: 'black_opal', specular: 0.95, roughness: 0.08, metallic: 0.45, iridescence: 1.0, shell: '#361047', highlight: '#e8ff78', rim: '#ff58f7' },
  divine: { type: 'divine_gold', specular: 1.0, roughness: 0.05, metallic: 1.0, iridescence: 0.3, shell: '#8b6914', highlight: '#fffacd', rim: '#ffd700' },
  balance: { type: 'platinum', specular: 0.9, roughness: 0.1, metallic: 1.0, iridescence: 0.2, shell: '#404040', highlight: '#ffffff', rim: '#c0c0c0' },
  trinity: { type: 'ruby', specular: 0.85, roughness: 0.15, metallic: 0.4, iridescence: 0.4, shell: '#660000', highlight: '#ffaaaa', rim: '#ff4444' },
  order: { type: 'sapphire', specular: 0.85, roughness: 0.15, metallic: 0.3, iridescence: 0.5, shell: '#0a0a40', highlight: '#aaccff', rim: '#4169e1' },
  essence: { type: 'amethyst', specular: 0.8, roughness: 0.2, metallic: 0.3, iridescence: 0.6, shell: '#2a0052', highlight: '#ddaaff', rim: '#9370db' },
  perfection: { type: 'amber', specular: 0.75, roughness: 0.2, metallic: 0.5, iridescence: 0.3, shell: '#663300', highlight: '#ffcc66', rim: '#ffa500' },
  completion: { type: 'emerald', specular: 0.8, roughness: 0.15, metallic: 0.3, iridescence: 0.5, shell: '#003333', highlight: '#aaffdd', rim: '#20b2aa' },
  ascension: { type: 'opal', specular: 0.9, roughness: 0.1, metallic: 0.4, iridescence: 0.9, shell: '#550044', highlight: '#ffaadd', rim: '#ff1493' },
};

export type RarityFx = { aura: number; sparkle: number; particles: number; orbit: number; pulse: number };

/** The rarer, the more the sphere glows, sparkles, orbits and breathes. */
export const RARITY_FX: Record<string, RarityFx> = {
  common: { aura: 0.75, sparkle: 0.4, particles: 0.35, orbit: 0.25, pulse: 0.25 },
  uncommon: { aura: 0.9, sparkle: 0.55, particles: 0.5, orbit: 0.4, pulse: 0.4 },
  rare: { aura: 1.05, sparkle: 0.8, particles: 0.8, orbit: 0.7, pulse: 0.65 },
  epic: { aura: 1.2, sparkle: 1.05, particles: 1.05, orbit: 1.0, pulse: 0.95 },
  legendary: { aura: 1.35, sparkle: 1.3, particles: 1.3, orbit: 1.35, pulse: 1.2 },
  mythic: { aura: 1.55, sparkle: 1.6, particles: 1.7, orbit: 1.8, pulse: 1.5 },
  genesis: { aura: 1.7, sparkle: 1.85, particles: 2.0, orbit: 2.1, pulse: 1.75 },
  primordial: { aura: 2.0, sparkle: 2.2, particles: 2.5, orbit: 2.5, pulse: 2.0 },
};

/** How the custody state colours the orb: brightness, saturation, pulse speed, halo. */
export type StateFx = { brightness: number; saturation: number; pulseSpeed: number; aura: number; corona: boolean };

export const STATE_FX: Record<SphereState, StateFx> = {
  finale: { brightness: 1.0, saturation: 1.0, pulseSpeed: 1.0, aura: 1.0, corona: true },
  'en attente': { brightness: 0.85, saturation: 0.9, pulseSpeed: 1.6, aura: 0.7, corona: false },
  brûlée: { brightness: 0.35, saturation: 0.05, pulseSpeed: 0.0, aura: 0.2, corona: false },
  invalide: { brightness: 0.6, saturation: 0.5, pulseSpeed: 0.4, aura: 0.4, corona: false },
};

/** A manifestation's family drives the orb's secondary geometry. */
export type FormFamily = 'beast' | 'being' | 'monolith' | 'wave' | 'singularity' | 'stellar' | 'plain';

const FAMILY_RULES: [FormFamily, RegExp][] = [
  ['singularity', /singularity|vortex|abyss|null_|paradox/i],
  ['stellar', /star|stellar|galactic|nebula|cosmos|celestial|ray/i],
  ['wave', /wave|chord|frequency|pulse|resonance|harmonic|echo/i],
  ['monolith', /monolith|shard|fold|tensor|manifold|geometric|clifford|vector|form$/i],
  ['beast', /dragon|beast/i],
  ['being', /being|entity|consciousness|essence|reflection|manifestation/i],
];

export function formFamily(manifestation: string | null | undefined): FormFamily {
  const text = String(manifestation ?? '');
  for (const [family, rule] of FAMILY_RULES) if (rule.test(text)) return family;
  return 'plain';
}

/** Legacy type/theme names into the palette, like the visualizer's `normalize_sphere_theme_name`. */
export function normalizeTheme(value: string | null | undefined, fallback = 'void'): string {
  if (!value) return fallback;
  let theme = value.trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
  theme = theme.replace(/^sphere_/, '').replace(/_sphere$/, '');
  theme = THEME_ALIASES[theme] ?? theme;
  if (THEME_COLORS[theme]) return theme;
  for (const known of Object.keys(THEME_COLORS)) if (theme.includes(known)) return known;
  return fallback;
}

/** FNV-1a over the signature strings and the id: stable per sphere, spread across [0, 1). */
export function sphereSeed(status: Pick<SphereStatus, 'sphere_id' | 'visual'>): number {
  const parts = [status.sphere_id, ...Object.values(status.visual?.signature ?? {}).map((v) => v ?? '')];
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

export interface SphereVisualSpec {
  theme: string;
  colors: ThemeColors;
  shell: ShellChrome;
  fx: RarityFx;
  state: StateFx;
  family: FormFamily;
  /** 0..1, per sphere. */
  seed: number;
  /** The manifestation, humanised ("cosmic singularity"), or null. */
  form: string | null;
}

function humanise(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
}

/** Everything the orb needs, from a sphere's status (works without `visual`: theme falls back to void). */
export function visualSpec(status: SphereStatus): SphereVisualSpec {
  const visual: SphereVisual | null | undefined = status.visual;
  const theme = normalizeTheme(visual?.theme);
  const rarity = RARITY_FX[status.rarity] ? status.rarity : 'common';
  return {
    theme,
    colors: THEME_COLORS[theme],
    shell: SHELL_CHROME[theme],
    fx: RARITY_FX[rarity],
    state: STATE_FX[status.state],
    family: formFamily(visual?.manifestation),
    seed: sphereSeed(status),
    form: humanise(visual?.manifestation),
  };
}
