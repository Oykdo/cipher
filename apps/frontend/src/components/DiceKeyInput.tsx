/**
 * DiceKey Input Component
 * 
 * User interface for entering 30 series of 10 dice rolls
 * 
 * Features:
 * - Real-time validation (1-6 only)
 * - Progress indicator
 * - Series checksums for verification
 * - Keyboard-friendly navigation
 * - Error prevention
 */

import { useState, useRef, useEffect } from 'react';
import {
  DICE_SERIES_COUNT,
  DICE_PER_SERIES,
  calculateSeriesChecksum,
  validateSeries as _validateSeries,
} from '../lib/diceKey';

interface DiceKeyInputProps {
  onComplete: (rolls: number[]) => void;
  onCancel?: () => void;
}

export default function DiceKeyInput({ onComplete, onCancel }: DiceKeyInputProps) {
  // State: Array of 30 series, each containing 10 values
  const [series, setSeries] = useState<(number | null)[][]>(() =>
    Array(DICE_SERIES_COUNT)
      .fill(null)
      .map(() => Array(DICE_PER_SERIES).fill(null))
  );

  const [currentSeriesIndex, setCurrentSeriesIndex] = useState(0);
  const [checksums, setChecksums] = useState<string[]>([]);
  const [showChecksums, setShowChecksums] = useState(false);

  // Refs for input fields
  const inputRefs = useRef<(HTMLInputElement | null)[][]>(
    Array(DICE_SERIES_COUNT)
      .fill(null)
      .map(() => Array(DICE_PER_SERIES).fill(null))
  );

  // Calculate progress
  const completedSeries = series.filter((s) =>
    s.every((val) => val !== null && val >= 1 && val <= 6)
  ).length;
  const progress = (completedSeries / DICE_SERIES_COUNT) * 100;

  // Handle input change for a specific die
  const handleDieInput = (seriesIdx: number, dieIdx: number, value: string) => {
    const numValue = parseInt(value, 10);

    // Validate: only 1-6 allowed
    if (value && (isNaN(numValue) || numValue < 1 || numValue > 6)) {
      return; // Ignore invalid input
    }

    // Update state
    const newSeries = [...series];
    newSeries[seriesIdx] = [...newSeries[seriesIdx]];
    newSeries[seriesIdx][dieIdx] = value ? numValue : null;
    setSeries(newSeries);

    // Auto-advance to next field
    if (value && dieIdx < DICE_PER_SERIES - 1) {
      inputRefs.current[seriesIdx][dieIdx + 1]?.focus();
    }
  };

  // Handle series validation and progression
  const handleSeriesComplete = (seriesIdx: number) => {
    const currentSeries = series[seriesIdx];

    // Check if series is complete
    if (!currentSeries.every((val) => val !== null && val >= 1 && val <= 6)) {
      return;
    }

    // Calculate checksum
    const checksum = calculateSeriesChecksum(currentSeries as number[]);
    const newChecksums = [...checksums];
    newChecksums[seriesIdx] = checksum;
    setChecksums(newChecksums);

    // Auto-advance to next series
    if (seriesIdx < DICE_SERIES_COUNT - 1) {
      setCurrentSeriesIndex(seriesIdx + 1);
      setTimeout(() => {
        inputRefs.current[seriesIdx + 1][0]?.focus();
      }, 100);
    } else {
      // All series complete
      handleComplete();
    }
  };

  // Flatten series and call onComplete
  const handleComplete = () => {
    const allRolls = series.flat().filter((val): val is number => val !== null);

    if (allRolls.length !== 300) {
      alert('Veuillez compléter les 30 séries de 10 dés.');
      return;
    }

    onComplete(allRolls);
  };

  // Keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    seriesIdx: number,
    dieIdx: number
  ) => {
    if (e.key === 'Backspace' && !e.currentTarget.value && dieIdx > 0) {
      // Go to previous field on backspace if current is empty
      inputRefs.current[seriesIdx][dieIdx - 1]?.focus();
    } else if (e.key === 'Enter') {
      // Check if series is complete
      handleSeriesComplete(seriesIdx);
    }
  };

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0][0]?.focus();
  }, []);

  return (
    <div className="dice-key-input">
      {/* Header */}
      <div className="header">
        <h2>🎲 Création de Compte DiceKey</h2>
        <p className="subtitle">
          Lancez 10 dés physiques et saisissez les valeurs. Répétez 30 fois.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="progress-container">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <span className="progress-text">
          Série {completedSeries + 1} / {DICE_SERIES_COUNT} ({Math.round(progress)}%)
        </span>
      </div>

      {/* Current Series Input */}
      <div className="series-container">
        <h3>
          Série {currentSeriesIndex + 1} / {DICE_SERIES_COUNT}
        </h3>

        <div className="dice-grid">
          {Array(DICE_PER_SERIES)
            .fill(null)
            .map((_, dieIdx) => (
              <div key={dieIdx} className="die-input-container">
                <label htmlFor={`die-${currentSeriesIndex}-${dieIdx}`}>
                  Dé {dieIdx + 1}
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
                  value={series[currentSeriesIndex][dieIdx] ?? ''}
                  onChange={(e) =>
                    handleDieInput(currentSeriesIndex, dieIdx, e.target.value)
                  }
                  onKeyDown={(e) => handleKeyDown(e, currentSeriesIndex, dieIdx)}
                  className="die-input"
                  autoComplete="off"
                  inputMode="numeric"
                />
              </div>
            ))}
        </div>

        <button
          onClick={() => handleSeriesComplete(currentSeriesIndex)}
          disabled={
            !series[currentSeriesIndex].every((val) => val !== null && val >= 1 && val <= 6)
          }
          className="btn-next-series"
        >
          {currentSeriesIndex < DICE_SERIES_COUNT - 1
            ? 'Valider cette série →'
            : 'Terminer la saisie ✓'}
        </button>
      </div>

      {/* Checksums Display */}
      {checksums.length > 0 && (
        <div className="checksums-container">
          <button
            onClick={() => setShowChecksums(!showChecksums)}
            className="btn-toggle-checksums"
          >
            {showChecksums ? '▼' : '▶'} Checksums de vérification (
            {checksums.length})
          </button>

          {showChecksums && (
            <div className="checksums-grid">
              {checksums.map((checksum, idx) => (
                <div key={idx} className="checksum-item">
                  <span className="checksum-label">Série {idx + 1}:</span>
                  <span className="checksum-value">{checksum}</span>
                </div>
              ))}
            </div>
          )}

          <p className="checksums-hint">
            💡 <strong>Important :</strong> Notez ces checksums sur papier avec vos
            lancers de dés. Ils vous permettront de vérifier chaque série en cas de
            doute.
          </p>
        </div>
      )}

      {/* Navigation History */}
      <div className="series-history">
        <h4>Progression</h4>
        <div className="series-dots">
          {Array(DICE_SERIES_COUNT)
            .fill(null)
            .map((_, idx) => {
              const isComplete = series[idx].every(
                (val) => val !== null && val >= 1 && val <= 6
              );
              const isCurrent = idx === currentSeriesIndex;

              return (
                <button
                  key={idx}
                  onClick={() => setCurrentSeriesIndex(idx)}
                  className={`series-dot ${isComplete ? 'complete' : ''} ${
                    isCurrent ? 'current' : ''
                  }`}
                  title={`Série ${idx + 1}${
                    checksums[idx] ? ` (checksum: ${checksums[idx]})` : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
        </div>
      </div>

      {/* Actions */}
      <div className="actions">
        {onCancel && (
          <button onClick={onCancel} className="btn-cancel">
            Annuler
          </button>
        )}

        <button
          onClick={handleComplete}
          disabled={completedSeries !== DICE_SERIES_COUNT}
          className="btn-complete"
        >
          Générer les clés ({completedSeries}/{DICE_SERIES_COUNT})
        </button>
      </div>

      {/* Instructions */}
      <div className="instructions">
        <details>
          <summary>❓ Comment utiliser</summary>
          <ol>
            <li>Préparez 10 dés physiques à 6 faces</li>
            <li>Lancez-les et saisissez les valeurs (1 à 6)</li>
            <li>Cliquez sur "Valider cette série" ou appuyez sur Entrée</li>
            <li>
              Notez le <strong>checksum</strong> affiché avec vos lancers sur papier
            </li>
            <li>Répétez le processus 30 fois</li>
            <li>
              Conservez votre feuille de lancers en lieu sûr - c'est la CLÉ de votre
              compte
            </li>
          </ol>

          <p className="warning">
            ⚠️ <strong>ATTENTION :</strong> Sans vos 300 lancers de dés, vous ne
            pourrez JAMAIS récupérer votre compte. Cette séquence est votre identité
            cryptographique.
          </p>
        </details>
      </div>

      <style suppressHydrationWarning>{`
        .dice-key-input {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .header h2 {
          font-size: 1.8rem;
          margin-bottom: 0.5rem;
        }

        .subtitle {
          color: #666;
          font-size: 0.95rem;
        }

        .progress-container {
          margin-bottom: 2rem;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4caf50, #8bc34a);
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 0.9rem;
          color: #666;
        }

        .series-container {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .series-container h3 {
          margin-bottom: 1rem;
          color: #333;
        }

        .dice-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .die-input-container {
          display: flex;
          flex-direction: column;
        }

        .die-input-container label {
          font-size: 0.85rem;
          color: #666;
          margin-bottom: 0.25rem;
        }

        .die-input {
          padding: 0.75rem;
          font-size: 1.5rem;
          text-align: center;
          border: 2px solid #ddd;
          border-radius: 4px;
          width: 100%;
          transition: all 0.2s;
        }

        .die-input:focus {
          outline: none;
          border-color: #4caf50;
          box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
        }

        .die-input:invalid {
          border-color: #f44336;
        }

        .btn-next-series {
          width: 100%;
          padding: 1rem;
          font-size: 1rem;
          font-weight: 600;
          background: #4caf50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-next-series:hover:not(:disabled) {
          background: #45a049;
        }

        .btn-next-series:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .checksums-container {
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          padding: 1rem;
          margin-bottom: 2rem;
        }

        .btn-toggle-checksums {
          background: none;
          border: none;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          margin-bottom: 0.5rem;
        }

        .checksums-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 0.5rem;
          margin: 1rem 0;
        }

        .checksum-item {
          font-family: 'Courier New', monospace;
          font-size: 0.9rem;
        }

        .checksum-label {
          color: #666;
          margin-right: 0.5rem;
        }

        .checksum-value {
          font-weight: bold;
          color: #333;
        }

        .checksums-hint {
          font-size: 0.9rem;
          color: #856404;
          margin-top: 1rem;
          margin-bottom: 0;
        }

        .series-history {
          margin-bottom: 2rem;
        }

        .series-history h4 {
          font-size: 0.9rem;
          color: #666;
          margin-bottom: 0.5rem;
        }

        .series-dots {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .series-dot {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid #ddd;
          background: white;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .series-dot.complete {
          background: #4caf50;
          color: white;
          border-color: #4caf50;
        }

        .series-dot.current {
          border-color: #2196f3;
          box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.2);
        }

        .series-dot:hover {
          transform: scale(1.1);
        }

        .actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        }

        .btn-cancel {
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          background: #f44336;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-complete {
          padding: 0.75rem 2rem;
          font-size: 1rem;
          font-weight: 600;
          background: #2196f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-complete:hover:not(:disabled) {
          background: #1976d2;
        }

        .btn-complete:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .instructions {
          margin-top: 2rem;
          font-size: 0.9rem;
        }

        .instructions summary {
          cursor: pointer;
          font-weight: 600;
          padding: 0.5rem;
          background: #f5f5f5;
          border-radius: 4px;
        }

        .instructions ol {
          margin-top: 1rem;
          padding-left: 1.5rem;
        }

        .instructions li {
          margin-bottom: 0.5rem;
        }

        .warning {
          background: #ffebee;
          border-left: 4px solid #f44336;
          padding: 1rem;
          margin-top: 1rem;
          color: #b71c1c;
        }

        @media (max-width: 768px) {
          .dice-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .checksums-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
