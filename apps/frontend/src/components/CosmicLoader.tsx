import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import '../styles/fluidCrypto.css';

interface CosmicLoaderProps {
  stage: 'normalizing' | 'argon2' | 'hkdf' | 'keygen' | 'complete';
  progress?: number;
  onComplete?: () => void;
}

export default function CosmicLoader({ stage, progress = 0, onComplete }: CosmicLoaderProps) {
  const { t } = useTranslation();
  const [isBreakthrough, setIsBreakthrough] = useState(false);

  const stages = [
    {
      id: 'normalizing',
      label: t('cosmic_loader.stage_normalizing'),
      icon: '🌀',
      description: t('cosmic_loader.stage_normalizing_desc'),
    },
    {
      id: 'argon2',
      label: t('cosmic_loader.stage_argon2'),
      icon: '🔥',
      description: t('cosmic_loader.stage_argon2_desc'),
    },
    {
      id: 'hkdf',
      label: t('cosmic_loader.stage_hkdf'),
      icon: '🔗',
      description: t('cosmic_loader.stage_hkdf_desc'),
    },
    {
      id: 'keygen',
      label: t('cosmic_loader.stage_keygen'),
      icon: '🔐',
      description: t('cosmic_loader.stage_keygen_desc'),
    },
  ];

  const currentStageIndex = stages.findIndex((s) => s.id === stage);

  useEffect(() => {
    if (stage === 'complete' && progress >= 100) {
      // Trigger breakthrough animation
      setIsBreakthrough(true);

      // Wait for animation to finish before calling onComplete
      const timer = setTimeout(() => {
        if (onComplete) onComplete();
      }, 1500); // 1.5s duration for the breakthrough effect

      return () => clearTimeout(timer);
    }
  }, [stage, progress, onComplete]);

  return (
    <div className="dark-matter-bg min-h-screen flex items-center justify-center p-8 overflow-hidden relative">
      {/* Breakthrough Flash Overlay */}
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
          filter: ['blur(0px)', 'blur(0px)', 'blur(20px)']
        } : {
          opacity: 1,
          scale: 1
        }}
        transition={isBreakthrough ? { duration: 1.2, ease: "easeInOut" } : { duration: 0.5 }}
        className="max-w-2xl w-full text-center relative z-10"
      >
        {/* Cosmic Rings */}
        <div className="flex justify-center mb-8">
          <div className={`cosmic-loader ${isBreakthrough ? 'accelerate' : ''}`}>
            <div className="cosmic-ring" />
            <div className="cosmic-ring" />
            <div className="cosmic-ring" />
            <div className="cosmic-center">
              <motion.span
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 180, 360],
                }}
                transition={{
                  duration: isBreakthrough ? 0.5 : 3,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              >
                🔐
              </motion.span>
            </div>
          </div>
        </div>

        {/* Main Title */}
        <motion.h2
          animate={{
            textShadow: [
              '0 0 10px rgba(0, 229, 255, 0.4)',
              '0 0 30px rgba(0, 229, 255, 0.6)',
              '0 0 10px rgba(0, 229, 255, 0.4)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-3xl font-black mb-4"
          style={{ color: 'var(--quantum-cyan)' }}
        >
          {t('cosmic_loader.title')}
        </motion.h2>

        <p className="text-soft-grey mb-8">
          {t('cosmic_loader.subtitle')}
        </p>

        {/* Stage Progress */}
        <div className="glass-card p-8 mb-6">
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
                  className={`flex items-center gap-4 p-4 rounded-xl transition-all ${isActive
                    ? 'bg-quantum-cyan/10 border-2 border-quantum-cyan'
                    : isComplete
                      ? 'bg-success-glow/10'
                      : 'bg-dark-matter-lighter/50'
                    }`}
                  style={{
                    borderColor: isActive ? 'var(--quantum-cyan)' : 'transparent',
                  }}
                >
                  {/* Icon */}
                  <motion.div
                    animate={
                      isActive
                        ? {
                          scale: [1, 1.2, 1],
                          rotate: [0, 10, -10, 0],
                        }
                        : {}
                    }
                    transition={{ duration: 0.6, repeat: isActive ? Infinity : 0 }}
                    className="text-3xl"
                  >
                    {isComplete ? '✅' : s.icon}
                  </motion.div>

                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div
                      className={`font-semibold text-sm ${isActive
                        ? 'text-quantum-cyan'
                        : isComplete
                          ? 'text-success-glow'
                          : 'text-muted-grey'
                        }`}
                    >
                      {s.label}
                    </div>
                    <div
                      className={`text-xs ${isActive || isComplete ? 'text-soft-grey' : 'text-muted-grey'
                        }`}
                    >
                      {s.description}
                    </div>
                  </div>

                  {/* Loading indicator */}
                  {isActive && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-6 h-6 border-2 border-quantum-cyan border-t-transparent rounded-full"
                    />
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Overall Progress Bar */}
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

        {/* Entropy Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-4"
        >
          <div className="badge badge-quantum">
            <span>🎲</span>
            <span>{t('cosmic_loader.entropy_badge')}</span>
          </div>
          <div className="badge badge-trust">
            <span>🛡️</span>
            <span>{t('cosmic_loader.quantum_badge')}</span>
          </div>
        </motion.div>

        {/* Fun Fact */}
        <motion.p
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{ duration: 3, repeat: Infinity }}
          className="text-xs text-muted-grey mt-8"
        >
          {t('cosmic_loader.fun_fact')}
          <br />
          {t('cosmic_loader.fun_fact_2')}
        </motion.p>
      </motion.div>
    </div>
  );
}
