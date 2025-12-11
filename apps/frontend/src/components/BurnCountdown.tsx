/**
 * Burn Countdown Component
 * 
 * Affiche un compte à rebours visuel pour les messages Burn After Reading
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface BurnCountdownProps {
  scheduledBurnAt: number;
  onBurnComplete?: () => void;
  compact?: boolean;
}

export function BurnCountdown({
  scheduledBurnAt,
  onBurnComplete,
  compact = false
}: BurnCountdownProps) {
  const { t } = useTranslation();
  const [timeRemaining, setTimeRemaining] = useState<number>(
    Math.max(0, scheduledBurnAt - Date.now())
  );
  const [percentage, setPercentage] = useState<number>(100);
  const hasCalledComplete = useRef(false);
  const initialDuration = useRef(Math.max(0, scheduledBurnAt - Date.now()));
  const onBurnCompleteRef = useRef(onBurnComplete);
  
  // Keep the ref updated with the latest callback
  useEffect(() => {
    onBurnCompleteRef.current = onBurnComplete;
  }, [onBurnComplete]);

  useEffect(() => {
    // Reset on scheduledBurnAt change
    hasCalledComplete.current = false;
    initialDuration.current = Math.max(0, scheduledBurnAt - Date.now());
    
    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, scheduledBurnAt - now);
      setTimeRemaining(remaining);

      // Calculate percentage based on initial duration
      const percent = initialDuration.current > 0 
        ? (remaining / initialDuration.current) * 100 
        : 0;
      setPercentage(Math.max(0, Math.min(100, percent)));

      if (remaining === 0 && !hasCalledComplete.current) {
        hasCalledComplete.current = true;
        onBurnCompleteRef.current?.();
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [scheduledBurnAt]); // Only depend on scheduledBurnAt, not on callback

  const formatTime = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  // Color based on urgency
  const getColor = () => {
    if (percentage > 50) return 'text-orange-400 border-orange-400';
    if (percentage > 20) return 'text-red-400 border-red-400';
    return 'text-red-600 border-red-600 animate-pulse';
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-1 text-xs ${getColor()}`}
      >
        <span className="animate-pulse">🔥</span>
        <span className="font-mono font-semibold">{formatTime(timeRemaining)}</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      {/* Progress Bar */}
      <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden mb-2">
        <motion.div
          className="h-full bg-gradient-to-r from-orange-500 via-red-500 to-red-600"
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Time Display */}
      <div className={`flex items-center justify-between text-xs ${getColor()}`}>
        <div className="flex items-center gap-2">
          <motion.span
            animate={{
              scale: percentage < 20 ? [1, 1.2, 1] : 1,
            }}
            transition={{
              repeat: percentage < 20 ? Infinity : 0,
              duration: 0.5
            }}
          >
            🔥
          </motion.span>
          <span className="font-semibold">{t('messages.auto_destruct')}</span>
        </div>
        <span className="font-mono font-bold">{formatTime(timeRemaining)}</span>
      </div>

      {/* Warning for last 10 seconds */}
      {timeRemaining < 10000 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-xs text-red-500 font-semibold text-center"
        >
          ⚠️ {t('messages.imminent_destruction')}
        </motion.div>
      )}
    </motion.div>
  );
}
