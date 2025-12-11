/**
 * Backup Vault Types
 * 
 * Architecture: Separates transport encryption (Double Ratchet) from storage encryption (BEK)
 * - Live messages use Double Ratchet for Perfect Forward Secrecy
 * - Archived messages use BEK (Backup Encryption Key) for portable, recoverable storage
 */

/**
 * Backup file format version 2 - "Secure Chat Backup Vault"
 */
export interface BackupFileV2 {
  format: 'SecureChatBackup';
  version: 2;
  kdf: {
    algorithm: 'pbkdf2';
    salt: string;        // Base64 encoded
    iterations: number;  // PBKDF2 iterations
    hash: string;        // Hash function (SHA-256)
  };
  encryption: {
    algorithm: 'xchacha20-poly1305';
  };
  payload: string;       // Base64 encoded encrypted payload
  checksum: string;      // BLAKE2b of decrypted payload for integrity
  createdAt: string;     // ISO timestamp
}

/**
 * Decrypted backup payload structure
 */
export interface BackupPayload {
  userProfile: {
    username: string;
    userId: string;
    createdAt: number;
    fingerprint?: string;
  };
  contacts: BackupContact[];
  conversations: BackupConversation[];
  identityKeys?: {
    publicKey: string;    // Base64
    fingerprint: string;
  };
  exportedAt: number;
}

/**
 * Contact information in backup
 */
export interface BackupContact {
  username: string;
  fingerprint?: string;
  addedAt: number;
  verified: boolean;
  nickname?: string;
}

/**
 * Conversation with archived messages
 */
export interface BackupConversation {
  id: string;
  peerUsername: string;
  createdAt: number;
  archivedMessages: ArchivedMessage[];
}

/**
 * Archived message format
 * Messages are re-encrypted with BEK during export
 */
export interface ArchivedMessage {
  id: string;
  timestamp: number;
  sender: string;
  /** 
   * Content encrypted with BEK (XChaCha20-Poly1305)
   * Format: { nonce: base64, ciphertext: base64 }
   */
  encryptedContent: {
    nonce: string;
    ciphertext: string;
  };
  /** Original encryption type before re-encryption */
  originalEncryption?: 'double-ratchet-v1' | 'nacl-box-v1' | 'legacy';
}

/**
 * Message ready for display (after BEK decryption)
 */
export interface DecryptedArchivedMessage {
  id: string;
  timestamp: number;
  sender: string;
  body: string;
  isArchived: true;
  originalEncryption?: string;
}

/**
 * Export options
 */
export interface ExportOptions {
  includeMessages: boolean;
  includeContacts: boolean;
  includeIdentityKeys: boolean;
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  imported: {
    conversations: number;
    messages: number;
    contacts: number;
  };
  errors: string[];
}

/**
 * KDF parameters for PBKDF2
 * Based on OWASP 2024 recommendations
 * 
 * Using PBKDF2 with high iteration count for browser compatibility.
 * 600,000 iterations recommended by OWASP for PBKDF2-SHA256
 */
export const BEK_KDF_PARAMS = {
  algorithm: 'pbkdf2' as const,
  iterations: 600000,    // OWASP recommended for PBKDF2-SHA256
  hash: 'SHA-256',
  hashLength: 32,        // 256 bits
  saltLength: 16,        // 128 bits
};
