/**
 * DiceKey Input Component - Fluid Cryptography Edition
 * 
 * Vision: Transformer 300 lancers de dés en un rituel engageant
 * avec constellation progressive, animations fluides, et feedback tactile
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { debugLogger } from "../debugLogger";
import {
  DICE_SERIES_COUNT,
  DICE_PER_SERIES,
  calculateSeriesChecksum,
  validateSeries as _validateSeries,
} from '../lib/diceKey';
import '../styles/fluidCrypto.css';

interface DiceKeyInputProps {
  onComplete: (rolls: number[]) => void;
  onCancel?: () => void;
}

export default function DiceKeyInputFluid({ onComplete, onCancel }: DiceKeyInputProps) {
  const { t } = useTranslation();
  const [series, setSeries] = useState<(number | null)[][]>(() =>
    Array(DICE_SERIES_COUNT)
      .fill(null)
      .map(() => Array(DICE_PER_SERIES).fill(null))
  );

  const [currentSeriesIndex, setCurrentSeriesIndex] = useState(0);
  const [checksums, setChecksums] = useState<string[]>([]);
  const [showInstructions, setShowInstructions] = useState(true);
  const [stars, setStars] = useState<Array<{ x: number; y: number; id: number }>>([]);

  const inputRefs = useRef<(HTMLInputElement | null)[][]>(
    Array(DICE_SERIES_COUNT)
      .fill(null)
      .map(() => Array(DICE_PER_SERIES).fill(null))
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const completedSeries = series.filter((s) =>
    s.every((val) => val !== null && val >= 1 && val <= 6)
  ).length;
  const progress = (completedSeries / DICE_SERIES_COUNT) * 100;

  // Play sound effect (optional)
  const playSound = (type: 'click' | 'complete' | 'success') => {
    // Placeholder for sound effects
    // In production, load actual audio files
    debugLogger.debug(`🔊 Sound: ${type}`);
  };

  // Trigger haptic feedback (if supported)
  const triggerHaptic = (intensity: 'light' | 'medium' | 'heavy' = 'light') => {
    if ('vibrate' in navigator) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30, 10, 30],
      };
      navigator.vibrate(patterns[intensity]);
    }
  };

  const handleDieInput = (seriesIdx: number, dieIdx: number, value: string) => {
    const numValue = parseInt(value, 10);

    if (value && (isNaN(numValue) || numValue < 1 || numValue > 6)) {
      triggerHaptic('light');
      return;
    }

    const newSeries = [...series];
    newSeries[seriesIdx] = [...newSeries[seriesIdx]];
    newSeries[seriesIdx][dieIdx] = value ? numValue : null;
    setSeries(newSeries);

    if (value) {
      playSound('click');
      triggerHaptic('light');

      // Auto-advance
      if (dieIdx < DICE_PER_SERIES - 1) {
        inputRefs.current[seriesIdx][dieIdx + 1]?.focus();
      }
    }
  };

  const handleSeriesComplete = (seriesIdx: number) => {
    const currentSeries = series[seriesIdx];

    if (!currentSeries.every((val) => val !== null && val >= 1 && val <= 6)) {
      return;
    }

    const checksum = calculateSeriesChecksum(currentSeries as number[]);
    const newChecksums = [...checksums];
    newChecksums[seriesIdx] = checksum;
    setChecksums(newChecksums);

    // Add star to constellation
    const newStar = {
      id: seriesIdx,
      x: Math.random() * 100,
      y: Math.random() * 100,
    };
    setStars([...stars, newStar]);

    playSound('complete');
    triggerHaptic('medium');

    // Auto-advance or complete
    if (seriesIdx < DICE_SERIES_COUNT - 1) {
      setCurrentSeriesIndex(seriesIdx + 1);
      setTimeout(() => {
        inputRefs.current[seriesIdx + 1][0]?.focus();
      }, 300);
    } else {
      playSound('success');
      triggerHaptic('heavy');
      setTimeout(() => handleComplete(), 500);
    }
  };

  const handleComplete = () => {
    const allRolls = series.flat().filter((val): val is number => val !== null);

    if (allRolls.length !== 300) {
      return;
    }

    onComplete(allRolls);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    seriesIdx: number,
    dieIdx: number
  ) => {
    if (e.key === 'Backspace' && !e.currentTarget.value && dieIdx > 0) {
      inputRefs.current[seriesIdx][dieIdx - 1]?.focus();
    } else if (e.key === 'Enter') {
      handleSeriesComplete(seriesIdx);
    } else if (e.key >= '1' && e.key <= '6') {
      // Handled by onChange
    } else if (e.key !== 'Tab' && e.key !== 'Shift' && e.key !== 'Delete') {
      e.preventDefault(); // Block non-numeric keys
    }
  };

  // Draw constellation lines on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stars.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw lines between stars
    ctx.strokeStyle = '#d946ef';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.shadowColor = 'rgba(217, 70, 239, 0.4)';

    for (let i = 1; i < stars.length; i++) {
      const from = stars[i - 1];
      const to = stars[i];

      ctx.beginPath();
      ctx.moveTo(from.x * canvas.width / 100, from.y * canvas.height / 100);
      ctx.lineTo(to.x * canvas.width / 100, to.y * canvas.height / 100);
      ctx.stroke();
    }
  }, [stars]);

  useEffect(() => {
    if (showInstructions) {
      setTimeout(() => setShowInstructions(false), 5000);
    }
  }, []);

  return (
    <div className="dark-matter-bg min-h-screen p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0.0, 0.2, 1] }}
        className="max-w-6xl mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.h1
            className="text-4xl font-black mb-3 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
          >
            {t('dicekey_input.title')}
          </motion.h1>
          <p className="text-soft-grey text-lg">
            {t('dicekey_input.subtitle')}
          </p>
        </div>

        {/* Instructions Toast */}
        <AnimatePresence>
          {showInstructions && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass-card mb-6 p-4 border-l-4"
              style={{ borderLeftColor: 'var(--quantum-cyan)' }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-pure-white mb-1">{t('dicekey_input.instructions_title')}</h4>
                  <p className="text-sm text-soft-grey">
                    {t('dicekey_input.instructions_desc')}
                  </p>
                </div>
                <button
                  onClick={() => setShowInstructions(false)}
                  className="text-muted-grey hover:text-pure-white transition-colors"
                >
                  {t('dicekey_input.close')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Dice Input */}
          <div className="lg:col-span-2">
            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--quantum-cyan)' }}>
                  {t('dicekey_input.series_progress', { current: currentSeriesIndex + 1, total: DICE_SERIES_COUNT })}
                </span>
                <span className="text-sm text-soft-grey">
                  {t('dicekey_input.completed', { percent: Math.round(progress) })}
                </span>
              </div>
              <div className="progress-container">
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: [0.4, 0.0, 0.2, 1] }}
                />
              </div>
            </div>

            {/* Dice Grid */}
            <motion.div
              key={currentSeriesIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="glass-card p-8"
            >
              <h3 className="text-xl font-bold mb-6 text-pure-white">
                {t('dicekey_input.roll_dice')}
              </h3>

              <div className="grid grid-cols-5 gap-4 mb-6">
                {Array(DICE_PER_SERIES)
                  .fill(null)
                  .map((_, dieIdx) => {
                    const value = series[currentSeriesIndex][dieIdx];
                    const isFilled = value !== null;

                    return (
                      <motion.div
                        key={dieIdx}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: dieIdx * 0.05 }}
                        className="flex flex-col items-center gap-2"
                      >
                        <label
                          htmlFor={`die-${currentSeriesIndex}-${dieIdx}`}
                          className="text-xs font-medium text-muted-grey"
                        >
                          {t('dicekey_input.die_number', { number: dieIdx + 1 })}
                        </label>
                        <input
                          id={`die-${currentSeriesIndex}-${dieIdx}`}
                          ref={(el) => {
                            if (!inputRefs.current[currentSeriesIndex]) {
                              inputRefs.current[currentSeriesIndex] = [];
                            }
                            inputRefs.current[currentSeriesIndex][dieIdx] = el;
                          }}
                          type="number"
                          min="1"
                          max="6"
                          value={value ?? ''}
                          onChange={(e) =>
                            handleDieInput(currentSeriesIndex, dieIdx, e.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, currentSeriesIndex, dieIdx)}
                          className={`dice-input ${isFilled ? 'filled' : ''}`}
                          autoComplete="off"
                          inputMode="numeric"
                        />
                      </motion.div>
                    );
                  })}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSeriesComplete(currentSeriesIndex)}
                disabled={
                  !series[currentSeriesIndex].every(
                    (val) => val !== null && val >= 1 && val <= 6
                  )
                }
                className="btn btn-primary w-full"
              >
                {currentSeriesIndex < DICE_SERIES_COUNT - 1
                  ? t('dicekey_input.validate_series')
                  : t('dicekey_input.finish_generate')}
              </motion.button>

              {checksums[currentSeriesIndex] && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex items-center justify-between"
                >
                  <span className="text-sm text-soft-grey">{t('dicekey_input.checksum_verification')}</span>
                  <span className="checksum">{checksums[currentSeriesIndex]}</span>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Right Column: Constellation & Progress */}
          <div className="space-y-6">
            {/* Constellation Visualization */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card p-6"
            >
              <h4 className="text-sm font-semibold mb-4 text-quantum-cyan glow-text-cyan">
                {t('dicekey_input.constellation_title')}
              </h4>

              <div className="constellation relative">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={200}
                  className="absolute inset-0 w-full h-full"
                />

                <AnimatePresence>
                  {stars.map((star, _idx) => (
                    <motion.div
                      key={star.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        duration: 0.4,
                        ease: [0.68, -0.55, 0.265, 1.55],
                      }}
                      className="star"
                      style={{
                        left: `${star.x}%`,
                        top: `${star.y}%`,
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>

              <div className="mt-4 text-center">
                <p className="text-xs text-muted-grey">
                  {t('dicekey_input.stars_count', { count: stars.length, total: DICE_SERIES_COUNT })}
                </p>
                <p className="text-xs text-soft-grey mt-1">
                  {t('dicekey_input.stars_hint')}
                </p>
              </div>
            </motion.div>

            {/* Series Progress Dots */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-6"
            >
              <h4 className="text-sm font-semibold mb-4 text-magenta-trust glow-text-magenta">
                {t('dicekey_input.series_progression')}
              </h4>

              <div className="grid grid-cols-6 gap-2">
                {Array(DICE_SERIES_COUNT)
                  .fill(null)
                  .map((_, idx) => {
                    const isComplete = series[idx].every(
                      (val) => val !== null && val >= 1 && val <= 6
                    );
                    const isCurrent = idx === currentSeriesIndex;

                    return (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setCurrentSeriesIndex(idx)}
                        className={`series-dot ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''
                          }`}
                        title={`Série ${idx + 1}${checksums[idx] ? ` (${checksums[idx]})` : ''
                          }`}
                      >
                        {idx + 1}
                      </motion.button>
                    );
                  })}
              </div>
            </motion.div>

            {/* Checksums List */}
            {checksums.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6"
              >
                <h4 className="text-sm font-semibold mb-4 text-pure-white">
                  {t('dicekey_input.checksums_title')}
                </h4>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {checksums.map((checksum, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-soft-grey">Série {idx + 1}:</span>
                      <span className="checksum text-xs">{checksum}</span>
                    </motion.div>
                  ))}
                </div>

                <p className="text-xs text-muted-grey mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                  {t('dicekey_input.checksums_hint')}
                </p>
              </motion.div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {onCancel && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onCancel}
                  className="btn btn-ghost w-full"
                >
                  {t('dicekey_input.cancel')}
                </motion.button>
              )}

              {completedSeries === DICE_SERIES_COUNT && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleComplete}
                  className="btn btn-primary w-full animate-glow-pulse"
                >
                  {t('dicekey_input.generate_keys')}
                </motion.button>
              )}
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 glass-card p-6 border-l-4"
          style={{ borderLeftColor: 'var(--error-glow)' }}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h4 className="font-bold text-pure-white mb-2">
                {t('dicekey_input.security_notice_title')}
              </h4>
              <ul className="text-sm text-soft-grey space-y-1">
                <li>• {t('dicekey_input.security_notice_1')}</li>
                <li>• {t('dicekey_input.security_notice_2')}</li>
                <li>• {t('dicekey_input.security_notice_3')}</li>
                <li>• {t('dicekey_input.security_notice_4')}</li>
              </ul>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <style suppressHydrationWarning>{`
        .text-quantum-cyan {
          color: var(--quantum-cyan);
        }

        .text-magenta-trust {
          color: var(--magenta-trust);
        }

        .text-soft-grey {
          color: var(--soft-grey);
        }

        .text-muted-grey {
          color: var(--muted-grey);
        }

        .text-pure-white {
          color: var(--pure-white);
        }
      `}</style>
    </div>
  );
}
