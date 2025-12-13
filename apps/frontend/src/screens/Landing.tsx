/**
 * Landing Page - Fluid Cryptography Edition
 * 
 * Page d'accueil avec 3 actions principales :
 * 1. S'inscrire (Signup)
 * 2. Se connecter (Login)
 * 3. Découvrir (About/Tech)
 * 
 * + Quick Unlock (MetaMask-style) si un compte existe localement
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import QuickUnlock from '../components/QuickUnlock';
import {
  clearLocalAccount,
  clearQuickConnectCache,
  getLastUsedAccount,
  getLocalAccounts,
  type LocalAccount,
} from '../lib/localStorage';
import { LanguageSelector } from '../components/LanguageSelector';
import '../styles/fluidCrypto.css';

type AccountSwitcherMode = 'landing' | 'quickUnlock' | 'switchAccount';

export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Quick Unlock state
  const [viewMode, setViewMode] = useState<AccountSwitcherMode>('landing');
  const [localAccount, setLocalAccount] = useState<LocalAccount | null>(null);
  const [hasMultipleAccounts, setHasMultipleAccounts] = useState(false);
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [openOptionsForUsername, setOpenOptionsForUsername] = useState<string | null>(null);

  // Check for local accounts on mount
  useEffect(() => {
    const lastAccount = getLastUsedAccount();
    const allAccounts = getLocalAccounts();
    setAccounts(allAccounts);

    // Only show quick unlock if we have valid accounts
    // Skip if localStorage has stale data (after DB clear)
    if (lastAccount && allAccounts.length > 0) {
      setLocalAccount(lastAccount);
      setHasMultipleAccounts(allAccounts.length > 1);
      setViewMode('quickUnlock');
    } else {
      // Clean up stale localStorage data
      if (allAccounts.length === 0) {
        localStorage.removeItem('cipher-pulse-auth');
      }
      setViewMode('landing');
    }
  }, []);

  return (
    <div className="dark-matter-bg min-h-screen flex flex-col">
      {/* Language Selector - Top Right */}
      <div className="absolute top-6 right-6 z-50">
        <LanguageSelector />
      </div>

      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          {/* Quick Unlock View (MetaMask-style) */}
          {viewMode === 'quickUnlock' && localAccount && (
            <QuickUnlock
              key="quickUnlock"
              account={localAccount}
              onSwitchAccount={hasMultipleAccounts ? () => {
                setViewMode('switchAccount');
              } : undefined}
              onCreateNew={() => setViewMode('landing')}
              onAccountDeleted={() => {
                // Refresh accounts list
                const nextAccounts = getLocalAccounts();
                setAccounts(nextAccounts);
                if (nextAccounts.length > 0) {
                  setLocalAccount(nextAccounts[0]);
                  setHasMultipleAccounts(nextAccounts.length > 1);
                } else {
                  setLocalAccount(null);
                  setViewMode('landing');
                }
              }}
            />
          )}

          {/* Account Switcher (pick a cached account without going to full login) */}
          {viewMode === 'switchAccount' && (
            <motion.div
              key="switchAccount"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center justify-center min-h-screen p-8"
            >
              <div className="max-w-md w-full">
                <div className="text-center mb-6">
                  <h2
                    className="text-3xl font-black mb-2 glow-text-cyan"
                    style={{ color: 'var(--quantum-cyan)' }}
                  >
                    🔄 {t('quick_unlock.switch_account')}
                  </h2>
                  <p className="text-soft-grey text-sm">
                    {t('settings.security_settings.cached_accounts', 'Comptes en cache')}
                  </p>
                </div>

                <div className="glass-card p-6 mb-4">
                  <div className="space-y-2">
                    {(accounts.length ? accounts : getLocalAccounts()).map((acct) => (
                      <div key={acct.username} className="relative">
                        <div className="flex items-stretch gap-2">
                          <button
                            type="button"
                            className="flex-1 text-left p-3 rounded-lg border border-slate-700 hover:border-brand-400 bg-slate-900/40 hover:bg-slate-900/70 transition-colors"
                            onClick={() => {
                              setOpenOptionsForUsername(null);
                              setLocalAccount(acct);
                              setHasMultipleAccounts((accounts.length ? accounts : getLocalAccounts()).length > 1);
                              setViewMode('quickUnlock');
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-pure-white font-semibold">@{acct.username}</div>
                                <div className="text-xs text-muted-grey">
                                  {acct.securityTier === 'dice-key'
                                    ? `🎲 ${t('auth.dicekey')}`
                                    : `🔑 ${t('auth.method_standard')}`}
                                </div>
                              </div>
                              <span className="text-soft-grey">→</span>
                            </div>
                          </button>

                          {/* 3-dots options */}
                          <button
                            type="button"
                            className="btn btn-ghost px-3"
                            aria-haspopup="menu"
                            aria-expanded={openOptionsForUsername === acct.username}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenOptionsForUsername((prev) => (prev === acct.username ? null : acct.username));
                            }}
                          >
                            ⋮
                          </button>
                        </div>

                        {openOptionsForUsername === acct.username && (
                          <div
                            role="menu"
                            className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-950 shadow-lg z-50 overflow-hidden"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="w-full text-left px-4 py-3 text-sm text-pure-white hover:bg-slate-900 transition-colors"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                const confirmText = t(
                                  'settings.security_settings.clear_cache_confirm',
                                  'Clear QuickConnect cache?'
                                );
                                if (!window.confirm(confirmText)) return;

                                clearQuickConnectCache();
                                const nextAccounts = getLocalAccounts();
                                setAccounts(nextAccounts);
                                setHasMultipleAccounts(nextAccounts.length > 1);
                                setOpenOptionsForUsername(null);
                              }}
                            >
                              🧹 {t('settings.security_settings.clear_cache', 'Vider le cache QuickConnect')}
                            </button>

                            <button
                              type="button"
                              role="menuitem"
                              className="w-full text-left px-4 py-3 text-sm text-error-glow hover:bg-slate-900 transition-colors"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                const confirmText = `⚠️ ${t(
                                  'settings.security_settings.forget_account',
                                  'Oublier ce compte'
                                )} @${acct.username} ?`;
                                if (!window.confirm(confirmText)) return;

                                clearLocalAccount(acct.username);
                                const nextAccounts = getLocalAccounts();
                                setAccounts(nextAccounts);
                                setHasMultipleAccounts(nextAccounts.length > 1);
                                setOpenOptionsForUsername(null);

                                if (nextAccounts.length === 0) {
                                  setLocalAccount(null);
                                  setViewMode('landing');
                                }
                              }}
                            >
                              🗑️ {t('settings.security_settings.forget_account', 'Supprimer le compte')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn btn-ghost flex-1"
                    onClick={() => setViewMode('quickUnlock')}
                  >
                    ← {t('common.back')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    onClick={() => setViewMode('landing')}
                  >
                    🔐 {t('auth.login_button')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Landing View (Standard) */}
          {viewMode === 'landing' && (
            <div key="landing" className="max-w-6xl w-full">
              {/* Logo / Title */}
              <motion.div
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.4, 0.0, 0.2, 1] }}
                className="text-center mb-16"
              >
                <motion.div
                  animate={{
                    textShadow: [
                      '0 0 20px rgba(0, 229, 255, 0.4)',
                      '0 0 40px rgba(0, 229, 255, 0.6)',
                      '0 0 20px rgba(0, 229, 255, 0.4)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="text-7xl font-black mb-6"
                  style={{ color: 'var(--quantum-cyan)' }}
                >
                  🔐 Cipher Pulse
                </motion.div>

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

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.8 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
              >
                {/* Button 1: S'inscrire */}
                <motion.button
                  whileHover={{ scale: 1.05, y: -8 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/signup')}
                  className="glass-card p-8 text-center card-hover cursor-pointer"
                  style={{
                    borderColor: 'var(--quantum-cyan)',
                    borderWidth: '2px',
                  }}
                >
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-6xl mb-4"
                  >
                    🎲
                  </motion.div>

                  <h3 className="text-2xl font-bold mb-3 text-pure-white">
                    {t('landing.signup_title')}
                  </h3>

                  <p className="text-soft-grey mb-4">
                    {t('landing.signup_description')}
                  </p>


                </motion.button>

                {/* Button 2: Se connecter */}
                <motion.button
                  whileHover={{ scale: 1.05, y: -8 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/login')}
                  className="glass-card p-8 text-center card-hover cursor-pointer"
                >
                  <motion.div
                    animate={{
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="text-6xl mb-4"
                  >
                    🔑
                  </motion.div>

                  <h3 className="text-2xl font-bold mb-3 text-pure-white">
                    {t('landing.login_title')}
                  </h3>

                  <p className="text-soft-grey mb-4">
                    {t('landing.login_description')}
                  </p>


                </motion.button>

                {/* Button 3: Découvrir */}
                <motion.button
                  whileHover={{ scale: 1.05, y: -8 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/discover')}
                  className="glass-card p-8 text-center card-hover cursor-pointer"
                  style={{
                    borderColor: 'var(--magenta-trust)',
                    borderWidth: '2px',
                  }}
                >
                  <motion.div
                    animate={{
                      scale: [1, 1.15, 1],
                    }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    className="text-6xl mb-4"
                  >
                    🌠
                  </motion.div>

                  <h3 className="text-2xl font-bold mb-3 text-pure-white">
                    {t('landing.discover_title')}
                  </h3>

                  <p className="text-soft-grey mb-4">
                    {t('landing.discover_description')}
                  </p>

                  <div className="flex flex-wrap gap-2 justify-center">
                    <span className="badge badge-quantum">
                      <span>🛡️</span>
                      <span>{t('landing.badge_post_quantum')}</span>
                    </span>
                    <span className="badge badge-trust">
                      <span>🔐</span>
                      <span>{t('landing.badge_self_sovereign')}</span>
                    </span>
                    <span className="badge badge-quantum">
                      <span>⚡</span>
                      <span>{t('landing.badge_instant')}</span>
                    </span>
                    <span className="badge badge-trust">
                      <span>🛡️</span>
                      <span>{t('landing.badge_zero_knowledge')}</span>
                    </span>
                    <span className="badge badge-trust">
                      <span>🧬</span>
                      <span>{t('landing.badge_crypto')}</span>
                    </span>
                    <span className="badge badge-quantum">
                      <span>🔬</span>
                      <span>{t('landing.badge_algo')}</span>
                    </span>
                    <span className="badge badge-trust">
                      <span>⏳</span>
                      <span>{t('landing.badge_timelock')}</span>
                    </span>
                    <span className="badge badge-quantum">
                      <span>🔥</span>
                      <span>{t('landing.badge_burn')}</span>
                    </span>
                  </div>
                </motion.button>
              </motion.div>

              {/* Features Grid */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.8 }}
                className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
              >
                <FeatureCard
                  icon="🔐"
                  title={t('landing.feature_e2e_title')}
                  description={t('landing.feature_e2e_desc')}
                />
                <FeatureCard
                  icon="🎲"
                  title={t('landing.feature_offline_keys_title')}
                  description={t('landing.feature_offline_keys_desc')}
                />
                <FeatureCard
                  icon="🔥"
                  title={t('landing.burn_after_reading_feature')}
                  description={t('landing.burn_description')}
                />
                <FeatureCard
                  icon="⏰"
                  title={t('landing.time_lock_feature')}
                  description={t('landing.timelock_description')}
                />
              </motion.div>

              {/* Footer Info */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 0.8 }}
                className="text-center"
              >
                <p className="text-xs text-muted-grey">
                  {t('landing.footer_tech_stack')}
                </p>
                <p className="text-xs text-muted-grey mt-2">
                  {t('landing.footer_built_with')}
                </p>

                {/* Back to Quick Unlock (if account exists) */}
                {localAccount && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2 }}
                    onClick={() => setViewMode('quickUnlock')}
                    className="mt-4 text-sm text-quantum-cyan hover:underline"
                  >
                    {t('landing.back_to_quick_unlock')}
                  </motion.button>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Animated Background Particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        {Array(20)
          .fill(null)
          .map((_, i) => (
            <motion.div
              key={i}
              initial={{
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                scale: 0,
              }}
              animate={{
                y: [null, Math.random() * window.innerHeight],
                scale: [0, 1, 0],
                opacity: [0, 0.5, 0],
              }}
              transition={{
                duration: Math.random() * 10 + 10,
                repeat: Infinity,
                delay: Math.random() * 5,
              }}
              className="absolute w-1 h-1 rounded-full"
              style={{
                background: i % 2 === 0 ? 'var(--quantum-cyan)' : 'var(--magenta-trust)',
                boxShadow:
                  i % 2 === 0
                    ? '0 0 10px var(--quantum-cyan-glow)'
                    : '0 0 10px var(--magenta-trust-glow)',
              }}
            />
          ))}
      </div>
    </div>
  );
}

// Helper Component
function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="glass-card p-4 text-center"
    >
      <div className="text-3xl mb-2">{icon}</div>
      <h4 className="text-sm font-bold text-pure-white mb-1">{title}</h4>
      <p className="text-xs text-soft-grey">{description}</p>
    </motion.div>
  );
}
