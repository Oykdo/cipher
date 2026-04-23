import { useEffect } from 'react';
import { useAppLockStore } from '../store/appLock';
import { EIDOLON_CONNECT_ENABLED } from '../config';

/**
 * Watches for user activity (mouse / keyboard / touch / focus) and resets
 * the idle timer. A background interval ticks every 30 s to push an
 * auto-lock the moment the threshold is crossed — without the ticker the
 * lock would only fire on the next activity event, which by definition
 * won't happen if the user is away.
 *
 * Mount once at the app root.
 */
export function useAppLockActivity(): void {
  const markActivity = useAppLockStore((s) => s.markActivity);
  const maybeAutoLock = useAppLockStore((s) => s.maybeAutoLock);
  const pinEnabled = useAppLockStore((s) => s.pinEnabled);

  useEffect(() => {
    // AppLock / PIN ships with the Eidolon release — disabled while the
    // flag is off even if the user previously toggled it on.
    if (!EIDOLON_CONNECT_ENABLED) return;
    if (!pinEnabled) return;

    const events: (keyof WindowEventMap)[] = [
      'mousedown',
      'keydown',
      'touchstart',
      'wheel',
      'focus',
    ];
    const handler = () => markActivity();
    for (const e of events) window.addEventListener(e, handler, { passive: true });

    const interval = setInterval(maybeAutoLock, 30_000);

    return () => {
      for (const e of events) window.removeEventListener(e, handler);
      clearInterval(interval);
    };
  }, [pinEnabled, markActivity, maybeAutoLock]);
}
