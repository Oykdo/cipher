import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { getRecoveryKeys } from "../../services/api-interceptor";
import { getKeyVault } from "../../lib/keyVault";
import { exportUserData, importUserData, validateExportFile } from "../../lib/dataExport";
import { getBackupExportPassword, hasBackupExportPassword, setBackupExportPassword } from "../../lib/backupPassword";
import { scryptAsync } from "@noble/hashes/scrypt";
import { 
    exportToBackupVault, 
    importFromBackupVault, 
    validateBackupFile,
} from "../../lib/backup";
import { exportVaultKeybundle } from "../../lib/keybundle";

// File System Access API Types
interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: Blob | BufferSource | string): Promise<void>;
    close(): Promise<void>;
}

interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: {
        description: string;
        accept: Record<string, string[]>;
    }[];
}

declare global {
    interface Window {
        showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    }
}

export function BackupSettings() {
    const { t } = useTranslation();
    const session = useAuthStore((state) => state.session);
    const linkedVault = session?.user?.linkedVault;
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const token = useAuthStore((state) => state.session?.accessToken);

    // Password prompt for KeyVault unlock
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState("");
    const [unlockError, setUnlockError] = useState("");

    // Data Portability Export/Import states
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportPassword, setExportPassword] = useState("");
    const [exportPasswordConfirm, setExportPasswordConfirm] = useState("");
    const [checkingSavedExportPassword, setCheckingSavedExportPassword] = useState(false);
    const [hasSavedExportPassword, setHasSavedExportPassword] = useState(false);
    const [changeExportPassword, setChangeExportPassword] = useState(true);
    const [includeMessages, setIncludeMessages] = useState(true);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importPassword, setImportPassword] = useState("");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importValidation, setImportValidation] = useState<{ valid: boolean; encrypted: boolean; stats: { conversations: number; messages: number; contacts: number } } | null>(null);
    
    // Backup Vault v2 states
    const [exportProgress, setExportProgress] = useState<{ stage: string; progress: number } | null>(null);
    const useVaultV2 = true; // Always use new secure format (Argon2id + XChaCha20-Poly1305)
    const [backupValidation, setBackupValidation] = useState<{ valid: boolean; version: number; encrypted: boolean; createdAt?: string } | null>(null);

    // Keybundle download state
    const [keybundleState, setKeybundleState] = useState<'idle' | 'downloading' | 'ok' | 'error'>('idle');
    const [keybundleMessage, setKeybundleMessage] = useState<string>('');

    const handleDownloadKeybundle = async () => {
        if (!linkedVault?.vaultId) return;
        setKeybundleState('downloading');
        setKeybundleMessage('');
        const r = await exportVaultKeybundle(linkedVault.vaultId);
        if (r.ok) {
            setKeybundleState('ok');
            setKeybundleMessage(`${r.filename} — ${Math.round(r.size / 1024)} KB`);
        } else {
            setKeybundleState('error');
            setKeybundleMessage(r.error);
        }
    };

    useEffect(() => {
        if (!showExportModal) return;

        const username = session?.user?.username;
        let cancelled = false;

        setCheckingSavedExportPassword(true);
        setHasSavedExportPassword(false);
        setChangeExportPassword(true);
        setExportPassword('');
        setExportPasswordConfirm('');

        (async () => {
            if (!username) {
                if (!cancelled) setCheckingSavedExportPassword(false);
                return;
            }

            const hasSaved = await hasBackupExportPassword(username);
            if (cancelled) return;

            setHasSavedExportPassword(hasSaved);
            setChangeExportPassword(!hasSaved);
            setCheckingSavedExportPassword(false);
        })();

        return () => {
            cancelled = true;
        };
    }, [showExportModal, session?.user?.username]);

    // Unlock KeyVault with password
    const handleUnlockVault = async () => {
        const username = session?.user?.username;
        if (!username || !unlockPassword) return;

        setUnlockError("");
        setLoading(true);

        try {
            // Try to open KeyVault with provided password
            const vault = await getKeyVault(unlockPassword);
            const masterKey =
                (await vault.getData(`masterKey:${username.toLowerCase()}`)) ||
                (await vault.getData(`masterKey:${username}`));

            if (!masterKey) {
                setUnlockError(t('settings.backup_settings.wrong_password'));
                setLoading(false);
                return;
            }

            // Success - close prompt and proceed with export
            setShowPasswordPrompt(false);
            setUnlockPassword("");
            await performExport(masterKey);
        } catch (err) {
            console.error('Vault unlock error:', err);
            setUnlockError(t('settings.backup_settings.wrong_password'));
        } finally {
            setLoading(false);
        }
    };

    // Helper function to decrypt data with masterKey (matching backend encryption)
    const decryptWithMasterKey = async (encryptedJson: unknown, masterKeyHex: string): Promise<string | null> => {
        try {
            if (!encryptedJson || !masterKeyHex) return null;
            
            // Check if it's encrypted format
            if (typeof encryptedJson === 'string' && !encryptedJson.trim().startsWith('{')) {
                // Plain text
                return encryptedJson;
            }

            const data: any = typeof encryptedJson === 'string' ? JSON.parse(encryptedJson) : encryptedJson;
            if (!data?.v || !data?.alg || !data?.s || !data?.iv || !data?.ct || !data?.tag) {
                // Plain text or unknown format
                return typeof encryptedJson === 'string' ? encryptedJson : JSON.stringify(encryptedJson);
            }

            // Backend uses: scryptSync(Buffer.from(masterKeyHex, 'hex'), salt, 32) + AES-256-GCM

            const salt = Uint8Array.from(atob(data.s), (c) => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(data.iv), (c) => c.charCodeAt(0));
            const ciphertext = Uint8Array.from(atob(data.ct), (c) => c.charCodeAt(0));
            const tag = Uint8Array.from(atob(data.tag), (c) => c.charCodeAt(0));

            // Combine ciphertext and tag for WebCrypto AES-GCM (expects tag appended)
            const combined = new Uint8Array(ciphertext.length + tag.length);
            combined.set(ciphertext);
            combined.set(tag, ciphertext.length);

            const masterKeyBytes = Uint8Array.from(masterKeyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
            const keyBytes = await scryptAsync(masterKeyBytes, salt, { N: 16384, r: 8, p: 1, dkLen: 32 });

            // Import raw key bytes into WebCrypto (ensure we have a plain ArrayBuffer-backed Uint8Array)
            const rawKeyBytes = new Uint8Array(keyBytes);
            const key = await crypto.subtle.importKey('raw', rawKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);

            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);

            keyBytes.fill(0);
            rawKeyBytes.fill(0);
            masterKeyBytes.fill(0);

            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.error('[BackupSettings] Decryption failed:', error);
            return null;
        }
    };

    const parseDecryptedStringArray = (value: string): string[] | null => {
        const trimmed = value.trim();
        if (!trimmed) return null;

        // JSON array or JSON object
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.filter(Boolean).map(String);
                }
                if (parsed && typeof parsed === 'object') {
                    const maybeMnemonic = (parsed as any).mnemonic;
                    const maybeChecksums = (parsed as any).checksums;
                    if (Array.isArray(maybeMnemonic)) return maybeMnemonic.filter(Boolean).map(String);
                    if (Array.isArray(maybeChecksums)) return maybeChecksums.filter(Boolean).map(String);
                }
            } catch {
                // fallthrough
            }
        }

        // Plaintext list (space/newline separated)
        const parts = trimmed.split(/\s+/g).filter(Boolean);
        return parts.length ? parts : null;
    };

    // Perform the actual export
    const performExport = async (masterKey: string) => {
        const username = session?.user?.username;
        if (!username) return;

        setLoading(true);
        setMessage({ type: 'success', text: t('settings.backup_settings.retrieving_keys') });

        try {
            // SECURITY: Get encrypted data from server, decrypt locally
            const recoveryData = await getRecoveryKeys();

            if (!recoveryData.success) {
                throw new Error('Échec de la récupération des clés');
            }

            // Decrypt mnemonic locally using masterKey
            let mnemonic: string[] | null = null;
            let checksums: string[] | null = null;

            if (recoveryData.encryptedMnemonic) {
                const decryptedMnemonic = await decryptWithMasterKey(recoveryData.encryptedMnemonic, masterKey);
                if (decryptedMnemonic) {
                    mnemonic = parseDecryptedStringArray(decryptedMnemonic);
                    if (!mnemonic) console.warn('[BackupSettings] Failed to parse decrypted mnemonic');
                }
            }

            if (recoveryData.encryptedChecksums) {
                const decryptedChecksums = await decryptWithMasterKey(recoveryData.encryptedChecksums, masterKey);
                if (decryptedChecksums) {
                    checksums = parseDecryptedStringArray(decryptedChecksums);
                    if (!checksums) console.warn('[BackupSettings] Failed to parse decrypted checksums');
                }
            }

            // Generate export content with REAL recovery keys (English by default)
            let content = `═══════════════════════════════════════════════════════\n`;
            content += `  CIPHER - RECOVERY KEYS\n`;
            content += `═══════════════════════════════════════════════════════\n\n`;
            content += `⚠️  CRITICAL INFORMATION - NEVER SHARE THIS FILE\n\n`;
            content += `Username: ${recoveryData.username}\n`;
            content += `User ID: ${recoveryData.userId}\n`;
            content += `Security Tier: ${recoveryData.securityTier}\n`;
            content += `Creation Date: ${new Date(recoveryData.createdAt).toLocaleString('en-US')}\n`;
            content += `Export Date: ${new Date().toLocaleString('en-US')}\n\n`;
            content += `───────────────────────────────────────────────────────\n\n`;

            if (recoveryData.securityTier === 'standard') {
                if (!mnemonic || (mnemonic.length !== 12 && mnemonic.length !== 24)) {
                    throw new Error('Impossible de récupérer la passphrase (mnemonic) - vérifiez votre mot de passe/Quick Unlock.');
                }
                content += `📝 MNEMONIC PHRASE (BIP-39)\n\n`;
                content += `Keep this phrase in a safe place. It is the ONLY\n`;
                content += `way to recover your account.\n\n`;
                content += `${mnemonic.join(' ')}\n\n`;
                content += `⚠️  WARNING: This phrase is unique and irreplaceable.\n`;
                content += `    If you lose it, access to your account will be PERMANENTLY lost.\n\n`;
            } else if (recoveryData.securityTier === 'dice-key') {
                if (!checksums || checksums.length === 0) {
                    throw new Error('Impossible de récupérer les checksums DiceKey - vérifiez votre mot de passe/Quick Unlock.');
                }
                content += `🎲 DICEKEY ACCOUNT (775 bits)\n\n`;
                content += `Your account uses the ultra-secure DiceKey method.\n\n`;

                // Display checksums if available
                content += `📝 YOUR VERIFICATION CHECKSUMS (${checksums.length} series):\n\n`;
                checksums.forEach((checksum: string, i: number) => {
                    content += `  Series ${String(i + 1).padStart(2, ' ')}: ${checksum}\n`;
                });
                content += `\n`;

                content += `🔐 HOW TO LOG IN:\n\n`;
                content += `   Method 1: User ID + Checksums\n`;
                content += `   Enter your User ID and all 30 checksums above.\n`;
                content += `   This is the RECOMMENDED method for recovery.\n\n`;
                content += `   Method 2: Re-enter 300 Dice Rolls\n`;
                content += `   If you saved your original dice sequence, you can\n`;
                content += `   re-enter all 300 rolls to regenerate your keys.\n\n`;
                content += `💡 TIP: The checksums ARE your recovery keys.\n`;
                content += `   Keep this file safe - it contains everything\n`;
                content += `   you need to access your account.\n\n`;
            }

            content += `───────────────────────────────────────────────────────\n\n`;
            content += `🛡️  SECURITY GUIDELINES:\n\n`;
            content += `• Do NOT store this file on an unencrypted cloud\n`;
            content += `• Use a secure password manager (Bitwarden, 1Password, etc.)\n`;
            content += `• Or print and store in a physical safe\n`;
            content += `• Make multiple copies in DIFFERENT locations\n`;
            content += `• NEVER share this information with ANYONE\n`;
            content += `• No support member will EVER ask for these keys\n\n`;
            content += `═══════════════════════════════════════════════════════\n`;
            content += `  Cipher - Zero-Knowledge Architecture\n`;
            content += `  Without these keys, NO ONE (not even us) can\n`;
            content += `  recover your account. This is the price of security.\n`;
            content += `═══════════════════════════════════════════════════════\n`;

            // Create download
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const filename = `cipher-recovery-${recoveryData.username}-${Date.now()}.txt`;

            // Try File System Access API
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: 'Text File',
                            accept: { 'text/plain': ['.txt'] },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    setMessage({
                        type: 'success',
                        text: t('settings.backup_settings.export_success')
                    });
                    setLoading(false);
                    return;
                } catch (err) {
                    if (err instanceof Error && err.name === 'AbortError') {
                        setLoading(false);
                        return;
                    }
                    console.warn('File Picker failed, falling back to download', err);
                }
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setMessage({
                type: 'success',
                text: t('settings.backup_settings.export_success')
            });

        } catch (error) {
            console.error('Recovery export error:', error);
            const errorMessage = error instanceof Error ? error.message : t('settings.backup_settings.backup_failed');
            setMessage({ type: 'error', text: `❌ ${errorMessage}` });
        } finally {
            setLoading(false);
        }
    };

    // RGPD Compliant Full Data Export
    const handleRgpdExport = async () => {
        if (!token) return;

        if (checkingSavedExportPassword) return;

        const username = session?.user?.username;
        let passwordToUse: string | null = null;
        let shouldPersistPassword = false;

        if (hasSavedExportPassword && !changeExportPassword) {
            if (!username) {
                setMessage({ type: 'error', text: t('settings.backup_settings.invalid_session', 'Invalid session. Please log in again.') });
                return;
            }

            passwordToUse = await getBackupExportPassword(username);
            if (!passwordToUse) {
                setHasSavedExportPassword(false);
                setChangeExportPassword(true);
                setMessage({
                    type: 'error',
                    text: t('settings.backup_settings.saved_password_missing', 'Saved backup password not found on this device. Please set it again.'),
                });
                return;
            }
        } else {
            if (!exportPassword) {
                setMessage({ type: 'error', text: t('settings.backup_settings.password_required', 'Password is required for secure backup') });
                return;
            }

            if (exportPassword !== exportPasswordConfirm) {
                setMessage({ type: 'error', text: t('settings.backup_settings.password_mismatch', 'Passwords do not match') });
                return;
            }

            if (exportPassword.length < 8) {
                setMessage({ type: 'error', text: t('settings.backup_settings.password_too_short', 'Password must be at least 8 characters') });
                return;
            }

            passwordToUse = exportPassword;
            shouldPersistPassword = Boolean(username);
        }

        if (!passwordToUse) return;
        const password = passwordToUse;

        setLoading(true);
        setMessage(null);
        setExportProgress(null);

        try {
            let blob: Blob;
            let filename: string;

            if (useVaultV2) {
                // Use new Backup Vault v2 (Argon2id + XChaCha20-Poly1305)
                blob = await exportToBackupVault(
                    password,
                    { includeMessages, includeContacts: true, includeIdentityKeys: false },
                    (stage, progress) => setExportProgress({ stage, progress })
                );
                filename = `cipher-backup-v2-${Date.now()}.json`;
            } else {
                // Fallback to legacy export (PBKDF2 + AES-GCM)
                const result = await exportUserData(
                    token,
                    password,
                    { includeMessages }
                );
                blob = result.blob;
                filename = result.filename;
            }

            // Try File System Access API
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: 'Secure Backup',
                            accept: { 'application/json': ['.json'] },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    if (shouldPersistPassword && username) {
                        await setBackupExportPassword(username, password);
                        setHasSavedExportPassword(true);
                        setChangeExportPassword(false);
                    }

                    setMessage({ type: 'success', text: t('settings.backup_settings.rgpd_export_success', 'Backup created successfully') });
                    setShowExportModal(false);
                    setExportPassword('');
                    setExportPasswordConfirm('');
                    setExportProgress(null);
                    return;
                } catch (err) {
                    if (err instanceof Error && err.name === 'AbortError') {
                        setExportProgress(null);
                        return;
                    }
                }
            }

            // Fallback download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (shouldPersistPassword && username) {
                await setBackupExportPassword(username, password);
                setHasSavedExportPassword(true);
                setChangeExportPassword(false);
            }

            setMessage({ type: 'success', text: t('settings.backup_settings.rgpd_export_success', 'Backup created successfully') });
            setShowExportModal(false);
            setExportPassword('');
            setExportPasswordConfirm('');
        } catch (error) {
            console.error('Backup export error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Export failed';
            setMessage({ type: 'error', text: errorMessage });
        } finally {
            setLoading(false);
            setExportProgress(null);
        }
    };

    // Validate import file when selected
    const handleImportFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setImportFile(file);
        setImportValidation(null);
        setBackupValidation(null);

        try {
            // Try v2 format first (Backup Vault)
            const v2Validation = await validateBackupFile(file);
            if (v2Validation.valid && v2Validation.version === 2) {
                setBackupValidation(v2Validation);
                setMessage({ type: 'success', text: t('settings.backup_settings.secure_backup_detected', 'Sauvegarde v2 détectée. Entrez le mot de passe pour restaurer.') });
                return;
            }

            // Fall back to v1 format validation
            const validation = await validateExportFile(file);
            setImportValidation(validation);

            if (validation.encrypted && !importPassword) {
                setMessage({ type: 'error', text: t('settings.backup_settings.file_encrypted', 'Fichier chiffré. Entrez le mot de passe.') });
            }
        } catch {
            setMessage({ type: 'error', text: t('settings.backup_settings.invalid_file', 'Invalid backup file') });
        }
    };

    // Handle backup import (supports both v1 and v2 formats)
    const handleRgpdImport = async () => {
        if (!importFile) return;

        if (!importPassword) {
            setMessage({ type: 'error', text: t('settings.backup_settings.password_required', 'Password is required to decrypt backup') });
            return;
        }

        setLoading(true);
        setMessage(null);
        setExportProgress(null);

        try {
            // Check if it's a v2 backup
            if (backupValidation?.version === 2) {
                // Use new Backup Vault import
                const result = await importFromBackupVault(
                    importFile,
                    importPassword,
                    (stage, progress) => setExportProgress({ stage, progress })
                );

                if (result.success) {
                    setMessage({
                        type: 'success',
                        text: `${t('settings.backup_settings.import_success', 'Import successful')}. ${result.imported.conversations} conversations, ${result.imported.messages} messages.`,
                    });
                } else {
                    setMessage({
                        type: 'error',
                        text: result.errors.join(', ') || 'Import failed',
                    });
                }
            } else if (token) {
                // Fall back to legacy v1 import
                const currentUserId = session?.user?.id;
                if (!currentUserId) {
                    throw new Error('Not authenticated');
                }
                const result = await importUserData(token, importFile, importPassword, currentUserId);

                setMessage({
                    type: 'success',
                    text: `${t('settings.backup_settings.import_success', 'Import successful')}. ${result.imported.conversations} conversations, ${result.imported.messages} messages.`,
                });
            } else {
                throw new Error('Not authenticated');
            }

            setShowImportModal(false);
            setImportFile(null);
            setImportPassword('');
            setImportValidation(null);
            setBackupValidation(null);
        } catch (error) {
            console.error('Backup import error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Import failed';
            setMessage({ type: 'error', text: errorMessage });
        } finally {
            setLoading(false);
            setExportProgress(null);
        }
    };

    return (
        <div className="space-y-8">
            {/* Password Prompt Modal */}
            {showPasswordPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="cosmic-glass-card cosmic-glow-border w-full max-w-md rounded-3xl p-6">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-amber-200">
                            <span>VAULT</span>
                            <span>UNLOCK</span>
                        </div>
                        <h3 className="mb-4 text-xl font-semibold text-white">
                            {t('settings.backup_settings.unlock_vault_title')}
                        </h3>
                        <p className="mb-4 text-sm text-slate-300">
                            {t('settings.backup_settings.unlock_vault_desc')}
                        </p>
                        <input
                            type="password"
                            value={unlockPassword}
                            onChange={(e) => setUnlockPassword(e.target.value)}
                            placeholder={t('settings.backup_settings.password_placeholder')}
                            className="cosmic-input mb-4 w-full"
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlockVault()}
                            autoFocus
                        />
                        {unlockError && (
                            <p className="mb-4 text-sm text-red-200">{unlockError}</p>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowPasswordPrompt(false);
                                    setUnlockPassword("");
                                    setUnlockError("");
                                }}
                                className="cosmic-btn-ghost flex-1"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleUnlockVault}
                                disabled={loading || !unlockPassword}
                                className="cosmic-cta flex flex-1 items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {loading && (
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                {t('settings.backup_settings.unlock_button')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Message */}
            {message && (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${message.type === "success"
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-red-400/30 bg-red-500/10 text-red-200"
                    }`}>
                    {message.text}
                </div>
            )}

            {/* Primary CTA — download the Eidolon keybundle (identity backup). */}
            {linkedVault && (
                <div>
                    <h2 className="mb-4 text-xl font-semibold text-white">
                        {t('settings.backup_settings.keybundle_title')}
                    </h2>
                    <div className="cosmic-glass-card cosmic-glow-border rounded-3xl border border-amber-400/20 p-6">
                        <p className="mb-4 text-sm leading-6 text-slate-300">
                            {t('settings.backup_settings.keybundle_desc')}
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={handleDownloadKeybundle}
                                disabled={keybundleState === 'downloading'}
                                className="cosmic-cta inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                {keybundleState === 'downloading'
                                    ? t('settings.backup_settings.keybundle_downloading')
                                    : t('settings.backup_settings.keybundle_download')}
                            </button>
                            {keybundleState === 'ok' && (
                                <span className="text-xs text-emerald-300/80">{keybundleMessage}</span>
                            )}
                            {keybundleState === 'error' && (
                                <span className="text-xs text-rose-300/80">{keybundleMessage}</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Conversations export / import. */}
            <div>
                <h2 className="mb-4 text-xl font-semibold text-white">
                    {t('settings.backup_settings.conversations_title')}
                </h2>
                <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                    <p className="mb-5 text-sm leading-6 text-slate-300">
                        {t('settings.backup_settings.conversations_desc')}
                    </p>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <button
                            onClick={() => setShowExportModal(true)}
                            className="cosmic-cta inline-flex min-h-[56px] items-center justify-center gap-2 shadow-[0_10px_30px_rgba(16,185,129,0.18)]"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            {t('settings.backup_settings.conversations_export')}
                        </button>
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="cosmic-btn-ghost inline-flex min-h-[56px] items-center justify-center gap-2 border-white/10 bg-white/[0.03]"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            {t('settings.backup_settings.conversations_import')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Secure Backup Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="cosmic-glass-card cosmic-glow-border w-full max-w-md rounded-3xl p-6">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-200">
                            <span>SECURE</span>
                            <span>BACKUP</span>
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-4">
                            {t('settings.backup_settings.export_data_title', linkedVault
                                ? 'Nouvelle sauvegarde Cipher'
                                : 'Nouvelle sauvegarde chiffrée')}
                        </h3>

                        {/* Progress indicator */}
                        {exportProgress && (
                            <div className="mb-4">
                                <div className="flex justify-between text-sm text-slate-300 mb-1">
                                    <span>{exportProgress.stage}</span>
                                    <span>{Math.round(exportProgress.progress)}%</span>
                                </div>
                                <div className="w-full h-2 bg-slate-900/80 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                                        style={{ width: `${exportProgress.progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 mb-6">
                            {/* Security info */}
                            <div className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                                <span className="mt-px shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">crypto</span>
                                <span className="text-xs leading-relaxed text-slate-400">{t('settings.backup_settings.secure_format_desc', 'Argon2id + XChaCha20-Poly1305')}</span>
                            </div>

                            {/* Wrap effect — plain-language guarantee derived from the crypto above */}
                            <div className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                                <span className="mt-px shrink-0 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">wrap</span>
                                <span className="text-xs leading-relaxed text-slate-400">{t('settings.backup_settings.wrap_effect_desc', 'Votre clé de chiffrement est scellée par votre mot de passe — le backup reste illisible sans lui, même en cas de fuite du fichier.')}</span>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={includeMessages}
                                    onChange={(e) => setIncludeMessages(e.target.checked)}
                                    className="h-5 w-5 rounded border-white/20 bg-slate-950/80 text-cyan-400 focus:ring-cyan-400"
                                    disabled={loading}
                                />
                                <span className="text-slate-200">
                                    {t('settings.backup_settings.include_messages', 'Inclure l\'historique des messages')}
                                </span>
                            </label>

                            <div className="border-t border-white/10 pt-4">
                                {checkingSavedExportPassword ? (
                                    <p className="text-slate-300 text-sm">
                                        {t('settings.backup_settings.checking_saved_password', 'Checking saved backup password for this device...')}
                                    </p>
                                ) : hasSavedExportPassword && !changeExportPassword ? (
                                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                                        <p className="text-slate-200 text-sm">
                                            {t('settings.backup_settings.saved_password_in_use', 'Mot de passe de sauvegarde actif sur cet appareil. Les exports suivants le réutiliseront.')}
                                        </p>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setChangeExportPassword(true);
                                                    setExportPassword('');
                                                    setExportPasswordConfirm('');
                                                }}
                                                className="cosmic-btn-ghost text-sm"
                                                disabled={loading}
                                            >
                                                {t('settings.backup_settings.change_backup_password', 'Change password')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-slate-300 text-sm mb-3">
                                            {t('settings.backup_settings.backup_password_required', 'Définissez un mot de passe pour protéger la sauvegarde :')}
                                        </p>
                                        <input
                                            type="password"
                                            value={exportPassword}
                                            onChange={(e) => setExportPassword(e.target.value)}
                                            placeholder={t('settings.backup_settings.export_password_placeholder', 'Backup password (min. 8 characters)')}
                                            className="cosmic-input w-full mb-2"
                                            disabled={loading}
                                        />
                                        <input
                                            type="password"
                                            value={exportPasswordConfirm}
                                            onChange={(e) => setExportPasswordConfirm(e.target.value)}
                                            placeholder={t('settings.backup_settings.confirm_password', 'Confirm password')}
                                            className="cosmic-input w-full"
                                            disabled={loading}
                                        />
                                        {exportPassword && exportPassword.length < 8 && (
                                            <p className="text-amber-200 text-xs mt-1">
                                                {t('settings.backup_settings.password_min_length', 'Password must be at least 8 characters')}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowExportModal(false);
                                    setExportPassword('');
                                    setExportPasswordConfirm('');
                                    setExportProgress(null);
                                }}
                                className="cosmic-btn-ghost flex-1"
                                disabled={loading}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleRgpdExport}
                                disabled={
                                    loading ||
                                    checkingSavedExportPassword ||
                                    (!hasSavedExportPassword || changeExportPassword
                                        ? !exportPassword || exportPassword.length < 8 || exportPassword !== exportPasswordConfirm
                                        : false)
                                }
                                className="cosmic-cta flex flex-1 items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {loading && (
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                {t('settings.backup_settings.export_button', 'Export')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Secure Backup Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="cosmic-glass-card cosmic-glow-border w-full max-w-md rounded-3xl p-6">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200">
                            <span>RESTORE</span>
                            <span>BACKUP</span>
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-4">
                            {t('settings.backup_settings.import_data_title', linkedVault
                                ? 'Restaurer une sauvegarde'
                                : 'Importer une sauvegarde')}
                        </h3>

                        <div className="mb-4 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] p-3 text-xs leading-5 text-slate-200">
                            {t('settings.backup_settings.import_merge_notice')}
                        </div>

                        {/* Progress indicator */}
                        {exportProgress && (
                            <div className="mb-4">
                                <div className="flex justify-between text-sm text-slate-300 mb-1">
                                    <span>{exportProgress.stage}</span>
                                    <span>{Math.round(exportProgress.progress)}%</span>
                                </div>
                                <div className="w-full h-2 bg-slate-900/80 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                                        style={{ width: `${exportProgress.progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-slate-200 text-sm mb-2">
                                    {t('settings.backup_settings.select_file', 'Fichier de sauvegarde')}
                                </label>
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleImportFileSelect}
                                    disabled={loading}
                                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-2 text-white file:mr-4 file:rounded-full file:border file:border-white/10 file:bg-white/5 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-200 disabled:opacity-50"
                                />
                            </div>

                            {/* v2 Backup Validation */}
                            {backupValidation && (
                                <div className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                                    <span className="mt-px shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">v2</span>
                                    <div className="text-xs leading-relaxed text-slate-400">
                                        <span className="text-slate-300">{t('settings.backup_settings.secure_backup_v2', 'Sauvegarde chiffree v2')}</span>
                                        {backupValidation.createdAt && (
                                            <span className="ml-2 text-slate-500">{new Date(backupValidation.createdAt).toLocaleString()}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* v1 Backup Validation */}
                            {importValidation && !backupValidation && (
                                <div className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                                    {importValidation.valid ? (
                                        <>
                                            <span className="mt-px shrink-0 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">v1</span>
                                            <div className="text-xs leading-relaxed text-slate-400">
                                                <span className="text-slate-300">{t('settings.backup_settings.legacy_backup', 'Sauvegarde legacy')}</span>
                                                <span className="ml-2 text-slate-500">
                                                    {importValidation.stats.conversations} conv. {importValidation.stats.messages} msg.
                                                    {importValidation.encrypted && ' (chiffre)'}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="mt-px shrink-0 rounded-md border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-400">err</span>
                                            <span className="text-xs leading-relaxed text-slate-400">{t('settings.backup_settings.invalid_file', 'Fichier invalide')}</span>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Password input - always shown for v2, conditional for v1 */}
                            {(backupValidation || importValidation?.encrypted) && (
                                <div>
                                    <label className="block text-slate-200 text-sm mb-2">
                                        {t('settings.backup_settings.decrypt_password', 'Backup password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={importPassword}
                                        onChange={(e) => setImportPassword(e.target.value)}
                                        placeholder={t('settings.backup_settings.enter_password', 'Enter password')}
                                        className="cosmic-input w-full"
                                        disabled={loading}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowImportModal(false);
                                    setImportFile(null);
                                    setImportPassword('');
                                    setImportValidation(null);
                                    setBackupValidation(null);
                                    setExportProgress(null);
                                }}
                                className="cosmic-btn-ghost flex-1"
                                disabled={loading}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleRgpdImport}
                                disabled={loading || !importFile || (!backupValidation && !importValidation?.valid) || ((backupValidation || importValidation?.encrypted) && !importPassword)}
                                className="cosmic-cta flex flex-1 items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {loading && (
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                {t('settings.backup_settings.import_button', 'Import')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
