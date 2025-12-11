import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { getRecoveryKeys } from "../../services/api-interceptor";
import { getExistingKeyVault, getKeyVault } from "../../lib/keyVault";
import { exportUserData, importUserData, validateExportFile } from "../../lib/dataExport";
import { 
    exportToBackupVault, 
    importFromBackupVault, 
    validateBackupFile 
} from "../../lib/backup";

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
    const [includeMessages, setIncludeMessages] = useState(true);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importPassword, setImportPassword] = useState("");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importValidation, setImportValidation] = useState<{ valid: boolean; encrypted: boolean; stats: { conversations: number; messages: number; contacts: number } } | null>(null);
    
    // Backup Vault v2 states
    const [exportProgress, setExportProgress] = useState<{ stage: string; progress: number } | null>(null);
    const useVaultV2 = true; // Always use new secure format (Argon2id + XChaCha20-Poly1305)
    const [backupValidation, setBackupValidation] = useState<{ valid: boolean; version: number; encrypted: boolean; createdAt?: string } | null>(null);

    // Unlock KeyVault with password
    const handleUnlockVault = async () => {
        const username = session?.user?.username;
        if (!username || !unlockPassword) return;

        setUnlockError("");
        setLoading(true);

        try {
            // Try to open KeyVault with provided password
            const vault = await getKeyVault(unlockPassword);
            const masterKey = await vault.getData(`masterKey:${username}`);

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
    const decryptWithMasterKey = async (encryptedJson: string, masterKeyHex: string): Promise<string | null> => {
        try {
            if (!encryptedJson || !masterKeyHex) return null;
            
            // Check if it's encrypted format
            const data = JSON.parse(encryptedJson);
            if (!data.v || !data.alg || !data.s || !data.iv || !data.ct || !data.tag) {
                // Plain text, not encrypted
                return encryptedJson;
            }

            // Decrypt using Web Crypto API
            const salt = Uint8Array.from(atob(data.s), c => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(data.iv), c => c.charCodeAt(0));
            const ciphertext = Uint8Array.from(atob(data.ct), c => c.charCodeAt(0));
            const tag = Uint8Array.from(atob(data.tag), c => c.charCodeAt(0));

            // Combine ciphertext and tag for AES-GCM
            const combined = new Uint8Array(ciphertext.length + tag.length);
            combined.set(ciphertext);
            combined.set(tag, ciphertext.length);

            // Derive key using PBKDF2 (similar to scrypt but web-compatible)
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                Uint8Array.from(masterKeyHex.match(/.{2}/g)!.map(b => parseInt(b, 16))),
                'PBKDF2',
                false,
                ['deriveKey']
            );

            const key = await crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                combined
            );

            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.error('[BackupSettings] Decryption failed:', error);
            return null;
        }
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
                    try {
                        mnemonic = JSON.parse(decryptedMnemonic);
                    } catch {
                        console.warn('[BackupSettings] Failed to parse decrypted mnemonic');
                    }
                }
            }

            if (recoveryData.encryptedChecksums) {
                const decryptedChecksums = await decryptWithMasterKey(recoveryData.encryptedChecksums, masterKey);
                if (decryptedChecksums) {
                    try {
                        checksums = JSON.parse(decryptedChecksums);
                    } catch {
                        console.warn('[BackupSettings] Failed to parse decrypted checksums');
                    }
                }
            }

            // Generate export content with REAL recovery keys (English by default)
            let content = `═══════════════════════════════════════════════════════\n`;
            content += `  CIPHER PULSE - RECOVERY KEYS\n`;
            content += `═══════════════════════════════════════════════════════\n\n`;
            content += `⚠️  CRITICAL INFORMATION - NEVER SHARE THIS FILE\n\n`;
            content += `Username: ${recoveryData.username}\n`;
            content += `User ID: ${recoveryData.userId}\n`;
            content += `Security Tier: ${recoveryData.securityTier}\n`;
            content += `Creation Date: ${new Date(recoveryData.createdAt).toLocaleString('en-US')}\n`;
            content += `Export Date: ${new Date().toLocaleString('en-US')}\n\n`;
            content += `───────────────────────────────────────────────────────\n\n`;

            if (recoveryData.securityTier === 'standard' && mnemonic) {
                content += `📝 MNEMONIC PHRASE (BIP-39)\n\n`;
                content += `Keep this phrase in a safe place. It is the ONLY\n`;
                content += `way to recover your account.\n\n`;
                content += `${mnemonic.join(' ')}\n\n`;
                content += `⚠️  WARNING: This phrase is unique and irreplaceable.\n`;
                content += `    If you lose it, access to your account will be PERMANENTLY lost.\n\n`;
            } else if (recoveryData.securityTier === 'dice-key') {
                content += `🎲 DICEKEY ACCOUNT (775 bits)\n\n`;
                content += `Your account uses the ultra-secure DiceKey method.\n\n`;

                // Display checksums if available
                if (checksums && checksums.length > 0) {
                    content += `📝 YOUR VERIFICATION CHECKSUMS (${checksums.length} series):\n\n`;
                    checksums.forEach((checksum: string, i: number) => {
                        content += `  Series ${String(i + 1).padStart(2, ' ')}: ${checksum}\n`;
                    });
                    content += `\n`;
                }

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
            content += `  Cipher Pulse - Zero-Knowledge Architecture\n`;
            content += `  Without these keys, NO ONE (not even us) can\n`;
            content += `  recover your account. This is the price of security.\n`;
            content += `═══════════════════════════════════════════════════════\n`;

            // Create download
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const filename = `cipher-pulse-recovery-${recoveryData.username}-${Date.now()}.txt`;

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

    const exportRecoveryKeys = async () => {
        const username = session?.user?.username;

        if (!session?.accessToken || !username) {
            setMessage({ type: 'error', text: t('settings.backup_settings.invalid_session') });
            return;
        }

        // Try to get existing KeyVault first
        const vault = getExistingKeyVault();
        if (!vault) {
            // KeyVault not initialized - show password prompt
            setShowPasswordPrompt(true);
            return;
        }

        const masterKey = await vault.getData(`masterKey:${username}`);
        if (!masterKey) {
            // No masterKey in vault - show password prompt to reinitialize
            setShowPasswordPrompt(true);
            return;
        }

        // Vault available and has masterKey - proceed with export
        await performExport(masterKey);
    };

    // RGPD Compliant Full Data Export
    const handleRgpdExport = async () => {
        if (!token) return;

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

        setLoading(true);
        setMessage(null);
        setExportProgress(null);

        try {
            let blob: Blob;
            let filename: string;

            if (useVaultV2) {
                // Use new Backup Vault v2 (Argon2id + XChaCha20-Poly1305)
                blob = await exportToBackupVault(
                    exportPassword,
                    { includeMessages, includeContacts: true, includeIdentityKeys: false },
                    (stage, progress) => setExportProgress({ stage, progress })
                );
                filename = `cipher-pulse-backup-v2-${Date.now()}.json`;
            } else {
                // Fallback to legacy export (PBKDF2 + AES-GCM)
                const result = await exportUserData(
                    token,
                    exportPassword,
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
                setMessage({ type: 'success', text: t('settings.backup_settings.secure_backup_detected', 'Secure backup v2 detected. Enter password to import.') });
                return;
            }

            // Fall back to v1 format validation
            const validation = await validateExportFile(file);
            setImportValidation(validation);

            if (validation.encrypted && !importPassword) {
                setMessage({ type: 'error', text: t('settings.backup_settings.file_encrypted', 'This file is encrypted. Please enter the password.') });
            }
        } catch (error) {
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
                const result = await importUserData(token, importFile, importPassword);

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
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full border border-slate-700">
                        <h3 className="text-xl font-semibold text-white mb-4">
                            {t('settings.backup_settings.unlock_vault_title')}
                        </h3>
                        <p className="text-slate-400 text-sm mb-4">
                            {t('settings.backup_settings.unlock_vault_desc')}
                        </p>
                        <input
                            type="password"
                            value={unlockPassword}
                            onChange={(e) => setUnlockPassword(e.target.value)}
                            placeholder={t('settings.backup_settings.password_placeholder')}
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlockVault()}
                            autoFocus
                        />
                        {unlockError && (
                            <p className="text-red-400 text-sm mb-4">{unlockError}</p>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowPasswordPrompt(false);
                                    setUnlockPassword("");
                                    setUnlockError("");
                                }}
                                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleUnlockVault}
                                disabled={loading || !unlockPassword}
                                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
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
                <div className={`p-4 rounded-lg border ${message.type === "success"
                    ? "bg-green-500/10 border-green-500/40 text-green-300"
                    : "bg-red-500/10 border-red-500/40 text-red-300"
                    }`}>
                    {message.text}
                </div>
            )}

            {/* Recovery Keys Export */}
            <div>
                <h2 className="text-xl font-semibold text-white mb-4">{t('settings.backup_settings.keys_backup_title')}</h2>
                <div className="p-6 bg-slate-900/50 rounded-lg border border-slate-800">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-amber-500/20 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-medium text-white mb-2">{t('settings.backup_settings.export_recovery_keys')}</h3>
                            <p className="text-slate-400 text-sm mb-4">
                                {t('settings.backup_settings.export_recovery_keys_desc')}
                            </p>
                            <button
                                onClick={exportRecoveryKeys}
                                disabled={loading}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                )}
                                {loading ? t('settings.backup_settings.exporting') : t('settings.backup_settings.export_keys_button')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Portability Section (RGPD Article 20) */}
            <div>
                <h2 className="text-xl font-semibold text-white mb-4">
                    {t('settings.backup_settings.rgpd_title', 'RGPD Data Portability')}
                </h2>
                <div className="p-6 bg-slate-900/50 rounded-lg border border-slate-800">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-green-500/20 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-white mb-2">
                                {t('settings.backup_settings.rgpd_desc_title', 'Your Data, Your Control')}
                            </h3>
                            <p className="text-slate-400 text-sm">
                                {t('settings.backup_settings.rgpd_desc', 'Export all your data (conversations, messages, contacts) in a portable JSON format. Optionally encrypt with a password for secure storage. Import on any Cipher Pulse instance.')}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => setShowExportModal(true)}
                            className="px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            {t('settings.backup_settings.export_all_data', 'Export All Data')}
                        </button>
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            {t('settings.backup_settings.import_data', 'Import Data')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Secure Backup Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full border border-slate-700">
                        <h3 className="text-xl font-semibold text-white mb-4">
                            {t('settings.backup_settings.export_data_title', 'Create Secure Backup')}
                        </h3>

                        {/* Progress indicator */}
                        {exportProgress && (
                            <div className="mb-4">
                                <div className="flex justify-between text-sm text-slate-400 mb-1">
                                    <span>{exportProgress.stage}</span>
                                    <span>{Math.round(exportProgress.progress)}%</span>
                                </div>
                                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-green-500 transition-all duration-300"
                                        style={{ width: `${exportProgress.progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 mb-6">
                            {/* Security info */}
                            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                                <p className="text-green-400 text-sm">
                                    <strong>{t('settings.backup_settings.secure_format', 'Secure Format:')}</strong> {t('settings.backup_settings.secure_format_desc', 'Argon2id key derivation + XChaCha20-Poly1305 encryption')}
                                </p>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={includeMessages}
                                    onChange={(e) => setIncludeMessages(e.target.checked)}
                                    className="w-5 h-5 rounded bg-slate-800 border-slate-600"
                                    disabled={loading}
                                />
                                <span className="text-slate-300">
                                    {t('settings.backup_settings.include_messages', 'Include message history')}
                                </span>
                            </label>

                            <div className="border-t border-slate-700 pt-4">
                                <p className="text-slate-400 text-sm mb-3">
                                    {t('settings.backup_settings.backup_password_required', 'Create a strong password to protect your backup:')}
                                </p>
                                <input
                                    type="password"
                                    value={exportPassword}
                                    onChange={(e) => setExportPassword(e.target.value)}
                                    placeholder={t('settings.backup_settings.export_password_placeholder', 'Backup password (min. 8 characters)')}
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white mb-2"
                                    disabled={loading}
                                />
                                <input
                                    type="password"
                                    value={exportPasswordConfirm}
                                    onChange={(e) => setExportPasswordConfirm(e.target.value)}
                                    placeholder={t('settings.backup_settings.confirm_password', 'Confirm password')}
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                                    disabled={loading}
                                />
                                {exportPassword && exportPassword.length < 8 && (
                                    <p className="text-amber-400 text-xs mt-1">
                                        {t('settings.backup_settings.password_min_length', 'Password must be at least 8 characters')}
                                    </p>
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
                                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                                disabled={loading}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleRgpdExport}
                                disabled={loading || !exportPassword || exportPassword.length < 8 || exportPassword !== exportPasswordConfirm}
                                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
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
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full border border-slate-700">
                        <h3 className="text-xl font-semibold text-white mb-4">
                            {t('settings.backup_settings.import_data_title', 'Restore from Backup')}
                        </h3>

                        {/* Progress indicator */}
                        {exportProgress && (
                            <div className="mb-4">
                                <div className="flex justify-between text-sm text-slate-400 mb-1">
                                    <span>{exportProgress.stage}</span>
                                    <span>{Math.round(exportProgress.progress)}%</span>
                                </div>
                                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-green-500 transition-all duration-300"
                                        style={{ width: `${exportProgress.progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-slate-300 text-sm mb-2">
                                    {t('settings.backup_settings.select_file', 'Select backup file')}
                                </label>
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleImportFileSelect}
                                    disabled={loading}
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-slate-700 file:text-white disabled:opacity-50"
                                />
                            </div>

                            {/* v2 Backup Validation */}
                            {backupValidation && (
                                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                                    <div className="text-green-400 text-sm">
                                        <p className="font-medium">{t('settings.backup_settings.secure_backup_v2', 'Secure Backup v2')}</p>
                                        <p className="text-xs mt-1">
                                            {t('settings.backup_settings.created_at', 'Created')}: {backupValidation.createdAt ? new Date(backupValidation.createdAt).toLocaleString() : 'Unknown'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* v1 Backup Validation */}
                            {importValidation && !backupValidation && (
                                <div className={`p-3 rounded-lg ${importValidation.valid ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                                    {importValidation.valid ? (
                                        <div className="text-amber-400 text-sm">
                                            <p className="font-medium">{t('settings.backup_settings.legacy_backup', 'Legacy Backup v1')}</p>
                                            <p className="text-xs mt-1">
                                                {importValidation.stats.conversations} conversations, {importValidation.stats.messages} messages
                                                {importValidation.encrypted && ' (encrypted)'}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-red-400 text-sm">{t('settings.backup_settings.invalid_file', 'Invalid backup file')}</p>
                                    )}
                                </div>
                            )}

                            {/* Password input - always shown for v2, conditional for v1 */}
                            {(backupValidation || importValidation?.encrypted) && (
                                <div>
                                    <label className="block text-slate-300 text-sm mb-2">
                                        {t('settings.backup_settings.decrypt_password', 'Backup password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={importPassword}
                                        onChange={(e) => setImportPassword(e.target.value)}
                                        placeholder={t('settings.backup_settings.enter_password', 'Enter password')}
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
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
                                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                                disabled={loading}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleRgpdImport}
                                disabled={loading || !importFile || (!backupValidation && !importValidation?.valid) || ((backupValidation || importValidation?.encrypted) && !importPassword)}
                                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
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
