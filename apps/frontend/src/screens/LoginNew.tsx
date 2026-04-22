/**
 * Login page aligned with the current Cipher stack.
 *
 * Main entry points:
 * 1. Local Cipher access on this device
 * 2. Legacy recovery methods
 * 3. Eidolon Connect vault flow
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { API_BASE_URL, EIDOLON_CONNECT_APP_ID } from '../config';
import { saveKnownAccount, clearPasswordCache } from '../lib/localStorage';
import { createEidolonConnectSession, ensureEidolonConnectRegistration } from '../lib/eidolonConnect';
import { readVaultBridgeContext, type VaultBridgeContext } from '../lib/vaultBridge';
import { importVaultKeybundle } from '../lib/keybundle';
import { getErrorMessage } from '../lib/errors';
import {
  decryptStoredBundle,
  deleteStoredBundle,
  encryptStoredBundle,
  listStoredBundles,
  loadStoredBundle,
  saveStoredBundle,
  type StoredBundleEntry,
} from '../lib/storedBundle';
import {
  EIDOLON_PUBLIC_DOWNLOAD_URL,
  openPublicEidolonInfo,
  type EidolonDesktopResult,
} from '../lib/eidolonInstall';
import '../styles/fluidCrypto.css';
import CosmicLoader from '../components/CosmicLoader';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import { CosmicActionButton, CosmicGhostButton } from '../components/CosmicAuthPrimitives';


export default function LoginNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  // Vault is the only login method — no more multi-method selector.
  const [vaultError, setVaultError] = useState('');
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultContext, setVaultContext] = useState<VaultBridgeContext | null>(null);
  const [vaultLauncherState, setVaultLauncherState] = useState<EidolonDesktopResult | null>(null);

  // Error state
  const [error, setError] = useState('');

  // Cosmic loader state — retained because the stored-bundle unlock flow can
  // spin the loader while Argon2id decryption runs client-side.
  const [showLoader] = useState(false);
  const [loaderStage] = useState<'normalizing' | 'argon2' | 'hkdf' | 'keygen' | 'complete'>('normalizing');
  const [loaderProgress] = useState(0);

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

  // Trigger Eidolon Connect registration probe in the background. We no longer
  // surface its status in-UI (the old `connectStatus` display belonged to the
  // removed MethodChoice screen), but keeping the probe wired means the Connect
  // session cache stays fresh for the vault login path.
  useEffect(() => {
    if (!vaultContext?.vault_id) return;
    let cancelled = false;
    void (async () => {
      try {
        await ensureEidolonConnectRegistration(EIDOLON_CONNECT_APP_ID);
      } catch {
        // probe failures are non-fatal — handleVaultSessionConnect re-tries
      }
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [vaultContext?.vault_id]);

  const handleVaultBridge = async () => {
    setVaultError('');
    setVaultLauncherState(null);
    setVaultLoading(true);
    try {
      if (!window.electron?.openEidolonLauncher) {
        setVaultLauncherState({
          ok: false,
          status: 'install_required',
          error: t('auth.vault_bridge_desktop_only_error'),
          downloadUrl: EIDOLON_PUBLIC_DOWNLOAD_URL,
          infoUrl: EIDOLON_PUBLIC_DOWNLOAD_URL,
        });
        return;
      }

      const result = await window.electron.openEidolonLauncher();
      if (!result?.ok) {
        setVaultLauncherState(result);
        throw new Error(result?.error || t('auth.vault_bridge_open_error'));
      }
      setVaultLauncherState(result);
    } catch (bridgeError) {
      setVaultError(getErrorMessage(bridgeError, t('auth.vault_bridge_start_error')));
    } finally {
      setVaultLoading(false);
    }
  };

  const handleVaultInstall = async () => {
    setVaultError('');
    setVaultLoading(true);
    try {
      if (!window.electron?.openEidolonInstaller) {
        openPublicEidolonInfo(vaultLauncherState?.downloadUrl || EIDOLON_PUBLIC_DOWNLOAD_URL);
        return;
      }

      const result = await window.electron.openEidolonInstaller();
      if (!result?.ok) {
        setVaultLauncherState(result);
        throw new Error(result?.error || t('auth.vault_bridge_install_error'));
      }

      setVaultLauncherState(result);
    } catch (installError) {
      setVaultError(getErrorMessage(installError, t('auth.vault_bridge_install_error')));
    } finally {
      setVaultLoading(false);
    }
  };

  const handleVaultSessionConnect = async () => {
    setVaultError('');
    setVaultLoading(true);

    try {
      if (!vaultContext?.vault_id) {
        throw new Error(t('auth.vault_bridge_no_context_error'));
      }

      // Desktop path: direct vault bridge without Connect session
      // The vault files are already local — no need to round-trip through the VPS
      const isDesktop = !!window.electron;
      let connectSessionId: string | undefined;
      let psnxPath = vaultContext.psnx_path;
      let psnxHash = vaultContext.psnx_hash;

      if (isDesktop) {
        // If the .psnx file wasn't found at its original path, ask the user to locate it
        if (!psnxHash && window.electron?.selectPsnxFile) {
          const selected = await window.electron.selectPsnxFile();
          if (!selected?.ok) {
            throw new Error(selected?.error || 'Vault file selection cancelled');
          }
          psnxPath = selected.psnxPath;
          psnxHash = selected.psnxHash;
        }
      } else {
        // Mobile/browser: use Connect session via VPS
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
        connectSessionId = connectSession.session.session_id;
      }

      const response = await fetch(`${API_BASE_URL}/api/v2/auth/eidolon-bridge/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: EIDOLON_CONNECT_APP_ID,
          connectSessionId,
          vaultId: vaultContext.vault_id,
          vaultNumber: vaultContext.vault_number,
          vaultName: vaultContext.vault_name,
          psnxPath,
          psnxHash,
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

      saveKnownAccount({
        username: data.user.username,
        securityTier: data.user.securityTier,
        quickUnlockEnabled: false,
      });

      clearPasswordCache(data.user.username);

      navigate('/conversations');
    } catch (connectError) {
      setVaultError(getErrorMessage(connectError, t('auth.vault_bridge_connect_error')));
    } finally {
      setVaultLoading(false);
    }
  };

  // QR / Code login: user enters a vault token generated by Eidolon
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');

  const [keybundleLoading, setKeybundleLoading] = useState(false);
  const [storedBundles, setStoredBundles] = useState<StoredBundleEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await listStoredBundles();
      if (!cancelled) setStoredBundles(entries);
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Full keybundle import flow. When `rememberPassword` is set, the raw
   * bundle bytes get encrypted with PBKDF2 + XChaCha20 and saved under
   * userData so the next login on this device can unlock by password only.
   */
  const handleKeybundleImport = async (file: File, rememberPassword?: string) => {
    setVaultError('');
    setKeybundleLoading(true);
    try {
      // Read bytes once — needed for both the import POST and the optional encrypt/save.
      const bundleBytes = new Uint8Array(await file.arrayBuffer());

      const r = await importVaultKeybundle(new Blob([bundleBytes as BlobPart]));
      if (!r.ok) throw new Error(r.error);

      if (rememberPassword) {
        try {
          const encrypted = await encryptStoredBundle(bundleBytes, rememberPassword);
          await saveStoredBundle(r.vaultId, r.vaultName, encrypted);
          const refreshedEntries = await listStoredBundles();
          setStoredBundles(refreshedEntries);
        } catch (storeErr) {
          // Don't block login if the save step fails — just surface a soft warning.
          console.warn('[storedBundle] save failed', storeErr);
          setVaultError(`login OK mais device save a échoué: ${getErrorMessage(storeErr, 'unknown')}`);
        }
      }

      const refreshed = await readVaultBridgeContext();
      if (!refreshed.ok || !refreshed.context?.vault_id) {
        throw new Error('bundle imported but bridge context was not written');
      }
      setVaultContext(refreshed.context);
      setTimeout(() => { void handleVaultSessionConnect(); }, 0);
    } catch (err) {
      setVaultError(getErrorMessage(err, 'Keybundle import failed'));
    } finally {
      setKeybundleLoading(false);
    }
  };

  /**
   * Quick unlock flow — user has already imported this vault on this device
   * and opted to remember it. They only need to type their password.
   */
  const handleQuickUnlock = async (vaultId: string, password: string) => {
    setVaultError('');
    setKeybundleLoading(true);
    try {
      const blob = await loadStoredBundle(vaultId);
      if (!blob) throw new Error('stored bundle disappeared — please restore from file');
      const bundleBytes = await decryptStoredBundle(blob, password);
      const file = new Blob([bundleBytes as BlobPart]);

      const r = await importVaultKeybundle(file);
      if (!r.ok) throw new Error(r.error);

      const refreshed = await readVaultBridgeContext();
      if (!refreshed.ok || !refreshed.context?.vault_id) {
        throw new Error('quick-unlock bridge context missing');
      }
      setVaultContext(refreshed.context);
      setTimeout(() => { void handleVaultSessionConnect(); }, 0);
    } catch (err) {
      setVaultError(getErrorMessage(err, 'Quick unlock failed'));
    } finally {
      setKeybundleLoading(false);
    }
  };

  const handleForgetStoredBundle = async (vaultId: string) => {
    await deleteStoredBundle(vaultId);
    setStoredBundles(await listStoredBundles());
  };

  const handleQrTokenRedeem = async (token: string) => {
    setQrError('');
    if (!token) {
      setQrError('Enter the code from Eidolon');
      return;
    }
    setQrLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/auth/vault-token/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultToken: token }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Vault token redemption failed');
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
      saveKnownAccount({
        username: data.user.username,
        securityTier: data.user.securityTier,
        quickUnlockEnabled: false,
      });
      navigate('/conversations');
    } catch (err) {
      setQrError(getErrorMessage(err, 'Invalid or expired token'));
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <div className="cosmic-scene auth-login-scene min-h-screen">
      <div aria-hidden="true">
        <div className="cosmic-nebula">
          <div className="cosmic-nebula-layer" />
        </div>
        <div className="cosmic-stars" />
        <div className="cosmic-p2p-grid">
          <span className="cosmic-p2p-node" style={{ top: '18%', left: '16%' }} />
          <span className="cosmic-p2p-node" style={{ top: '28%', right: '22%' }} />
          <span className="cosmic-p2p-node" style={{ bottom: '24%', left: '28%' }} />
          <span className="cosmic-p2p-node" style={{ bottom: '16%', right: '18%' }} />
        </div>
        <div className="cosmic-volumetric" />
      </div>

      <div className="relative z-10">
        <AnimatePresence mode="wait">
        {/* Cosmic Loader has priority */}
        {showLoader ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-dark-matter flex items-center justify-center"
          >
            <CosmicLoader
              stage={loaderStage}
              progress={loaderProgress}
            // onComplete handled manually in the flow for login
            />
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex items-center justify-center min-h-screen p-8"
          >
            <div className="cosmic-glass-card p-8 max-w-md">
              <h2 className="cosmic-title text-2xl mb-4">{t('common.error')}</h2>
              <p className="text-soft-grey text-sm mb-6">{error}</p>
              <CosmicActionButton onClick={() => setError('')}>
                {t('common.retry')}
              </CosmicActionButton>
            </div>
          </motion.div>
        ) : (
          // Vault is now the only login method. Quick-unlock + keybundle import
          // + launch Eidolon are all handled by VaultBridgeForm.
          <VaultBridgeForm
            key="vault"
            onLaunch={handleVaultBridge}
            onInstall={handleVaultInstall}
            onConnect={handleVaultSessionConnect}
            onBack={() => navigate('/')}
            onQrRedeem={handleQrTokenRedeem}
            onKeybundleImport={handleKeybundleImport}
            onQuickUnlock={handleQuickUnlock}
            onForgetStoredBundle={handleForgetStoredBundle}
            storedBundles={storedBundles}
            error={vaultError}
            loading={vaultLoading}
            keybundleLoading={keybundleLoading}
            context={vaultContext}
            launcherState={vaultLauncherState}
            qrLoading={qrLoading}
            qrError={qrError}
          />
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================ 
// SUB-COMPONENTS
// ============================================================================ 

function AuthStage({
  children,
  width = 'narrow',
}: {
  children: React.ReactNode;
  width?: 'narrow' | 'wide';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="auth-viewport"
    >
      <div className={`auth-stage ${width === 'wide' ? 'auth-stage-wide' : 'auth-stage-narrow'}`}>
        {children}
      </div>
    </motion.div>
  );
}


function QrTokenInput({ onRedeem, loading, error }: { onRedeem: (token: string) => void; loading?: boolean; error?: string }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');

  if (!open) {
    return (
      <div className="mt-4 pt-4 border-t border-white/10">
        <button
          onClick={() => setOpen(true)}
          className="w-full text-sm text-cyan-300/70 hover:text-cyan-200 transition-colors py-2"
        >
          Enter Vault Code from Eidolon
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
      <p className="text-xs text-white/50">
        Open Eidolon → press [Q] → copy the code and paste it below
      </p>
      <textarea
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Paste vault token from Eidolon..."
        className="w-full bg-slate-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:border-cyan-500/50 focus:outline-none resize-none"
        rows={3}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => onRedeem(token.trim())}
          disabled={loading || !token.trim()}
          className="flex-1 bg-cyan-600/80 hover:bg-cyan-500/80 disabled:opacity-40 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? 'Connecting...' : 'Connect with code'}
        </button>
        <button
          onClick={() => { setOpen(false); setToken(''); }}
          className="text-white/40 hover:text-white/70 text-sm px-3"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function VaultBridgeForm({
  onLaunch,
  onInstall,
  onConnect,
  onBack,
  onQrRedeem,
  onKeybundleImport,
  onQuickUnlock,
  onForgetStoredBundle,
  storedBundles,
  error,
  loading,
  keybundleLoading,
  context,
  launcherState,
  qrLoading,
  qrError,
}: {
  onLaunch: () => void;
  onInstall: () => void;
  onConnect: () => void;
  onBack: () => void;
  onQrRedeem: (token: string) => void;
  onKeybundleImport: (file: File, rememberPassword?: string) => void;
  onQuickUnlock: (vaultId: string, password: string) => void;
  onForgetStoredBundle: (vaultId: string) => void;
  storedBundles: StoredBundleEntry[];
  error: string;
  loading: boolean;
  keybundleLoading: boolean;
  context: VaultBridgeContext | null;
  launcherState: EidolonDesktopResult | null;
  qrLoading?: boolean;
  qrError?: string;
}) {
  const { t } = useTranslation();
  const installRequired = launcherState?.status === 'install_required';
  const desktopOnly = !window.electron?.openEidolonLauncher;
  const hasLinkedVault = Boolean(context?.vault_id);
  const vaultLabel = context?.vault_name || context?.vault_id?.slice(0, 12) || t('auth.vault_bridge_pending');

  return (
    <AuthStage>
      <div className="auth-header text-center mb-6">
        <CosmicConstellationLogo />
        <div className="cosmic-kicker mb-2">{t('auth.vault_bridge_kicker')}</div>
        <h2 className="cosmic-title text-4xl font-black mb-2">
          <span className="cosmic-title-cipher">Vault / Eidolon</span>{' '}
          <span className="cosmic-title-pulse">Bridge</span>
        </h2>
        <p className="auth-subtitle mx-auto max-w-2xl text-soft-grey">
          {t('auth.vault_bridge_subtitle')}
        </p>
      </div>

        <div className="cosmic-glass-card auth-panel relative mb-5 p-6 md:p-8">
          <div className="cosmic-glow-border" aria-hidden="true" />
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                  {t('auth.vault_bridge_step_1_label')}
                </div>
                <p className="text-sm leading-6 text-soft-grey">
                  {t('auth.vault_bridge_step_1_desc')}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                  {t('auth.vault_bridge_step_2_label')}
                </div>
                <p className="text-sm leading-6 text-soft-grey">
                  {t('auth.vault_bridge_step_2_desc')}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] px-4 py-3.5 text-left shadow-[0_8px_24px_rgba(34,211,238,0.08)]">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                  {t('auth.vault_bridge_step_3_label')}
                </div>
                <p className="text-sm leading-6 text-soft-grey">
                  {t('auth.vault_bridge_step_3_desc')}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-5 py-3.5 text-sm leading-6 text-soft-grey">
              {t('auth.vault_bridge_summary')}
            </div>
          </div>

          {hasLinkedVault && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="vault-detected-card cosmic-status-card mx-auto mt-5 w-full max-w-4xl px-5 py-5 shadow-[0_12px_36px_rgba(34,211,238,0.12)] relative overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(34,211,238,0.08), rgba(8,47,73,0.06))',
                borderRadius: '16px',
                border: 'none',
              }}
            >
              {/* Animated conic-gradient border */}
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
              {/* Inner glow pulse */}
              <motion.div
                aria-hidden="true"
                animate={{ opacity: [0.04, 0.12, 0.04] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '16px',
                  background: 'radial-gradient(ellipse at 30% 50%, rgba(0,240,255,0.15), transparent 70%)',
                  pointerEvents: 'none',
                }}
              />
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between relative z-[2]">
                <div className="space-y-2.5">
                  <motion.p
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                    style={{ color: 'var(--cosmic-cyan)' }}
                  >
                    {t('auth.vault_bridge_context_detected')}
                  </motion.p>
                  <p className="text-xl font-semibold leading-7 text-white">
                    {vaultLabel}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-soft-grey">
                    <motion.span
                      animate={{ borderColor: ['rgba(34,211,238,0.12)', 'rgba(34,211,238,0.35)', 'rgba(34,211,238,0.12)'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="inline-flex items-center rounded-full bg-cyan-400/6 px-3 py-1 text-xs font-medium text-cyan-100/90"
                      style={{ border: '1px solid rgba(34,211,238,0.12)' }}
                    >
                      {t('auth.vault_bridge_trusted_context')}
                    </motion.span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs leading-6 text-soft-grey">
                    <span>
                      {t('auth.vault_bridge_identity_label')}{' '}
                      <span className="text-white/85">{t('auth.vault_bridge_identity_value')}</span>
                    </span>
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 md:max-w-[320px] backdrop-blur-sm">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                    {t('auth.vault_bridge_vault_label')}
                  </div>
                  <div className="break-all font-mono text-xs leading-6 text-white/80">
                    {context?.vault_id || t('auth.vault_bridge_pending')}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {installRequired && (
            <div className="cosmic-status-card mx-auto mt-6 w-full max-w-4xl px-8 py-6">
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--cosmic-cyan)' }}>
                {t('auth.vault_bridge_install_required')}
              </p>
              <div className="space-y-2 text-sm text-soft-grey">
                <p>{t('auth.vault_bridge_install_desc_1')}</p>
                <p>{t('auth.vault_bridge_install_desc_2')}</p>
                {launcherState?.installerPath && (
                  <p className="font-mono break-all text-xs">{launcherState.installerPath}</p>
                )}
              </div>
            </div>
          )}

          {desktopOnly && !installRequired && (
            <div className="cosmic-status-card mx-auto mt-6 w-full max-w-4xl px-8 py-6">
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--cosmic-cyan)' }}>
                {t('auth.vault_bridge_desktop_required')}
              </p>
              <div className="space-y-2 text-sm text-soft-grey">
                <p>{t('auth.vault_bridge_desktop_desc_1')}</p>
                <p>{t('auth.vault_bridge_desktop_desc_2')}</p>
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
        </div>

        <div className="auth-actions">
          <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <CosmicGhostButton onClick={onBack} disabled={loading}>
                  {t('common.back')}
                </CosmicGhostButton>
                {!installRequired && !desktopOnly && hasLinkedVault && (
                  <CosmicGhostButton onClick={onLaunch} disabled={loading}>
                    {loading ? t('auth.vault_bridge_opening') : t('auth.vault_bridge_reopen_button')}
                  </CosmicGhostButton>
                )}
              </div>

              <div className="flex flex-col items-center gap-3">
                <div className="max-w-xs w-full">
                  {(installRequired || desktopOnly) ? (
                    <CosmicActionButton onClick={onInstall} disabled={loading}>
                      {loading ? t('auth.vault_bridge_preparing') : t('auth.vault_bridge_install_button')}
                    </CosmicActionButton>
                  ) : context ? (
                    <CosmicActionButton onClick={onConnect} disabled={loading || !hasLinkedVault}>
                      {loading ? t('auth.vault_bridge_verifying') : t('auth.vault_bridge_verify_button')}
                    </CosmicActionButton>
                  ) : (
                    <CosmicActionButton onClick={onLaunch} disabled={loading}>
                      {loading ? t('auth.vault_bridge_opening') : t('auth.vault_bridge_open_button')}
                    </CosmicActionButton>
                  )}
                </div>

                {/* QR / Code login */}
                <QrTokenInput onRedeem={onQrRedeem} loading={qrLoading} error={qrError} />

                {/* Quick unlock — vaults previously imported on this device with a password. */}
                {storedBundles.length > 0 && (
                  <QuickUnlockList
                    entries={storedBundles}
                    onUnlock={onQuickUnlock}
                    onForget={onForgetStoredBundle}
                    loading={keybundleLoading}
                    disabled={loading}
                  />
                )}

                {/* Keybundle file import — restore from a previously downloaded
                    .eidolon_keybundle. Works offline (no Connect session needed). */}
                <KeybundleImportWidget
                  onFile={onKeybundleImport}
                  loading={keybundleLoading}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        </div>
    </AuthStage>
  );
}

function KeybundleImportWidget({
  onFile,
  loading,
  disabled,
}: {
  onFile: (file: File, rememberPassword?: string) => void;
  loading: boolean;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [remember, setRemember] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');

  const handlePick = (file?: File | null) => {
    setLocalError('');
    if (!file) return;
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      setLocalError(`fichier invalide (${file.size} bytes)`);
      return;
    }
    setPicked(file);
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = () => {
    if (!picked) return;
    if (remember) {
      if (password.length < 8) {
        setLocalError('mot de passe trop court (8 caractères minimum)');
        return;
      }
      if (password !== confirm) {
        setLocalError('les mots de passe ne correspondent pas');
        return;
      }
    }
    onFile(picked, remember ? password : undefined);
  };

  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-2">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">ou</div>
      <button
        type="button"
        disabled={loading || disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handlePick(e.dataTransfer.files[0]);
        }}
        className={`w-full rounded-2xl border px-4 py-3 text-sm transition-colors ${
          dragOver
            ? 'border-amber-300/70 bg-amber-300/10 text-amber-100'
            : 'border-white/15 bg-white/[0.03] text-white/85 hover:border-amber-300/40 hover:bg-amber-300/[0.04]'
        } ${loading || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {loading
          ? 'Restauration…'
          : picked
            ? `${picked.name} (${Math.round(picked.size / 1024)} KB)`
            : 'J\u2019ai un fichier .eidolon_keybundle'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".eidolon_keybundle"
        className="hidden"
        onChange={(e) => handlePick(e.target.files?.[0])}
      />
      {!picked && (
        <div className="text-[11px] text-white/40 text-center leading-4">
          Déposez votre fichier de sauvegarde pour restaurer votre vault.
        </div>
      )}
      {picked && (
        <div className="w-full flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={loading}
            />
            <span>Retenir ce vault sur cet appareil</span>
          </label>
          {remember && (
            <>
              <input
                type="password"
                placeholder="Mot de passe (8 caractères min)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white/90 outline-none focus:border-amber-300/50"
                autoComplete="new-password"
              />
              <input
                type="password"
                placeholder="Confirmer"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={loading}
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white/90 outline-none focus:border-amber-300/50"
                autoComplete="new-password"
              />
            </>
          )}
          {localError && (
            <div className="text-[11px] text-rose-300/80">{localError}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setPicked(null); setPassword(''); setConfirm(''); setLocalError(''); }}
              disabled={loading}
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.05]"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-xs text-amber-100 hover:bg-amber-300/15 disabled:opacity-50"
            >
              {loading ? 'Restauration…' : 'Restaurer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Lists vaults previously imported on this device and saved under a password.
 * Clicking a row expands it into a password prompt — unlock decrypts the
 * stored bundle and replays the import flow, giving the user a login without
 * having to find their .eidolon_keybundle file again.
 */
function QuickUnlockList({
  entries,
  onUnlock,
  onForget,
  loading,
  disabled,
}: {
  entries: StoredBundleEntry[];
  onUnlock: (vaultId: string, password: string) => void;
  onForget: (vaultId: string) => void;
  loading: boolean;
  disabled: boolean;
}) {
  const [openVaultId, setOpenVaultId] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  return (
    <div className="w-full max-w-xs flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70 text-center">
        Vaults enregistrés sur cet appareil
      </div>
      {entries.map((entry) => {
        const expanded = openVaultId === entry.vaultId;
        return (
          <div
            key={entry.vaultId}
            className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.03] p-3"
          >
            <button
              type="button"
              onClick={() => {
                setOpenVaultId(expanded ? null : entry.vaultId);
                setPassword('');
              }}
              disabled={disabled}
              className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-50"
            >
              <div className="min-w-0">
                <div className="text-sm text-white/90 truncate">
                  {entry.vaultName || entry.vaultId.slice(0, 12)}
                </div>
                <div className="text-[10px] font-mono text-white/40 truncate">
                  {entry.vaultId.slice(0, 16)}…
                </div>
              </div>
              <div className="text-[11px] text-cyan-200/70">
                {expanded ? 'fermer' : 'débloquer'}
              </div>
            </button>
            {expanded && (
              <div className="mt-2 flex flex-col gap-2">
                <input
                  type="password"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && password) onUnlock(entry.vaultId, password);
                  }}
                  disabled={loading}
                  autoFocus
                  className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white/90 outline-none focus:border-cyan-300/50"
                  autoComplete="current-password"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onForget(entry.vaultId)}
                    disabled={loading}
                    className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-rose-300/70 hover:bg-rose-500/10"
                    title="Oublier ce vault (supprime la sauvegarde locale chiffrée)"
                  >
                    Oublier
                  </button>
                  <button
                    type="button"
                    onClick={() => password && onUnlock(entry.vaultId, password)}
                    disabled={loading || !password}
                    className="flex-1 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-50"
                  >
                    {loading ? 'Débloquage…' : 'Débloquer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
