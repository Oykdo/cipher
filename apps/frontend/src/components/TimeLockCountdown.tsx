/**
 * Time Lock Countdown Component
 * 
 * Affiche un compte à rebours en temps réel pour les messages Time Capsule
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface TimeLockCountdownProps {
  unlockTimestamp: number;
  onUnlock?: () => void;
}

export function TimeLockCountdown({ 
  unlockTimestamp, 
  onUnlock 
}: TimeLockCountdownProps) {
  const { t } = useTranslation();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, unlockTimestamp - now);
      setTimeRemaining(remaining);

      if (remaining === 0 && !isUnlocked) {
        setIsUnlocked(true);
        if (onUnlock) {
          onUnlock();
        }
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [unlockTimestamp, onUnlock, isUnlocked]);

  const formatTime = (ms: number): { days: number; hours: number; minutes: number; seconds: number } => {
    const totalSeconds = Math.ceil(ms / 1000);
    
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;
    
    return { days, hours, minutes, seconds };
  };

  const time = formatTime(timeRemaining);

  if (isUnlocked) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center"
      >
        <motion.div 
          className="text-4xl mb-2"
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 0.5 }}
        >
          🔓
        </motion.div>
        <p className="text-sm text-green-400 font-semibold">
          {t('messages.unlocked', 'Déverrouillé')}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="text-center">
      <motion.div 
        className="text-4xl mb-2"
        animate={{ 
          scale: [1, 1.05, 1],
        }}
        transition={{ 
          repeat: Infinity,
          duration: 2,
          ease: "easeInOut"
        }}
      >
        🔒
      </motion.div>
      <p className="text-sm text-soft-grey mb-2">{t('messages.time_capsule', 'Time Capsule')}</p>
      
      {/* Countdown Display */}
      <div className="flex items-center justify-center gap-1 text-quantum-cyan font-mono">
        {time.days > 0 && (
          <>
            <TimeUnit value={time.days} label="j" />
            <span className="text-soft-grey">:</span>
          </>
        )}
        {(time.days > 0 || time.hours > 0) && (
          <>
            <TimeUnit value={time.hours} label="h" />
            <span className="text-soft-grey">:</span>
          </>
        )}
        <TimeUnit value={time.minutes} label="m" />
        <span className="text-soft-grey">:</span>
        <TimeUnit value={time.seconds} label="s" highlight={time.days === 0 && time.hours === 0 && time.minutes < 1} />
      </div>

      {/* Progress indicator */}
      <div className="mt-3 flex justify-center gap-1">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-quantum-cyan/30"
            animate={{
              backgroundColor: ['rgba(0, 255, 255, 0.3)', 'rgba(0, 255, 255, 1)', 'rgba(0, 255, 255, 0.3)'],
            }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              delay: i * 0.2,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>
    </div>
  );
}

function TimeUnit({ value, label, highlight = false }: { value: number; label: string; highlight?: boolean }) {
  return (
    <motion.div 
      className={`flex items-baseline ${highlight ? 'text-error-glow' : ''}`}
      animate={highlight ? { scale: [1, 1.1, 1] } : {}}
      transition={{ repeat: Infinity, duration: 1 }}
    >
      <span className="text-lg font-bold min-w-[2ch] text-right">
        {value.toString().padStart(2, '0')}
      </span>
      <span className="text-xs text-soft-grey ml-0.5">{label}</span>
    </motion.div>
  );
}
