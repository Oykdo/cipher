/**
 * Quick Connect — dedicated screen for returning users.
 *
 * Reached from the banner on Landing.tsx when `getLastKnownAccount()` finds
 * an entry in localStorage. Two modes :
 *
 * 1. Unlock mode — the account was set up with the password step at signup
 *    (pwd_<username> present). User enters their password, we verify via
 *    PBKDF2, unseal the KeyVault, and SRP-login with the server to get a
 *    fresh JWT. Same flow as the old inline bandeau on Landing.
 *
 * 2. Provision mode — legacy accounts (from before the password step) or
 *    accounts where the user cleared the cache. No pwd_<username> yet. The
 *    user enters their mnemonic + a new password. We derive masterKey from
 *    the mnemonic, run srp-seed login for a fresh JWT, then write the PBKDF2
 *    hash + seal KeyVault so future returns use unlock mode.
 *
 * Both modes end by setSession + initializeE2EE + navigate('/conversations').
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import * as srp from 'secure-remote-password/client';

import { LanguageSelector } from '../components/LanguageSelector';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import MouseGlowCard from '../components/MouseGlowCard';
import '../styles/fluidCrypto.css';

import {
  getLastKnownAccount,
  getLocalAccounts,
  hasLocalPassword,
  saveKnownAccount,
  type LocalAccount,
} from '../lib/localStorage';
import { hashPassword, evaluatePassword, MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';
import { getE2EEVault, getKeyVault } from '../lib/keyVault';
import { setSessionMasterKey } from '../lib/masterKeyResolver';
import { setTemporaryMasterKey } from '../lib/secureKeyAccess';
import { initializeE2EE, publishKeyBundleToServer } from '../lib/e2ee/e2eeService';
import { useAuthStore } from '../store/auth';
import { API_BASE_URL } from '../config';
import {
  deriveMasterKeyFromMnemonic,
  startSrpSeedLogin,
  continueSrpSeedLogin,
  computeSrpPasswordSetup,
} from '../lib/srpSeed';
import { getErrorMessage } from '../lib/errors';

export default function QuickConnect() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Build the account list — the whole `known_accounts` metadata, unfiltered.
  // Users who only ever logged in via mnemonic (quickUnlockEnabled: false)
  // still show up here so they can provision their password from this screen.
  const accounts = useMemo<LocalAccount[]>(() => {
    const all = getLocalAccounts();
    if (all.length > 0) return all;
    // Fallback : if the filter on quickUnlockEnabled stripped everything, show
    // the last known account anyway so provision mode is reachable.
    const last = getLastKnownAccount();
    return last ? [last] : [];
  }, []);

  const [selectedUsername, setSelectedUsername] = useState<string | null>(() => {
    const preferred = getLastKnownAccount();
    return preferred?.username ?? accounts[0]?.username ?? null;
  });

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.username === selectedUsername) ?? null,
    [accounts, selectedUsername]
  );

  // Force-provision flag : lets the UnlockForm bubble up a 401 from the server
  // (account has a local pwd_ hash but the server never received its classic
  // SRP credentials — e.g. legacy accounts created before the `/srp/setup` call
  // was added). We fall back to provision mode which will call `/srp/setup`.
  const [forceProvision, setForceProvision] = useState<string | null>(null);

  const mode: 'unlock' | 'provision' | 'empty' = selectedAccount
    ? forceProvision === selectedAccount.username
      ? 'provision'
      : hasLocalPassword(selectedAccount.username)
        ? 'unlock'
        : 'provision'
    : 'empty';

  return (
    <div className="signup-screen relative min-h-screen overflow-hidden">
      <div className="cosmic-ambient" aria-hidden="true">
        <div className="cosmic-stars" />
        <div className="cosmic-nebula" />
        <div className="cosmic-volumetric" />
      </div>

      <div className="absolute right-6 top-6 z-50">
        <LanguageSelector />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6 md:p-8">
        <div className="w-full max-w-xl">
          <div className="mb-8 text-center">
            <CosmicConstellationLogo />
            <h1 className="cosmic-title mb-3 text-4xl font-black md:text-5xl">
              <span className="cosmic-title-cipher">{t('quick_connect.title')}</span>
            </h1>
            <p className="text-soft-grey">{t('quick_connect.subtitle')}</p>
          </div>

          {accounts.length > 1 && (
            <AccountPicker
              accounts={accounts}
              selectedUsername={selectedUsername}
              onSelect={setSelectedUsername}
            />
          )}

          {mode === 'empty' && (
            <EmptyState onBackToSignup={() => navigate('/signup')} />
          )}

          {mode === 'unlock' && selectedAccount && (
            <UnlockForm
              account={selectedAccount}
              onNeedsProvision={() => setForceProvision(selectedAccount.username)}
            />
          )}

          {mode === 'provision' && selectedAccount && (
            <ProvisionForm
              account={selectedAccount}
              forced={forceProvision === selectedAccount.username}
            />
          )}

          <div className="mt-6 flex items-center justify-between text-xs text-soft-grey">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="cosmic-btn-ghost text-xs"
            >
              {t('common.back')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="cosmic-btn-ghost text-xs"
            >
              {t('quick_connect.full_login')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Account picker — only rendered when more than one local account exists.
// ============================================================================

function AccountPicker({
  accounts,
  selectedUsername,
  onSelect,
}: {
  accounts: LocalAccount[];
  selectedUsername: string | null;
  onSelect: (username: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mb-6">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
        {t('quick_connect.select_account')}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {accounts.map((a) => {
          const selected = a.username === selectedUsername;
          const initial = a.username.charAt(0).toUpperCase();
          return (
            <button
              key={a.username}
              type="button"
              onClick={() => onSelect(a.username)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                selected
                  ? 'border-cyan-400/50 bg-cyan-400/10 text-pure-white'
                  : 'border-white/10 bg-white/[0.03] text-soft-grey hover:border-white/20 hover:bg-white/[0.06]'
              }`}
              aria-pressed={selected}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/60 to-violet-500/60 text-xs font-bold text-white">
                {initial}
              </span>
              <span className="truncate text-sm">@{a.username}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Unlock form — account has pwd_<username>, standard password flow.
// ============================================================================

function UnlockForm({
  account,
  onNeedsProvision,
}: {
  account: LocalAccount;
  onNeedsProvision: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  const normalizedUsername = useMemo(() => account.username.toLowerCase(), [account.username]);

  const handleUnlock = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (unlocking || !password) return;
    setUnlocking(true);
    setError('');
    try {
      const storedHash =
        localStorage.getItem(`pwd_${normalizedUsername}`) ??
        localStorage.getItem(`pwd_${account.username}`);
      if (!storedHash) throw new Error(t('quick_connect.error_not_provisioned'));

      const candidateHash = await hashPassword(password, normalizedUsername);
      if (candidateHash !== storedHash) {
        throw new Error(t('quick_connect.error_wrong_password'));
      }

      const vault = await getKeyVault(password);
      const masterKey =
        (await vault.getData(`masterKey:${normalizedUsername}`)) ??
        (await vault.getData(`masterKey:${account.username}`));
      if (!masterKey) throw new Error(t('quick_connect.error_no_masterkey'));

      await setSessionMasterKey(masterKey);
      try { await setTemporaryMasterKey(masterKey); } catch { /* non-blocking */ }
      try { await getE2EEVault(masterKey); } catch { /* non-blocking */ }

      const ephemeral = srp.generateEphemeral();
      const initResp = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedUsername, A: ephemeral.public }),
      });
      if (!initResp.ok) {
        // 401 here means the account has a local pwd_ hash but no classic
        // SRP credentials server-side (legacy account or `/srp/setup` call
        // dropped earlier). The user needs to re-provision : enter their
        // mnemonic + same password so /srp/setup is called with a fresh
        // JWT from the srp-seed login. Bubble up to the parent to switch
        // modes.
        if (initResp.status === 401) {
          onNeedsProvision();
          return;
        }
        throw new Error(t('quick_connect.error_server'));
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
        if (verifyResp.status === 401) {
          onNeedsProvision();
          return;
        }
        throw new Error(t('quick_connect.error_wrong_password'));
      }
      const data = await verifyResp.json();

      // Set the session BEFORE initializeE2EE — publishKeyBundleToServer fires
      // inside initializeE2EE and needs session.accessToken in the store, else
      // authFetchV2WithRefresh throws "No access token in session".
      setSession({
        user: {
          id: data.user.id,
          username: data.user.username,
          securityTier: data.user.securityTier,
        },
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      try { await initializeE2EE(data.user.username); } catch { /* non-blocking */ }

      navigate('/conversations');
    } catch (err: any) {
      setError(err?.message ?? t('quick_connect.error_generic'));
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleUnlock}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="cosmic-glass-card relative"
      aria-label={t('quick_connect.unlock_section_title')}
    >
      <div className="cosmic-glow-border" aria-hidden="true" />
      <MouseGlowCard className="space-y-5 p-6 md:p-8">
        <AccountHeader account={account} />

        <div>
          <label className="mb-2 block text-sm text-soft-grey">
            {t('quick_connect.password_label')}
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
              placeholder={t('quick_connect.password_placeholder')}
              className="cosmic-input cosmic-input-plain w-full pr-16"
              autoComplete="current-password"
              autoFocus
              disabled={unlocking}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-[0.18em] text-soft-grey hover:text-pure-white transition-colors"
              disabled={unlocking}
            >
              {showPassword ? t('common.hide') : t('common.show')}
            </button>
          </div>
        </div>

        <ErrorBanner message={error} />

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!password || unlocking}
            className="cosmic-cta text-sm !w-auto !px-5 !py-2.5"
          >
            <span>
              {unlocking ? t('quick_connect.unlocking') : t('quick_connect.unlock_button')}
            </span>
            <div className="cosmic-cta-glow" aria-hidden="true" />
          </button>
        </div>
      </MouseGlowCard>
    </motion.form>
  );
}

