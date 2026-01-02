import { useMemo, useState } from 'react';
import type { ResonanceSnapshot } from '../../core/resonance/ResonanceCore';
import { computeAnchoringLevel, computeRhoMaxStake, getAnchoringStatus } from '../../core/resonance/AnchoringEngine';

export interface StakingPanelProps {
  snapshot: ResonanceSnapshot;
  onStake: (amount: number) => void;
  onRequestUnstake: (amount: number) => void;
  onClose?: () => void;
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function formatAether(v: number): string {
  return `${Math.floor(v)}`;
}

export default function StakingPanel({ snapshot, onStake, onRequestUnstake, onClose }: StakingPanelProps) {
  const available = snapshot.aether.available;
  const staked = snapshot.aether.staked;

  const status = getAnchoringStatus(staked);
  const isUnanchored = staked <= 0;

  const rhoMax = useMemo(() => computeRhoMaxStake(staked), [staked]);
  const level = useMemo(() => computeAnchoringLevel(staked), [staked]);

  const [stakeAmount, setStakeAmount] = useState(0);
  const [unstakeAmount, setUnstakeAmount] = useState(0);

  const stakePreviewCap = useMemo(() => computeRhoMaxStake(staked + stakeAmount), [staked, stakeAmount]);

  const canStake = stakeAmount > 0 && available > 0;
  const canUnstake = unstakeAmount > 0 && staked > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-100">Ancrage Réseau</h2>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={
              status === 'ANCRE'
                ? 'px-2 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/30'
                : 'px-2 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30'
            }
          >
            {status === 'ANCRE' ? `État Ancré (Niveau ${level})` : 'État Sauvage'}
          </span>
          <span className="text-slate-400">Cap de Résonance : {formatPercent(rhoMax)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/30">
            <div className="text-slate-400">Disponible</div>
            <div className="text-slate-100 font-semibold">{formatAether(available)} Aether</div>
          </div>
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/30">
            <div className="text-slate-400">Stake</div>
            <div className="text-slate-100 font-semibold">{formatAether(staked)} Aether</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-100">Ajouter du Stake</div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={Math.max(0, Math.floor(available))}
            step={1}
            value={stakeAmount}
            onChange={(e) => setStakeAmount(Math.floor(Number(e.target.value) || 0))}
            className="w-full"
          />

          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Montant : {formatAether(stakeAmount)} Aether</span>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors"
              onClick={() => setStakeAmount(Math.min(Math.floor(available), 100))}
              disabled={available <= 0}
            >
              +100
            </button>
          </div>

          <div className="text-xs text-slate-400">
            Si vous stakez {formatAether(stakeAmount)} Aether : cap passe à {formatPercent(stakePreviewCap)}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost px-3 py-2 text-xs"
            onClick={() => {
              setStakeAmount(0);
              onClose?.();
            }}
          >
            Fermer
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2 text-xs"
            disabled={!canStake}
            onClick={() => {
              onStake(stakeAmount);
              setStakeAmount(0);
            }}
          >
            Ancrer
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-100">Retrait (Unstake)</div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={Math.max(0, Math.floor(staked))}
            step={1}
            value={unstakeAmount}
            onChange={(e) => setUnstakeAmount(Math.floor(Number(e.target.value) || 0))}
            className="w-full"
          />

          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Montant : {formatAether(unstakeAmount)} Aether</span>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors"
              onClick={() => setUnstakeAmount(Math.min(Math.floor(staked), 100))}
              disabled={staked <= 0}
            >
              100
            </button>
          </div>

          <div className="text-xs text-slate-400">
            Retrait = perte immédiate du statut Ancré et du cap élevé. Déblocage sous 7 jours.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost px-3 py-2 text-xs"
            onClick={() => setUnstakeAmount(0)}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2 text-xs"
            disabled={!canUnstake}
            onClick={() => {
              onRequestUnstake(unstakeAmount);
              setUnstakeAmount(0);
            }}
          >
            Demander le retrait
          </button>
        </div>
      </div>

      <div
        className={
          isUnanchored
            ? 'p-3 rounded-xl bg-red-900/20 border border-red-700/50 text-xs text-red-100'
            : 'p-3 rounded-xl bg-slate-900/30 border border-slate-800 text-xs text-slate-200'
        }
      >
        {isUnanchored ? (
          <div>En mode Sauvage, tout soupçon de bot entraînera un blocage de 30 minutes. Stakez pour protéger votre identité.</div>
        ) : (
          <div>Slashing activé : 10% du Stake sera brûlé en cas de faute. Retrait = perte immédiate de la protection Ancrée.</div>
        )}
      </div>
    </div>
  );
}
