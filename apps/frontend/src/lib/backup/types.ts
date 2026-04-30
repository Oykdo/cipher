/**
 * Backup Vault Types
 * 
 * Architecture: Separates transport encryption (Double Ratchet) from storage encryption (BEK)
 * - Live messages use Double Ratchet for Perfect Forward Secrecy
 * - Archived messages use BEK (Backup Encryption Key) for portable, recoverable storage
 */

/**
 * Backup file format envelope. Version 2 was direct-only; version 3
 * (Cipher 1.2.0) adds group conversation metadata. The cryptographic
 * envelope (KDF + payload encryption) is unchanged across versions —
 * only the inner payload schema evolved, so importers handle both
 * versions side-by-side.
 */
export interface BackupFileV2 {
  format: 'SecureChatBackup';
  version: 2 | 3;
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

export type BackupFileV3 = BackupFileV2 & { version: 3 };

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
 * Conversation with archived messages.
 *
 * v3 (Cipher 1.2.0) adds the group fields: `type`, `members`,
 * `createdBy`, `encryptedTitle`, and `decryptedTitle` (UX convenience).
 * `peerUsername` is kept as an OPTIONAL deprecated field so old v2
 * backups still import cleanly — for a direct conversation, it equals
 * `members.find(m => m.id !== self).username`.
 */
export interface BackupConversation {
  id: string;
  /** Conversation kind. Defaults to 'direct' on import for v2 backups. */
  type?: 'direct' | 'group';
  /**
   * Resolved members at export time. Required in v3 backups; absent in
   * v2 (importer reconstructs from `peerUsername` + self).
   */
  members?: Array<{ id: string; username: string }>;
  /** Group owner. Null for direct, optional for forward compat. */
  createdBy?: string | null;
  /** Encrypted group title envelope (e2ee-v2). Null for direct. */
  encryptedTitle?: string | null;
  /** Decrypted group title at export time, for UX after restore. */
  decryptedTitle?: string | null;
  createdAt: number;
  archivedMessages: ArchivedMessage[];
  /** @deprecated v2 only. Use `members` (resolved against `currentUserId`) in v3. */
  peerUsername?: string;
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
  /**
   * drand round number the message was time-locked to, if any. Preserved so
   * the archived message keeps its tlock gating across export/import cycles —
   * re-imported before the round publishes, the body stays cryptographically
   * unreadable (it is itself a tlock AGE ciphertext wrapped by BEK). Absent
   * for regular messages.
   */
  unlockBlockHeight?: number;
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
  /** See ArchivedMessage.unlockBlockHeight. */
  unlockBlockHeight?: number;
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
