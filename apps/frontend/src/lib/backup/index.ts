/**
 * Backup Vault Module
 * 
 * Provides secure, portable backup of conversations that:
 * - Separates transport encryption (Double Ratchet) from storage encryption (BEK)
 * - Uses Argon2id for password-based key derivation
 * - Uses XChaCha20-Poly1305 for symmetric encryption
 * - Creates self-contained backup files that can be imported anywhere
 */

export * from './types';
export * from './backupCrypto';
export {
  exportToBackupVault,
  importFromBackupVault,
  getArchivedMessages,
  hasArchivedMessages,
  validateBackupFile,
} from './backupService';
