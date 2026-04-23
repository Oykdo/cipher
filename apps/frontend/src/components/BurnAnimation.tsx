/**
 * Burn Animation Component
 * 
 * Animation spectaculaire pour la destruction d'un message
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface BurnAnimationProps {
  onComplete?: () => void;
}

// Total duration of the inner animations (fire emoji + particles + text).
// Keep in sync with the `duration: 2` transitions below.
const BURN_ANIMATION_MS = 2000;

export function BurnAnimation({ onComplete }: BurnAnimationProps) {
  const { t } = useTranslation();

  // The previous implementation relied on `onAnimationComplete` on the outer
  // motion.div. In practice that fires after the outer opacity 0→1 tween
  // (~0.3 s) which is *before* the inner fire/text/particles finish — and in
  // some framer-motion versions it was not firing at all, leaving the overlay
  // stuck with a static "Message détruit". A single scheduled timer is the
  // reliable way to hand control back to the parent.
  useEffect(() => {
    const id = window.setTimeout(() => onComplete?.(), BURN_ANIMATION_MS);
    return () => window.clearTimeout(id);
  }, [onComplete]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-2xl z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Fire Emoji Animation */}
      <motion.div
        className="text-8xl"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ 
          scale: [0, 1.5, 1.2, 1.5, 0],
          rotate: [0, 180, 360, 540, 720],
          opacity: [0, 1, 1, 1, 0]
        }}
        transition={{ 
          duration: 2,
          times: [0, 0.2, 0.5, 0.8, 1],
          ease: "easeInOut"
        }}
      >
        🔥
      </motion.div>

      {/* Particles */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-orange-500 rounded-full"
          initial={{ 
            x: 0, 
            y: 0,
            scale: 1,
            opacity: 1
          }}
          animate={{ 
            x: Math.cos((i / 12) * Math.PI * 2) * 100,
            y: Math.sin((i / 12) * Math.PI * 2) * 100,
            scale: 0,
            opacity: 0
          }}
          transition={{ 
            duration: 1.5,
            delay: 0.3,
            ease: "easeOut"
          }}
        />
      ))}

      {/* Text */}
      <motion.div
        className="absolute bottom-8 text-error-glow font-bold text-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -20] }}
        transition={{ duration: 2, times: [0, 0.2, 0.8, 1] }}
      >
        {t('messages.message_burned')}
      </motion.div>
    </motion.div>
  );
}
