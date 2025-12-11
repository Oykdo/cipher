/**
 * Burn Animation Component
 * 
 * Animation spectaculaire pour la destruction d'un message
 */

import { motion } from 'framer-motion';

interface BurnAnimationProps {
  onComplete?: () => void;
}

export function BurnAnimation({ onComplete }: BurnAnimationProps) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-2xl z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={onComplete}
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
        Message détruit
      </motion.div>
    </motion.div>
  );
}
