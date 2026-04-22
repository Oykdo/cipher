import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAppLockStore } from '../store/appLock';
import { verifyPin, getStatus } from '../lib/appLock';
import { verifyBiometric, isBiometricAvailable } from '../lib/appLockBiometric';
import { PinKeypad } from './PinKeypad';

/**
 * Full-screen lock overlay. Mounted in App.tsx. Renders nothing when
 * `isLocked` is false. On `isLocked === true`:
 * - Offers a biometric CTA (Windows Hello / Touch ID) when enrolled +
 *   platform authenticator is available.
 * - PIN pad below — either the only option or the fallback.
 * - Shows rate-limit countdown when `lockedUntil` is in the future.
 * - On 6 consecutive failures, config is wiped by the verifier and the
 *   overlay displays a "please re-import your keybundle" state.
 */
export function AppLockOverlay() {
  const { t } = useTranslation();
  const isLocked = useAppLockStore((s) => s.isLocked);
  const unlock = useAppLockStore((s) => s.unlock);
  const refreshStatus = useAppLockStore((s) => s.refreshStatus);
  const biometricEnabled = useAppLockStore((s) => s.biometricEnabled);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakeN, setShakeN] = useState(0);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [wiped, setWiped] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [platformOk, setPlatformOk] = useState(false);

  useEffect(() => {
    void isBiometricAvailable().then(setPlatformOk);
  }, []);

  useEffect(() => {
    if (!retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [retryAt]);

  useEffect(() => {
    if (!isLocked) {
      setPin('');
      setError(null);
      setWiped(false);
    }
  }, [isLocked]);

  const handleComplete = useCallback(async (candidate: string) => {
    const result = await verifyPin(candidate);
    if (result.ok) {
      setPin('');
      setError(null);
      setRetryAt(null);
      unlock();
      return;
    }
    if (result.reason === 'rate-limited') {
      setRetryAt(result.retryAt);
      setError(t('app_lock.rate_limited'));
      setPin('');
      setShakeN((n) => n + 1);
      return;
    }
    if (result.reason === 'wiped') {
      setWiped(true);
      setError(t('app_lock.wiped'));
      setPin('');
      refreshStatus();
      return;
    }
    if (result.reason === 'wrong-pin') {
      setError(
        t('app_lock.wrong_pin', { remaining: result.remainingAttempts }),
      );
      setPin('');
      setShakeN((n) => n + 1);
      if (result.backoffMs > 0) {
        setRetryAt(Date.now() + result.backoffMs);
      }
      return;
    }
    if (result.reason === 'not-configured') {
      // No PIN on file but the overlay is up — bail out, trust the store.
      refreshStatus();
      unlock();
    }
  }, [t, unlock, refreshStatus]);

  const handleBiometric = useCallback(async () => {
    if (biometricBusy) return;
    const status = getStatus();
    if (!status.biometricEnabled || !status.biometricCredentialId) return;
    setBiometricBusy(true);
    try {
      const ok = await verifyBiometric(status.biometricCredentialId);
      if (ok) {
        setPin('');
        setError(null);
        unlock();
      } else {
        setError(t('app_lock.biometric_failed'));
      }
    } catch {
      setError(t('app_lock.biometric_failed'));
    } finally {
      setBiometricBusy(false);
    }
  }, [biometricBusy, t, unlock]);

  // Auto-trigger biometric prompt once per unlock cycle when available.
  useEffect(() => {
    if (!isLocked || !biometricEnabled || !platformOk) return;
    void handleBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, biometricEnabled, platformOk]);

  const rateLimitSecondsLeft = retryAt && now < retryAt
    ? Math.ceil((retryAt - now) / 1000)
    : 0;
  const padDisabled = wiped || rateLimitSecondsLeft > 0;

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'radial-gradient(circle at 50% 40%, #0a0c18 0%, #04050c 70%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 36,
            color: '#eef1ff',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 4,
                textTransform: 'uppercase',
                opacity: 0.55,
                marginBottom: 8,
              }}
            >
              {t('app_lock.kicker')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 300 }}>
              {wiped ? t('app_lock.wiped_title') : t('app_lock.title')}
            </div>
          </div>

          {!wiped && (
            <PinKeypad
              value={pin}
              onChange={setPin}
              onComplete={handleComplete}
              disabled={padDisabled}
              errorShake={shakeN}
            />
          )}

          {biometricEnabled && platformOk && !wiped && (
            <button
              type="button"
              onClick={handleBiometric}
              disabled={biometricBusy || padDisabled}
              style={biometricBtn}
            >
              {biometricBusy ? t('app_lock.biometric_busy') : t('app_lock.biometric_cta')}
            </button>
          )}

          {error && (
            <div style={{ fontSize: 13, color: '#f0a0a0', maxWidth: 320, textAlign: 'center' }}>
              {rateLimitSecondsLeft > 0
                ? t('app_lock.retry_in', { seconds: rateLimitSecondsLeft })
                : error}
            </div>
          )}

          {wiped && (
            <div
              style={{ fontSize: 13, opacity: 0.8, maxWidth: 380, textAlign: 'center', lineHeight: 1.5 }}
            >
              {t('app_lock.wiped_desc')}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const biometricBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  color: '#eef1ff',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 999,
  padding: '9px 22px',
  fontFamily: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  letterSpacing: 1,
};
