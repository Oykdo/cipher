import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../components/LanguageSelector';
import '../styles/fluidCrypto.css';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import { API_BASE_URL } from '../config';
import {
  getLastUsedAccount,
  hasLocalPassword,
  type LocalAccount,
} from '../lib/localStorage';
import { hashPassword } from '../lib/passwordPolicy';
import { getE2EEVault, getKeyVault } from '../lib/keyVault';
import { setSessionMasterKey } from '../lib/masterKeyResolver';
import { setTemporaryMasterKey } from '../lib/secureKeyAccess';
import { initializeE2EE } from '../lib/e2ee/e2eeService';
import { useAuthStore } from '../store/auth';
import * as srp from 'secure-remote-password/client';

export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [quickAccount, setQuickAccount] = useState<LocalAccount | null>(null);

  // Detect a returning user : if a known account exists on this device
  // AND it was provisioned with a quick-unlock password (pwd_<username>
  // present), show the Quick Unlock banner above the usual entry points.
  useEffect(() => {
    const account = getLastUsedAccount();
    if (account && hasLocalPassword(account.username)) {
      setQuickAccount(account);
    } else {
      setQuickAccount(null);
    }
  }, []);

  return (
    <div className="cosmic-scene min-h-screen flex flex-col">
      <div aria-hidden="true">
        <div className="cosmic-nebula">
          <div className="cosmic-nebula-layer" />
        </div>
        <div className="cosmic-stars" />
        <div className="cosmic-p2p-grid">
          <span className="cosmic-p2p-node" style={{ top: '14%', left: '14%' }} />
          <span className="cosmic-p2p-node" style={{ top: '32%', right: '20%' }} />
          <span className="cosmic-p2p-node" style={{ bottom: '28%', left: '26%' }} />
          <span className="cosmic-p2p-node" style={{ bottom: '18%', right: '16%' }} />
        </div>
        <div className="cosmic-volumetric" />
      </div>

      <div className="absolute top-6 right-6 z-50">
        <LanguageSelector />
      </div>

      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <div key="landing" className="max-w-6xl w-full">
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.4, 0.0, 0.2, 1] }}
            className="text-center mb-16"
          >
            <CosmicConstellationLogo />
            <motion.h1 className="cosmic-title text-7xl font-black mb-6">
              <span className="cosmic-title-cipher">Cipher</span>{' '}
              <span className="cosmic-title-pulse">Desktop</span>
            </motion.h1>
            <p className="cosmic-tagline mb-6">{t('landing.hero_tagline')}</p>

            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-3xl font-bold mb-4 text-pure-white"
            >
              {t('landing.hero_title')}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="text-xl text-soft-grey max-w-2xl mx-auto"
            >
              {t('landing.hero_description')}
              <br />
              {t('landing.hero_description_2')}
            </motion.p>
          </motion.div>

          {quickAccount && (
            <QuickUnlockBandeau
              account={quickAccount}
              onSwitchAccount={() => setQuickAccount(null)}
            />
          )}

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
          >
            <motion.button
              whileHover={{ scale: 1.05, y: -8 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/signup')}
              className="cosmic-glass-card cosmic-method-card relative flex min-h-[270px] flex-col p-8 text-left cursor-pointer"
            >
              <div className="cosmic-glow-border" aria-hidden="true" />
              <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100/60">
                {t('landing.signup_kicker')}
              </div>
              <motion.h3
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="mb-4 text-4xl font-bold cosmic-title-pulse lg:text-5xl"
              >
                {t('landing.signup_title')}
              </motion.h3>
              <p className="max-w-sm text-soft-grey">
                {t('landing.signup_cta_desc')}
              </p>
              <div className="mt-auto pt-8 text-sm font-medium text-cyan-100/88">
                {t('landing.signup_cta_footer')} →
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05, y: -8 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/login')}
              className="cosmic-glass-card cosmic-method-card relative flex min-h-[270px] flex-col p-8 text-left cursor-pointer"
            >
              <div className="cosmic-glow-border" aria-hidden="true" />
              <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100/60">
                {t('landing.login_kicker')}
              </div>
              <motion.h3
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="mb-4 text-4xl font-bold cosmic-title-pulse lg:text-5xl"
              >
                {t('landing.login_title')}
              </motion.h3>
              <p className="max-w-sm text-soft-grey">
                {t('landing.login_cta_desc')}
              </p>
              <div className="mt-auto pt-8 text-sm font-medium text-cyan-100/88">
                {t('landing.login_cta_footer')} →
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05, y: -8 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/discover')}
              className="cosmic-glass-card cosmic-method-card relative flex min-h-[270px] flex-col p-8 text-left cursor-pointer"
            >
              <div className="cosmic-glow-border" aria-hidden="true" />
              <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-200/60">
                {t('landing.discover_kicker')}
              </div>
              <motion.h3
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className="mb-4 text-4xl font-bold md:text-5xl"
                style={{ color: 'var(--cosmic-violet)' }}
              >
                {t('landing.discover_title')}
              </motion.h3>
              <p className="max-w-sm text-soft-grey">
                {t('landing.discover_cta_desc')}
              </p>
              <div className="mt-auto pt-8 text-sm font-medium text-violet-100/88">
                {t('landing.discover_cta_footer')} →
              </div>
            </motion.button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
          >
            <FeatureCard title={t('landing.feature_e2e_title')} description={t('landing.feature_e2e_desc')} />
            <FeatureCard title={t('landing.feature_local_session_title')} description={t('landing.feature_local_session_desc')} />
            <FeatureCard title={t('landing.feature_portable_data_title')} description={t('landing.feature_portable_data_desc')} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.8 }}
            className="text-center"
          >
            <p className="text-xs text-muted-grey">{t('landing.footer_tech_stack')}</p>
            <p className="text-xs text-muted-grey mt-2">{t('landing.footer_built_with')}</p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <motion.div whileHover={{ scale: 1.05 }} className="cosmic-glass-card cosmic-method-card p-4 text-center relative">
      <div className="cosmic-glow-border" aria-hidden="true" />
      <h4 className="text-xl md:text-2xl font-bold mb-3 cosmic-title-pulse">{title}</h4>
      <p className="text-xs text-soft-grey">{description}</p>
    </motion.div>
  );
}

