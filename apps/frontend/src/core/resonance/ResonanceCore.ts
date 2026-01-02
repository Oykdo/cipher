import { applyAnchoringPenalty, applyStakeHardcap } from './AnchoringEngine';
import { proveRhythm, generateProofOfState, type ZKRhythmProof } from './ZKProver';
import {
  type ResonanceEvent,
  createEvent,
  verifyChainIntegrity,
  computeStateFromHistory
} from './ResonanceLedger';
import { calculateVoteWeight, calculateSocialSplit } from '../../services/SocialEcho';

export type ResonanceErrorCode =
  | 'LOCKED'
  | 'EMPTY_MESSAGE'
  | 'COGNITIVE_MISMATCH'
  | 'RATE_LIMITED'
  | 'INTEGRITY_FAILURE';

export interface ResonanceValidationError {
  code: ResonanceErrorCode;
  message: string;
  /** Optional absolute time (ms since epoch) when the user can retry. */
  retryAt?: number;
}

export interface AetherVestingEntry {
  amount: number;
  unlockAt: number; // ms since epoch
}

export interface AetherLedgerState {
  available: number;
  vesting: AetherVestingEntry[];
  /** Reserved for “soulbound stake” (not fully implemented in prototype). */
  staked: number;
}

export interface ResonancePersistedState {
  // rho is now DERIVED, but we keep a cached version for performance/snapshots
  // DO NOT MUTATE DIRECTLY without adding an event.
  cachedRho: number;
  history: ResonanceEvent[]; // THE TRUTH

  lastMessageAt: number | null;
  lockedUntil: number | null;
  aether: AetherLedgerState;
  /** Local, client-side peer reputation estimates (Web-of-Trust seed). */
  peerRho: Record<string, number>;
  /**
  /**
   * Per-peer cursor so we can apply peer-trust updates idempotently when replaying history.
   * Keyed by peerId (senderId). Value is the latest observed message `createdAt` (ms since epoch).
   */
  peerLastSeenAt: Record<string, number>;

  /**
   * Anti-Replay: Track signatures of processed lovebombs to prevent double-spending/vesting.
   */
  processedLovebombSignatures: string[];

  /**
   * Anti-Double-Vote: Track "messageId:senderId" keys to ensure one vote per user per message.
   */
  processedLovebombKeys?: string[];
}

export interface ResonanceSnapshot {
  rho: number;
  baselineRho: number;
  lockedUntil: number | null;
  aether: {
    available: number;
    vested: number;
    staked: number;
    vesting: AetherVestingEntry[];
  };
  peerRho: Record<string, number>;
  historyLength: number; // For debug/verification
}

export interface KeystrokeStats {
  n: number;
  meanMs: number;
  varianceMs2: number;
  stdDevMs: number;
  cv: number; // coefficient of variation
}

export interface SendAttemptContext {
  now: number;
  text: string;
  /** Peer identifier used for local Web-of-Trust gating. */
  peerId?: string;
  /** If true, skips entropy-based checks (attachments-only send, etc.). */
  allowLowEntropy?: boolean;
}

export interface SendAttemptResult {
  ok: boolean;
  error?: ResonanceValidationError;
  proof?: ZKRhythmProof;
  metrics?: {
    entropyScore: number;
    timeSinceLastMessageMs: number | null;
    keystrokes: KeystrokeStats;
  };
}

export interface SendCommittedResult {
  rhoBefore: number;
  rhoAfter: number;
  mintedAether: number;
  vestingEntry?: AetherVestingEntry;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) * (v - m);
  return sum / (values.length - 1);
}

function computeKeystrokeStats(intervalsMs: number[]): KeystrokeStats {
  const n = intervalsMs.length;
  const meanMs = mean(intervalsMs);
  const varianceMs2 = variance(intervalsMs, meanMs);
  const stdDevMs = Math.sqrt(varianceMs2);
  const cv = meanMs > 0 ? stdDevMs / meanMs : 0;
  return { n, meanMs, varianceMs2, stdDevMs, cv };
}

