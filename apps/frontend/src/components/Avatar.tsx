import type { CSSProperties } from 'react';

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
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