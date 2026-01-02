export type AnchoringStatus = 'SAUVAGE' | 'ANCRE';

export interface AnchoringConfig {
  baseCap: number;
  additionalCap: number;
  stakeTarget: number;
  wildLockoutMs: number;
  slashFraction: number;
}

export const DEFAULT_ANCHORING_CONFIG: AnchoringConfig = {
  baseCap: 0.35,
  additionalCap: 0.65,
  stakeTarget: 1000,
  wildLockoutMs: 30 * 60 * 1000,
  slashFraction: 0.1,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function getAnchoringStatus(stakedAmount: number): AnchoringStatus {
  return stakedAmount > 0 ? 'ANCRE' : 'SAUVAGE';
}

export function computeRhoMaxStake(
  stakedAmount: number,
  config: Partial<AnchoringConfig> = {},
): number {
  const cfg = { ...DEFAULT_ANCHORING_CONFIG, ...config };
  if (stakedAmount <= 0) return cfg.baseCap;
  const ratio = cfg.stakeTarget > 0 ? stakedAmount / cfg.stakeTarget : 0;
  return clamp01(cfg.baseCap + cfg.additionalCap * ratio);
}

export function applyStakeHardcap(
  rhoCalculated: number,
  stakedAmount: number,
  config: Partial<AnchoringConfig> = {},
): number {
  const cap = computeRhoMaxStake(stakedAmount, config);
  return Math.min(rhoCalculated, cap);
}

export function computeAnchoringLevel(
  stakedAmount: number,
  config: Partial<AnchoringConfig> = {},
): number {
  const cfg = { ...DEFAULT_ANCHORING_CONFIG, ...config };
  if (stakedAmount <= 0) return 0;
  const ratio = cfg.stakeTarget > 0 ? Math.min(1, stakedAmount / cfg.stakeTarget) : 0;
  return Math.max(1, Math.ceil(ratio * 5));
}

export interface AnchoringPenaltyDecision {
  rhoAfter: number;
  lockedUntil: number | null;
  stakedAfter: number;
  slashedAmount: number;
}

export function applyAnchoringPenalty(args: {
  now: number;
  rhoBefore: number;
  stakedAmount: number;
  config?: Partial<AnchoringConfig>;
}): AnchoringPenaltyDecision {
  const cfg = { ...DEFAULT_ANCHORING_CONFIG, ...(args.config ?? {}) };

  if (args.stakedAmount <= 0) {
    return {
      rhoAfter: 0,
      lockedUntil: args.now + cfg.wildLockoutMs,
      stakedAfter: 0,
      slashedAmount: 0,
    };
  }

  const slashedAmount = Math.max(0, Math.floor(args.stakedAmount * cfg.slashFraction));
  const stakedAfter = Math.max(0, args.stakedAmount - slashedAmount);

  return {
    rhoAfter: 0,
    lockedUntil: null,
    stakedAfter,
    slashedAmount,
  };
}
