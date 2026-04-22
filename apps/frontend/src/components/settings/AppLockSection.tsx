import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  disablePin,
  setupPin,
  enrollBiometric,
  disableBiometric,
  getStatus,
} from '../../lib/appLock';
import {
  isBiometricAvailable,
  registerBiometric,
} from '../../lib/appLockBiometric';
import { useAppLockStore } from '../../store/appLock';
import { PinKeypad } from '../PinKeypad';

type SetupStage = 'idle' | 'choose' | 'confirm';

/**
 * Security → App Lock section. Opt-in toggle for the PIN gate + Windows Hello
 * / Touch ID pairing. Hidden when the user's browser has no PublicKeyCredential
 * at all; otherwise the biometric row stays disabled with a hint.
 */
export function AppLockSection() {
  const { t } = useTranslation();
  const refreshStatus = useAppLockStore((s) => s.refreshStatus);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [platformOk, setPlatformOk] = useState(false);
  const [stage, setStage] = useState<SetupStage>('idle');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shakeN, setShakeN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getStatus();
    setPinEnabled(s.pinEnabled);
    setBiometricEnabled(s.biometricEnabled);
    void isBiometricAvailable().then(setPlatformOk);
  }, []);

  const sync = () => {
    const s = getStatus();
    setPinEnabled(s.pinEnabled);
    setBiometricEnabled(s.biometricEnabled);
    refreshStatus();
  };

  const resetWizard = () => {
    setStage('idle');
    setPin('');
    setConfirm('');
    setError(null);
  };

  const startSetup = () => {
    setStage('choose');
    setPin('');
    setConfirm('');
    setError(null);
  };

  const handleChoose = (value: string) => {
    if (value.length !== 6) return;
    // move to confirm stage
    setStage('confirm');
    setConfirm('');
  };

  const handleConfirm = async (value: string) => {
    if (value.length !== 6) return;
    if (value !== pin) {
      setError(t('app_lock.setup_mismatch'));
      setConfirm('');
      setShakeN((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await setupPin(value);
      sync();
      resetWizard();
    } catch (exc: any) {
      setError(exc?.message || t('app_lock.setup_failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisablePin = () => {
    if (!confirm) {
      // Quick one-click disable — PIN gate is opt-in safety, not vault auth.
      disablePin();
      if (biometricEnabled) {
        disableBiometric();
      }
      sync();
    }
  };

  const handleEnrollBiometric = async () => {
    setBusy(true);
    setError(null);
    try {
      const { credentialId } = await registerBiometric();
      enrollBiometric(credentialId);
      sync();
    } catch (exc: any) {
      setError(exc?.message || t('app_lock.biometric_enroll_failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisableBiometric = () => {
    disableBiometric();
    sync();
  };

  return (
    <div className="cosmic-glass-card rounded-3xl border border-cyan-400/12 overflow-hidden p-6 shadow-[0_12px_40px_rgba(8,47,73,0.16)]">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">
          {t('app_lock.section_title')}
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          {t('app_lock.section_desc')}
        </p>
      </div>

      {stage === 'idle' && (
        <div className="space-y-3">
          {/* PIN row */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {t('app_lock.pin_label')}
                </p>
                <p className="mt-1 text-xs text-slate-500 max-w-md">
                  {pinEnabled
                    ? t('app_lock.pin_enabled_desc')
                    : t('app_lock.pin_disabled_desc')}
                </p>
              </div>
              {pinEnabled ? (
                <button
                  onClick={handleDisablePin}
                  disabled={busy}
                  className="cosmic-btn-ghost border-white/10 bg-white/[0.03] text-xs"
                >
                  {t('app_lock.pin_disable')}
                </button>
              ) : (
                <button
                  onClick={startSetup}
                  disabled={busy}
                  className="cosmic-cta text-xs"
                >
                  {t('app_lock.pin_enable')}
                </button>
              )}
            </div>
          </div>

          {/* Biometric row */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {t('app_lock.biometric_label')}
                </p>
                <p className="mt-1 text-xs text-slate-500 max-w-md">
                  {!platformOk
                    ? t('app_lock.biometric_unavailable')
                    : !pinEnabled
                      ? t('app_lock.biometric_requires_pin')
                      : biometricEnabled
                        ? t('app_lock.biometric_enabled_desc')
                        : t('app_lock.biometric_disabled_desc')}
                </p>
              </div>
              {biometricEnabled ? (
                <button
                  onClick={handleDisableBiometric}
                  disabled={busy}
                  className="cosmic-btn-ghost border-white/10 bg-white/[0.03] text-xs"
                >
                  {t('app_lock.biometric_disable')}
                </button>
              ) : (
                <button
                  onClick={handleEnrollBiometric}
                  disabled={busy || !platformOk || !pinEnabled}
                  className="cosmic-cta text-xs disabled:opacity-40"
                >
                  {busy ? t('app_lock.biometric_enrolling') : t('app_lock.biometric_enable')}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      )}

      {stage === 'choose' && (
        <div className="flex flex-col items-center gap-5 py-6">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/70 mb-1">
              {t('app_lock.setup_kicker')}
            </div>
            <div className="text-base text-white/90">{t('app_lock.setup_choose_title')}</div>
          </div>
          <PinKeypad
            value={pin}
            onChange={(v) => {
              setPin(v);
              if (v.length === 6) handleChoose(v);
            }}
            onComplete={handleChoose}
            disabled={busy}
            errorShake={shakeN}
          />
          <button onClick={resetWizard} className="cosmic-btn-ghost text-xs mt-2">
            {t('app_lock.cancel')}
          </button>
        </div>
      )}

      {stage === 'confirm' && (
        <div className="flex flex-col items-center gap-5 py-6">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/70 mb-1">
              {t('app_lock.setup_kicker')}
            </div>
            <div className="text-base text-white/90">{t('app_lock.setup_confirm_title')}</div>
          </div>
          <PinKeypad
            value={confirm}
            onChange={(v) => {
              setConfirm(v);
              if (v.length === 6) handleConfirm(v);
            }}
            onComplete={handleConfirm}
            disabled={busy}
            errorShake={shakeN}
          />
          {error && (
            <div className="text-xs text-rose-300/90">{error}</div>
          )}
          <button onClick={resetWizard} className="cosmic-btn-ghost text-xs mt-2">
            {t('app_lock.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
