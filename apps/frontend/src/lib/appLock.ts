/**
 * App lock — PIN-based device-local gate that sits on top of vault auth.
 *
 * Threat model: physical attacker with access to an unlocked OS session.
 * Without this gate, anyone who opens Cipher on the user's machine sees the
 * vault-bridge auto-connect flow and lands straight in /conversations.
 *
 * Design:
 * - 6-digit PIN, Argon2id-hashed (64MB / 3 iter / parallel 1)
 * - Rate limit with exponential backoff after 3 misses
 * - Wipe the stored hash after 6 misses (forces reconfigure via keybundle flow)
 * - State stored in localStorage under a single namespaced key
 *
 * The PIN is NOT a replacement for the vault's cryptographic identity. It's a
 * convenience gate, like iOS's screen-lock relative to the Secure Enclave.
 */

import { getArgon2 } from './argon2Loader';

const STORAGE_KEY = 'cipher.appLock.v1';

// Argon2id parameters — matches the master-key derivation elsewhere, because
// a 6-digit PIN has only 1M combinations and the KDF is the main thing
// protecting against brute-force. Memory-hard + time-hard makes a GPU attack
// take decades even for the entire keyspace.
const ARGON2_PARAMS = {
  type: 2, // Argon2id
  hashLen: 32,
  time: 3,
  mem: 65536, // 64 MB
  parallelism: 1,
};

const MAX_ATTEMPTS_BEFORE_WIPE = 6;
const BACKOFF_STEPS_MS = [0, 0, 0, 1_000, 5_000, 30_000, 300_000];

export interface AppLockState {
  version: 1;
  pinEnabled: boolean;
  biometricEnabled: boolean;
  // Stored hash: hex-encoded Argon2id output. Never contains the PIN.
  pinHash: string | null;
  pinSalt: string | null;
  // WebAuthn credential id (base64url) enrolled for biometric fallback.
  biometricCredentialId: string | null;
  // Failure tracking for rate limiting.
  failedAttempts: number;
  lockedUntil: number | null;
  updatedAt: number;
}

const DEFAULT_STATE: AppLockState = {
  version: 1,
  pinEnabled: false,
  biometricEnabled: false,
  pinHash: null,
  pinSalt: null,
  biometricCredentialId: null,
  failedAttempts: 0,
  lockedUntil: null,
  updatedAt: 0,
};

export function loadState(): AppLockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: AppLockState): void {
  const next = { ...state, updatedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function randomBytes(len: number): Uint8Array {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function hashPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const argon2 = await getArgon2();
  const result = await argon2.hash({
    pass: pin,
    salt,
    ...ARGON2_PARAMS,
  });
  return result.hash as Uint8Array;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function setupPin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) throw new Error('pin must be exactly 6 digits');
  const salt = randomBytes(16);
  const hash = await hashPin(pin, salt);
  const state = loadState();
  saveState({
    ...state,
    pinEnabled: true,
    pinHash: toHex(hash),
    pinSalt: toHex(salt),
    failedAttempts: 0,
    lockedUntil: null,
  });
}

export function disablePin(): void {
  const state = loadState();
  saveState({
    ...state,
    pinEnabled: false,
    pinHash: null,
    pinSalt: null,
    failedAttempts: 0,
    lockedUntil: null,
  });
}

export function enrollBiometric(credentialId: string): void {
  const state = loadState();
  saveState({
    ...state,
    biometricEnabled: true,
    biometricCredentialId: credentialId,
  });
}

export function disableBiometric(): void {
  const state = loadState();
  saveState({
    ...state,
    biometricEnabled: false,
    biometricCredentialId: null,
  });
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong-pin'; remainingAttempts: number; backoffMs: number }
  | { ok: false; reason: 'rate-limited'; retryAt: number }
  | { ok: false; reason: 'wiped' }
  | { ok: false; reason: 'not-configured' };

export async function verifyPin(pin: string): Promise<VerifyResult> {
  const state = loadState();
  if (!state.pinEnabled || !state.pinHash || !state.pinSalt) {
    return { ok: false, reason: 'not-configured' };
  }
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return { ok: false, reason: 'rate-limited', retryAt: state.lockedUntil };
  }

  const computed = await hashPin(pin, fromHex(state.pinSalt));
  const expected = fromHex(state.pinHash);

  if (constantTimeEqual(computed, expected)) {
    saveState({ ...state, failedAttempts: 0, lockedUntil: null });
    return { ok: true };
  }

  const failed = state.failedAttempts + 1;

  // Past the wipe threshold → clear all config. User must reconfigure via
  // the keybundle flow (they proved they hold the vault files).
  if (failed >= MAX_ATTEMPTS_BEFORE_WIPE) {
    saveState({
      ...DEFAULT_STATE,
      biometricEnabled: state.biometricEnabled,
      biometricCredentialId: state.biometricCredentialId,
    });
    return { ok: false, reason: 'wiped' };
  }

  const backoffMs = BACKOFF_STEPS_MS[Math.min(failed, BACKOFF_STEPS_MS.length - 1)];
  const lockedUntil = backoffMs > 0 ? Date.now() + backoffMs : null;

  saveState({ ...state, failedAttempts: failed, lockedUntil });

  return {
    ok: false,
    reason: 'wrong-pin',
    remainingAttempts: MAX_ATTEMPTS_BEFORE_WIPE - failed,
    backoffMs,
  };
}

export function getStatus(): {
  pinEnabled: boolean;
  biometricEnabled: boolean;
  biometricCredentialId: string | null;
  lockedUntil: number | null;
  failedAttempts: number;
} {
  const state = loadState();
  return {
    pinEnabled: state.pinEnabled,
    biometricEnabled: state.biometricEnabled,
    biometricCredentialId: state.biometricCredentialId,
    lockedUntil: state.lockedUntil,
    failedAttempts: state.failedAttempts,
  };
}

export const APP_LOCK_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
