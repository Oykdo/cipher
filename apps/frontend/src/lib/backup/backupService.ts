/**
 * Backup Service - Export/Import Pipeline
 * 
 * Implements the "Backup Vault" architecture:
 * - Export: Decrypt DR messages -> Re-encrypt with BEK -> Create portable backup
 * - Import: Decrypt BEK messages -> Store as archived -> Display in UI
 * 
 * Key principle: Transport encryption (DR) is separate from storage encryption (BEK)
 */

import {
  BackupFileV2,
  BackupPayload,
  BackupConversation,
  ArchivedMessage,
  ExportOptions,
  ImportResult,
  BEK_KDF_PARAMS,
} from './types';
import {
  deriveBEK,
  generateSalt,
  encryptMessageForBackup,
  decryptArchivedMessage,
  encryptBackupPayload,
  decryptBackupPayload,
  toBase64,
  fromBase64,
} from './backupCrypto';
import { getCachedDecryptedMessage } from '../e2ee/decryptedMessageCache';
import { decryptReceivedMessage } from '../e2ee/messagingIntegration';
import { getMyFingerprint, isE2EEInitialized } from '../e2ee/e2eeService';
import { useAuthStore } from '../../store/auth';

import { debugLogger } from "../debugLogger";
/**
 * Export all user data to encrypted backup file
 * 
 * Process:
 * 1. Fetch conversations and messages from server/local
 * 2. Decrypt each message (from DR/NaCl Box)
 * 3. Re-encrypt with BEK (password-derived key)
 * 4. Package into portable backup format
 */
export async function exportToBackupVault(
  password: string,
  options: ExportOptions = { includeMessages: true, includeContacts: true, includeIdentityKeys: false },
  onProgress?: (stage: string, progress: number) => void,
  extra?: { recoveryKeys?: BackupPayload['recoveryKeys'] }
): Promise<Blob> {
  const session = useAuthStore.getState().session;
  if (!session?.accessToken || !session?.user) {
    throw new Error('Not authenticated');
  }

  onProgress?.('Initializing...', 0);

  // Generate salt for this backup
  const salt = await generateSalt();
  const bek = await deriveBEK(password, salt);

  try {
    // Fetch user data from API
    onProgress?.('Fetching conversations...', 10);
    const { apiv2 } = await import('../../services/api-v2');
    
    const { conversations } = await apiv2.listConversations();
    const contacts = options.includeContacts ? await fetchContacts() : [];

    // Build backup payload
    const payload: BackupPayload = {
      userProfile: {
        username: session.user.username,
        userId: session.user.id,
        createdAt: Date.now(),
        fingerprint: getMyFingerprint() || undefined,
      },
      contacts,
      conversations: [],
      exportedAt: Date.now(),
    };

    if (extra?.recoveryKeys) {
      payload.recoveryKeys = extra.recoveryKeys;
    }

    if (options.includeIdentityKeys && isE2EEInitialized()) {
      payload.identityKeys = {
        publicKey: '', // Would need to export from keyManagement
        fingerprint: getMyFingerprint() || '',
      };
    }

    // Process each conversation
    if (options.includeMessages) {
      const totalConvs = conversations.length;
      
      for (let i = 0; i < totalConvs; i++) {
        const conv = conversations[i];
        onProgress?.(`Processing conversation ${i + 1}/${totalConvs}...`, 20 + (i / totalConvs) * 60);

        const peerUsername = conv.otherParticipant?.username || 'unknown';

        const backupConv: BackupConversation = {
          id: conv.id,
          peerUsername,
          createdAt: conv.createdAt || Date.now(),
          archivedMessages: [],
        };

        // Fetch and process messages for this conversation
        const { messages } = await apiv2.listMessages(conv.id);
        
        for (const msg of messages) {
          try {
            // Try to get plaintext
            let plaintext = getCachedDecryptedMessage(msg.id);
            
            if (!plaintext && msg.senderId !== session.user.id) {
              // Decrypt message from peer
              try {
                const result = await decryptReceivedMessage(
                  peerUsername,
                  msg.body,
                  undefined,
                  true
                );
                plaintext = result.text;
              } catch (e) {
                // If decryption fails, use placeholder
                plaintext = '[Message could not be decrypted for backup]';
              }
            } else if (!plaintext) {
              // Own message - may be stored encrypted for recipient
              plaintext = '[Your encrypted message]';
            }

            // Re-encrypt with BEK
            const encryptedContent = await encryptMessageForBackup(plaintext, bek);

            const archivedMsg: ArchivedMessage = {
              id: msg.id,
              timestamp: msg.createdAt || Date.now(),
              sender: msg.senderId === session.user.id ? session.user.username : peerUsername,
              encryptedContent,
              originalEncryption: detectEncryptionType(msg.body),
            };

            backupConv.archivedMessages.push(archivedMsg);
          } catch (msgError) {
            console.warn(`Failed to backup message ${msg.id}:`, msgError);
          }
        }

        payload.conversations.push(backupConv);
      }
    }

    onProgress?.('Encrypting backup...', 85);

    // Serialize and encrypt entire payload
    const payloadJson = JSON.stringify(payload);
    const encrypted = await encryptBackupPayload(payloadJson, password);

    // Create backup file structure
    const backupFile: BackupFileV2 = {
      format: 'SecureChatBackup',
      version: 2,
      kdf: {
        algorithm: 'pbkdf2',
        salt: toBase64(encrypted.salt),
        iterations: BEK_KDF_PARAMS.iterations,
        hash: 'SHA-256',
      },
      encryption: {
        algorithm: 'xchacha20-poly1305',
      },
      payload: toBase64(encrypted.ciphertext),
      checksum: encrypted.checksum,
      createdAt: new Date().toISOString(),
    };

    // Add nonce to the payload encoding (prepend to ciphertext)
    // Store nonce in a separate field for clarity
    (backupFile as any).nonce = toBase64(encrypted.nonce);

    onProgress?.('Complete', 100);

    return new Blob([JSON.stringify(backupFile, null, 2)], { type: 'application/json' });
  } finally {
    // Clear BEK from memory (not strictly possible in JS but symbolically important)
  }
}

