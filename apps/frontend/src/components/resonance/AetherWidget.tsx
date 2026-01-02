import { motion } from 'framer-motion';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToCss(rgb: { r: number; g: number; b: number }, alpha = 1): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function lerpColor(a: string, b: string, t: number): string {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  const tt = clamp01(t);
  return rgbToCss({
    r: Math.round(lerp(c1.r, c2.r, tt)),
    g: Math.round(lerp(c1.g, c2.g, tt)),
    b: Math.round(lerp(c1.b, c2.b, tt)),
  });
}

function resonancePalette(rho: number): { core: string; glow: string } {
  const r = clamp01(rho);

  // Red -> Electric Blue -> White/Gold
  const red = '#ef4444';
  const blue = '#2563eb';
  const gold = '#fbbf24';

  if (r < 0.5) {
    const t = r / 0.5;
    return { core: lerpColor(red, blue, t), glow: lerpColor(red, '#06b6d4', t) };
  }

  const t = (r - 0.5) / 0.5;
  return { core: lerpColor(blue, gold, t), glow: lerpColor('#60a5fa', '#f8fafc', t) };
}

export interface AetherWidgetProps {
  rho: number;
  lockedUntil: number | null;
  aetherAvailable: number;
  aetherVested: number;
  peerTrustScore?: number | null; // 0..1
  compact?: boolean;
}

export function AetherWidget({
  rho,
  lockedUntil,
  aetherAvailable,
  aetherVested,
  peerTrustScore,
  compact = true,
}: AetherWidgetProps) {
  const now = Date.now();
  const isLocked = typeof lockedUntil === 'number' && lockedUntil > now;
  const rhoClamped = clamp01(rho);

  const palette = resonancePalette(isLocked ? 0 : rhoClamped);
  const resonancePct = Math.round(rhoClamped * 100);
  const peerPct = typeof peerTrustScore === 'number' ? Math.round(clamp01(peerTrustScore) * 100) : null;

  // “Heartbeat”: higher resonance => slightly faster pulse.
  const baseMs = isLocked ? 2200 : 1600;
  const pulseMs = Math.max(900, baseMs - rhoClamped * 700);

  const label = isLocked ? 'LOCKED' : `${resonancePct}%`;

  return (
    <div
      className={
        compact
          ? 'flex items-center gap-3'
          : 'flex items-center gap-4 p-3 rounded-xl border border-quantum-cyan/20 bg-dark-matter-lighter'
      }
      title="Aether Resonance (local prototype)"
    >
      <motion.div
        aria-hidden
        className="relative"
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.9, 1, 0.9],
        }}
        transition={{
          duration: pulseMs / 1000,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <div
          className="rounded-full"
          style={{
            width: 36,
            height: 36,
            background: `radial-gradient(circle at 30% 30%, ${palette.glow} 0%, ${palette.core} 55%, rgba(2,6,23,1) 100%)`,
            boxShadow: `0 0 18px ${rgbToCss(hexToRgb('#06b6d4'), isLocked ? 0.15 : 0.35)}`,
            border: `1px solid ${rgbToCss(hexToRgb('#06b6d4'), 0.25)}`,
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: `0 0 22px ${rgbToCss(hexToRgb('#22d3ee'), isLocked ? 0.12 : 0.25)}`,
          }}
        />
      </motion.div>

      <div className="leading-tight">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-grey">ρ</span>
          <span className={isLocked ? 'text-xs font-bold text-error-glow' : 'text-xs font-bold text-pure-white'}>
            {label}
          </span>
        </div>

        <div className="text-[11px] text-soft-grey">
          Aether: <span className="text-pure-white">{aetherAvailable}</span>
          {aetherVested > 0 ? (
            <>
              {' '}
              <span className="text-muted-grey">(+{aetherVested} vesting)</span>
            </>
          ) : null}
        </div>

        {peerPct != null ? (
          <div className="text-[11px] text-soft-grey">
            Trust: <span className="text-pure-white">{peerPct}%</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AetherWidget;
