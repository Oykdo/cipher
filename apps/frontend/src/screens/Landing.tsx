import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../components/LanguageSelector';
import { readVaultBridgeContext, type VaultBridgeContext } from '../lib/vaultBridge';
import '../styles/fluidCrypto.css';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import { formatVaultHandle } from '../lib/vaultHandle';
import { EIDOLON_CONNECT_ENABLED } from '../config';

export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [vaultBridge, setVaultBridge] = useState<VaultBridgeContext | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadVaultBridge = async () => {
      const result = await readVaultBridgeContext();
      if (!mounted) return;
      setVaultBridge(result.ok ? result.context ?? null : null);
    };

    loadVaultBridge();
    window.addEventListener('focus', loadVaultBridge);
    return () => {
      mounted = false;
      window.removeEventListener('focus', loadVaultBridge);
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

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
          >
            {EIDOLON_CONNECT_ENABLED && vaultBridge && (
              <motion.button
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/login', { state: { preselectVault: true } })}
                className="cosmic-glass-card cosmic-method-card border border-cyan-400/12 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_40%),linear-gradient(180deg,rgba(34,211,238,0.07),rgba(15,23,42,0.24))] p-5 text-left cursor-pointer md:col-span-3 relative overflow-hidden"
              >
                <div className="cosmic-glow-border" aria-hidden="true" />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-10 top-0 h-24 bg-[radial-gradient(circle,rgba(125,211,252,0.14),transparent_72%)] blur-2xl"
                />
                <div className="relative flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.85)]" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-100/60">
                        {t('landing.eidolon_context_badge')}
                      </div>
                      <h3 className="truncate font-mono text-xl font-semibold text-pure-white md:text-2xl">
                        {formatVaultHandle(vaultBridge.vault_name, vaultBridge.vault_number)}
                      </h3>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-cyan-100/88">
                    <span>{t('landing.eidolon_context_continue')}</span>
                    <span aria-hidden="true" className="text-lg leading-none">→</span>
                  </div>
                </div>
              </motion.button>
            )}

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
            className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
          >
            <FeatureCard title={t('landing.feature_connect_title')} description={t('landing.feature_connect_desc')} />
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
