/**
 * Zustand store for the app-lock overlay state.
 *
 * - `isLocked` is the render gate: when true, the `AppLockOverlay` takes over
 *   the whole viewport and the rest of the app is blurred but kept mounted
 *   so sockets / in-flight requests don't unmount mid-flight.
 * - `lastActivityAt` is reset by the activity tracker hook on every
 *   mousedown / keydown / touchstart. After `APP_LOCK_IDLE_TIMEOUT_MS` the
 *   store auto-locks.
 * - The store itself is volatile (no persist). Config (pin hash, biometric
 *   enrollment, rate-limit counters) lives in `src/lib/appLock.ts` via
 *   localStorage — that's the source of truth across cold starts.
 */

import { create } from 'zustand';
import { APP_LOCK_IDLE_TIMEOUT_MS, getStatus } from '../lib/appLock';

interface AppLockStoreState {
  pinEnabled: boolean;
  biometricEnabled: boolean;
  isLocked: boolean;
  lastActivityAt: number;
  refreshStatus: () => void;
  lock: () => void;
  unlock: () => void;
  markActivity: () => void;
  maybeAutoLock: () => void;
}

function initialFromStatus(): {
  pinEnabled: boolean;
  biometricEnabled: boolean;
  isLocked: boolean;
} {
  const s = getStatus();
  return {
    pinEnabled: s.pinEnabled,
    biometricEnabled: s.biometricEnabled,
    // Cold start with PIN enabled → we start locked. User must authenticate
    // to access anything.
    isLocked: s.pinEnabled,
  };
}

export const useAppLockStore = create<AppLockStoreState>((set, get) => ({
  ...initialFromStatus(),
  lastActivityAt: Date.now(),
  refreshStatus: () => {
    const s = getStatus();
    set((prev) => ({
      pinEnabled: s.pinEnabled,
      biometricEnabled: s.biometricEnabled,
      // Don't force isLocked=true retroactively; let the caller decide.
      isLocked: prev.isLocked,
    }));
  },
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false, lastActivityAt: Date.now() }),
  markActivity: () => set({ lastActivityAt: Date.now() }),
  maybeAutoLock: () => {
    const { pinEnabled, isLocked, lastActivityAt } = get();
    if (!pinEnabled || isLocked) return;
    if (Date.now() - lastActivityAt >= APP_LOCK_IDLE_TIMEOUT_MS) {
      set({ isLocked: true });
    }
  },
}));
