/**
 * Signup flow — vault-only.
 *
 * Simplified from the original multi-method (standard mnemonic / DiceKey /
 * vault) selector down to a single path: create an Eidolon vault. The user
 * either runs the Genesis ceremony inside Cipher, or opens the external
 * Eidolon desktop launcher to connect an existing vault.
 *
 * Legacy login paths (mnemonic, DiceKey, legacy .blend file) were removed on
 * 2026-04-20 to consolidate the auth narrative around the post-quantum vault.
 * Existing users still authenticate via the keybundle / quick-unlock flows on
 * the Login screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import {
  API_BASE_URL,
  API_SUPPORTS_LOCAL_PSNX,
  EIDOLON_CONNECT_APP_ID,
  EIDOLON_CONNECT_ENABLED,
} from '../config';
import { createEidolonConnectSession, ensureEidolonConnectRegistration } from '../lib/eidolonConnect';
import { readVaultBridgeContext, type VaultBridgeContext } from '../lib/vaultBridge';
import {
  openPublicEidolonInfo,
  type EidolonDesktopResult,
} from '../lib/eidolonInstall';
import '../styles/fluidCrypto.css';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import MouseGlowCard from '../components/MouseGlowCard';
import { getErrorMessage } from '../lib/errors';
import SignupMnemonic from './SignupMnemonic';

export default function SignupFluid() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  // While the Eidolon ecosystem is still pre-release, fall back to the
  // BIP-39 mnemonic signup. Flipping VITE_EIDOLON_CONNECT_ENABLED=true at
  // launch time swaps the vault flow back in without code changes.
  if (!EIDOLON_CONNECT_ENABLED) {
    return <SignupMnemonic />;
  }

  // Post-Genesis-ceremony auto-connect: the ceremony navigates here with
  // ?auto=connect once it has written eidolon_cipher_bridge.json. This
  // component then triggers the normal connect flow without interaction.
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const autoConnectRequested = initialParams.get('auto') === 'connect';
  const autoConnectConsumedRef = useRef(false);

  const [vaultError, setVaultError] = useState('');
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultContext, setVaultContext] = useState<VaultBridgeContext | null>(null);
  const [vaultLauncherState, setVaultLauncherState] = useState<EidolonDesktopResult | null>(null);
  const [connectStatus, setConnectStatus] = useState(() => t('auth.connect_status_required'));

  useEffect(() => {
    let mounted = true;
    const loadVaultContext = async () => {
      const result = await readVaultBridgeContext();
      if (!mounted) return;
      setVaultContext(result.ok ? result.context ?? null : null);
    };
    loadVaultContext();
    window.addEventListener('focus', loadVaultContext);
    return () => {
      mounted = false;
      window.removeEventListener('focus', loadVaultContext);
    };
  }, []);

  useEffect(() => {
    // When the Eidolon ecosystem is still pre-release we skip the probe
    // entirely and surface a single "coming soon" status instead of
    // attempting the registration handshake.
    if (!EIDOLON_CONNECT_ENABLED) {
      setConnectStatus(t('auth.connect_status_coming_soon'));
      return;
    }

    let cancelled = false;
    const probeConnect = async () => {
      if (!vaultContext?.vault_id) {
        setConnectStatus(t('auth.connect_status_no_context'));
        return;
      }
      const result = await ensureEidolonConnectRegistration(EIDOLON_CONNECT_APP_ID);
      if (cancelled) return;
      if (result.ok && result.registration) {
        if (result.registration.status === 'approved') {
          setConnectStatus(t('auth.connect_status_approved'));
          return;
        }
        if (result.registration.status === 'pending_consent') {
          setConnectStatus(t('auth.connect_status_pending'));
          return;
        }
        setConnectStatus(t('auth.connect_status_generic', { status: result.registration.status }));
        return;
      }
      setConnectStatus(
        result.error
          ? t('auth.connect_status_error', { error: result.error })
          : t('auth.connect_status_unavailable'),
      );
    };
    void probeConnect();
    return () => {
      cancelled = true;
    };
  }, [vaultContext?.vault_id, t]);

  // Launching Eidolon's desktop app from signup was removed in the UX pass —
  // users who already have Eidolon go to /login (which offers launcher +
  // keybundle import). Install prompt + context-detection still live here.

  const handleVaultInstall = async () => {
    if (window.electron?.openEidolonInstaller) {
      const result = await window.electron.openEidolonInstaller();
      setVaultLauncherState(result);
      return;
    }
    openPublicEidolonInfo();
  };

  const handleVaultSignupConnect = async () => {
    setVaultError('');
    setVaultLoading(true);
    try {
      if (!vaultContext?.vault_id) {
        throw new Error(t('auth.vault_bridge_no_context_error'));
      }
      const connectSession = await createEidolonConnectSession({
        appId: EIDOLON_CONNECT_APP_ID,
        vaultId: vaultContext.vault_id,
        vaultNumber: vaultContext.vault_number,
        vaultName: vaultContext.vault_name,
        source: vaultContext.source || 'eidolon',
        createdAt: vaultContext.created_at,
      });
      if (!connectSession.ok || !connectSession.session?.session_id) {
        throw new Error(connectSession.error || t('auth.vault_bridge_session_error'));
      }
      const response = await fetch(`${API_BASE_URL}/api/v2/auth/eidolon-bridge/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: EIDOLON_CONNECT_APP_ID,
          connectSessionId: connectSession.session.session_id,
          vaultId: vaultContext.vault_id,
          vaultNumber: vaultContext.vault_number,
          vaultName: vaultContext.vault_name,
          psnxPath: API_SUPPORTS_LOCAL_PSNX ? vaultContext.psnx_path : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || t('auth.vault_bridge_connect_error'));
      }
      setSession({
        user: {
          id: data.user.id,
          username: data.user.username,
          securityTier: data.user.securityTier,
          linkedVault: data.vaultBridge
            ? {
                appId: data.vaultBridge.appId,
                vaultId: data.vaultBridge.vaultId,
                vaultNumber: data.vaultBridge.vaultNumber,
                vaultName: data.vaultBridge.vaultName,
                source: data.vaultBridge.source,
              }
            : undefined,
        },
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      navigate('/conversations');
    } catch (connectError) {
      setVaultError(getErrorMessage(connectError, t('signup.vault_signup_complete_error')));
    } finally {
      setVaultLoading(false);
    }
  };

  // Once the ceremony-written bridge context arrives, auto-trigger the
  // connect flow so the user lands in /conversations without a second click.
  useEffect(() => {
    if (!autoConnectRequested || autoConnectConsumedRef.current) return;
    if (!vaultContext?.vault_id) return;
    autoConnectConsumedRef.current = true;
    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', cleanUrl);
    setTimeout(() => handleVaultSignupConnect(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnectRequested, vaultContext?.vault_id]);

  // When a vault is already on disk AND the user did not arrive from the
  // ceremony auto-connect flow, show a short "you already have a vault"
  // screen pointing at /login. This avoids confusing a returning user with
  // the "Create your identity" narrative they don't need.
  const alreadyHasVault = Boolean(vaultContext?.vault_id) && !autoConnectRequested;

  return (
    <div className="signup-screen relative min-h-screen overflow-hidden">
      <div className="cosmic-ambient" aria-hidden="true">
        <div className="cosmic-stars" />
        <div className="cosmic-nebula" />
        <div className="cosmic-volumetric" />
      </div>

      {alreadyHasVault ? (
        <AlreadyHasVaultNotice
          vaultName={vaultContext?.vault_name ?? null}
          onGoToLogin={() => navigate('/login')}
          onBack={() => navigate('/')}
        />
      ) : (
        <VaultSignupBridge
          context={vaultContext}
          connectStatus={connectStatus}
          error={vaultError}
          loading={vaultLoading}
          launcherState={vaultLauncherState}
          onBack={() => navigate('/')}
          onInstall={handleVaultInstall}
          onConnect={handleVaultSignupConnect}
        />
      )}
    </div>
  );
}

function AlreadyHasVaultNotice({
  vaultName,
  onGoToLogin,
  onBack,
}: {
  vaultName: string | null;
  onGoToLogin: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8 relative z-10"
    >
      <div className="max-w-xl w-full text-center">
        <CosmicConstellationLogo />
        <h1 className="cosmic-title text-4xl font-black mt-6 mb-4">
          <span className="cosmic-title-pulse">
            {t('signup.already_have_vault_title')}
          </span>
        </h1>
        <p className="text-soft-grey text-lg mb-8">
          {vaultName
            ? t('signup.already_have_vault_named', { name: vaultName })
            : t('signup.already_have_vault_subtitle')}
        </p>
        <div className="flex flex-col items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onGoToLogin}
            className="cosmic-cta w-full max-w-xs"
          >
            {t('signup.already_have_vault_cta')}
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
      </div>
    </motion.div>
  );
}

// ============================================================================
// Vault signup — the only signup path.
// ============================================================================

function VaultSignupBridge({
  context,
  connectStatus,
  error,
  loading,
  launcherState,
  onBack,
  onInstall,
  onConnect,
}: {
  context: VaultBridgeContext | null;
  connectStatus: string;
  error: string;
  loading: boolean;
  launcherState: EidolonDesktopResult | null;
  onBack: () => void;
  onInstall: () => void;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const installRequired = launcherState?.status === 'install_required';
  const desktopOnly = !window.electron?.openEidolonLauncher;
  const hasLinkedVault = Boolean(context?.vault_id);
  const vaultLabel = context?.vault_name || context?.vault_id?.slice(0, 12) || t('auth.vault_bridge_pending');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8 relative z-10"
    >
      <div className="max-w-3xl w-full">
        <div className="text-center mb-10">
          <CosmicConstellationLogo />
          <motion.h1 className="cosmic-title text-5xl font-black mb-4">
            <span className="cosmic-title-cipher">{t('signup.vault_page_title')}</span>{' '}
            <span className="cosmic-title-pulse">{t('signup.vault_page_title_suffix')}</span>
          </motion.h1>
          <p className="text-soft-grey text-xl">{t('signup.vault_page_subtitle')}</p>
        </div>

        <div className="cosmic-glass-card relative">
          <div className="cosmic-glow-border" aria-hidden="true" />
          <MouseGlowCard className="p-8">
            <div className="space-y-4 text-sm text-soft-grey">
              <p>{t('signup.vault_intro_0')}</p>
              <p>{t('signup.vault_intro_1')}</p>
              <p>{t('signup.vault_intro_2')}</p>
            </div>

            {hasLinkedVault && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="cosmic-status-card mt-6 relative overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(34,211,238,0.08), rgba(8,47,73,0.06))',
                  borderRadius: '16px',
                  border: 'none',
                }}
              >
                <div
                  aria-hidden="true"
                  className="vault-border-glow"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '16px',
                    padding: '1.5px',
                    background: 'conic-gradient(from var(--vault-border-angle, 0deg), rgba(0,240,255,0.6), rgba(139,92,246,0.5), rgba(0,240,255,0.1), rgba(139,92,246,0.5), rgba(0,240,255,0.6))',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                    animation: 'vault-border-spin 3s linear infinite',
                    pointerEvents: 'none',
                  }}
                />
                <div className="relative z-[2]">
                  <motion.p
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-sm font-semibold mb-2"
                    style={{ color: 'var(--cosmic-cyan)' }}
                  >
                    {t('auth.vault_bridge_context_detected')}
                  </motion.p>
                  <div className="space-y-1 text-sm text-soft-grey">
                    <p>{t('auth.vault_bridge_vault_label')} {vaultLabel}</p>
                    <p>{t('signup.vault_connect_label')} {connectStatus}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {installRequired && (
              <div className="cosmic-status-card mt-6">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--cosmic-cyan)' }}>
                  {t('auth.vault_bridge_install_required')}
                </p>
                <div className="space-y-2 text-sm text-soft-grey">
                  <p>{t('signup.vault_install_desc_1')}</p>
                  <p>{t('signup.vault_install_desc_2')}</p>
                </div>
              </div>
            )}

            {desktopOnly && !installRequired && (
              <div className="cosmic-status-card mt-6">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--cosmic-cyan)' }}>
                  {t('auth.vault_bridge_desktop_required')}
                </p>
                <div className="space-y-2 text-sm text-soft-grey">
                  <p>{t('signup.vault_desktop_desc')}</p>
                </div>
              </div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="cosmic-alert-error mt-6"
                role="alert"
                aria-live="polite"
              >
                <p className="text-sm text-error-glow font-semibold">{error}</p>
              </motion.div>
            )}
          </MouseGlowCard>
        </div>

        {/* Primary action — run the Genesis ceremony inside Cipher.
            (If Cipher detects a pre-existing linked vault from a launched
            Eidolon desktop, we also surface a direct connect CTA.) */}
        <div className="mt-6">
          {hasLinkedVault ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onConnect}
              className="cosmic-cta w-full"
              disabled={loading}
            >
              {loading ? t('auth.connecting') : t('signup.create_with_vault')}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/genesis?from=signup')}
              className="cosmic-cta w-full"
              disabled={loading}
              title={t('signup.create_identity_title')}
            >
              {t('signup.create_identity')}
            </motion.button>
          )}
          {(installRequired || desktopOnly) && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onInstall}
              className="cosmic-btn-ghost mt-3 w-full"
              disabled={loading}
            >
              {loading ? t('auth.vault_bridge_preparing') : t('auth.vault_bridge_install_button')}
            </motion.button>
          )}
        </div>

        {/* Tertiary navigation — Back + already-have-a-vault link. Grouped
            together so the primary CTA stands alone. */}
        <div className="flex flex-wrap gap-3 mt-6 justify-between">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="cosmic-btn-ghost"
            disabled={loading}
          >
            {t('common.back')}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/login')}
            className="cosmic-btn-ghost"
            disabled={loading}
          >
            {t('signup.legacy_login')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