/**
 * Message “entropy” heuristic: Shannon entropy normalized by alphabet size *and* scaled by length.
 * Returns [0..1].
 */
export function estimateMessageEntropyScore(text: string): number {
  const raw = (text ?? '').trim();
  if (!raw) return 0;

  // Ignore whitespace to reduce inflation via spaces/newlines.
  const chars = Array.from(raw).filter((c) => !/\s/.test(c));
  if (!chars.length) return 0;

  const counts = new Map<string, number>();
  for (const c of chars) counts.set(c, (counts.get(c) ?? 0) + 1);

  const total = chars.length;
  const unique = counts.size;
  if (unique <= 1) return Math.min(1, total / 64) * 0.05;

  let h = 0;
  for (const count of counts.values()) {
    const p = count / total;
    h += -p * Math.log2(p);
  }

  const maxH = Math.log2(unique);
  const normalized = maxH > 0 ? h / maxH : 0;

  // Length scaling: short messages shouldn’t yield “high complexity” even if diverse.
  const lengthFactor = Math.min(1, total / 80);

  return clamp01(normalized * lengthFactor);
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function gaussian(x: number, mu: number, sigma: number): number {
  const s = Math.max(1e-6, sigma);
  const z = (x - mu) / s;
  return Math.exp(-0.5 * z * z);
}

export class ResonanceCore {
  private state: ResonancePersistedState;

  // Ephemeral (not persisted): input rhythm for the current compose session.
  private lastKeystrokeAt: number | null = null;
  private composerIntervalsMs: number[] = [];

  // Ephemeral anti-spam window (persisting this adds little value; keep local).
  private recentOutgoingAt: number[] = [];

  // Mutex to prevent race conditions (Infinite Minting)
  private isProcessing = false;

  // Tunable constants (prototype)
  private readonly baselineRho = 0.1;
  private readonly minPeerRho = 0.1;

  // Cognitive PoW thresholds
  private readonly minIntervalsForCognitiveCheck = 8;
  private readonly minStdDevMs = 6; // stddev below this is suspiciously “robotic”
  private readonly minCv = 0.04; // very low cv => highly regular timing

  // Spam thresholds (matches the user story: 50 messages / 10 seconds)
  private readonly spamWindowMs = 10_000;
  private readonly spamMaxCount = 50;

  // Oscillator dynamics
  // Target cadence: “natural interaction frequency” (we model as a preferred message interval).
  private readonly targetIntervalMs = 12_000;
  private readonly rhythmSigmaMs = 7_000;
  private readonly dampingHalfLifeMs = 6 * 60 * 60 * 1000; // decay toward baseline over ~6h

  // Tokenomics (prototype)
  private readonly maxAetherPerEvent = 15;
  private readonly baseUnlockMs = 24 * 60 * 60 * 1000;
  private readonly minRhoForUnlock = 0.1;

  constructor(initial?: Partial<ResonancePersistedState>) {
    // Initialize state from HISTORY if available (Security Fix: State Forgery)
    const history = Array.isArray(initial?.history) ? initial!.history : [];

    // Replay ledger to get the true state
    const reconstructed = computeStateFromHistory(history, this.baselineRho);

    this.state = {
      cachedRho: reconstructed.rho, // Trust the ledger, not the cache
      history: history,
      lastMessageAt: initial?.lastMessageAt ?? null,
      lockedUntil: initial?.lockedUntil ?? null,
      aether: {
        available: reconstructed.aether.available,
        vesting: reconstructed.aether.vesting,
        staked: reconstructed.aether.staked,
      },
      peerRho: initial?.peerRho ?? {},
      peerLastSeenAt: initial?.peerLastSeenAt ?? {},
      processedLovebombSignatures: reconstructed.processedLovebombSignatures,
      processedLovebombKeys: initial?.processedLovebombKeys ?? []
    };

    // Initialize Genesis if empty
    if (this.state.history.length === 0) {
      // Async in constructor is tricky, but for prototype we'll assume fast operations or let it happen
      // We can't await here. For now, we skip explicit genesis event in constructor or assume creating it later.
      // Or we can just start empty.
    }

    // Integrity check on load (sanity check)
    // verifyChainIntegrity(this.state.history).then(valid => { ... });

    // Normalize vesting entries
    this.state.aether.vesting = (this.state.aether.vesting || [])
      .filter((e) => e && typeof e.amount === 'number' && typeof e.unlockAt === 'number')
      .map((e) => ({ amount: Math.max(0, e.amount), unlockAt: e.unlockAt }))
      .filter((e) => e.amount > 0 && Number.isFinite(e.unlockAt));

    // Sanitize peer maps
    this.state.peerRho = { ...(this.state.peerRho ?? {}) };
    this.state.peerLastSeenAt = Object.fromEntries(
      Object.entries(this.state.peerLastSeenAt ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0),
    );

    this.applyStakeHardcap();
  }

  // Get true Rho from state (use cached for performance, but know it derives from history)
  get rho(): number {
    return this.state.cachedRho;
  }

  private getLastHash(): string {
    const len = this.state.history.length;
    return len > 0 ? this.state.history[len - 1].id : 'genesis';
  }

  private async appendEvent(type: any, payload: any, now: number): Promise<void> {
    const prevHash = this.getLastHash();
    const event = await createEvent(type, payload, prevHash, now);
    this.state.history.push(event);
  }

  private applyStakeHardcap(): void {
    // Rho calculation is now technically event-dependent.
    // However, for immediate feedback we simplify: update cachedRho directly,
    // assuming the events would produce this result.
    this.state.cachedRho = applyStakeHardcap(this.state.cachedRho, this.state.aether.staked);
  }

  /**
   * Persist only “safe” state (never keystroke timings).
   */
  toJSON(): ResonancePersistedState {
    return {
      cachedRho: this.state.cachedRho,
      history: this.state.history,
      lastMessageAt: this.state.lastMessageAt,
      lockedUntil: this.state.lockedUntil,
      aether: {
        available: this.state.aether.available,
        vesting: this.state.aether.vesting,
        staked: this.state.aether.staked,
      },
      peerRho: this.state.peerRho,
      peerLastSeenAt: this.state.peerLastSeenAt,
      processedLovebombSignatures: this.state.processedLovebombSignatures,
      processedLovebombKeys: this.state.processedLovebombKeys
    };
  }

  snapshot(now: number): ResonanceSnapshot {
    this.settleVesting(now);
    const vested = this.state.aether.vesting.reduce((sum, e) => sum + e.amount, 0);

    return {
      rho: this.state.cachedRho,
      baselineRho: this.baselineRho,
      lockedUntil: this.state.lockedUntil,
      aether: {
        available: this.state.aether.available,
        vested,
        staked: this.state.aether.staked,
        vesting: [...this.state.aether.vesting].sort((a, b) => a.unlockAt - b.unlockAt),
      },
      peerRho: { ...this.state.peerRho },
      historyLength: this.state.history.length,
    };
  }

  tick(now: number): void {
    this.applyDamping(now);
    this.settleVesting(now);
    this.applyStakeHardcap();
  }

  async stake(amount: number, now: number = Date.now()): Promise<void> {
    const amt = Math.floor(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    this.settleVesting(now);
    const movable = Math.min(this.state.aether.available, amt);
    if (movable <= 0) return;

    // Validate Integrity before staking (High stakes action)
    const integrityOk = await verifyChainIntegrity(this.state.history);
    if (!integrityOk) {
      console.error("STAKING BLOCKED: Integrity failure.");
      return;
    }

    // Confirm valid ZK proof of state (Checkpoint)
    const proof = await generateProofOfState(this.state.history);
    console.log('[ZK] Generated Proof of State:', proof);

    this.state.aether.available -= movable;
    this.state.aether.staked += movable;

    // Record Event with Proof
    await this.appendEvent('stake', {
      amount: movable,
      newStaked: this.state.aether.staked,
      proof // Checkpoint the chain
    }, now);

    this.applyStakeHardcap();
  }

  async requestUnstake(amount: number, now: number = Date.now()): Promise<void> {
    const amt = Math.floor(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    this.settleVesting(now);
    const movable = Math.min(this.state.aether.staked, amt);
    if (movable <= 0) return;

    this.state.aether.staked -= movable;
    this.state.aether.vesting.push({ amount: movable, unlockAt: now + 7 * 24 * 60 * 60 * 1000 });

    await this.appendEvent('unstake', { amount: movable, remainingStaked: this.state.aether.staked }, now);

    this.applyStakeHardcap();
  }

  /**
   * "Burn" Aether from available liquid balance to pay for services (Privacy Gas).
   * Returns true if successful (sufficient funds), false otherwise.
   */
  async burnAether(amount: number, now: number = Date.now()): Promise<boolean> {
    if (amount <= 0) return true; // Free is always free
    this.settleVesting(now);

    // Check available balance
    if (this.state.aether.available < amount) {
      return false;
    }

    this.state.aether.available -= amount;
    // We don't record every micro-burn as a "ResonanceEvent" to keep ledger small? 
    // Or we should? For integrity, we SHOULD record where money went.
    // For now, let's assume burns are frequent and maybe we log them elsewhere or batch them.
    // But strictly, modification of state without event = integrity breach.

    await this.appendEvent('slash_penalty', { reason: 'service_fee', amount }, now);

    return true;
  }

  /**
   * Process an outgoing Lovebomb (Amplify).
   * - Deducts FULL weight from available balance.
   * - Returns the split (burned vs transferred) if successful, null if insufficient funds.
   */
  async processOutgoingLovebomb(weight: number, now: number = Date.now()): Promise<{ burned: number; transferred: number } | null> {
    if (weight <= 0) return null;
    this.settleVesting(now);

    if (this.state.aether.available < weight) {
      return null;
    }

    // Deduct full amount
    this.state.aether.available -= weight;

    // Split is logical, the tokens are gone from this wallet either way
    const split = {
      burned: weight * 0.2,
      transferred: weight * 0.8
    };

    // Record Event
    await this.appendEvent('message_sent', { type: 'lovebomb_out', weight, split }, now);

    return split;
  }

  /**
   * Process an incoming Lovebomb (Reward).
   * - Adds the transferred amount to vesting (Proof of Impact).
   * - Records the source and signature for Chain of Custody.
   */
  /**
   * Process an incoming Lovebomb (Reward).
   * - Validates one-time vote per user per message.
   * - Calculates reward based on local view of Sender's Rho (Web-of-Trust).
   * - Adds the transferred amount to vesting (Proof of Impact).
   */
  async processIncomingLovebomb(messageId: string, fromUserId: string, signature: string, now: number = Date.now()): Promise<void> {
    if (!messageId || !fromUserId) return;

    // Initialize tracking if missing (migration)
    if (!this.state.processedLovebombKeys) {
      this.state.processedLovebombKeys = [];
    }

    // 1. Anti-Replay / Double-Spend Protection
    if (this.state.processedLovebombSignatures.includes(signature)) {
      console.warn('Lovebomb signature already processed. Ignoring replay.', signature);
      return;
    }
    this.state.processedLovebombSignatures.push(signature);

    // 2. Anti-Double-Vote (Constraint from Prompt)
    const voteKey = `${messageId}:${fromUserId}`;
    if (this.state.processedLovebombKeys.includes(voteKey)) {
      console.warn(`Duplicate lovebomb from ${fromUserId} on message ${messageId}. Ignoring.`);
      return;
    }
    this.state.processedLovebombKeys.push(voteKey);

    // 3. Calculate Value (Validator Rho * 10)
    // We use our local trusted view of the peer's Rho. 
    // If unknown, minPeerRho (0.1) => 0 weight (as per SocialEcho checks).
    const peerRho = this.state.peerRho[fromUserId] ?? 0.1;
    const grossWeight = calculateVoteWeight(peerRho);

    // Check Diversity / Low Value
    if (grossWeight <= 0) {
      console.log(`Lovebomb from ${fromUserId} ignored due to low reputation (Rho: ${peerRho.toFixed(2)})`);
      return;
    }

    const { transferred } = calculateSocialSplit(grossWeight);

    // Vesting for rewards to prevent instant dumping
    // 3 days vesting for social rewards
    this.state.aether.vesting.push({
      amount: transferred,
      unlockAt: now + 3 * 24 * 60 * 60 * 1000
    });

    console.log(`[Resonance] Lovebomb Accepted from ${fromUserId}. Rho: ${peerRho.toFixed(2)} => +${transferred.toFixed(2)} Aether`);

    await this.appendEvent('lovebomb_received', { amount: transferred, fromUserId, signature, messageId, weight: grossWeight }, now);
  }

  resetComposer(): void {
    this.lastKeystrokeAt = null;
    this.composerIntervalsMs = [];
  }

  recordKeystroke(now: number): void {
    if (this.lastKeystrokeAt != null) {
      const dt = now - this.lastKeystrokeAt;
      // Discard huge gaps (user paused) and negative/zero values.
      if (dt > 0 && dt < 3_000) {
        this.composerIntervalsMs.push(dt);
        if (this.composerIntervalsMs.length > 80) {
          this.composerIntervalsMs.shift();
        }
      }
    }
    this.lastKeystrokeAt = now;
  }

  getComposerIntervals(): number[] {
    return [...this.composerIntervalsMs];
  }

  /**
   * Observe a peer message (client-side only). This is a *local* Web-of-Trust signal.
   *
   * Note: we do NOT have the peer’s keystrokes; we only use decrypted plaintext entropy.
   */
  observePeerMessage(peerId: string, plaintext: string, createdAt?: number): void {
    if (!peerId) return;

    // Idempotency when replaying history: if we have already observed messages up to this
    // timestamp for this peer, skip.
    if (typeof createdAt === 'number' && Number.isFinite(createdAt)) {
      const lastSeen = this.state.peerLastSeenAt[peerId] ?? -Infinity;
      if (createdAt <= lastSeen) return;
      this.state.peerLastSeenAt[peerId] = Math.max(lastSeen, createdAt);
    }

    const prev = this.state.peerRho[peerId] ?? this.minPeerRho;
    const entropy = estimateMessageEntropyScore(plaintext);

    // Small bounded increase; tuneable.
    const delta = 0.02 * entropy;
    this.state.peerRho[peerId] = clamp01(Math.max(this.minPeerRho, prev + delta));
  }

  observePeerMessages(entries: Array<{ peerId: string; plaintext: string; createdAt?: number }>): void {
    for (const e of entries) {
      this.observePeerMessage(e.peerId, e.plaintext, e.createdAt);
    }
  }

  /**
   * Validate a send attempt.
   * - Applies local “cognitive PoW” (keystroke variance) before any network send.
   * - Applies coarse rate limiting (spam window) and can lock the UI temporarily.
   */
  async validateSendAttempt(ctx: SendAttemptContext): Promise<SendAttemptResult> {
    const now = ctx.now;

    if (this.state.lockedUntil && now < this.state.lockedUntil) {
      return {
        ok: false,
        error: {
          code: 'LOCKED',
          message: 'Système verrouillé. Attente de recharge.',
          retryAt: this.state.lockedUntil,
        },
      };
    }

    if (!ctx.allowLowEntropy && !ctx.text.trim()) {
      return { ok: false, error: { code: 'EMPTY_MESSAGE', message: 'Message vide.' } };
    }

    // Rate-limit detection (protects against ultra-fast spam regardless of keystrokes).
    this.recentOutgoingAt = this.recentOutgoingAt.filter((t) => now - t < this.spamWindowMs);
    if (this.recentOutgoingAt.length >= this.spamMaxCount) {
      const stakedBefore = this.state.aether.staked;
      const penalty = applyAnchoringPenalty({
        now,
        rhoBefore: this.state.cachedRho,
        stakedAmount: stakedBefore,
      });

      this.state.cachedRho = penalty.rhoAfter;
      this.state.lockedUntil = penalty.lockedUntil;
      this.state.aether.staked = penalty.stakedAfter;

      // Log slash event
      this.appendEvent('slash_penalty', { reason: 'rate_limit', penalty }, now);

      return {
        ok: false,
        error:
          stakedBefore <= 0
            ? { code: 'RATE_LIMITED', message: 'Système verrouillé. Attente de recharge.', retryAt: penalty.lockedUntil ?? undefined }
            : {
              code: 'RATE_LIMITED',
              message: `Ancrage détecté: slashing appliqué (-${penalty.slashedAmount}).`,
            },
      };
    }

    const intervals = this.getComposerIntervals();
    const stats = computeKeystrokeStats(intervals);

    // Cognitive PoW: only run if we have enough signal.
    if (stats.n >= this.minIntervalsForCognitiveCheck) {
      const suspiciouslyRegular = stats.stdDevMs < this.minStdDevMs || stats.cv < this.minCv;

      if (suspiciouslyRegular) {
        const stakedBefore = this.state.aether.staked;
        const penalty = applyAnchoringPenalty({
          now,
          rhoBefore: this.state.cachedRho,
          stakedAmount: stakedBefore,
        });

        this.state.cachedRho = penalty.rhoAfter;
        this.state.lockedUntil = penalty.lockedUntil;
        this.state.aether.staked = penalty.stakedAfter;

        // Log slash event
        this.appendEvent('slash_penalty', { reason: 'cognitive_mismatch', penalty }, now);

        return {
          ok: false,
          error: {
            code: 'COGNITIVE_MISMATCH',
            message:
              stakedBefore <= 0
                ? 'Cognitive Mismatch: rythme de frappe non-humain détecté.'
                : `Cognitive Mismatch: slashing appliqué (-${penalty.slashedAmount}).`,
            retryAt: penalty.lockedUntil ?? undefined,
          },
          metrics: {
            entropyScore: estimateMessageEntropyScore(ctx.text),
            timeSinceLastMessageMs: this.state.lastMessageAt ? now - this.state.lastMessageAt : null,
            keystrokes: stats,
          },
        };
      }
    }

    // Build a ZK “proof” (prototype) without leaking timings.
    const proof = await proveRhythm({ intervalsMs: intervals, nonce: `${now}:${Math.random()}` });

    return {
      ok: true,
      proof,
      metrics: {
        entropyScore: estimateMessageEntropyScore(ctx.text),
        timeSinceLastMessageMs: this.state.lastMessageAt ? now - this.state.lastMessageAt : null,
        keystrokes: stats,
      },
    };
  }

  /**
   * Apply resonance gain + Aether rewards after a message is *actually* sent.
   */
  async commitOutgoingMessage(ctx: { now: number; text: string; peerId?: string }): Promise<SendCommittedResult> {
    if (this.isProcessing) {
      throw new Error("Transaction in progress (Race Condition Protection)");
    }
    this.isProcessing = true;

    try {
      const now = ctx.now;
      const rhoBefore = this.state.cachedRho;

      // Track for spam window
      this.recentOutgoingAt.push(now);

      const entropyScore = estimateMessageEntropyScore(ctx.text);
      const timeSinceMs = this.state.lastMessageAt ? now - this.state.lastMessageAt : this.targetIntervalMs;

      // Spec gave: 1/(1+e^{-k(Entropy-θ)}) * 1/TimeSinceLastMessage.
      // That “1/Δt” term rewards *very fast* messaging (spam). We replace it with a
      // bell-shaped rhythm factor centered around a target interval (oscillator model).
      const k = 8;
      const theta = 0.35;

      // Spec gave: 1/(1+e^{-k(Entropy-θ)}).
      // Innovation: normalize the logistic so that Entropy=0 yields ~0 gain (prevents “ok” spam).
      const entropyGateRaw = logistic(k * (entropyScore - theta));
      const entropyGateMin = logistic(-k * theta); // value at entropyScore = 0
      const entropyGate = clamp01((entropyGateRaw - entropyGateMin) / (1 - entropyGateMin));

      const rhythmFactor = gaussian(timeSinceMs, this.targetIntervalMs, this.rhythmSigmaMs);

      const gain = entropyGate * rhythmFactor;

      // Damping for extreme inactivity is applied in tick(); here we only apply gain.
      let rhoAfter = clamp01(Math.max(this.baselineRho, rhoBefore + 0.12 * gain));
      rhoAfter = applyStakeHardcap(rhoAfter, this.state.aether.staked);
      // this.state.rho = rhoAfter; // OLD
      this.state.cachedRho = rhoAfter; // Updated cached

      this.state.lastMessageAt = now;

      // Web-of-Trust gating: only mint if peer has higher local resonance estimate.
      const peerId = ctx.peerId;
      const peerRho = peerId ? (this.state.peerRho[peerId] ?? this.minPeerRho) : this.minPeerRho;
      const canMint = peerId ? peerRho > rhoAfter : false;

      let mintedAether = 0;
      let vestingEntry: AetherVestingEntry | undefined;

      if (canMint) {
        mintedAether = Math.round(this.maxAetherPerEvent * gain);

        if (mintedAether > 0) {
          const unlockDelayMs = this.computeUnlockDelayMs(rhoAfter);
          vestingEntry = { amount: mintedAether, unlockAt: now + unlockDelayMs };
          this.state.aether.vesting.push(vestingEntry);
        }
      }

      // Ledger Update
      await this.appendEvent('message_sent', {
        rhoDelta: rhoAfter - rhoBefore,
        gain,
        mintedAether,
        vestingEntry // Crucial for reconstructing state
      }, now);

      // Reset composer (new message starts a new rhythm sample)
      this.resetComposer();

      return { rhoBefore, rhoAfter, mintedAether, vestingEntry };
    } finally {
      this.isProcessing = false;
    }
  }

  private computeUnlockDelayMs(rho: number): number {
    // Liquidity Harmony (prototype): faster unlock as rho -> 1.
    //
    // We want:
    // - rho -> 1 => near-instant liquidity
    // - low rho => *months* before unlock (anti “pump & dump”)
    //
    // A simple curve that behaves well is a squared inverse ratio:
    //   delay = BASE * ((1 - rho) / max(rho, MIN_RHO))^2
    // - rho = 0.5 => delay = BASE
    // - rho = 0.1 => delay ≈ 81 * BASE
    const denom = Math.max(this.minRhoForUnlock, rho);
    const ratio = (1 - rho) / denom;
    const delay = this.baseUnlockMs * ratio * ratio;

    const maxDelay = 180 * 24 * 60 * 60 * 1000; // 180 days cap (prototype safety)
    return Math.max(0, Math.min(maxDelay, delay));
  }

  private settleVesting(now: number): void {
    const remaining: AetherVestingEntry[] = [];
    for (const entry of this.state.aether.vesting) {
      if (entry.unlockAt <= now) {
        this.state.aether.available += entry.amount;
      } else {
        remaining.push(entry);
      }
    }
    this.state.aether.vesting = remaining;
  }

  private applyDamping(now: number): void {
    // Exponential decay toward baseline over a half-life.
    const last = this.state.lastMessageAt;
    if (!last) return;

    const dt = now - last;
    if (dt <= 0) return;

    const halfLife = this.dampingHalfLifeMs;
    const lambda = Math.log(2) / Math.max(1, halfLife);
    const factor = Math.exp(-lambda * dt);

    // rho(t) = baseline + (rho0 - baseline) * exp(-λ t)
    const rho = this.state.cachedRho;
    const damped = this.baselineRho + (rho - this.baselineRho) * factor;
    // this.state.rho = clamp01(Math.max(0, damped));
    this.state.cachedRho = clamp01(Math.max(0, damped));
    this.applyStakeHardcap();
  }
}

export async function simulateOnChainVerification(_proof: ZKRhythmProof): Promise<boolean> {
  // Placeholder for future chain verification.
  // In a real implementation, this would submit/verify zkSNARK proof against a verifier contract.
  return true;
}
