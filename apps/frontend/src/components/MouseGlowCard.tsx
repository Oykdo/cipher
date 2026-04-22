import { useRef, useCallback } from 'react';

interface MouseGlowCardProps {
  children: React.ReactNode;
  className?: string;
}

export default function MouseGlowCard({ children, className = '' }: MouseGlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty('--glow-x', `${x}px`);
    el.style.setProperty('--glow-y', `${y}px`);
    el.style.setProperty('--glow-opacity', '1');
  }, []);

  const handleMouseLeave = useCallback(() => {
    cardRef.current?.style.setProperty('--glow-opacity', '0');
  }, []);

  return (
    <div
      ref={cardRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ['--glow-x' as string]: '0px',
        ['--glow-y' as string]: '0px',
        ['--glow-opacity' as string]: '0',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(300px circle at var(--glow-x) var(--glow-y), rgba(0,240,255,0.08), transparent 60%)',
          opacity: 'var(--glow-opacity)',
          transition: 'opacity 0.3s ease',
          zIndex: 1,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </div>
  );
}
