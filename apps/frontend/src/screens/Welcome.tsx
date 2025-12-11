/**
 * Welcome Page - After DiceKey Account Creation
 * 
 * Affiche l'identifiant et les checksums, force l'utilisateur à se reconnecter
 * pour vérifier qu'il a bien noté ses informations
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

  if (!state || !state.userId || !state.checksums) {
    console.error('Missing state, redirecting to landing');
    // Si pas de state, rediriger vers landing
    navigate('/');
    return null;
  }

  const { userId, username, checksums } = state;

  // Generate 5 random checksums to verify on mount
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
      setRandomChecksums(indices.map(i => ({ index: i, value: checksums[i] })));
    }
  }, [checksums]);

  const copyUserId = () => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAllChecksums = () => {
    // Format: "1. abc123\n2. def456\n..."
    const formatted = checksums
      .map((checksum, idx) => `${idx + 1}. ${checksum}`)
      .join('\n');
    navigator.clipboard.writeText(formatted);
    setCopiedChecksums(true);
    setTimeout(() => setCopiedChecksums(false), 2000);
  };

  const handleStartVerification = () => {
    setVerificationStep('verify');
  };

  const handleVerification = async () => {
    // Check if all inputs match
    const allCorrect = randomChecksums.every((item, idx) => {
      return userInputs[idx].toLowerCase().trim() === item.value.toLowerCase().trim();
    });

    if (!allCorrect) {
      setVerificationError(t('welcome.verification_error'));
      return;
    }

    // Verification successful! Now create the account
    setIsCreatingAccount(true);
    setVerificationError('');

    try {
      // Get pending signup data
      const pendingSignup = sessionStorage.getItem('pendingSignup');
      if (!pendingSignup) {
        throw new Error(t('welcome.error_data_missing'));
      }

      const signupData = JSON.parse(pendingSignup);

      // Verify data integrity
      if (signupData.userId !== userId || signupData.username !== username) {
        throw new Error(t('welcome.error_data_inconsistent'));
      }

      // ⚠️ CRITICAL: Verify masterKeyHex is present
      if (!signupData.masterKeyHex) {
        console.error('[Welcome] ⚠️ CRITICAL: masterKeyHex is missing from pendingSignup!');
        throw new Error(t('welcome.error_master_key_missing'));
      }

      // ⚠️ CRITICAL: Verify keySet is present
      if (!signupData.keySet) {
        console.error('[Welcome] ⚠️ CRITICAL: keySet is missing from pendingSignup!');
        throw new Error(t('welcome.error_data_missing'));
      }

      // Create account via API with all public keys
      // The backend will derive the same userId from identityPublicKey
      const response = await fetch(`${API_BASE_URL}/api/v2/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: signupData.username,
          method: 'dice-key',
          masterKeyHex: signupData.masterKeyHex,
          avatarHash: signupData.avatarHash,
          checksums: signupData.checksums, // Include checksums for recovery assistance
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

      // Store tokens and user info temporarily for password setup
      sessionStorage.setItem('tempAccessToken', responseData.accessToken);
      sessionStorage.setItem('tempRefreshToken', responseData.refreshToken);
      sessionStorage.setItem('tempUserId', responseData.id);
      sessionStorage.setItem('tempUserSecurityTier', responseData.securityTier);
      sessionStorage.setItem('tempUsername', signupData.username);

      // Navigate to password setup (LoginNew will detect these and go to setpassword step)
      navigate('/login', {
        state: {
          autoSetPassword: true,
          username: signupData.username
        }
      });
    } catch (error: any) {
      console.error('Account creation error:', error);
      setVerificationError(`❌ ${error.message || 'Erreur lors de la création du compte'}`);
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
    <div className="dark-matter-bg min-h-screen flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-3xl w-full"
      >
        {/* Success Header with Particles */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="text-7xl mb-4"
          >
            🎉
          </motion.div>

          <motion.h1
            className="text-4xl font-black mb-4 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
            animate={{
              textShadow: [
                '0 0 20px rgba(0, 229, 255, 0.4)',
                '0 0 40px rgba(0, 229, 255, 0.6)',
                '0 0 20px rgba(0, 229, 255, 0.4)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {t('welcome.title')}
          </motion.h1>

          <p className="text-soft-grey text-xl">
            {t('welcome.subtitle')}
          </p>
        </div>

        {/* User ID Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 mb-6"
        >
          <label className="text-xs uppercase tracking-wider text-muted-grey font-semibold mb-2 block">
            {t('welcome.unique_id')}
          </label>
          <div className="flex items-center gap-3 justify-between">
            <motion.code
              className="text-3xl font-bold font-mono"
              style={{ color: 'var(--quantum-cyan)' }}
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
              className="p-3 rounded-lg bg-dark-matter-lighter hover:bg-quantum-cyan/20 transition-colors"
              title="Copier"
              aria-label={copied ? 'Identifiant copié' : 'Copier l\'identifiant unique'}
            >
              {copied ? '✅' : '📋'}
            </motion.button>
          </div>
          <p className="text-sm text-soft-grey mt-2">@{username}</p>
        </motion.div>

        {/* Checksums Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-pure-white flex items-center gap-2">
              {t('welcome.checksums', { count: checksums.length })}
            </h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={copyAllChecksums}
              className="px-3 py-2 text-sm rounded-lg bg-dark-matter-lighter hover:bg-quantum-cyan/20 transition-colors"
              title={t('welcome.copy_all')}
            >
              {copiedChecksums ? t('welcome.copied') : t('welcome.copy_all')}
            </motion.button>
          </div>

          <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto p-2">
            {checksums.map((checksum, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + idx * 0.01 }}
                className="flex flex-col items-center gap-1 p-2 bg-dark-matter-lighter rounded-lg hover:bg-dark-matter-light transition-colors"
              >
                <span className="text-quantum-cyan text-xs font-bold">{t('welcome.series_number', { number: idx + 1 })}</span>
                <span className="checksum text-center text-sm">{checksum}</span>
              </motion.div>
            ))}
          </div>

          {/* SECURITY FIX VULN-005: Sanitize translation HTML */}
          <p className="text-xs text-muted-grey mt-4 text-center" dangerouslySetInnerHTML={createSafeHTML(t('welcome.note_numbered'))} />
        </motion.div>

        {/* Critical Warning */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass-card p-6 mb-8 border-l-4"
          style={{ borderLeftColor: 'var(--error-glow)' }}
        >
          <div className="flex items-start gap-4">
            <motion.span
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-4xl"
            >
              ⚠️
            </motion.span>
            <div>
              <h4 className="font-bold text-pure-white mb-3 text-xl">
                {t('welcome.critical_warning')}
              </h4>
              {/* SECURITY FIX VULN-005: Sanitize all translation HTML */}
              <div className="space-y-3 text-sm text-soft-grey">
                <div className="flex items-start gap-2">
                  <span className="text-quantum-cyan font-bold">1.</span>
                  <span dangerouslySetInnerHTML={createSafeHTML(t('welcome.warning_id', { id: userId }))} />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-quantum-cyan font-bold">2.</span>
                  <span dangerouslySetInnerHTML={createSafeHTML(t('welcome.warning_checksums'))} />
                </div>
              </div>
              <div className="mt-4 p-3 bg-error-glow/10 rounded-lg">
                <p className="text-xs text-pure-white" dangerouslySetInnerHTML={createSafeHTML(t('welcome.zero_knowledge'))} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
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
              className="btn btn-primary text-xl px-12 py-4"
              style={{
                background: 'linear-gradient(135deg, var(--quantum-cyan), var(--magenta-trust))',
              }}
            >
              {t('welcome.noted_verify')}
            </motion.button>

            <p className="text-xs text-muted-grey mt-4">
              {t('welcome.verify_hint')}
            </p>
          </motion.div>
        )}

        {/* Verification Step */}
        {verificationStep === 'verify' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <div className="glass-card p-8">
              <h3 className="text-2xl font-bold mb-4 text-pure-white text-center">
                {t('welcome.verification_title')}
              </h3>
              <p className="text-soft-grey text-center mb-6">
                {t('welcome.verification_desc')}
              </p>

              <div className="space-y-4 mb-6">
                {randomChecksums.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <span className="text-quantum-cyan font-mono font-bold w-24">
                      {t('welcome.series_label', { number: item.index + 1 })}
                    </span>
                    <input
                      type="text"
                      value={userInputs[idx]}
                      onChange={(e) => handleInputChange(idx, e.target.value)}
                      placeholder={t('welcome.checksum_placeholder')}
                      className="input flex-1 font-mono"
                      autoFocus={idx === 0}
                    />
                  </div>
                ))}
              </div>

              {verificationError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 bg-error-glow/10 border border-error-glow/30 rounded-lg"
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
                  className="btn btn-ghost flex-1"
                >
                  {t('welcome.back')}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleVerification}
                  disabled={userInputs.some(input => input.trim() === '') || isCreatingAccount}
                  className="btn btn-primary flex-1"
                >
                  {isCreatingAccount ? t('welcome.creating_account') : t('welcome.verify_create')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Security Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex justify-center gap-3 mt-8"
        >
          <div className="badge badge-quantum">🔐 {t('welcome.security_badges.zero_knowledge')}</div>
          <div className="badge badge-trust">🌌 {t('welcome.security_badges.entropy')}</div>
          <div className="badge badge-quantum">🎲 {t('welcome.security_badges.dicekey')}</div>
        </motion.div>
      </motion.div>
    </div>
  );
}
