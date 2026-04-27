/**
 * Welcome.tsx — DiceKey post-onboarding signup screen.
 *
 * STATUS (privacy-l1, 2026-04-27): NEEDS REFACTOR.
 *
 * This screen still POSTs `masterKeyHex` and `checksums` to /api/v2/auth/
 * signup. After privacy-l1 the backend rejects those fields with HTTP 400.
 * No active code path navigates here — it is reachable only by direct URL
 * — so the live signup (BIP-39 via SignupMnemonic.tsx) is unaffected.
 *
 * To re-enable DiceKey signup, mirror the SignupMnemonic refactor:
 *   1. Compute srpSalt + srpVerifier locally (computeSrpPasswordSetup or
 *      a dice-key equivalent — masterKeyHex stays on the device).
 *   2. POST signup with { username, method: 'dice-key', srpSalt,
 *      srpVerifier, identityPublicKey, signaturePublicKey, signedPreKey,
 *      oneTimePreKeys, avatarHash } only.
 *   3. Initialize KeyVault locally with the masterKeyHex.
 *
 * Tracked as L1-T13 in the privacy-l1 sprint (see TaskList).
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import { createSafeHTML } from '../lib/sanitize';
import '../styles/fluidCrypto.css';

interface WelcomeState {
  userId: string;
  username: string;
  checksums: string[];
}

function CosmicConstellationLogo() {
  return (
    <svg viewBox="0 0 96 96" className="cosmic-constellation" aria-hidden="true">
      <defs>
        <linearGradient id="welcomeCosmicCoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="100%" stopColor="#7b2fff" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="19" fill="none" stroke="rgba(0,240,255,0.28)" strokeWidth="1.5">
        <animate attributeName="r" values="16;21;16" dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.95;0.4" dur="4s" repeatCount="indefinite" />
      </circle>
      <path d="M20 30L48 48L73 20M48 48L25 73L74 74M48 48L76 46" fill="none" stroke="rgba(200,220,255,0.4)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="48" cy="48" r="7" fill="url(#welcomeCosmicCoreGradient)" />
      <circle cx="20" cy="30" r="3.5" fill="#d9e3ff" />
      <circle cx="73" cy="20" r="3" fill="#8ce8ff" />
      <circle cx="25" cy="73" r="3" fill="#b78fff" />
      <circle cx="74" cy="74" r="2.8" fill="#d9e3ff" />
      <circle cx="76" cy="46" r="2.5" fill="#8ce8ff" />
    </svg>
  );
}

export default function Welcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as WelcomeState | null;

  const [copied, setCopied] = useState(false);
  const [copiedChecksums, setCopiedChecksums] = useState(false);
  const [verificationStep, setVerificationStep] = useState<'display' | 'verify'>('display');
  const [randomChecksums, setRandomChecksums] = useState<{ index: number; value: string }[]>([]);
  const [userInputs, setUserInputs] = useState<string[]>(Array(5).fill(''));
  const [verificationError, setVerificationError] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const missingState = !state || !state.userId || !state.checksums;
  const userId = state?.userId ?? '';
  const username = state?.username ?? '';
  const checksums = state?.checksums ?? [];

  useEffect(() => {
    if (missingState) {
      console.error('Missing state, redirecting to landing');
      navigate('/');
    }
  }, [missingState, navigate]);

  useEffect(() => {
    if (checksums.length === 30) {
      const indices: number[] = [];
      while (indices.length < 5) {
        const rand = Math.floor(Math.random() * 30);
        if (!indices.includes(rand)) {
          indices.push(rand);
        }
      }
      indices.sort((a, b) => a - b);
      setRandomChecksums(indices.map((i) => ({ index: i, value: checksums[i] })));
    }
  }, [checksums]);

  if (missingState) {
    return null;
  }

  const copyUserId = () => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAllChecksums = () => {
    const formatted = checksums.map((checksum, idx) => `${idx + 1}. ${checksum}`).join('\n');
    navigator.clipboard.writeText(formatted);
    setCopiedChecksums(true);
    setTimeout(() => setCopiedChecksums(false), 2000);
  };

  const handleStartVerification = () => {
    setVerificationStep('verify');
  };

  const handleVerification = async () => {
    const allCorrect = randomChecksums.every((item, idx) => {
      return userInputs[idx].toLowerCase().trim() === item.value.toLowerCase().trim();
    });

    if (!allCorrect) {
      setVerificationError(t('welcome.verification_error'));
      return;
    }

    setIsCreatingAccount(true);
    setVerificationError('');

    try {
      const pendingSignup = sessionStorage.getItem('pendingSignup');
      if (!pendingSignup) {
        throw new Error(t('welcome.error_data_missing'));
      }

      const signupData = JSON.parse(pendingSignup);

      if (signupData.userId !== userId || signupData.username !== username) {
        throw new Error(t('welcome.error_data_inconsistent'));
      }

      if (!signupData.masterKeyHex) {
        console.error('[Welcome] CRITICAL: masterKeyHex is missing from pendingSignup');
        throw new Error(t('welcome.error_master_key_missing'));
      }

      if (!signupData.keySet) {
        console.error('[Welcome] CRITICAL: keySet is missing from pendingSignup');
        throw new Error(t('welcome.error_data_missing'));
      }

      const response = await fetch(`${API_BASE_URL}/api/v2/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: signupData.username,
          method: 'dice-key',
          masterKeyHex: signupData.masterKeyHex,
          avatarHash: signupData.avatarHash,
          checksums: signupData.checksums,
          identityPublicKey: signupData.keySet.identityKey.publicKey,
          signaturePublicKey: signupData.keySet.signatureKey.publicKey,
          signedPreKey: {
            keyId: signupData.keySet.signedPreKey.keyId,
            publicKey: signupData.keySet.signedPreKey.publicKey,
            signature: signupData.keySet.signedPreKey.signature,
            timestamp: signupData.keySet.signedPreKey.timestamp,
          },
          oneTimePreKeys: signupData.keySet.oneTimePreKeys.map((k: any) => ({
            keyId: k.keyId,
            publicKey: k.publicKey,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        console.error('Server error response:', errorData);
        const errorMsg = errorData.details?.join(', ') || errorData.message || errorData.error || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }

      const responseData = await response.json();

      sessionStorage.setItem('tempAccessToken', responseData.accessToken);
      sessionStorage.setItem('tempRefreshToken', responseData.refreshToken);
      sessionStorage.setItem('tempUserId', responseData.id);
      sessionStorage.setItem('tempUserSecurityTier', responseData.securityTier);
      sessionStorage.setItem('tempUsername', signupData.username);

      navigate('/login', {
        state: {
          autoSetPassword: true,
          username: signupData.username,
        },
      });
    } catch (error: any) {
      console.error('Account creation error:', error);
      setVerificationError(`ERROR ${error.message || 'Erreur lors de la creation du compte'}`);
      setIsCreatingAccount(false);
    }
  };

  const handleInputChange = (index: number, value: string) => {
    const newInputs = [...userInputs];
    newInputs[index] = value;
    setUserInputs(newInputs);
    setVerificationError('');
  };

  return (
    <div className="cosmic-scene min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
      <div className="cosmic-nebula" aria-hidden="true" />
      <div className="cosmic-stars" aria-hidden="true" />
      <div className="cosmic-p2p-grid" aria-hidden="true" />
      <div className="cosmic-volumetric" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-3xl w-full relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="text-7xl mb-4 cosmic-title-pulse"
          >
            ACCESS
          </motion.div>

          <CosmicConstellationLogo />
          <motion.h1 className="cosmic-title text-4xl font-black mb-4">
            <span className="cosmic-title-cipher">{t('welcome.title')}</span>
          </motion.h1>

          <p className="text-soft-grey text-xl">{t('welcome.subtitle')}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="cosmic-glass-card p-6 mb-6 relative"
        >
          <div className="cosmic-glow-border" aria-hidden="true" />
          <label className="text-xs uppercase tracking-wider text-muted-grey font-semibold mb-2 block">
            {t('welcome.unique_id')}
          </label>
          <div className="flex items-center gap-3 justify-between">
            <motion.code
              className="text-3xl font-bold font-mono"
              style={{ color: 'var(--cosmic-cyan)' }}
              animate={{
                textShadow: [
                  '0 0 10px rgba(0, 229, 255, 0.4)',
                  '0 0 20px rgba(0, 229, 255, 0.6)',
                  '0 0 10px rgba(0, 229, 255, 0.4)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {userId}
            </motion.code>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={copyUserId}
              className="px-3 py-2 rounded-lg border border-[rgba(0,240,255,0.18)] bg-[rgba(10,18,40,0.7)] hover:bg-[rgba(0,240,255,0.12)] transition-colors text-xs font-semibold tracking-[0.2em]"
              title={t('common.copy')}
              aria-label={copied ? t('welcome.copied_id') : t('welcome.copy_id_aria')}
            >
              {copied ? t('common.done') : t('common.copy')}
            </motion.button>
          </div>
          <p className="text-sm text-soft-grey mt-2">@{username}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="cosmic-glass-card p-6 mb-6 relative"
        >
          <div className="cosmic-glow-border" aria-hidden="true" />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-pure-white flex items-center gap-2">
              <span className="cosmic-badge-cyan">VAULT</span>
              {t('welcome.checksums', { count: checksums.length })}
            </h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={copyAllChecksums}
              className="px-3 py-2 text-sm rounded-lg border border-[rgba(0,240,255,0.18)] bg-[rgba(10,18,40,0.7)] hover:bg-[rgba(0,240,255,0.12)] transition-colors"
              title={t('welcome.copy_all')}
            >
              {copiedChecksums ? t('common.done') : t('welcome.copy_all')}
            </motion.button>
          </div>

          <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto p-2">
            {checksums.map((checksum, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + idx * 0.01 }}
                className="flex flex-col items-center gap-1 p-2 bg-dark-matter-lighter rounded-lg hover:bg-dark-matter-light transition-colors border border-[rgba(0,240,255,0.12)]"
              >
                <span className="text-xs font-bold" style={{ color: 'var(--cosmic-cyan)' }}>
                  {t('welcome.series_number', { number: idx + 1 })}
                </span>
                <span className="checksum text-center text-sm">{checksum}</span>
              </motion.div>
            ))}
          </div>

          <p className="text-xs text-muted-grey mt-4 text-center" dangerouslySetInnerHTML={createSafeHTML(t('welcome.note_numbered'))} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="cosmic-glass-card p-6 mb-8 border-l-4 relative"
          style={{ borderLeftColor: 'var(--error-glow)' }}
        >
          <div className="cosmic-glow-border" aria-hidden="true" />
          <div className="flex items-start gap-4">
            <motion.span
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="cosmic-badge-violet"
            >
              {t('common.warning')}
            </motion.span>
            <div>
              <h4 className="font-bold text-pure-white mb-3 text-xl">
                {t('welcome.critical_warning')}
              </h4>
              <div className="space-y-3 text-sm text-soft-grey">
                <div className="flex items-start gap-2">
                  <span className="font-bold" style={{ color: 'var(--cosmic-cyan)' }}>1.</span>
                  <span dangerouslySetInnerHTML={createSafeHTML(t('welcome.warning_id', { id: userId }))} />
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold" style={{ color: 'var(--cosmic-cyan)' }}>2.</span>
                  <span dangerouslySetInnerHTML={createSafeHTML(t('welcome.warning_checksums'))} />
                </div>
              </div>
              <div className="mt-4 p-3 bg-error-glow/10 rounded-lg">
                <p className="text-xs text-pure-white" dangerouslySetInnerHTML={createSafeHTML(t('welcome.zero_knowledge'))} />
              </div>
            </div>
          </div>
        </motion.div>

        {verificationStep === 'display' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-center"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStartVerification}
              className="cosmic-cta text-xl px-12 py-4"
            >
              <span>{t('welcome.noted_verify')}</span>
              <div className="cosmic-cta-glow" aria-hidden="true" />
            </motion.button>

            <p className="text-xs text-muted-grey mt-4">{t('welcome.verify_hint')}</p>
          </motion.div>
        )}

        {verificationStep === 'verify' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <div className="cosmic-glass-card p-8 relative">
              <div className="cosmic-glow-border" aria-hidden="true" />
              <h3 className="text-2xl font-bold mb-4 text-pure-white text-center">
                {t('welcome.verification_title')}
              </h3>
              <p className="text-soft-grey text-center mb-6">{t('welcome.verification_desc')}</p>

              <div className="space-y-4 mb-6">
                {randomChecksums.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <span className="font-mono font-bold w-24" style={{ color: 'var(--cosmic-cyan)' }}>
                      {t('welcome.series_label', { number: item.index + 1 })}
                    </span>
                    <input
                      type="text"
                      value={userInputs[idx]}
                      onChange={(e) => handleInputChange(idx, e.target.value)}
                      placeholder={t('welcome.checksum_placeholder')}
                      className="cosmic-input cosmic-input-plain flex-1 font-mono"
                      autoFocus={idx === 0}
                    />
                  </div>
                ))}
              </div>

              {verificationError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="cosmic-alert-error mb-4"
                  role="alert"
                  aria-live="polite"
                >
                  <p className="text-sm text-error-glow">{verificationError}</p>
                </motion.div>
              )}

              <div className="flex gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setVerificationStep('display')}
                  disabled={isCreatingAccount}
                  className="cosmic-btn-ghost flex-1"
                >
                  {t('welcome.back')}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleVerification}
                  disabled={userInputs.some((input) => input.trim() === '') || isCreatingAccount}
                  className="cosmic-cta flex-1"
                >
                  <span>{isCreatingAccount ? t('welcome.creating_account') : t('welcome.verify_create')}</span>
                  <div className="cosmic-cta-glow" aria-hidden="true" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex justify-center gap-3 mt-8"
        >
          <div className="cosmic-badge-cyan">SECURE {t('welcome.security_badges.zero_knowledge')}</div>
          <div className="cosmic-badge-violet">VOID {t('welcome.security_badges.entropy')}</div>
          <div className="cosmic-badge-cyan">DICE {t('welcome.security_badges.dicekey')}</div>
        </motion.div>
      </motion.div>
    </div>
  );
}
