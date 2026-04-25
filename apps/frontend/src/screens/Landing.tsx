import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../components/LanguageSelector';
import '../styles/fluidCrypto.css';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import {
  getLastKnownAccount,
  hasLocalPassword,
  type LocalAccount,
} from '../lib/localStorage';

export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [knownAccount, setKnownAccount] = useState<LocalAccount | null>(null);

  // Detect a returning user — any account known on this device, regardless
  // of whether a quick-unlock password was provisioned. The banner is a
  // single CTA that redirects to /quick-connect, where the user will
  // either enter their password (unlock mode) or mnemonic + new password
  // (provision mode, for legacy accounts that predate the password step).
  // We re-probe on `focus` and `storage` so the banner state stays current
  // after a signup finishes in the same process.
  useEffect(() => {
    const refresh = () => {
      const account = getLastKnownAccount();
      if (import.meta.env.DEV) {
        console.log('[Landing] Quick Connect probe', {
          hasAccount: !!account,
          username: account?.username,
          hasPwd: account ? hasLocalPassword(account.username) : false,
        });
      }
      setKnownAccount(account);
    };

    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
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

          {knownAccount && (
            <QuickConnectBanner
              account={knownAccount}
              onClick={() => navigate('/quick-connect')}
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
// QuickConnectBanner — compact CTA on the landing page that redirects
// returning users to the dedicated /quick-connect screen, where they'll
// either unlock with their password or provision one if they never set
// it up (legacy mnemonic accounts).
// ============================================================================

function QuickConnectBanner({
  account,
  onClick,
}: {
  account: LocalAccount;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const avatarInitial = account.username.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="cosmic-glass-card relative mx-auto mb-10 flex w-full max-w-2xl items-center justify-between gap-4 overflow-hidden rounded-[22px] border border-[rgba(0,240,255,0.22)] px-5 py-4"
      role="region"
      aria-label={t('landing.quick_unlock_title')}
    >
      <div className="cosmic-glow-border rounded-[22px]" aria-hidden="true" />

      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/70 to-violet-500/70 text-base font-bold text-white shadow-[0_0_18px_rgba(0,240,255,0.25)]">
          {avatarInitial}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">
            {t('landing.quick_unlock_title')}
          </p>
          <p className="truncate text-base font-semibold text-pure-white">@{account.username}</p>
        </div>
      </button>

      <button
        type="button"
        onClick={onClick}
        className="cosmic-cta whitespace-nowrap text-sm !w-auto !px-5 !py-2.5"
      >
        <span>{t('landing.quick_unlock_unlock_button')} →</span>
        <div className="cosmic-cta-glow" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

