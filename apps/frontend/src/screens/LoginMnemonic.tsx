/**
 * Interim login flow — recover a session from a BIP-39 mnemonic.
 *
 * Used while the Eidolon ecosystem (vault-based login) is pre-release.
 * Rendered from LoginNew.tsx when EIDOLON_CONNECT_ENABLED is false.
 *
 * Security model: SRP-seed zero-knowledge. The mnemonic is used as the
 * SRP password — the server only ever sees a salt + verifier registered
 * at signup time. A standard SRP-6a handshake proves the client holds
 * the mnemonic without transmitting it. Server proof (M2) is verified
 * client-side to defeat a malicious server.
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { API_BASE_URL } from '../config';
import { saveKnownAccount, clearPasswordCache } from '../lib/localStorage';
import { getErrorMessage } from '../lib/errors';
import {
  startSrpSeedLogin,
  continueSrpSeedLogin,
  deriveMasterKeyFromMnemonic,
} from '../lib/srpSeed';
import { getE2EEVault } from '../lib/keyVault';
import { setSessionMasterKey } from '../lib/masterKeyResolver';
import { setTemporaryMasterKey } from '../lib/secureKeyAccess';
import { initializeE2EE, publishKeyBundleToServer } from '../lib/e2ee/e2eeService';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import MouseGlowCard from '../components/MouseGlowCard';

interface LoginMnemonicProps {
  onBack?: () => void;
}

export default function LoginMnemonic({ onBack }: LoginMnemonicProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  const [username, setUsername] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const wordCount = mnemonic.trim().split(/\s+/).filter(Boolean).length;
  const canSubmit =
    username.trim().length >= 3 && (wordCount === 12 || wordCount === 24) && !loading;

  const handleSubmit = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const handle = startSrpSeedLogin(username, mnemonic);

      // Step 1 — /srp-seed/login/init: send {username, A} → get {salt, B, sessionId}
      const initRes = await fetch(`${API_BASE_URL}/api/v2/auth/srp-seed/login/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: handle.username,
          A: handle.clientEphemeral.public,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) {
        throw new Error(initData?.error || t('auth.mnemonic_login_init_error'));
      }

      const finish = continueSrpSeedLogin(handle, {
        salt: initData.salt,
        B: initData.B,
      });

      // Step 2 — /srp-seed/login/verify: send {username, M1, sessionId} → get tokens + M2
      const verifyRes = await fetch(`${API_BASE_URL}/api/v2/auth/srp-seed/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: handle.username,
          M1: finish.M1,
          sessionId: initData.sessionId,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData?.error || t('auth.mnemonic_login_verify_error'));
      }

      // Step 3 — validate the server's M2 proof. A MITM or malicious server
      // cannot produce M2 without knowing the verifier.
      try {
        finish.verifyServerProof(verifyData.M2);
      } catch {
        throw new Error(t('auth.mnemonic_login_proof_error'));
      }

      // Step 4 — derive the masterKey from the mnemonic (same formula as
      // backend signup) and initialize the E2EE KeyVault. Without this,
      // encrypted messages can't be sent ("KeyVault not initialized").
      try {
        const masterKeyHex = await deriveMasterKeyFromMnemonic(mnemonic);
        try { await setSessionMasterKey(masterKeyHex); } catch (e) { console.warn('[login-mnemonic] session masterKey cache failed', e); }
        try { await setTemporaryMasterKey(masterKeyHex); } catch (e) { console.warn('[login-mnemonic] persist masterKey failed', e); }
        try { await getE2EEVault(masterKeyHex); } catch (e) { console.warn('[login-mnemonic] E2EE vault init failed', e); }
      } catch (deriveErr) {
        console.error('[login-mnemonic] failed to derive masterKey for E2EE init', deriveErr);
      }

      setSession({
        user: {
          id: verifyData.user.id,
          username: verifyData.user.username,
          securityTier: verifyData.user.securityTier,
        },
        accessToken: verifyData.accessToken,
        refreshToken: verifyData.refreshToken,
      });

      // Initialize E2EE + publish key bundle to server. Must run AFTER
      // setSession so the access token is in the auth store for the
      // publish API call. We await an explicit second publish because the
      // one inside initializeE2EE is fire-and-forget (silent on failure).
      try {
        await initializeE2EE(verifyData.user.username);
        try {
          await publishKeyBundleToServer();
          console.log('✅ [login-mnemonic] Key bundle published to server');
        } catch (pubErr) {
          console.error('❌ [login-mnemonic] Key bundle publish failed', pubErr);
        }
      } catch (e2eeErr) {
        console.warn('[login-mnemonic] E2EE init failed', e2eeErr);
      }

      saveKnownAccount({
        username: verifyData.user.username,
        securityTier: verifyData.user.securityTier,
        quickUnlockEnabled: false,
      });
      clearPasswordCache(verifyData.user.username);

      navigate('/conversations');
    } catch (err) {
      setError(getErrorMessage(err, t('auth.mnemonic_login_generic_error')));
    } finally {
      setLoading(false);
    }
  }, [username, mnemonic, setSession, navigate, t]);

  return (
    <div className="signup-screen relative min-h-screen overflow-hidden">
      <div className="cosmic-ambient" aria-hidden="true">
        <div className="cosmic-stars" />
        <div className="cosmic-nebula" />
        <div className="cosmic-volumetric" />
      </div>

      <div className="flex items-center justify-center min-h-screen p-6 md:p-8 relative z-10">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <CosmicConstellationLogo />
            <h1 className="cosmic-title text-4xl md:text-5xl font-black mb-3">
              <span className="cosmic-title-cipher">{t('auth.mnemonic_login_title')}</span>
            </h1>
            <p className="text-soft-grey text-base md:text-lg">
              {t('auth.mnemonic_login_subtitle')}
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="cosmic-glass-card relative"
          >
            <div className="cosmic-glow-border" aria-hidden="true" />
            <MouseGlowCard className="p-6 md:p-8 space-y-6">
              <label className="block">
                <span className="text-sm text-soft-grey mb-2 block">
                  {t('auth.mnemonic_login_username_label')}
                </span>
                <div className="cosmic-input-wrap">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('auth.mnemonic_login_username_placeholder')}
                    className="cosmic-input cosmic-input-plain"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm text-soft-grey mb-2 flex items-center justify-between">
                  <span>{t('auth.mnemonic_login_phrase_label')}</span>
                  <span className="text-xs tabular-nums text-soft-grey/70">
                    {t('auth.mnemonic_login_word_count', { count: wordCount })}
                  </span>
                </span>
                <textarea
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  placeholder={t('auth.mnemonic_login_phrase_placeholder')}
                  className="cosmic-input cosmic-input-plain font-mono min-h-[6rem] resize-y"
                  rows={3}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>

              {error && (
                <div className="cosmic-alert-error text-sm" role="alert">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <motion.button
                  whileHover={canSubmit ? { scale: 1.02 } : undefined}
                  whileTap={canSubmit ? { scale: 0.98 } : undefined}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="cosmic-cta w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>
                    {loading
                      ? t('auth.mnemonic_login_cta_loading')
                      : t('auth.mnemonic_login_cta')}
                  </span>
                  <div className="cosmic-cta-glow" aria-hidden="true" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => (onBack ? onBack() : navigate('/'))}
                  className="cosmic-btn-ghost"
                >
                  {t('common.back')}
                </motion.button>
              </div>

              <p className="text-xs text-soft-grey/70 text-center pt-2">
                {t('auth.mnemonic_login_hint')}
              </p>
            </MouseGlowCard>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
