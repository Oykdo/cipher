import VaultResonanceOrb from './VaultResonanceOrb';
import '../styles/fluidCrypto.css';

export interface VaultMetrics {
  resonance: number;
  entropy: number;
  rosettaBonus?: boolean;
  dailyYield?: number;
}

interface VaultResonanceWidgetProps {
  metrics: VaultMetrics;
  /** Compact mode for header placement */
  compact?: boolean;
}

function resonanceLabel(value: number): string {
  if (value >= 80) return 'Radiant';
  if (value >= 60) return 'Active';
  if (value >= 40) return 'Steady';
  if (value >= 20) return 'Fading';
  return 'Dormant';
}

function entropyLabel(value: number): string {
  if (value <= 10) return 'Clear';
  if (value <= 30) return 'Calm';
  if (value <= 60) return 'Cloudy';
  return 'Stormy';
}

function valueClass(resonance: number): string {
  if (resonance >= 60) return 'vault-resonance-widget__value vault-resonance-widget__value--high';
  if (resonance >= 30) return 'vault-resonance-widget__value vault-resonance-widget__value--mid';
  return 'vault-resonance-widget__value vault-resonance-widget__value--low';
}

export default function VaultResonanceWidget({
  metrics,
  compact = true,
}: VaultResonanceWidgetProps) {
  const { resonance, entropy, rosettaBonus, dailyYield } = metrics;
  const orbSize = compact ? 36 : 64;

  return (
    <div className="vault-resonance-widget" title="Your vault's energy level">
      <VaultResonanceOrb
        resonance={resonance}
        entropy={entropy}
        rosettaBonus={rosettaBonus}
        size={orbSize}
      />

      <div className="vault-resonance-widget__metrics">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={valueClass(resonance)}>
            {Math.round(resonance)}
          </span>
          <span className="vault-resonance-widget__label">
            {resonanceLabel(resonance)}
          </span>
        </div>

        {!compact && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              className="vault-resonance-widget__value"
              style={{ color: entropy > 50 ? 'var(--error-glow)' : 'var(--muted-grey)' }}
            >
              {Math.round(entropy)}
            </span>
            <span className="vault-resonance-widget__label">
              Aura {entropyLabel(entropy)}
            </span>
          </div>
        )}

        {rosettaBonus && (
          <span className="vault-resonance-widget__rosetta">
            Rosetta Boost
          </span>
        )}
      </div>

      {!compact && dailyYield != null && (
        <div style={{
          marginLeft: 'auto',
          textAlign: 'right',
          minWidth: 0,
        }}>
          <div className="vault-resonance-widget__label">Daily reward</div>
          <div className={valueClass(resonance)}>
            {dailyYield.toFixed(1)} EIDOLON
          </div>
        </div>
      )}
    </div>
  );
}