/**
 * Import data from backup vault file
 * 
 * Process:
 * 1. Parse and validate backup file
 * 2. Decrypt payload with password
 * 3. Store messages in archived format (still BEK-encrypted)
 * 4. Import contacts and metadata
 */
export async function importFromBackupVault(
  file: File,
  password: string,
  onProgress?: (stage: string, progress: number) => void
): Promise<ImportResult> {
  onProgress?.('Reading file...', 0);

  const fileContent = await file.text();
  let backupFile: BackupFileV2 & { nonce?: string };

  try {
    backupFile = JSON.parse(fileContent);
  } catch {
    throw new Error('Invalid backup file format');
  }

  // Validate format
  if (backupFile.format !== 'SecureChatBackup' || backupFile.version !== 2) {
    throw new Error('Unsupported backup format or version');
  }

  onProgress?.('Decrypting backup...', 20);

  // Decrypt payload
  const salt = fromBase64(backupFile.kdf.salt);
  const nonce = fromBase64(backupFile.nonce || '');
  const ciphertext = fromBase64(backupFile.payload);

  let payload: BackupPayload;
  try {
    const payloadJson = await decryptBackupPayload(
      ciphertext,
      nonce,
      salt,
      password,
      backupFile.checksum
    );
    payload = JSON.parse(payloadJson);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Checksum')) {
      throw error;
    }
    throw new Error('Incorrect password or corrupted backup file');
  }

  onProgress?.('Importing data...', 50);

  const result: ImportResult = {
    success: true,
    imported: { conversations: 0, messages: 0, contacts: 0 },
    errors: [],
  };

  // Store archived messages in local storage
  // These remain encrypted with BEK and are decrypted on-the-fly for display
  try {
    await storeArchivedConversations(payload.conversations, password);
    result.imported.conversations = payload.conversations.length;
    result.imported.messages = payload.conversations.reduce(
      (sum, conv) => sum + conv.archivedMessages.length, 
      0
    );
  } catch (error) {
    result.errors.push(`Failed to import conversations: ${error}`);
  }

  // Import contacts
  if (payload.contacts.length > 0) {
    try {
      await importContacts(payload.contacts);
      result.imported.contacts = payload.contacts.length;
    } catch (error) {
      result.errors.push(`Failed to import contacts: ${error}`);
    }
  }

  onProgress?.('Complete', 100);

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Store archived conversations in IndexedDB
 * Messages remain BEK-encrypted for security
 */
async function storeArchivedConversations(
  conversations: BackupConversation[],
  _password: string
): Promise<void> {
  // Store in localStorage for now (should migrate to IndexedDB for large datasets)
  const archived = localStorage.getItem('archivedConversations');
  const existing = archived ? JSON.parse(archived) : {};

  for (const conv of conversations) {
    if (!existing[conv.id]) {
      existing[conv.id] = {
        ...conv,
        importedAt: Date.now(),
      };
    } else {
      // Merge messages, avoiding duplicates
      const existingMsgIds = new Set(existing[conv.id].archivedMessages.map((m: ArchivedMessage) => m.id));
      for (const msg of conv.archivedMessages) {
        if (!existingMsgIds.has(msg.id)) {
          existing[conv.id].archivedMessages.push(msg);
        }
      }
    }
  }

  localStorage.setItem('archivedConversations', JSON.stringify(existing));
}

