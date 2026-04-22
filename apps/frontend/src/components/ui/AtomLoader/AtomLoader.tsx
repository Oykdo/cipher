import { motion } from 'framer-motion';

interface AtomLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: {
    wrapper: 40,
    inner: 32,
    nucleusOuter: 10,
    nucleusDots: 4,
    electronA: 6,
    electronB: 6,
    electronC: 6,
    axisInset: 6,
    markerOffset: 6,
  },
  md: {
    wrapper: 64,
    inner: 56,
    nucleusOuter: 14,
    nucleusDots: 6,
    electronA: 8,
    electronB: 8,
    electronC: 8,
    axisInset: 8,
    markerOffset: 8,
  },
  lg: {
    wrapper: 96,
    inner: 80,
    nucleusOuter: 16,
    nucleusDots: 6,
    electronA: 10,
    electronB: 8,
    electronC: 8,
    axisInset: 8,
    markerOffset: 8,
  },
} as const;

export function AtomLoader({ size = 'md', className = '' }: AtomLoaderProps) {
  const current = sizeMap[size];

  return (
    <div
      className={`flex items-center justify-center ${className}`.trim()}
      style={{ width: current.wrapper, height: current.wrapper }}
    >
      <div className="relative" style={{ width: current.inner, height: current.inner }}>
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/8" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/8" />
        <div
          className="absolute rounded-full border border-white/5"
          style={{ inset: current.axisInset }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white/18"
          style={{ top: current.markerOffset, width: current.nucleusDots, height: current.nucleusDots }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white/18"
          style={{ bottom: current.markerOffset, width: current.nucleusDots, height: current.nucleusDots }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white/18"
          style={{ left: current.markerOffset, width: current.nucleusDots, height: current.nucleusDots }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white/18"
          style={{ right: current.markerOffset, width: current.nucleusDots, height: current.nucleusDots }}
        />

        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 5.8, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border border-quantum-cyan/24"
          style={{ transform: 'scaleY(0.58)' }}
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 4.9, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border border-white/14"
          style={{ transform: 'rotate(60deg) scaleY(0.58)' }}
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4.3, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border border-cyan-100/12"
          style={{ transform: 'rotate(-60deg) scaleY(0.58)' }}
        />

        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/18 bg-slate-950/85"
          style={{ width: current.nucleusOuter, height: current.nucleusOuter }}
        />
        <div
          className="absolute rounded-full bg-white/85"
          style={{ left: 'calc(50% - 6px)', top: 'calc(50% - 4px)', width: current.nucleusDots, height: current.nucleusDots }}
        />
        <div
          className="absolute rounded-full bg-quantum-cyan shadow-[0_0_8px_rgba(0,240,255,0.6)]"
          style={{ left: 'calc(50% + 1px)', top: 'calc(50% - 1px)', width: current.nucleusDots, height: current.nucleusDots }}
        />
        <div
          className="absolute rounded-full bg-white/75"
          style={{ left: 'calc(50% - 1px)', top: 'calc(50% + 2px)', width: current.nucleusDots, height: current.nucleusDots }}
        />

        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0"
        >
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full border border-white/35 bg-quantum-cyan shadow-[0_0_10px_rgba(0,240,255,0.55)]"
            style={{ width: current.electronA, height: current.electronA }}
          />
        </motion.div>

        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0"
          style={{ transform: 'rotate(60deg)' }}
        >
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full border border-white/30 bg-slate-100 shadow-[0_0_8px_rgba(255,255,255,0.35)]"
            style={{ width: current.electronB, height: current.electronB }}
          />
        </motion.div>

        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0"
          style={{ transform: 'rotate(-60deg)' }}
        >
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full border border-cyan-100/28 bg-cyan-50 shadow-[0_0_8px_rgba(180,240,255,0.35)]"
            style={{ width: current.electronC, height: current.electronC }}
          />
        </motion.div>
      </div>
    </div>
  );
}
