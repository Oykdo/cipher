import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Apple-style 6-digit numeric keypad.
 *
 * - 6 dots at the top fill as digits are entered.
 * - Digit buttons 1-9 on a 3x3 grid, then a blank, 0, and backspace.
 * - `onComplete(pin)` fires once the 6th digit is entered.
 * - `onInput` fires on every change so the overlay can clear an error label.
 * - Controlled by the parent via `value` so the parent can wipe on reject.
 */
export function PinKeypad({
  value,
  onChange,
  onComplete,
  disabled,
  errorShake,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  errorShake?: number; // bump to trigger shake animation
}) {
  const shakeRef = useRef(errorShake ?? 0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (value.length !== 6) {
      completedRef.current = false;
      return;
    }
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(value);
  }, [value, onComplete]);

  useEffect(() => {
    if (errorShake !== undefined) shakeRef.current = errorShake;
  }, [errorShake]);

  useEffect(() => {
    if (disabled) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key >= '0' && ev.key <= '9') {
        ev.preventDefault();
        if (value.length >= 6) return;
        onChange(value + ev.key);
      } else if (ev.key === 'Backspace') {
        ev.preventDefault();
        onChange(value.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [value, onChange, disabled]);

  const press = (digit: string) => {
    if (disabled) return;
    if (value.length >= 6) return;
    onChange(value + digit);
  };

  const backspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
      <motion.div
        key={`dots-${errorShake ?? 0}`}
        animate={errorShake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
        style={{ display: 'flex', gap: 16 }}
      >
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < value.length;
          return (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '1.5px solid rgba(255,255,255,0.55)',
                background: filled ? '#f6ecd0' : 'transparent',
                boxShadow: filled ? '0 0 10px rgba(246,236,208,0.55)' : 'none',
                transition: 'background 140ms ease, box-shadow 140ms ease',
              }}
            />
          );
        })}
      </motion.div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          width: 260,
        }}
      >
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((key, i) => {
          if (!key) return <div key={`empty-${i}`} />;
          if (key === 'back') {
            return (
              <button
                key="back"
                type="button"
                onClick={backspace}
                disabled={disabled || value.length === 0}
                style={buttonStyle(disabled)}
                aria-label="backspace"
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              disabled={disabled}
              style={buttonStyle(disabled)}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buttonStyle(disabled?: boolean): React.CSSProperties {
  return {
    height: 64,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.05)',
    color: '#eef1ff',
    fontSize: 26,
    fontWeight: 300,
    letterSpacing: 0.5,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontFamily: 'inherit',
    transition: 'background 120ms ease, transform 80ms ease',
  };
}
