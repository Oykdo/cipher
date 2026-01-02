import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ResonanceCore, type ResonanceSnapshot, type SendAttemptResult, type SendCommittedResult, type ResonancePersistedState } from '../core/resonance/ResonanceCore';

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildStorageKey(userId: string): string {
  return `cipher-pulse-resonance:${userId}`;
}

export interface UseResonanceApi {
  snapshot: ResonanceSnapshot;
  recordKeystroke: () => void;
  resetComposer: () => void;
  stake: (amount: number) => Promise<void>;
  requestUnstake: (amount: number) => Promise<void>;
  validateSendAttempt: (args: { text: string; peerId?: string; allowLowEntropy?: boolean }) => Promise<SendAttemptResult>;
  commitOutgoingMessage: (args: { text: string; peerId?: string; now?: number }) => Promise<SendCommittedResult>;
  observePeerMessage: (args: { peerId: string; plaintext: string; createdAt?: number }) => void;
  observePeerMessages: (args: { messages: Array<{ peerId: string; plaintext: string; createdAt?: number }> }) => void;
  burnAether: (amount: number) => Promise<boolean>;
  processOutgoingLovebomb: (weight: number) => Promise<{ burned: number; transferred: number } | null>;
  processIncomingLovebomb: (amount: number, fromUserId: string, signature: string) => Promise<void>;
}

/**
 * Resonance state is per-user and stored locally.
 *
 * Important: We persist only “safe” state — never keystroke timings.
 */
export function useResonance(userId: string | null | undefined): UseResonanceApi {
  const storageKey = useMemo(() => (userId ? buildStorageKey(userId) : null), [userId]);
  const coreRef = useRef<ResonanceCore | null>(null);

  const [snapshot, setSnapshot] = useState<ResonanceSnapshot>(() => ({
    rho: 0.1,
    baselineRho: 0.1,
    lockedUntil: null,
    aether: { available: 0, vested: 0, staked: 0, vesting: [] },
    peerRho: {},
    historyLength: 0,
  }));

  const persist = useCallback(() => {
    if (!storageKey) return;
    const core = coreRef.current;
    if (!core) return;
    try {
      const payload: ResonancePersistedState = core.toJSON();
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Non-fatal; keep in-memory.
    }
  }, [storageKey]);

  // (Re)initialize per user.
  useEffect(() => {
    if (!storageKey) {
      coreRef.current = null;
      setSnapshot({
        rho: 0.1,
        baselineRho: 0.1,
        lockedUntil: null,
        aether: { available: 0, vested: 0, staked: 0, vesting: [] },
        peerRho: {},
        historyLength: 0,
      });
      return;
    }

    const saved = safeParseJson<ResonancePersistedState>(localStorage.getItem(storageKey));
    coreRef.current = new ResonanceCore(saved ?? undefined);

    const now = Date.now();
    coreRef.current.tick(now);
    setSnapshot(coreRef.current.snapshot(now));

    // Persist in case we normalized/sanitized.
    persist();
  }, [storageKey, persist]);

  // Background tick: decay + vesting settlement.
  useEffect(() => {
    if (!storageKey) return;

    const id = window.setInterval(() => {
      const core = coreRef.current;
      if (!core) return;
      const now = Date.now();
      core.tick(now);
      setSnapshot(core.snapshot(now));
      persist();
    }, 5_000);

    return () => window.clearInterval(id);
  }, [storageKey, persist]);

  const recordKeystroke = useCallback(() => {
    const core = coreRef.current;
    if (!core) return;
    core.recordKeystroke(Date.now());
    // No snapshot update per keystroke (avoid rerenders). The UI will update on tick/send.
  }, []);

  const resetComposer = useCallback(() => {
    const core = coreRef.current;
    if (!core) return;
    core.resetComposer();
  }, []);

  const stake = useCallback(
    async (amount: number) => {
      const core = coreRef.current;
      if (!core) return;
      const now = Date.now();
      await core.stake(amount, now);
      setSnapshot(core.snapshot(now));
      persist();
    },
    [persist],
  );

  const requestUnstake = useCallback(
    async (amount: number) => {
      const core = coreRef.current;
      if (!core) return;
      const now = Date.now();
      await core.requestUnstake(amount, now);
      setSnapshot(core.snapshot(now));
      persist();
    },
    [persist],
  );

  const validateSendAttempt = useCallback(
    async (args: { text: string; peerId?: string; allowLowEntropy?: boolean }) => {
      const core = coreRef.current;
      if (!core) {
        return { ok: false, error: { code: 'LOCKED' as const, message: 'Resonance core not initialized.' } };
      }

      const res = await core.validateSendAttempt({
        now: Date.now(),
        text: args.text,
        peerId: args.peerId,
        allowLowEntropy: args.allowLowEntropy,
      });

      // Validation may update lockout state.
      const now = Date.now();
      setSnapshot(core.snapshot(now));
      persist();
      return res;
    },
    [persist],
  );

  const commitOutgoingMessage = useCallback(
    async (args: { text: string; peerId?: string; now?: number }): Promise<SendCommittedResult> => {
      const core = coreRef.current;
      if (!core) {
        return { rhoBefore: 0.1, rhoAfter: 0.1, mintedAether: 0 };
      }

      const commitAt = args.now ?? Date.now();
      const res = await core.commitOutgoingMessage({ now: commitAt, text: args.text, peerId: args.peerId });
      setSnapshot(core.snapshot(commitAt));
      persist();
      return res;
    },
    [persist],
  );

  const observePeerMessage = useCallback(
    (args: { peerId: string; plaintext: string; createdAt?: number }) => {
      const core = coreRef.current;
      if (!core) return;
      core.observePeerMessage(args.peerId, args.plaintext, args.createdAt);
      const now = Date.now();
      setSnapshot(core.snapshot(now));
      persist();
    },
    [persist],
  );

  const observePeerMessages = useCallback(
    (args: { messages: Array<{ peerId: string; plaintext: string; createdAt?: number }> }) => {
      const core = coreRef.current;
      if (!core) return;
      if (!args.messages.length) return;

      core.observePeerMessages(args.messages);
      const now = Date.now();
      setSnapshot(core.snapshot(now));
      persist();
    },
    [persist],
  );

  const burnAether = useCallback(
    async (amount: number): Promise<boolean> => {
      const core = coreRef.current;
      if (!core) return false;
      const now = Date.now();
      const success = await core.burnAether(amount, now);
      if (success) {
        setSnapshot(core.snapshot(now));
        persist();
      }
      return success;
    },
    [persist]
  );

  const processOutgoingLovebomb = useCallback(async (weight: number) => {
    const core = coreRef.current;
    if (!core) return null;
    const now = Date.now();
    const result = await core.processOutgoingLovebomb(weight, now);
    if (result) {
      setSnapshot(core.snapshot(now));
      persist();
    }
    return result;
  }, [persist]);

  const processIncomingLovebomb = useCallback(async (amount: number, fromUserId: string, signature: string) => {
    const core = coreRef.current;
    if (!core) return;
    const now = Date.now();
    await core.processIncomingLovebomb(amount, fromUserId, signature, now);
    setSnapshot(core.snapshot(now));
    persist();
  }, [persist]);

  return {
    snapshot,
    recordKeystroke,
    resetComposer,
    stake,
    requestUnstake,
    validateSendAttempt,
    commitOutgoingMessage,
    observePeerMessage,
    observePeerMessages,
    burnAether,
    processOutgoingLovebomb,
    processIncomingLovebomb,
  };
}
