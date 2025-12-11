/**
 * Burn Message Component
 * 
 * Displays a Burn After Reading message with:
 * - Hidden content until revealed ("Tap to Reveal")
 * - Automatic burn on reveal
 * - Dissolution animation
 * - Distinct visual styling
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface BurnMessageProps {
  messageId: string;
  content: string;
  isOwn: boolean;
  timestamp: number;
  burnDelay?: number;          // Delay in seconds before burn after reveal
  isBurnedFromServer?: boolean; // Whether server has confirmed burn
  onReveal?: () => void;       // Called when message is revealed
  onBurn?: () => void;         // Called when burn animation completes
  formatTime: (timestamp: number) => string;
  reducedMotion?: boolean;
}

// Particle configuration for dissolution effect
const PARTICLE_COUNT = 24;
const PARTICLE_COLORS = ['#f97316', '#ef4444', '#fbbf24', '#dc2626'];

export function BurnMessage({
  messageId: _messageId,
  content,
  isOwn,
  timestamp,
  burnDelay = 5,
  isBurnedFromServer = false,
  onReveal,
  onBurn,
  formatTime,
  reducedMotion = false,
}: BurnMessageProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [burning, setBurning] = useState(false);
  const [burned, setBurned] = useState(false);
  
  // When server confirms burn, skip countdown and start animation immediately
  useEffect(() => {
    if (isBurnedFromServer && revealed && !burning && !burned) {
      // Clear any existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Start burn animation immediately
      setCountdown(null);
      setBurning(true);
    }
  }, [isBurnedFromServer, revealed, burning, burned]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Handle reveal - show content and start burn countdown
  const handleReveal = useCallback(() => {
    if (revealed || burning || burned || isOwn) return;

    setRevealed(true);
    setCountdown(burnDelay);
    onReveal?.();

    // Start countdown
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Start burn animation
          setBurning(true);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [revealed, burning, burned, isOwn, burnDelay, onReveal]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Handle burn animation complete
  const handleBurnComplete = useCallback(() => {
    setBurning(false);
    setBurned(true);
    onBurn?.();
  }, [onBurn]);

  // Generate random particles for dissolution effect
  const generateParticles = () => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const distance = 80 + Math.random() * 60;
      const delay = Math.random() * 0.3;
      const size = 4 + Math.random() * 8;
      const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];

      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - 50, // Drift upward
        delay,
        size,
        color,
        rotation: Math.random() * 720 - 360,
      };
    });
  };

  // Burned state - show nothing (message disappears)
  if (burned) {
    return null;
  }
  
  // If already burned on server and not revealed, don't show "Tap to Reveal"
  if (isBurnedFromServer && !revealed) {
    return null;
  }

  return (
    <motion.div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.3 } }}
    >
      <div
        className={`
          relative max-w-[85%] md:max-w-md rounded-2xl overflow-hidden
          ${isOwn
            ? 'bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40'
            : 'bg-gradient-to-br from-amber-900/30 to-red-900/30 border border-orange-500/30'
          }
          ${!revealed && !isOwn ? 'cursor-pointer hover:border-orange-400/50 transition-colors' : ''}
        `}
        onClick={!isOwn ? handleReveal : undefined}
      >
        {/* Burning Animation Overlay */}
        <AnimatePresence>
          {burning && (
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Dissolution particles */}
              {!reducedMotion && generateParticles().map((particle) => (
                <motion.div
                  key={particle.id}
                  className="absolute rounded-full"
                  style={{
                    width: particle.size,
                    height: particle.size,
                    backgroundColor: particle.color,
                    boxShadow: `0 0 ${particle.size}px ${particle.color}`,
                  }}
                  initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                  animate={{
                    x: particle.x,
                    y: particle.y,
                    scale: 0,
                    opacity: 0,
                    rotate: particle.rotation,
                  }}
                  transition={{
                    duration: 1.2,
                    delay: particle.delay,
                    ease: 'easeOut',
                  }}
                />
              ))}

              {/* Central fire emoji */}
              <motion.div
                className="text-6xl z-10"
                initial={{ scale: 0, rotate: -180 }}
                animate={{
                  scale: [0, 1.5, 1.2, 1.5, 0],
                  rotate: [0, 180, 360, 540, 720],
                  opacity: [0, 1, 1, 1, 0],
                }}
                transition={{
                  duration: 1.5,
                  times: [0, 0.2, 0.5, 0.8, 1],
                  ease: 'easeInOut',
                }}
                onAnimationComplete={handleBurnComplete}
              >
                🔥
              </motion.div>

              {/* "Message Destroyed" text */}
              <motion.div
                className="absolute bottom-4 text-orange-400 font-bold text-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -10] }}
                transition={{ duration: 1.5, times: [0, 0.2, 0.8, 1] }}
              >
                {t('messages.message_burned')}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <div ref={contentRef} className="p-4">
          {/* Header with burn icon */}
          <div className="flex items-center gap-2 mb-2">
            <motion.span
              className="text-lg"
              animate={!revealed && !isOwn ? {
                scale: [1, 1.1, 1],
                opacity: [0.7, 1, 0.7],
              } : {}}
              transition={{
                repeat: Infinity,
                duration: 2,
                ease: 'easeInOut',
              }}
            >
              🔥
            </motion.span>
            <span className="text-xs font-semibold text-orange-400">
              {t('messages.burn_after_reading')}
            </span>
            {countdown !== null && (
              <motion.span
                className="ml-auto text-xs font-mono font-bold text-red-400"
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
              >
                {countdown}s
              </motion.span>
            )}
          </div>

          {/* Message content */}
          {!revealed && !isOwn ? (
            // Hidden state - "Tap to Reveal"
            <motion.div
              className="py-6 text-center"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                className="text-4xl mb-3"
                animate={{
                  y: [0, -5, 0],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 1.5,
                  ease: 'easeInOut',
                }}
              >
                👆
              </motion.div>
              <p className="text-sm font-medium text-orange-300">
                {t('messages.tap_to_reveal')}
              </p>
              <p className="text-xs text-orange-400/60 mt-1">
                {t('messages.burn_warning')}
              </p>
            </motion.div>
          ) : isOwn ? (
            // Sender view - show content directly with burn indicator
            <>
              <p className="text-pure-white whitespace-pre-wrap break-words">
                {content}
              </p>
              <div className="mt-3 p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <div className="flex items-center gap-2 text-xs text-orange-400">
                  <span className="animate-pulse">⏳</span>
                  <span>{t('messages.burn_waiting_read')}</span>
                </div>
              </div>
            </>
          ) : (
            // Revealed state - show content with countdown
            <motion.div
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-pure-white whitespace-pre-wrap break-words">
                {content}
              </p>
              {countdown !== null && (
                <motion.div
                  className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: burnDelay, ease: 'linear' }}
                  />
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Timestamp */}
          <div className="mt-2 text-xs text-muted-grey text-right">
            {formatTime(timestamp)}
          </div>
        </div>

        {/* Pulsing glow effect for unrevealed messages */}
        {!revealed && !isOwn && (
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              boxShadow: '0 0 20px rgba(249, 115, 22, 0.3)',
            }}
            animate={{
              boxShadow: [
                '0 0 20px rgba(249, 115, 22, 0.2)',
                '0 0 30px rgba(249, 115, 22, 0.4)',
                '0 0 20px rgba(249, 115, 22, 0.2)',
              ],
            }}
            transition={{
              repeat: Infinity,
              duration: 2,
              ease: 'easeInOut',
            }}
          />
        )}
      </div>
    </motion.div>
  );
}
