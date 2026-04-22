import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import '../styles/fluidCrypto.css';

interface CosmicLoaderProps {
  stage: 'normalizing' | 'argon2' | 'hkdf' | 'keygen' | 'complete';
  progress?: number;
  onComplete?: () => void;
}

function CosmicConstellationLogo() {
  return (
    <svg viewBox="0 0 96 96" className="cosmic-constellation" aria-hidden="true">
      <defs>
        <linearGradient id="cosmicLoaderCoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="100%" stopColor="#7b2fff" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="19" fill="none" stroke="rgba(0,240,255,0.28)" strokeWidth="1.5">
        <animate attributeName="r" values="16;21;16" dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.95;0.4" dur="4s" repeatCount="indefinite" />
      </circle>
      <path d="M20 30L48 48L73 20M48 48L25 73L74 74M48 48L76 46" fill="none" stroke="rgba(200,220,255,0.4)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="48" cy="48" r="7" fill="url(#cosmicLoaderCoreGradient)" />
      <circle cx="20" cy="30" r="3.5" fill="#d9e3ff" />
      <circle cx="73" cy="20" r="3" fill="#8ce8ff" />
      <circle cx="25" cy="73" r="3" fill="#b78fff" />
      <circle cx="74" cy="74" r="2.8" fill="#d9e3ff" />
      <circle cx="76" cy="46" r="2.5" fill="#8ce8ff" />
    </svg>
  );
}

export default function CosmicLoader({ stage, progress = 0, onComplete }: CosmicLoaderProps) {
  const { t } = useTranslation();
  const [isBreakthrough, setIsBreakthrough] = useState(false);

  const stages = [
    {
      id: 'normalizing',
      label: t('cosmic_loader.stage_normalizing'),
      description: t('cosmic_loader.stage_normalizing_desc'),
    },
    {
      id: 'argon2',
      label: t('cosmic_loader.stage_argon2'),
      description: t('cosmic_loader.stage_argon2_desc'),
    },
    {
      id: 'hkdf',
      label: t('cosmic_loader.stage_hkdf'),
      description: t('cosmic_loader.stage_hkdf_desc'),
    },
    {
      id: 'keygen',
      label: t('cosmic_loader.stage_keygen'),
      description: t('cosmic_loader.stage_keygen_desc'),
    },
  ];

  const currentStageIndex = stages.findIndex((s) => s.id === stage);

  useEffect(() => {
    if (stage !== 'complete' || progress < 100) return;

    setIsBreakthrough(true);
    const timer = setTimeout(() => {
      if (onComplete) onComplete();
    }, 1500);

    return () => clearTimeout(timer);
  }, [stage, progress, onComplete]);

  return (
    <div className="cosmic-scene min-h-screen flex items-center justify-center p-8 overflow-hidden relative">
      <div className="cosmic-nebula" aria-hidden="true" />
      <div className="cosmic-stars" aria-hidden="true" />
      <div className="cosmic-p2p-grid" aria-hidden="true" />
      <div className="cosmic-volumetric" aria-hidden="true" />

      <AnimatePresence>
        {isBreakthrough && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, times: [0, 0.5, 1] }}
            className="absolute inset-0 bg-white z-50 pointer-events-none mix-blend-overlay"
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={isBreakthrough ? {
          scale: [1, 1.5, 50],
          opacity: [1, 1, 0],
          filter: ['blur(0px)', 'blur(0px)', 'blur(20px)'],
        } : {
          opacity: 1,
          scale: 1,
        }}
        transition={isBreakthrough ? { duration: 1.2, ease: "easeInOut" } : { duration: 0.5 }}
        className="max-w-2xl w-full text-center relative z-10"
      >
        <div className="flex justify-center mb-8">
          <div className={`cosmic-loader ${isBreakthrough ? 'accelerate' : ''}`}>
            <div className="cosmic-ring" />
            <div className="cosmic-ring" />
            <div className="cosmic-ring" />
            <div className="cosmic-center">
              <motion.span
                animate={{
                  scale: [1, 1.08, 1],
                  rotate: [0, 180, 360],
                }}
                transition={{
                  duration: isBreakthrough ? 0.5 : 3,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                className="text-base"
                aria-hidden="true"
              >
                &#x2731;
              </motion.span>
            </div>
          </div>
        </div>

        <CosmicConstellationLogo />
        <motion.h2
          animate={{
            textShadow: [
              '0 0 10px rgba(0, 229, 255, 0.4)',
              '0 0 30px rgba(0, 229, 255, 0.6)',
              '0 0 10px rgba(0, 229, 255, 0.4)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="cosmic-title text-3xl font-black mb-4"
        >
          <span className="cosmic-title-cipher">{t('cosmic_loader.title')}</span>
        </motion.h2>

        <p className="text-soft-grey mb-8">{t('cosmic_loader.subtitle')}</p>

        <div className="cosmic-glass-card p-8 mb-6 relative">
          <div className="cosmic-glow-border" aria-hidden="true" />
          <div className="space-y-4">
            {stages.map((s, idx) => {
              const isActive = idx === currentStageIndex;
              const isComplete = idx < currentStageIndex || stage === 'complete';

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="cosmic-status-card"
                  style={{
                    borderColor: isActive ? 'var(--cosmic-cyan)' : undefined,
                    boxShadow: isActive ? '0 0 0 1px rgba(0,240,255,0.18), 0 18px 40px rgba(0,0,0,0.35)' : undefined,
                    background: isComplete
                      ? 'linear-gradient(180deg, rgba(8, 18, 38, 0.95) 0%, rgba(6, 12, 26, 0.92) 100%)'
                      : undefined,
                  }}
                >
                  <motion.div
                    animate={isActive ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 1, repeat: isActive ? Infinity : 0 }}
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${isComplete ? 'cosmic-dot cosmic-dot-cyan' : isActive ? 'cosmic-dot cosmic-dot-cyan' : 'cosmic-dot cosmic-dot-violet'}`}
                    style={{ opacity: isComplete || isActive ? 1 : 0.4 }}
                  />

                  <div className="flex-1 text-left">
                    <div
                      className="font-semibold text-sm"
                      style={{
                        color: isActive
                          ? 'var(--cosmic-cyan)'
                          : isComplete
                            ? 'var(--success-glow)'
                            : 'var(--cosmic-text-secondary)',
                      }}
                    >
                      {s.label}
                    </div>
                    <div className="text-xs text-soft-grey">{s.description}</div>
                  </div>

                  {isActive && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-6 h-6 border-2 border-[var(--cosmic-cyan)] border-t-transparent rounded-full"
                    />
                  )}
                </motion.div>
              );
            })}
          </div>

          {progress > 0 && (
            <div className="mt-6">
              <div className="progress-container h-2">
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-muted-grey mt-2 text-center">
                {t('cosmic_loader.progress', { percent: Math.round(progress) })}
              </p>
            </div>
          )}
        </div>

        <motion.p
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="text-xs text-muted-grey mt-6"
        >
          {t('cosmic_loader.subtitle')}
        </motion.p>
      </motion.div>
    </div>
  );
}
