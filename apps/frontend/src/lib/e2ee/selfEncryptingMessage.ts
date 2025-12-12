/**
 * Self-Encrypting Message (e2ee-v2)
 * 
 * Architecture Zéro-Connaissance :
 * - Une clé symétrique unique pour chiffrer le message
 * - Cette clé est chiffrée pour CHAQUE participant (y compris l'expéditeur)
 * - Le serveur ne voit que des données opaques
 * - L'expéditeur peut toujours relire ses messages
 * 
 * Format :
 * {
 *   version: "e2ee-v2",
 *   type: "standard" | "bar" | "timelock" | "attachment",
 *   iv: string,           // Base64 - Initialization Vector (12 bytes for GCM)
 *   ciphertext: string,   // Base64 - Message chiffré avec AES-256-GCM
 *   authTag: string,      // Base64 - Authentication tag from GCM
 *   keys: {
 *     [userId]: string    // Clé symétrique chiffrée pour chaque participant
 *   },
 *   metadata?: {          // Métadonnées optionnelles (NON chiffrées)
 *     filename?: string,
 *     mimeType?: string,
 *     size?: number
 *   }
 * }
 */

import _sodium from 'libsodium-wrappers';

// ============================================================================
// TYPES
// ============================================================================

export type MessageType = 'standard' | 'bar' | 'timelock' | 'attachment';

export interface EncryptedMessageV2 {
  version: 'e2ee-v2';
  type: MessageType;
  iv: string;                    // Base64 encoded IV
  ciphertext: string;            // Base64 encoded encrypted message
  authTag: string;               // Base64 encoded GCM auth tag
  keys: {
    [userId: string]: string;    // Base64 encoded wrapped key for each participant
  };
  metadata?: {
    filename?: string;
    mimeType?: string;
    size?: number;
  };
}

export interface ParticipantKey {
  userId: string;
  publicKey: Uint8Array;         // Curve25519 public key
}

// ============================================================================
// CONSTANTS
// ============================================================================

const IV_LENGTH = 12;              // 96 bits for AES-GCM
const KEY_LENGTH = 32;             // 256 bits for AES-256
const AUTH_TAG_LENGTH = 16;        // 128 bits for GCM

// ============================================================================
// ENCRYPTION
// ============================================================================

/**
 * Encrypt a message using Self-Encrypting Message format (e2ee-v2)
 * 
 * @param plaintext Message body in plaintext
 * @param participants List of participant public keys (including sender!)
 * @param type Message type
 * @param metadata Optional metadata (NOT encrypted)
 * @returns Encrypted message object
 */
export async function encryptSelfEncryptingMessage(
  plaintext: string,
  participants: ParticipantKey[],
  type: MessageType = 'standard',
  metadata?: EncryptedMessageV2['metadata']
): Promise<EncryptedMessageV2> {
  await _sodium.ready;

  if (!participants.length) {
    throw new Error('No participants provided');
  }

  const sodiumAny = _sodium as any;

  const hasAesGcm =
    typeof sodiumAny.crypto_aead_aes256gcm_is_available === 'function' &&
    typeof sodiumAny.crypto_aead_aes256gcm_encrypt === 'function' &&
    typeof sodiumAny.crypto_aead_aes256gcm_decrypt === 'function' &&
    sodiumAny.crypto_aead_aes256gcm_is_available();

  // 1. Generate one-time symmetric key
  const messageKey = _sodium.randombytes_buf(KEY_LENGTH);
  const iv = _sodium.randombytes_buf(IV_LENGTH);

  // 2. Encrypt message with AES-256-GCM
  const additionalData = new Uint8Array(0);
  
  // Use libsodium's crypto_aead_aes256gcm if available (hardware accelerated)
  let ciphertext: Uint8Array;
  let authTag: Uint8Array;
  
  if (hasAesGcm) {
    // Hardware-accelerated AES-GCM
    const encrypted = sodiumAny.crypto_aead_aes256gcm_encrypt(
      plaintext,
      additionalData, // No additional data
      null,           // No secret nonce
      iv,
      messageKey
    );
    // GCM appends auth tag to ciphertext
    ciphertext = encrypted.slice(0, -AUTH_TAG_LENGTH);
    authTag = encrypted.slice(-AUTH_TAG_LENGTH);
  } else {
    // Fallback to ChaCha20-Poly1305 (always available)
    const encrypted = _sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
      plaintext,
      additionalData,
      null,
      iv,
      messageKey
    );
    ciphertext = encrypted.slice(0, -AUTH_TAG_LENGTH);
    authTag = encrypted.slice(-AUTH_TAG_LENGTH);
  }

  // 3. Wrap the message key for each participant
  const keys: { [userId: string]: string } = {};
  
  for (const participant of participants) {
    // Encrypt messageKey with participant's public key (sealed box)
    const wrappedKey = _sodium.crypto_box_seal(
      messageKey,
      participant.publicKey
    );
    keys[participant.userId] = _sodium.to_base64(wrappedKey);
  }

  // 4. Securely wipe the message key from memory
  _sodium.memzero(messageKey);

  // 5. Construct the encrypted message object
  return {
    version: 'e2ee-v2',
    type,
    iv: _sodium.to_base64(iv),
    ciphertext: _sodium.to_base64(ciphertext),
    authTag: _sodium.to_base64(authTag),
    keys,
    metadata,
  };
}

// ============================================================================
// DECRYPTION
// ============================================================================