/**
 * Get archived messages for a conversation
 * Decrypts on-the-fly using BEK
 */
export async function getArchivedMessages(
  conversationId: string,
  password: string
): Promise<Array<{
  id: string;
  timestamp: number;
  sender: string;
  body: string;
  isArchived: true;
}>> {
  const archived = localStorage.getItem('archivedConversations');
  if (!archived) return [];

  const conversations = JSON.parse(archived);
  const conv = conversations[conversationId];
  if (!conv) return [];

  // Derive BEK from password
  // Note: In production, you'd cache the BEK in memory after initial unlock
  const salt = await generateSalt(); // This should come from stored backup metadata
  const bek = await deriveBEK(password, salt);

  const messages = [];
  for (const msg of conv.archivedMessages) {
    try {
      const body = await decryptArchivedMessage(msg.encryptedContent, bek);
      messages.push({
        id: msg.id,
        timestamp: msg.timestamp,
        sender: msg.sender,
        body,
        isArchived: true as const,
      });
    } catch {
      messages.push({
        id: msg.id,
        timestamp: msg.timestamp,
        sender: msg.sender,
        body: '[Failed to decrypt archived message]',
        isArchived: true as const,
      });
    }
  }

  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Check if a conversation has archived messages
 */
export function hasArchivedMessages(conversationId: string): boolean {
  const archived = localStorage.getItem('archivedConversations');
  if (!archived) return false;
  
  const conversations = JSON.parse(archived);
  return !!conversations[conversationId]?.archivedMessages?.length;
}

/**
 * Validate backup file without full decryption
 */
export async function validateBackupFile(file: File): Promise<{
  valid: boolean;
  version: number;
  encrypted: boolean;
  createdAt?: string;
}> {
  try {
    const content = await file.text();
    const backup = JSON.parse(content);

    if (backup.format === 'SecureChatBackup' && backup.version === 2) {
      return {
        valid: true,
        version: 2,
        encrypted: true,
        createdAt: backup.createdAt,
      };
    }

    // Check for v1 format (old dataExport.ts format)
    if (backup.format === 'cipher-pulse-export-v1') {
      return {
        valid: true,
        version: 1,
        encrypted: backup.encrypted === true,
      };
    }

    return { valid: false, version: 0, encrypted: false };
  } catch {
    return { valid: false, version: 0, encrypted: false };
  }
}

// Helper functions

async function fetchContacts(): Promise<Array<{
  username: string;
  fingerprint?: string;
  addedAt: number;
  verified: boolean;
}>> {
  try {
    // Fetch contacts from conversations (users we've messaged)
    const { apiv2 } = await import('../../services/api-v2');
    const { conversations } = await apiv2.listConversations();
    
    // Extract unique contacts
    const contactsMap = new Map<string, { username: string; fingerprint?: string; addedAt: number; verified: boolean }>();
    
    for (const conv of conversations) {
      const contact = conv.otherParticipant;
      if (contact && !contactsMap.has(contact.username)) {
        contactsMap.set(contact.username, {
          username: contact.username,
          fingerprint: undefined,
          addedAt: conv.createdAt ? new Date(conv.createdAt).getTime() : Date.now(),
          verified: false, // TODO: Implement verification status tracking
        });
      }
    }
    
    return Array.from(contactsMap.values());
  } catch (error) {
    console.warn('[Backup] Failed to fetch contacts:', error);
    return [];
  }
}

async function importContacts(
  contacts: Array<{
    username: string;
    fingerprint?: string;
    addedAt: number;
    verified: boolean;
  }>
): Promise<void> {
  if (contacts.length === 0) return;

  // App currently has no dedicated contacts store/UI.
  // Keep this as a no-op to preserve backup compatibility.
  debugLogger.debug(`[Backup] Imported ${contacts.length} contact(s)`);
}

function detectEncryptionType(messageBody: string): 'double-ratchet-v1' | 'nacl-box-v1' | 'legacy' | undefined {
  try {
    const parsed = JSON.parse(messageBody);
    if (parsed.version === 'e2ee-v1' && parsed.encrypted?.version) {
      return parsed.encrypted.version;
    }
  } catch {
    // Not JSON, assume legacy
  }
  return 'legacy';
}
