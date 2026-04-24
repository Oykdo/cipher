/**
 * Interim signup flow — BIP-39 mnemonic (12 or 24 words).
 *
 * Used while the Eidolon ecosystem (vault-based signup) is pre-release.
 * Rendered from SignupFluid.tsx when EIDOLON_CONNECT_ENABLED is false.
 *
 * Backend contract (POST /api/v2/auth/signup, method=standard):
 *   request  : { username, method: 'standard', mnemonicLength: 12 | 24 }
 *   response : { id, username, securityTier, accessToken, refreshToken,
 *                mnemonic: string[], masterKeyHex }
 * The backend generates the mnemonic — frontend only displays it and
 * verifies the user has written it down before sealing the session.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { API_BASE_URL } from '../config';
import '../styles/fluidCrypto.css';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import MouseGlowCard from '../components/MouseGlowCard';
import { getErrorMessage } from '../lib/errors';
import { computeSrpSeedSetup } from '../lib/srpSeed';
import { getE2EEVault } from '../lib/keyVault';
import { setSessionMasterKey } from '../lib/masterKeyResolver';
import { setTemporaryMasterKey } from '../lib/secureKeyAccess';
import { initializeE2EE, publishKeyBundleToServer } from '../lib/e2ee/e2eeService';

type Step = 'intro' | 'generating' | 'reveal' | 'verify';

interface SignupResponse {
  id: string;
  username: string;
  securityTier: 'standard' | 'dice-key';
  accessToken: string;
  refreshToken: string;
  mnemonic: string[];
  masterKeyHex: string;
}

const MIN_USERNAME_LENGTH = 3;
const STEP_ORDER: Step[] = ['intro', 'generating', 'reveal', 'verify'];

export default function SignupMnemonic() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  const [step, setStep] = useState<Step>('intro');
  const [username, setUsername] = useState('');
  const [mnemonicLength, setMnemonicLength] = useState<12 | 24>(12);
  const [response, setResponse] = useState<SignupResponse | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  // Verification asks for two distinct random positions to make sure the
  // user actually wrote the words down instead of ticking a checkbox.
  const [verifyIndex, setVerifyIndex] = useState<number>(0);
  const [verifyIndex2, setVerifyIndex2] = useState<number>(0);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyInput2, setVerifyInput2] = useState('');
  const [verifyError, setVerifyError] = useState('');

  const [error, setError] = useState('');

  // Extra UX state: default-hide the mnemonic until the user clicks reveal
  // (protects against a passer-by shoulder-surfing the screen).
  const [mnemonicHidden, setMnemonicHidden] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    const trimmed = username.trim();
    if (trimmed.length < MIN_USERNAME_LENGTH) {
      setError(t('signup.mnemonic_username_too_short', { min: MIN_USERNAME_LENGTH }));
      return;
    }
    setError('');
    setStep('generating');

    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmed,
          method: 'standard',
          mnemonicLength,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || t('signup.mnemonic_error_generic'));
      }
      const signupData = data as SignupResponse;

      // Initialize the E2EE KeyVault with the masterKey derived from the
      // mnemonic. Without this, sending encrypted messages fails with
      // "KeyVault not initialized". Same pattern as QuickUnlock.
      try {
        await setSessionMasterKey(signupData.masterKeyHex);
      } catch (mkErr) {
        console.warn('[signup-mnemonic] Failed to cache masterKey', mkErr);
      }
      try {
        await setTemporaryMasterKey(signupData.masterKeyHex);
      } catch (mkErr) {
        console.warn('[signup-mnemonic] Failed to persist masterKey', mkErr);
      }
      try {
        await getE2EEVault(signupData.masterKeyHex);
      } catch (vaultErr) {
        console.warn('[signup-mnemonic] Failed to init E2EE vault', vaultErr);
      }

      // Register the SRP-seed verifier so this user can log back in later
      // via their mnemonic alone (zero-knowledge — server never sees it).
      // Failure here must not block signup — the account is still usable on
      // this device via the session we just received.
      try {
        const { srpSalt, srpVerifier } = computeSrpSeedSetup(
          signupData.username,
          signupData.mnemonic
        );
        await fetch(`${API_BASE_URL}/api/v2/auth/srp-seed/setup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${signupData.accessToken}`,
          },
          body: JSON.stringify({ srpSalt, srpVerifier }),
        });
      } catch (setupErr) {
        console.warn('[srp-seed] setup failed', setupErr);
      }

      setResponse(signupData);
      setMnemonicHidden(true);
      setCopied(false);
      setStep('reveal');
    } catch (err) {
      setError(getErrorMessage(err, t('signup.mnemonic_error_generic')));
      setStep('intro');
    }
  }, [username, mnemonicLength, t]);

  const handleProceedToVerify = useCallback(() => {
    if (!response || !backupConfirmed) return;
    const len = response.mnemonic.length;
    const first = Math.floor(Math.random() * len);
    let second = Math.floor(Math.random() * len);
    if (second === first) second = (second + 1) % len;
    setVerifyIndex(first);
    setVerifyIndex2(second);
    setVerifyInput('');
    setVerifyInput2('');
    setVerifyError('');
    setStep('verify');
  }, [response, backupConfirmed]);

  const handleVerify = useCallback(async () => {
    if (!response) return;
    const expected1 = response.mnemonic[verifyIndex].trim().toLowerCase();
    const expected2 = response.mnemonic[verifyIndex2].trim().toLowerCase();
    const given1 = verifyInput.trim().toLowerCase();
    const given2 = verifyInput2.trim().toLowerCase();
    if (given1 !== expected1 || given2 !== expected2) {
      setVerifyError(t('signup.mnemonic_verify_error'));
      return;
    }

    setSession({
      user: {
        id: response.id,
        username: response.username,
        securityTier: response.securityTier,
      },
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    });

    // Initialize E2EE + publish key bundle to server. This must happen AFTER
    // setSession so the access token is available for the publish API call.
    // Without this, other users can't send encrypted messages to us
    // ("No public key for <username>"). We await an explicit second publish
    // because the one triggered inside initializeE2EE is fire-and-forget
    // (silent on failure).
    try {
      await initializeE2EE(response.username);
      try {
        await publishKeyBundleToServer();
        console.log('✅ [signup-mnemonic] Key bundle published to server');
      } catch (pubErr) {
        console.error('❌ [signup-mnemonic] Key bundle publish failed', pubErr);
      }
    } catch (e2eeErr) {
      console.warn('[signup-mnemonic] E2EE init failed', e2eeErr);
    }

    navigate('/conversations');
  }, [response, verifyIndex, verifyIndex2, verifyInput, verifyInput2, setSession, navigate, t]);

  const handleCopy = useCallback(async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response.mnemonic.join(' '));
      setCopied(true);
    } catch {
      // Clipboard denied (permissions / non-secure context). Leave state as-is.
    }
  }, [response]);

  // Auto-clear the "copied" feedback so the user can re-trigger it if needed.
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const mnemonicGrid = useMemo(() => response?.mnemonic ?? [], [response]);
  const currentStepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="signup-screen relative min-h-screen overflow-hidden">
      <div className="cosmic-ambient" aria-hidden="true">
        <div className="cosmic-stars" />
        <div className="cosmic-nebula" />
        <div className="cosmic-volumetric" />
      </div>

      <div className="flex items-center justify-center min-h-screen p-6 md:p-8 relative z-10">
        <div className="max-w-3xl w-full">
          <div className="text-center mb-8">
            <CosmicConstellationLogo />
            <h1 className="cosmic-title text-4xl md:text-5xl font-black mb-3">
              <span className="cosmic-title-cipher">{t('signup.mnemonic_title')}</span>
            </h1>
            <p className="text-soft-grey text-base md:text-lg">{t('signup.mnemonic_subtitle')}</p>
          </div>

          <Stepper currentIndex={currentStepIndex} />

          <AnimatePresence mode="wait">
            {step === 'intro' && (
              <IntroStep
                key="intro"
                username={username}
                onUsernameChange={(v) => setUsername(v)}
                mnemonicLength={mnemonicLength}
                onLengthChange={setMnemonicLength}
                error={error}
                onSubmit={handleGenerate}
                onBack={() => navigate('/')}
              />
            )}

            {step === 'generating' && <GeneratingStep key="generating" />}

            {step === 'reveal' && response && (
              <RevealStep
                key="reveal"
                words={mnemonicGrid}
                confirmed={backupConfirmed}
                onConfirmChange={setBackupConfirmed}
                onNext={handleProceedToVerify}
                hidden={mnemonicHidden}
                onToggleHidden={() => setMnemonicHidden((h) => !h)}
                onCopy={handleCopy}
                copied={copied}
              />
            )}

            {step === 'verify' && response && (
              <VerifyStep
                key="verify"
                position1={verifyIndex + 1}
                position2={verifyIndex2 + 1}
                value1={verifyInput}
                value2={verifyInput2}
                onChange1={(v) => {
                  setVerifyInput(v);
                  if (verifyError) setVerifyError('');
                }}
                onChange2={(v) => {
                  setVerifyInput2(v);
                  if (verifyError) setVerifyError('');
                }}
                error={verifyError}
                onSubmit={handleVerify}
                onBack={() => setStep('reveal')}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Progress stepper
// ============================================================================

function Stepper({ currentIndex }: { currentIndex: number }) {
  const { t } = useTranslation();
  const labels = [
    t('signup.mnemonic_stepper_step_1'),
    t('signup.mnemonic_stepper_step_2'),
    t('signup.mnemonic_stepper_step_3'),
    t('signup.mnemonic_stepper_step_4'),
  ];
  return (
    <div className="cosmic-stepper mb-6" aria-label="Signup progress">
      {labels.map((label, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending';
        return (
          <div key={label} className="cosmic-stepper-item">
            <div className={`cosmic-step-dot cosmic-step-dot--${state}`}>
              {state === 'done' ? <CheckIcon /> : <span>{i + 1}</span>}
            </div>
            <span className={`cosmic-step-label cosmic-step-label--${state}`}>{label}</span>
            {i < labels.length - 1 && (
              <div className={`cosmic-step-bar cosmic-step-bar--${i < currentIndex ? 'done' : 'pending'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Step components
// ============================================================================

function IntroStep({
  username,
  onUsernameChange,
  mnemonicLength,
  onLengthChange,
  error,
  onSubmit,
  onBack,
}: {
  username: string;
  onUsernameChange: (v: string) => void;
  mnemonicLength: 12 | 24;
  onLengthChange: (v: 12 | 24) => void;
  error: string;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="cosmic-glass-card relative"
    >
      <div className="cosmic-glow-border" aria-hidden="true" />
      <MouseGlowCard className="p-6 md:p-8 space-y-6">
        <div>
          <label className="block">
            <span className="text-sm text-soft-grey mb-2 block">
              {t('signup.mnemonic_intro_username_label')}
            </span>
            <div className="cosmic-input-wrap">
              <UserIcon className="cosmic-input-icon" />
              <input
                type="text"
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder={t('signup.mnemonic_intro_username_placeholder')}
                className="cosmic-input"
                autoComplete="off"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              />
            </div>
          </label>
          <InMemoriamBen username={username} />
        </div>

        <div>
          <span className="text-sm text-soft-grey mb-3 block">
            {t('signup.mnemonic_intro_length_label')}
          </span>
          <div className="grid grid-cols-2 gap-3">
            {([12, 24] as const).map((n) => {
              const selected = mnemonicLength === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onLengthChange(n)}
                  className={`cosmic-length-card ${selected ? 'cosmic-length-card--selected' : ''}`}
                  aria-pressed={selected}
                >
                  <span className="cosmic-length-title">
                    {t(n === 12 ? 'signup.mnemonic_intro_length_12' : 'signup.mnemonic_intro_length_24')}
                  </span>
                  <span className="cosmic-length-hint">
                    {t(n === 12 ? 'signup.mnemonic_intro_length_12_hint' : 'signup.mnemonic_intro_length_24_hint')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="cosmic-alert-error text-sm" role="alert">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSubmit}
            className="cosmic-cta w-full"
          >
            <span>{t('signup.mnemonic_intro_cta')}</span>
            <div className="cosmic-cta-glow" aria-hidden="true" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="cosmic-btn-ghost"
          >
            {t('common.back')}
          </motion.button>
        </div>
      </MouseGlowCard>
    </motion.div>
  );
}

function GeneratingStep() {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="cosmic-glass-card relative"
    >
      <MouseGlowCard className="p-12 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
          className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-cyan-400/60 border-t-transparent"
        />
        <p className="text-soft-grey">{t('signup.mnemonic_generating')}</p>
      </MouseGlowCard>
    </motion.div>
  );
}

function RevealStep({
  words,
  confirmed,
  onConfirmChange,
  onNext,
  hidden,
  onToggleHidden,
  onCopy,
  copied,
}: {
  words: string[];
  confirmed: boolean;
  onConfirmChange: (v: boolean) => void;
  onNext: () => void;
  hidden: boolean;
  onToggleHidden: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="cosmic-glass-card relative"
    >
      <div className="cosmic-glow-border" aria-hidden="true" />
      <MouseGlowCard className="p-6 md:p-8 space-y-6">
        <div className="cosmic-warning">
          <ShieldIcon className="cosmic-warning-icon" />
          <div>
            <p className="cosmic-warning-title">{t('signup.mnemonic_reveal_warning_title')}</p>
            <p className="cosmic-warning-body">{t('signup.mnemonic_reveal_warning')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl md:text-2xl font-bold text-pure-white">
            {t('signup.mnemonic_reveal_title')}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleHidden}
              className="cosmic-icon-btn"
              aria-label={hidden ? t('signup.mnemonic_reveal_show') : t('signup.mnemonic_reveal_hide')}
              title={hidden ? t('signup.mnemonic_reveal_show') : t('signup.mnemonic_reveal_hide')}
            >
              {hidden ? <EyeIcon /> : <EyeOffIcon />}
              <span className="cosmic-icon-btn-label">
                {hidden ? t('signup.mnemonic_reveal_show') : t('signup.mnemonic_reveal_hide')}
              </span>
            </button>
            <button
              type="button"
              onClick={onCopy}
              disabled={hidden}
              className="cosmic-icon-btn"
              aria-label={copied ? t('signup.mnemonic_reveal_copied') : t('signup.mnemonic_reveal_copy')}
              title={copied ? t('signup.mnemonic_reveal_copied') : t('signup.mnemonic_reveal_copy')}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              <span className="cosmic-icon-btn-label">
                {copied ? t('signup.mnemonic_reveal_copied') : t('signup.mnemonic_reveal_copy')}
              </span>
            </button>
          </div>
        </div>

        <div className="cosmic-pill-grid">
          {words.map((word, i) => (
            <motion.div
              key={`${i}-${word}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 * i }}
              className="cosmic-pill"
            >
              <span className="cosmic-pill-index">{i + 1}</span>
              <span className="cosmic-pill-word font-mono">
                {hidden ? '••••••' : word}
              </span>
            </motion.div>
          ))}
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirmChange(e.target.checked)}
            className="mt-1 h-4 w-4 accent-cyan-400"
          />
          <span className="text-sm text-soft-grey">
            {t('signup.mnemonic_reveal_confirm_checkbox')}
          </span>
        </label>

        <motion.button
          whileHover={confirmed ? { scale: 1.02 } : undefined}
          whileTap={confirmed ? { scale: 0.98 } : undefined}
          onClick={onNext}
          disabled={!confirmed}
          className="cosmic-cta w-full disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>{t('signup.mnemonic_reveal_cta')}</span>
          <div className="cosmic-cta-glow" aria-hidden="true" />
        </motion.button>
      </MouseGlowCard>
    </motion.div>
  );
}

function VerifyStep({
  position1,
  position2,
  value1,
  value2,
  onChange1,
  onChange2,
  error,
  onSubmit,
  onBack,
}: {
  position1: number;
  position2: number;
  value1: string;
  value2: string;
  onChange1: (v: string) => void;
  onChange2: (v: string) => void;
  error: string;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="cosmic-glass-card relative"
    >
      <div className="cosmic-glow-border" aria-hidden="true" />
      <MouseGlowCard className="p-6 md:p-8 space-y-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-pure-white mb-2">
            {t('signup.mnemonic_verify_title')}
          </h2>
          <p className="text-soft-grey">{t('signup.mnemonic_verify_prompt')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VerifyInput
            label={t('signup.mnemonic_verify_word_position', { position: position1 })}
            value={value1}
            onChange={onChange1}
            onSubmit={onSubmit}
            autoFocus
          />
          <VerifyInput
            label={t('signup.mnemonic_verify_word_position', { position: position2 })}
            value={value2}
            onChange={onChange2}
            onSubmit={onSubmit}
          />
        </div>

        {error && (
          <div className="cosmic-alert-error text-sm" role="alert">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSubmit}
            className="cosmic-cta w-full"
          >
            <span>{t('signup.mnemonic_verify_cta')}</span>
            <div className="cosmic-cta-glow" aria-hidden="true" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="cosmic-btn-ghost"
          >
            {t('common.back')}
          </motion.button>
        </div>
      </MouseGlowCard>
    </motion.div>
  );
}

function VerifyInput({
  label,
  value,
  onChange,
  onSubmit,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.18em] text-soft-grey mb-2 block">
        {label}
      </span>
      <div className="cosmic-input-wrap">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cosmic-input cosmic-input-plain font-mono"
          autoComplete="off"
          autoFocus={autoFocus}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
        />
      </div>
    </label>
  );
}

// ============================================================================
// Icons (inline SVG — no new deps)
// ============================================================================

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.83 21.83 0 0 1-3.17 4.58" />
      <path d="M1 1l22 22" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/**
 * In memoriam — easter egg. Apparaît discrètement quand l'utilisateur
 * tape "ben" ou "benjamin" comme nom d'utilisateur, juste avant
 * validation. Hommage à un ami du développeur disparu ; texte gardé en
 * français, non traduit (une dédicace personnelle ne change pas de
 * langue selon la locale). Non bloquant : l'utilisateur peut valider
 * ce nom si c'est effectivement le sien.
 */
function InMemoriamBen({ username }: { username: string }) {
  const normalized = username.trim().toLowerCase();
  const matches = normalized === 'ben' || normalized === 'benjamin';

  return (
    <AnimatePresence>
      {matches && (
        <motion.div
          key="in-memoriam-ben"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="mt-3 flex items-center justify-center gap-3 select-none"
          aria-label="In memoriam"
        >
          <span
            aria-hidden="true"
            className="h-px w-10 bg-gradient-to-r from-transparent via-[rgba(233,200,122,0.55)] to-transparent"
          />
          <span
            className="italic text-lg tracking-wide"
            style={{
              fontFamily: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
              color: '#e9c87a',
              textShadow:
                '0 0 10px rgba(233, 200, 122, 0.55), 0 0 24px rgba(233, 200, 122, 0.22), 0 1px 0 rgba(0, 0, 0, 0.35)',
              backgroundImage:
                'linear-gradient(180deg, #f5d98a 0%, #e9c87a 45%, #b98b3a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Pour Ben
          </span>
          <span
            aria-hidden="true"
            className="h-px w-10 bg-gradient-to-r from-[rgba(233,200,122,0.55)] via-[rgba(233,200,122,0.55)] to-transparent"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