/**
 * Decrypt a Self-Encrypting Message (e2ee-v2)
 * 
 * @param encryptedMessage The encrypted message object
 * @param userId Current user's ID
 * @param publicKey Current user's public key (Curve25519)
 * @param privateKey Current user's private key (Curve25519)
 * @returns Decrypted plaintext
 */
export async function decryptSelfEncryptingMessage(
  encryptedMessage: EncryptedMessageV2,
  userId: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array
): Promise<string> {
  await _sodium.ready;

  const sodiumAny = _sodium as any;

  const hasAesGcm =
    typeof sodiumAny.crypto_aead_aes256gcm_is_available === 'function' &&
    typeof sodiumAny.crypto_aead_aes256gcm_encrypt === 'function' &&
    typeof sodiumAny.crypto_aead_aes256gcm_decrypt === 'function' &&
    sodiumAny.crypto_aead_aes256gcm_is_available();

  // 1. Validate version
  if (encryptedMessage.version !== 'e2ee-v2') {
    throw new Error(`Unsupported message version: ${encryptedMessage.version}`);
  }

  // 2. Get the wrapped key for this user
  const wrappedKeyB64 = encryptedMessage.keys[userId];
  if (!wrappedKeyB64) {
    throw new Error(`No key found for user ${userId} in this message`);
  }

  // 3. Unwrap the message key with user's private key
  const wrappedKey = _sodium.from_base64(wrappedKeyB64);
  const messageKey = _sodium.crypto_box_seal_open(
    wrappedKey,
    publicKey,
    privateKey
  );

  if (!messageKey) {
    throw new Error('Failed to unwrap message key - incorrect private key?');
  }

  // 4. Decrypt the message with AES-256-GCM
  const iv = _sodium.from_base64(encryptedMessage.iv);
  const ciphertext = _sodium.from_base64(encryptedMessage.ciphertext);
  const authTag = _sodium.from_base64(encryptedMessage.authTag);

  // Reconstruct full ciphertext with auth tag
  const fullCiphertext = new Uint8Array(ciphertext.length + authTag.length);
  fullCiphertext.set(ciphertext);
  fullCiphertext.set(authTag, ciphertext.length);
  const additionalData = new Uint8Array(0);

  let decrypted: Uint8Array;
  
  if (hasAesGcm) {
    // Hardware-accelerated AES-GCM
    decrypted = sodiumAny.crypto_aead_aes256gcm_decrypt(
      null,           // No secret nonce
      fullCiphertext,
      additionalData, // No additional data
      iv,
      messageKey
    );
  } else {
    // Fallback to ChaCha20-Poly1305
    decrypted = _sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
      null,
      fullCiphertext,
      additionalData,
      iv,
      messageKey
    );
  }

  // 5. Securely wipe the message key from memory
  _sodium.memzero(messageKey);

  // 6. Convert to string
  return _sodium.to_string(decrypted);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if a message is in e2ee-v2 format
 */
export function isSelfEncryptingMessage(data: any): data is EncryptedMessageV2 {
  if (typeof data !== 'object' || data === null) return false;
  if (data.version !== 'e2ee-v2') return false;
  if (data.type !== 'standard' && data.type !== 'bar' && data.type !== 'timelock' && data.type !== 'attachment') return false;
  if (typeof data.iv !== 'string' || data.iv.length === 0) return false;
  if (typeof data.ciphertext !== 'string' || data.ciphertext.length === 0) return false;
  if (typeof data.authTag !== 'string' || data.authTag.length === 0) return false;
  if (typeof data.keys !== 'object' || data.keys === null) return false;

  const entries = Object.entries(data.keys as Record<string, unknown>);
  for (const [userId, wrappedKey] of entries) {
    if (typeof userId !== 'string' || userId.length === 0) return false;
    if (typeof wrappedKey !== 'string' || wrappedKey.length === 0) return false;
  }

  return true;
}

/**
 * Get list of participants who can decrypt this message
 */
export function getMessageParticipants(message: EncryptedMessageV2): string[] {
  return Object.keys(message.keys);
}

/**
 * Check if a specific user can decrypt this message
 */
export function canUserDecryptMessage(message: EncryptedMessageV2, userId: string): boolean {
  return userId in message.keys;
}

/**
 * Estimate encrypted message size (for validation)
 */
export function estimateEncryptedSize(plaintext: string, participantCount: number): number {
  const plaintextSize = new TextEncoder().encode(plaintext).length;
  const ciphertextSize = plaintextSize; // Same size for AES
  const ivSize = IV_LENGTH;
  const authTagSize = AUTH_TAG_LENGTH;
  const wrappedKeySize = 48; // crypto_box_seal overhead per participant
  const jsonOverhead = 200; // Estimated JSON structure overhead
  
  return ciphertextSize + ivSize + authTagSize + (wrappedKeySize * participantCount) + jsonOverhead;
}

/**
 * Validate encrypted message structure
 */
export function validateEncryptedMessage(message: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isSelfEncryptingMessage(message)) {
    errors.push('Invalid e2ee-v2 message format');
    return { valid: false, errors };
  }

  // Validate IV length
  try {
    const iv = _sodium.from_base64(message.iv);
    if (iv.length !== IV_LENGTH) {
      errors.push(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
    }
  } catch {
    errors.push('Invalid IV: not valid base64');
  }

  // Validate auth tag length
  try {
    const authTag = _sodium.from_base64(message.authTag);
    if (authTag.length !== AUTH_TAG_LENGTH) {
      errors.push(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
    }
  } catch {
    errors.push('Invalid auth tag: not valid base64');
  }

  // Validate keys object
  if (Object.keys(message.keys).length === 0) {
    errors.push('No participant keys found');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