// ============================================================================
// Provision form — account has no pwd_<username>. User supplies their
// mnemonic + a new password. We srp-seed-login to get JWT + derive
// masterKey from mnemonic, then write pwd_<username> and seal the
// KeyVault so next return lands in unlock mode.
// ============================================================================

function ProvisionForm({
  account,
  forced = false,
}: {
  account: LocalAccount;
  forced?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const normalizedUsername = useMemo(() => account.username.toLowerCase(), [account.username]);

  const mnemonicWords = useMemo(() => mnemonic.trim().split(/\s+/).filter(Boolean), [mnemonic]);
  const mnemonicValid = mnemonicWords.length === 12 || mnemonicWords.length === 24;

  const strength = useMemo(() => evaluatePassword(password, [account.username]), [
    password,
    account.username,
  ]);
  const passwordMatches = password === passwordConfirm;
  const canSubmit =
    mnemonicValid && strength.acceptable && passwordMatches && !submitting;

  const handleProvision = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      // 1. SRP-seed login with the mnemonic — gets JWT + confirms identity.
      const handle = startSrpSeedLogin(account.username, mnemonicWords);

      const initRes = await fetch(`${API_BASE_URL}/api/v2/auth/srp-seed/login/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: handle.username, A: handle.clientEphemeral.public }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData?.error || t('quick_connect.error_mnemonic_invalid'));

      const finish = continueSrpSeedLogin(handle, { salt: initData.salt, B: initData.B });

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
      if (!verifyRes.ok) throw new Error(verifyData?.error || t('quick_connect.error_mnemonic_invalid'));

      try { finish.verifyServerProof(verifyData.M2); } catch {
        throw new Error(t('quick_connect.error_server_proof'));
      }

      // 2. Derive masterKey from the mnemonic so E2EE resumes on this device.
      const masterKeyHex = await deriveMasterKeyFromMnemonic(mnemonicWords);
      await setSessionMasterKey(masterKeyHex);
      try { await setTemporaryMasterKey(masterKeyHex); } catch { /* non-blocking */ }
      try { await getE2EEVault(masterKeyHex); } catch { /* non-blocking */ }

      // 3. Provision the quick-unlock password : PBKDF2 hash + KeyVault seal.
      const storedHash = await hashPassword(password, normalizedUsername);
      localStorage.setItem(`pwd_${normalizedUsername}`, storedHash);

      try {
        const vault = await getKeyVault(password);
        await vault.storeData(`masterKey:${normalizedUsername}`, masterKeyHex);
      } catch (vaultErr) {
        // If KeyVault seal fails, rollback the PBKDF2 entry so the user
        // stays in provision mode on next return rather than being stuck
        // in unlock mode with an unreadable vault.
        localStorage.removeItem(`pwd_${normalizedUsername}`);
        throw new Error(getErrorMessage(vaultErr, t('quick_connect.error_vault_seal')));
      }

      saveKnownAccount({
        username: verifyData.user.username,
        securityTier: verifyData.user.securityTier,
        quickUnlockEnabled: true,
      });

      // Register classic SRP server-side so future Quick Unlock (which
      // calls /srp/login/init) can authenticate the user with the password
      // alone. The accessToken from the srp-seed verify response is used
      // as Bearer. If this fails, the unlock flow will keep 401-ing and
      // the user will fall back to provision mode next time — safe.
      try {
        const srpCreds = computeSrpPasswordSetup(verifyData.user.username, password);
        const srpSetupResp = await fetch(`${API_BASE_URL}/api/v2/auth/srp/setup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${verifyData.accessToken}`,
          },
          body: JSON.stringify(srpCreds),
        });
        if (!srpSetupResp.ok) {
          console.warn('[quick-connect] /srp/setup returned', srpSetupResp.status);
        }
      } catch (srpErr) {
        console.warn('[quick-connect] SRP password setup failed', srpErr);
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

      try {
        await initializeE2EE(verifyData.user.username);
        try { await publishKeyBundleToServer(); } catch { /* silent */ }
      } catch { /* non-blocking */ }

      navigate('/conversations');
    } catch (err) {
      setError(getErrorMessage(err, t('quick_connect.error_generic')));
    } finally {
      setSubmitting(false);
    }
  };

  const strengthColor =
    strength.level === 'strong' ? '#10b981'
      : strength.level === 'good' ? '#22d3ee'
        : strength.level === 'fair' ? '#f59e0b'
          : '#ef4444';

  return (
    <motion.form
      onSubmit={handleProvision}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="cosmic-glass-card relative"
      aria-label={t('quick_connect.provision_section_title')}
    >
      <div className="cosmic-glow-border" aria-hidden="true" />
      <MouseGlowCard className="space-y-5 p-6 md:p-8">
        <AccountHeader account={account} />

        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100/90">
          {forced ? t('quick_connect.provision_desc_migration') : t('quick_connect.provision_desc')}
        </div>

        <div>
          <label className="mb-2 block text-sm text-soft-grey">
            {t('quick_connect.mnemonic_label')}
          </label>
          <textarea
            value={mnemonic}
            onChange={(e) => { setMnemonic(e.target.value); if (error) setError(''); }}
            placeholder={t('quick_connect.mnemonic_placeholder')}
            rows={3}
            className="cosmic-input cosmic-input-plain w-full resize-none font-mono"
            autoComplete="off"
            disabled={submitting}
          />
          <p className="mt-1.5 text-[11px] text-soft-grey">
            {mnemonicWords.length > 0
              ? t('quick_connect.mnemonic_word_count', { count: mnemonicWords.length })
              : t('quick_connect.mnemonic_hint')}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm text-soft-grey">
            {t('quick_connect.new_password_label')}
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
              placeholder={t('quick_connect.new_password_placeholder', { min: MIN_PASSWORD_LENGTH })}
              className="cosmic-input cosmic-input-plain w-full pr-16"
              autoComplete="new-password"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-[0.18em] text-soft-grey hover:text-pure-white transition-colors"
              disabled={submitting}
            >
              {showPassword ? t('common.hide') : t('common.show')}
            </button>
          </div>
          {password.length > 0 && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: strengthColor }}
                  initial={false}
                  animate={{ width: `${Math.round(strength.progress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-[0.22em]" style={{ color: strengthColor }}>
                {t(`signup.mnemonic_password_strength_${strength.level}`)}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm text-soft-grey">
            {t('quick_connect.confirm_password_label')}
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={passwordConfirm}
            onChange={(e) => { setPasswordConfirm(e.target.value); if (error) setError(''); }}
            placeholder={t('quick_connect.confirm_password_placeholder')}
            className="cosmic-input cosmic-input-plain w-full"
            autoComplete="new-password"
            disabled={submitting}
          />
          {passwordConfirm.length > 0 && !passwordMatches && (
            <p className="mt-1.5 text-[11px] text-red-400">
              {t('quick_connect.error_password_mismatch')}
            </p>
          )}
        </div>

        <ErrorBanner message={error} />

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="cosmic-cta text-sm"
          >
            <span>
              {submitting ? t('quick_connect.provisioning') : t('quick_connect.provision_submit')}
            </span>
            <div className="cosmic-cta-glow" aria-hidden="true" />
          </button>
        </div>
      </MouseGlowCard>
    </motion.form>
  );
}

// ============================================================================
// Tiny shared sub-components.
// ============================================================================

function AccountHeader({ account }: { account: LocalAccount }) {
  const { t } = useTranslation();
  const initial = account.username.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/70 to-violet-500/70 text-lg font-bold text-white shadow-[0_0_18px_rgba(0,240,255,0.25)]">
        {initial}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">
          {t('quick_connect.account_on_device')}
        </p>
        <p className="truncate text-base font-semibold text-pure-white">@{account.username}</p>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          key="qc-error"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
          aria-live="polite"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function EmptyState({ onBackToSignup }: { onBackToSignup: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="cosmic-glass-card relative">
      <div className="cosmic-glow-border" aria-hidden="true" />
      <MouseGlowCard className="space-y-4 p-6 md:p-8 text-center">
        <p className="text-soft-grey">{t('quick_connect.empty_state')}</p>
        <button onClick={onBackToSignup} className="cosmic-cta mx-auto text-sm">
          <span>{t('quick_connect.empty_state_cta')}</span>
          <div className="cosmic-cta-glow" aria-hidden="true" />
        </button>
      </MouseGlowCard>
    </div>
  );
}
