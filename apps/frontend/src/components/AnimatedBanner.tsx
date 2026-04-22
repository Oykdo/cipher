import { useRef, useEffect, useCallback } from 'react';

interface AnimatedBannerProps {
  label: string;
  variant: 'violet' | 'cyan';
}

export default function AnimatedBanner({ label, variant }: AnimatedBannerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1, y: -1 });
  const animFrameRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);

  const isCyan = variant === 'cyan';
  const baseHue = isCyan ? 185 : 270;

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, time: number) => {
    ctx.clearRect(0, 0, w, h);

    // Animated gradient background
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    const shift = Math.sin(time * 0.001) * 15;
    grad.addColorStop(0, `hsla(${baseHue + shift}, 90%, 55%, 0.25)`);
    grad.addColorStop(0.5, `hsla(${baseHue + 20 + shift}, 85%, 45%, 0.35)`);
    grad.addColorStop(1, `hsla(${baseHue + shift}, 90%, 55%, 0.25)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    // Animated border glow
    const borderGrad = ctx.createLinearGradient(0, 0, w, h);
    borderGrad.addColorStop(0, `hsla(${baseHue}, 100%, 65%, ${0.4 + Math.sin(time * 0.003) * 0.2})`);
    borderGrad.addColorStop(1, `hsla(${baseHue + 40}, 100%, 65%, ${0.4 + Math.cos(time * 0.003) * 0.2})`);
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0.75, 0.75, w - 1.5, h - 1.5, 12);
    ctx.stroke();

    // Scanning light sweep
    const sweepX = ((time * 0.08) % (w + 60)) - 30;
    const sweepGrad = ctx.createLinearGradient(sweepX - 30, 0, sweepX + 30, 0);
    sweepGrad.addColorStop(0, 'hsla(0,0%,100%,0)');
    sweepGrad.addColorStop(0.5, `hsla(${baseHue}, 100%, 80%, 0.15)`);
    sweepGrad.addColorStop(1, 'hsla(0,0%,100%,0)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    // Particles
    const particles = particlesRef.current;
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;

      // Mouse repulsion
      if (mx >= 0) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 40) {
          const force = (40 - dist) / 40 * 0.8;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      // Damping
      p.vx *= 0.98;
      p.vy *= 0.98;

      // Wrap
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      if (p.life <= 0) {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        p.life = 1;
        p.vx = (Math.random() - 0.5) * 0.4;
        p.vy = (Math.random() - 0.5) * 0.4;
      }

      const alpha = p.life * 0.7;
      const size = p.size * (0.5 + p.life * 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${baseHue + p.hueOffset}, 100%, 75%, ${alpha})`;
      ctx.fill();
    }

    // Mouse glow
    if (mx >= 0 && mx <= w && my >= 0 && my <= h) {
      const glowGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 35);
      glowGrad.addColorStop(0, `hsla(${baseHue}, 100%, 75%, 0.25)`);
      glowGrad.addColorStop(1, 'hsla(0,0%,100%,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Label text
    ctx.font = 'bold 11px "Inter", sans-serif';
    ctx.letterSpacing = '3px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textGlow = `hsla(${baseHue}, 100%, 80%, ${0.7 + Math.sin(time * 0.004) * 0.3})`;
    ctx.shadowColor = textGlow;
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff';
    ctx.fillText(label.toUpperCase(), w / 2, h / 2 + 1);
    ctx.shadowBlur = 0;
  }, [label, baseHue]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 80;
    const h = 28;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // Init particles
    particlesRef.current = Array.from({ length: 12 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 1.5 + 0.5,
      life: Math.random(),
      decay: 0.001 + Math.random() * 0.002,
      hueOffset: Math.random() * 30 - 15,
    }));

    const loop = (time: number) => {
      draw(ctx, w, h, time);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseLeave = () => {
    mouseRef.current = { x: -1, y: -1 };
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="inline-block cursor-pointer align-middle"
      style={{ borderRadius: 12 }}
    />
  );
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  decay: number;
  hueOffset: number;
}
