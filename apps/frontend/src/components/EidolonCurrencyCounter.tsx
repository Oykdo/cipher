import type { VaultMetrics } from '../hooks/useVaultMetrics';

interface EidolonCurrencyCounterProps {
  /**
   * Métriques déjà interrogées par l'écran hôte. useVaultMetrics interroge
   * le bridge toutes les 30 s : une seconde instance ici doublerait ce trafic
   * pour afficher les mêmes nombres.
   */
  metrics: Pick<VaultMetrics, 'eidolonBalance' | 'resonance'>;
}

const BALANCE_FORMAT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Solde EIDOLON du vault lié, pour l'en-tête de Conversations.
 *
 * Le solde vient du registre Eidolon via GET /api/v2/vault/economy sur le
 * bridge, comme l'orbe de résonance à côté. Le point vert n'apparaît qu'au
 * seuil « High » de l'orbe, pour dire la même chose que lui.
 */
export default function EidolonCurrencyCounter({ metrics }: EidolonCurrencyCounterProps) {
  const balance = BALANCE_FORMAT.format(metrics.eidolonBalance);

  return (
    <div
      className="eidolon-currency-counter"
      title="Solde EIDOLON du vault lié"
      aria-label={`Solde EIDOLON ${balance}`}
    >
      <span className="eidolon-currency-counter__icon" aria-hidden="true">
        E
      </span>
      <span className="eidolon-currency-counter__value">{balance}</span>
      {metrics.resonance >= 60 && (
        <span className="eidolon-currency-counter__status" title="Vault actif" />
      )}
    </div>
  );
}
