/**
 * Compact time-capsule view for time-locked messages. Polls drand every 5 s
 * for the target round's signature, ticks the countdown every second for
 * smooth display, and swaps to the plaintext once the round is published.
 *
 * UI stays non-technical — the "drand"/"tlock" vocabulary lives in code
 * and dev docs, never in user-facing strings.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  decryptKeyFromCiphertext,
  estimatedTimestampForRound,
  isRoundAvailable,
} from '../../lib/tlock';

interface TlockGateProps {
  body: string;
  drandRound: number;
  // Fires exactly once when the tlock round opens and the ciphertext is
  // successfully decrypted. Used by the parent to chain follow-up flows
  // (e.g. auto-acknowledging a burn-after-reading message so its burn
  // countdown starts the moment the recipient can read it).
  onUnlocked?: () => void;
}

type GateState =
  | { phase: 'locked'; unlockAtMs: number }
  | { phase: 'unlocked'; plaintext: string };

const POLL_INTERVAL_MS = 5000;
const TICK_INTERVAL_MS = 1000;

// drand quicknet chain parameters (baked into tlock-js, see
// node_modules/tlock-js/drand/defaults.js). Used to compute the unlock
// timestamp locally so the countdown renders instantly on mount — the
// async call to `estimatedTimestampForRound` may take a few seconds and
// would otherwise leave the UI stuck on '…'.
const DRAND_QUICKNET_GENESIS_S = 1692803367;
const DRAND_QUICKNET_PERIOD_S = 3;

function localUnlockMsFromRound(round: number): number {
  return 1000 * (DRAND_QUICKNET_GENESIS_S + (round - 1) * DRAND_QUICKNET_PERIOD_S);
}

export function TlockGate({ body, drandRound, onUnlocked }: TlockGateProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<GateState>(() => ({
    phase: 'locked',
    unlockAtMs: localUnlockMsFromRound(drandRound),
  }));
  const [now, setNow] = useState<number>(() => Date.now());
  const mountedRef = useRef(true);
  const unlockedNotifiedRef = useRef(false);
  // Stash the callback in a ref so the polling effect can invoke the latest
  // version without re-subscribing on every parent re-render.
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;
  // Anchor the initial "remaining time" so the progress bar can fill over
  // the total lock duration, not just the window since this component
  // mounted (which would restart on every remount).
  const anchorRef = useRef<{ startedAtMs: number; unlockAtMs: number } | null>({
    startedAtMs: Date.now(),
    unlockAtMs: localUnlockMsFromRound(drandRound),
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let pollTimer: number | undefined;

    const tryUnlock = async () => {
      try {
        const available = await isRoundAvailable(drandRound);
        if (!mountedRef.current) return;

        if (!available) {
          let unlockAtMs: number = localUnlockMsFromRound(drandRound);
          try {
            const networkEstimate = await estimatedTimestampForRound(drandRound);
            if (Number.isFinite(networkEstimate)) unlockAtMs = networkEstimate;
          } catch {
            // Keep the local estimate — chain params are fixed constants
            // so the drift from the network value is negligible.
          }
          if (!anchorRef.current) {
            anchorRef.current = { startedAtMs: Date.now(), unlockAtMs };
          }
          if (mountedRef.current) setState({ phase: 'locked', unlockAtMs });
          return;
        }

        const bytes = await decryptKeyFromCiphertext(body);
        if (!mountedRef.current) return;
        const plaintext = new TextDecoder().decode(bytes);
        setState({ phase: 'unlocked', plaintext });
        if (!unlockedNotifiedRef.current) {
          unlockedNotifiedRef.current = true;
          onUnlockedRef.current?.();
        }
      } catch {
        // Transient — retry on next tick without scaring the user.
      }
    };

    void tryUnlock();
    pollTimer = window.setInterval(() => void tryUnlock(), POLL_INTERVAL_MS);
    return () => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
    };
  }, [body, drandRound]);

  useEffect(() => {
    if (state.phase === 'unlocked') return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state.phase]);

  const unlockAtMs = state.phase === 'locked' ? state.unlockAtMs : 0;

  const progressPct = useMemo(() => {
    const anchor = anchorRef.current;
    if (!anchor) return 0;
    const total = anchor.unlockAtMs - anchor.startedAtMs;
    if (total <= 0) return 100;
    const elapsed = now - anchor.startedAtMs;
    return Math.max(0, Math.min(100, (elapsed / total) * 100));
  }, [now]);

  if (state.phase === 'unlocked') {
    return <p className="text-pure-white whitespace-pre-wrap break-words">{state.plaintext}</p>;
  }

  const label = formatCountdown(unlockAtMs, now, t);

  return (
    <div className="tlock-capsule">
      <div className="tlock-capsule-row">
        <CapsuleIcon />
        <span className="tlock-capsule-countdown font-mono tabular-nums">{label}</span>
      </div>
      <div className="tlock-capsule-progress" aria-hidden="true">
        <motion.div
          className="tlock-capsule-progress-fill"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function formatCountdown(
  unlockAtMs: number,
  now: number,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const deltaMs = unlockAtMs - now;
  if (deltaMs <= 0) {
    return t('messages.tlock_unlocking_short', { defaultValue: 'Déverrouillage…' });
  }
  const seconds = Math.floor(deltaMs / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (d > 0) return `${d}j ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function CapsuleIcon() {
  return (
    <motion.span
      className="tlock-capsule-icon"
      aria-hidden="true"
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        <circle cx="12" cy="16" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    </motion.span>
  );
}

/**
 * Cheap heuristic — tlock-js emits the armored PEM-like AGE format
 * (`-----BEGIN AGE ENCRYPTED FILE-----` ...). Older versions emitted raw,
 * we accept both.
 */
export function looksLikeTlockCiphertext(body: string): boolean {
  if (!body) return false;
  const head = body.slice(0, 64).trimStart();
  return (
    head.startsWith('-----BEGIN AGE ENCRYPTED FILE-----') ||
    head.startsWith('age-encryption.org/v1')
  );
}
