/**
 * QuickUnlock Component - MetaMask-style Quick Login
 * 
 * Allows users to unlock their wallet with just a password
 * when they've previously logged in on this device
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { type LocalAccount, hasLocalPassword, clearLocalAccount } from '../lib/localStorage';
import { API_BASE_URL } from '../config';
import { getE2EEVault, getKeyVault } from '../lib/keyVault';
import { initializeE2EE } from '../lib/e2ee/e2eeService';
import { setSessionMasterKey } from '../lib/masterKeyResolver';
import { setTemporaryMasterKey } from '../lib/secureKeyAccess';
import * as srp from 'secure-remote-password/client';
import { debugLogger } from "../lib/debugLogger";
import '../styles/fluidCrypto.css';

interface QuickUnlockProps {
  account: LocalAccount;
  onSwitchAccount?: () => void;
  onCreateNew?: () => void;
  onAccountDeleted?: () => void;
}

export default function QuickUnlock({ account, onSwitchAccount, onCreateNew, onAccountDeleted }: QuickUnlockProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);

  // Check if local password exists on mount
  useEffect(() => {
    setHasPassword(hasLocalPassword(account.username));
  }, [account.username]);

  // Hash password with PBKDF2
  async function hashPassword(password: string, salt: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: 10000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      setError(t('quick_unlock.enter_password_error'));
      return;
    }

    setUnlocking(true);
    setError('');

    try {
      // Verify password locally
      const normalizedUsername = account.username.toLowerCase();
      const storedHash = localStorage.getItem(`pwd_${normalizedUsername}`);
      if (!storedHash) {
        // Should not happen if hasPassword check works, but handle gracefully
        setHasPassword(false);
        throw new Error(t('quick_unlock.password_not_found'));
      }

      const passwordHash = await hashPassword(password, normalizedUsername);
      if (passwordHash !== storedHash) {
        throw new Error(t('quick_unlock.incorrect_password'));
      }

      // Get masterKey from KeyVault for this device
      let masterKey: string | null = null;
      try {
        const vault = await getKeyVault(password);
        masterKey = await vault.getData(`masterKey:${account.username}`);
      } catch (vaultError) {
        console.error('[QuickUnlock] Failed to open KeyVault:', vaultError);
      }

      if (!masterKey) {
        throw new Error(t('quick_unlock.master_key_not_found'));
      }

      // SECURITY: Store masterKey in memory for encryption only (never sent to server)
      await setSessionMasterKey(masterKey);

      // Persist for the session + initialize E2EE vault (keyed by masterKey)
      try {
        await setTemporaryMasterKey(masterKey);
      } catch (mkErr) {
        console.warn('[QuickUnlock] Failed to persist masterKey:', mkErr);
      }

      try {
        await getE2EEVault(masterKey);
      } catch (vaultInitErr) {
        console.warn('[QuickUnlock] Failed to init E2EE vault:', vaultInitErr);
      }

      // SECURITY: Use SRP for authentication (zero-knowledge)
      const ephemeral = srp.generateEphemeral();
      const initResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: account.username,
          A: ephemeral.public,
        }),
      });

      if (!initResponse.ok) {
        const errorData = await initResponse.json().catch(() => ({ error: t('errors.unknown_error') }));
        // Check if SRP is not configured
        if (errorData.error?.includes('not found') || errorData.error?.includes('SRP not configured')) {
          throw new Error(t('quick_unlock.srp_not_configured') || 'Account not configured for quick unlock. Please use full login or recreate your account.');
        }
        throw new Error(errorData.error || t('quick_unlock.connection_error'));
      }

      const initData = await initResponse.json();
      const { salt, B, sessionId } = initData;

      // Derive SRP session
      const privateKey = srp.derivePrivateKey(salt, account.username, password);
      const session = srp.deriveSession(ephemeral.secret, B, salt, account.username, privateKey);

      // Verify
      const verifyResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: account.username,
          M1: session.proof,
          sessionId,
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json().catch(() => ({ error: t('errors.unknown_error') }));
        throw new Error(errorData.error || t('quick_unlock.incorrect_password'));
      }

      const data = await verifyResponse.json();

      // Initialize E2EE for message encryption
      try {
        debugLogger.debug('[QuickUnlock] Initializing E2EE for:', data.user.username);
        await initializeE2EE(data.user.username);
        debugLogger.debug('[QuickUnlock] E2EE initialized successfully');
      } catch (e2eeError) {
        console.error('[QuickUnlock] E2EE initialization failed:', e2eeError);
        // Don't block login, but show warning to user
        alert('Warning: E2EE initialization failed. Encryption may not work properly. Please try logging out and back in.');
      }

      // Create session
      setSession({
        user: {
          id: data.user.id,
          username: data.user.username,
          securityTier: data.user.securityTier,
        },
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      // Success! Navigate to conversations
      navigate('/conversations');
    } catch (err: any) {
      console.error('Unlock error:', err);
      setError(err.message || t('quick_unlock.unlock_error'));
    } finally {
      setUnlocking(false);
    }
  };

  const handleClearCache = () => {
    if (confirm(t('settings.security_settings.clear_cache_confirm'))) {
      clearLocalAccount(account.username);
      setHasPassword(false);
      setError('');
      if (onAccountDeleted) {
        onAccountDeleted();
      }
    }
  };

  const handleFullLogin = () => {
    // Navigate to login with username pre-filled
    navigate('/login', { state: { username: account.username } });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-md"
    >
      {/* Wallet-style Card */}
      <div className="glass-card p-8 border-2 border-quantum-cyan/40">
        {/* Header */}
        <div className="text-center mb-6">
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-5xl mb-3"
          >
            {hasPassword ? '🔐' : '👤'}
          </motion.div>
          <h2 className="text-2xl font-black glow-text-cyan mb-2">
            {hasPassword ? t('quick_unlock.title') : t('auth.login')}
          </h2>
          <p className="text-soft-grey text-sm">
            {hasPassword ? t('quick_unlock.subtitle') : t('auth.login_required_desc')}
          </p>
        </div>

        {/* Account Badge */}
        <div className="mb-6 p-4 bg-quantum-cyan/10 rounded-lg border border-quantum-cyan/30 relative group">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-quantum-cyan to-magenta-trust flex items-center justify-center text-2xl">
              {account.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-pure-white font-semibold">
                @{account.username}
              </p>
              <p className="text-xs text-soft-grey">
                {account.securityTier === 'dice-key' ? `🎲 ${t('auth.dicekey')}` : `🔑 ${t('auth.method_standard')}`}
              </p>
            </div>

            {/* Clear Cache Button (Always visible on hover) */}
            <button
              onClick={handleClearCache}
              className="p-2 text-soft-grey hover:text-error-glow transition-colors opacity-0 group-hover:opacity-100"
              title={t('settings.security_settings.forget_account')}
            >
              🗑️
            </button>
          </div>
        </div>

        {hasPassword ? (
          /* Password Form */
          <form onSubmit={handleUnlock}>
            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-soft-grey">
                {t('quick_unlock.password_label')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('quick_unlock.password_placeholder')}
                  className="input w-full pr-12"
                  autoFocus
                  disabled={unlocking}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-soft-grey hover:text-pure-white transition-colors"
                  disabled={unlocking}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-4 p-3 bg-error-glow/10 border border-error-glow/30 rounded-lg"
                  role="alert"
                  aria-live="polite"
                >
                  <p className="text-sm text-error-glow">⚠️ {error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Unlock Button */}
            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!password || unlocking}
              className="btn btn-primary w-full mb-4 text-lg"
              style={{
                background: 'linear-gradient(135deg, var(--quantum-cyan), var(--magenta-trust))',
              }}
            >
              {unlocking ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  {t('quick_unlock.unlocking')}
                </>
              ) : (
                <>
                  🔓 {t('quick_unlock.unlock_button')}
                </>
              )}
            </motion.button>
          </form>
        ) : (
          /* Login Required State */
          <div className="mb-6">
            <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30 mb-6 text-center">
              <p className="text-sm text-amber-200">
                ⚠️ {t('quick_unlock.password_not_found')}
              </p>
              <p className="text-xs text-amber-200/70 mt-1">
                {t('quick_unlock.master_key_not_found')}
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleFullLogin}
              className="btn btn-primary w-full mb-4 text-lg"
            >
              🔐 {t('auth.login_button')}
            </motion.button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Switch Account / Create New */}
          <div className="flex gap-2">
            {onSwitchAccount && (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="btn btn-ghost flex-1 text-sm"
                disabled={unlocking}
              >
                🔄 {t('quick_unlock.switch_account')}
              </button>
            )}
            {onCreateNew && (
              <button
                type="button"
                onClick={onCreateNew}
                className="btn btn-ghost flex-1 text-sm"
                disabled={unlocking}
              >
                ➕ {t('quick_unlock.create_account')}
              </button>
            )}
          </div>

          {/* Back to Discover */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate('/discover');
            }}
            className="btn btn-ghost w-full text-sm"
          >
            ← {t('quick_unlock.back_to_discover')}
          </motion.button>
        </div>

        {/* Security Notice */}
        <div className="mt-6 p-3 bg-dark-matter-lighter rounded-lg border border-quantum-cyan/10">
          <p className="text-xs text-muted-grey text-center">
            🔒 {t('quick_unlock.security_notice')}
          </p>
        </div>
      </div>

      {/* MetaMask-style Footer */}
      <div className="mt-4 text-center">
        <p className="text-xs text-muted-grey">
          {t('quick_unlock.footer')}
        </p>
      </div>
    </motion.div>
  );
}
