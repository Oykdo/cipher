/**
 * Burn Delay Selector Component
 * 
 * Allows users to select burn-after-reading delay
 */

import { motion } from 'framer-motion';

export interface BurnDelayOption {
  label: string;
  value: number; // seconds
  description?: string;
}

export const BURN_DELAY_PRESETS: BurnDelayOption[] = [
  { label: '10s', value: 10, description: 'Lecture rapide' },
  { label: '30s', value: 30, description: 'Par défaut' },
  { label: '1min', value: 60, description: 'Lecture normale' },
  { label: '5min', value: 300, description: 'Lecture approfondie' },
  { label: '15min', value: 900, description: 'Discussion longue' },
  { label: '1h', value: 3600, description: 'Très longue durée' },
  { label: '24h', value: 86400, description: 'Un jour' },
  { label: '7j', value: 604800, description: 'Une semaine' },
];

interface BurnDelaySelectorProps {
  value: number;
  onChange: (value: number) => void;
  presets?: BurnDelayOption[];
  showDescription?: boolean;
}

export function BurnDelaySelector({
  value,
  onChange,
  presets = BURN_DELAY_PRESETS,
  showDescription = true,
}: BurnDelaySelectorProps) {
  const formatDelay = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} heure${hours > 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(seconds / 86400);
      return `${days} jour${days > 1 ? 's' : ''}`;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="p-3 bg-error-glow/10 rounded-lg border border-error-glow/30"
    >
      <p className="text-xs text-error-glow mb-2 font-semibold">
        🔥 Délai avant destruction
      </p>

      {/* Preset Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {presets.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`
              text-xs px-3 py-2 rounded-lg border transition-all
              ${value === option.value
                ? 'bg-error-glow/30 border-error-glow text-error-glow font-semibold scale-105'
                : 'border-error-glow/30 text-error-glow/70 hover:bg-error-glow/20 hover:scale-105'
              }
            `}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Custom Input */}
      <div className="flex items-center gap-2 mb-2">
        <input
          type="number"
          min="5"
          max="604800"
          value={value}
          onChange={(e) => onChange(Math.max(5, parseInt(e.target.value) || 30))}
          className="input flex-1 text-sm"
          placeholder="Délai personnalisé (secondes)"
        />
        <span className="text-xs text-error-glow/70">secondes</span>
      </div>

      {/* Description */}
      {showDescription && (
        <div className="p-2 bg-error-glow/5 rounded border border-error-glow/20">
          <p className="text-xs text-error-glow/70">
            ⏱️ Le message sera détruit <span className="font-semibold">{formatDelay(value)}</span> après lecture par le destinataire
          </p>
        </div>
      )}

      {/* Warning for very short delays */}
      {value < 30 && (
        <div className="mt-2 p-2 bg-yellow-500/10 rounded border border-yellow-500/30">
          <p className="text-xs text-yellow-400">
            ⚠️ Délai très court - Le destinataire aura peu de temps pour lire
          </p>
        </div>
      )}
    </motion.div>
  );
}