// ============================================================================
// QuickUnlockBandeau — returning-user entry point on the landing page.
// Kept elegant and pastille-free: just an avatar, the username, one password
// field and an unlock button. "Switch account" lets the user fall back to the
// standard signup/login grid below.
// ============================================================================

function QuickUnlockBandeau({
  account,
  onSwitchAccount,
}: {
  account: LocalAccount;
  onSwitchAccount: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  const normalizedUsername = useMemo(() => account.username.toLowerCase(), [account.username]);
  const avatarInitial = account.username.charAt(0).toUpperCase();

  const handleUnlock = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (unlocking || !password) return;
    setUnlocking(true);
    setError('');
    try {
      // 1. Verify the local PBKDF2 hash first — avoids hitting the server
      //    on a typo and keeps the error fast.
      const storedHash =
        localStorage.getItem(`pwd_${normalizedUsername}`) ??
        localStorage.getItem(`pwd_${account.username}`);
      if (!storedHash) throw new Error(t('landing.quick_unlock_error_not_provisioned'));

      const candidateHash = await hashPassword(password, normalizedUsername);
      if (candidateHash !== storedHash) {
        throw new Error(t('landing.quick_unlock_error_wrong_password'));
      }

      // 2. Unseal KeyVault → recover masterKey for E2EE + caches.
      const vault = await getKeyVault(password);
      const masterKey =
        (await vault.getData(`masterKey:${normalizedUsername}`)) ??
        (await vault.getData(`masterKey:${account.username}`));
      if (!masterKey) throw new Error(t('landing.quick_unlock_error_no_masterkey'));

      await setSessionMasterKey(masterKey);
      try { await setTemporaryMasterKey(masterKey); } catch { /* non-blocking */ }
      try { await getE2EEVault(masterKey); } catch { /* non-blocking */ }

      // 3. SRP login against the server to obtain a fresh JWT.
      const ephemeral = srp.generateEphemeral();
      const initResp = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedUsername, A: ephemeral.public }),
      });
      if (!initResp.ok) {
        throw new Error(t('landing.quick_unlock_error_server'));
      }
      const { salt, B, sessionId } = await initResp.json();
      const privateKey = srp.derivePrivateKey(salt, normalizedUsername, password);
      const session = srp.deriveSession(ephemeral.secret, B, salt, normalizedUsername, privateKey);

      const verifyResp = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedUsername, M1: session.proof, sessionId }),
      });
      if (!verifyResp.ok) {
        throw new Error(t('landing.quick_unlock_error_wrong_password'));
      }
      const data = await verifyResp.json();

      try { await initializeE2EE(data.user.username); } catch { /* non-blocking */ }

      setSession({
        user: {
          id: data.user.id,
          username: data.user.username,
          securityTier: data.user.securityTier,
        },
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      navigate('/conversations');
    } catch (err: any) {
      setError(err?.message ?? t('landing.quick_unlock_error_generic'));
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleUnlock}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="cosmic-glass-card relative mx-auto mb-10 flex w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-[22px] border border-[rgba(0,240,255,0.22)] px-6 py-5 md:flex-row md:items-center"
      aria-label={t('landing.quick_unlock_title')}
    >
      <div className="cosmic-glow-border rounded-[22px]" aria-hidden="true" />

      <div className="flex items-center gap-3 md:flex-1">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/70 to-violet-500/70 text-lg font-bold text-white shadow-[0_0_18px_rgba(0,240,255,0.25)]">
          {avatarInitial}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">
            {t('landing.quick_unlock_title')}
          </p>
          <p className="truncate text-base font-semibold text-pure-white">@{account.username}</p>
        </div>
      </div>

      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
            placeholder={t('landing.quick_unlock_password_placeholder')}
            className="cosmic-input cosmic-input-plain w-full pr-14"
            autoComplete="current-password"
            disabled={unlocking}
            aria-label={t('landing.quick_unlock_password_label')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.18em] text-soft-grey hover:text-pure-white transition-colors"
            disabled={unlocking}
            aria-label={showPassword ? t('common.hide_password') : t('common.show_password')}
          >
            {showPassword ? t('common.hide') : t('common.show')}
          </button>
        </div>
        <button
          type="submit"
          disabled={!password || unlocking}
          className="cosmic-cta whitespace-nowrap text-sm"
        >
          <span>
            {unlocking
              ? t('landing.quick_unlock_unlocking')
              : t('landing.quick_unlock_unlock_button')}
          </span>
          <div className="cosmic-cta-glow" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={onSwitchAccount}
        className="cosmic-btn-ghost shrink-0 text-xs"
        disabled={unlocking}
      >
        {t('landing.quick_unlock_switch_account')}
      </button>

      <AnimatePresence>
        {error && (
          <motion.p
            key="qu-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full text-center text-xs text-red-300 md:text-right"
            role="alert"
            aria-live="polite"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.form>
  );
}
