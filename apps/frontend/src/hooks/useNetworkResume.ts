/**
 * Centralized network-resume signal.
 *
 * Fires when any of the following happens:
 *   - The browser emits `online` (Chromium's heuristic that connectivity
 *     is back — covers DHCP renewals, captive-portal logins, etc.).
 *   - Electron's main process forwards a `power:resume` IPC event after
 *     the OS wakes from sleep (Windows S3/S0ix, macOS lid open, Linux
 *     systemd suspend.target). This is the most reliable trigger on a
 *     desktop because `online` may fire seconds late or not at all.
 *
 * Consumers (signaling client, messaging socket, etc.) subscribe with
 * `subscribeToNetworkResume(cb)` and use `waitForNetwork()` before
 * actually reconnecting, so they don't burn retries while the OS is
 * still bringing the interface back up.
 */
import { useEffect, useRef } from 'react';

type ResumeCallback = () => void;

const subscribers = new Set<ResumeCallback>();
let initialized = false;

function fireResume(source: string): void {
    console.info(`[network-resume] signal: ${source} (${subscribers.size} subscriber(s))`);
    subscribers.forEach((cb) => {
        try {
            cb();
        } catch (err) {
            console.error('[network-resume] subscriber threw:', err);
        }
    });
}

function init(): void {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    window.addEventListener('online', () => fireResume('window.online'));

    const electronApi = (window as unknown as { electron?: { onPowerResume?: (cb: () => void) => () => void } }).electron;
    if (electronApi?.onPowerResume) {
        electronApi.onPowerResume(() => fireResume('electron.power.resume'));
    }
}

/**
 * Non-hook subscriber for class-based code (e.g. SignalingClient).
 * Returns an unsubscribe function.
 */
export function subscribeToNetworkResume(cb: ResumeCallback): () => void {
    init();
    subscribers.add(cb);
    return () => {
        subscribers.delete(cb);
    };
}

/**
 * React hook variant. The callback ref is captured each render so the
 * effect doesn't have to re-subscribe when the callback identity changes.
 */
export function useNetworkResume(callback: ResumeCallback): void {
    const ref = useRef(callback);
    ref.current = callback;

    useEffect(() => {
        return subscribeToNetworkResume(() => ref.current());
    }, []);
}

/**
 * Resolves once `navigator.onLine === true`, or after `timeoutMs` as a
 * sanity fallback (some browsers/proxies never flip the flag back).
 *
 * Use this BEFORE attempting a reconnect after a resume event, so you
 * don't hammer the bridge with attempts while the NIC is still re-DHCPing.
 */
export function waitForNetwork(timeoutMs = 10_000): Promise<void> {
    if (typeof navigator === 'undefined' || navigator.onLine) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
            window.removeEventListener('online', onOnline);
            resolve();
        }, timeoutMs);
        const onOnline = () => {
            window.clearTimeout(timer);
            window.removeEventListener('online', onOnline);
            resolve();
        };
        window.addEventListener('online', onOnline);
    });
}
