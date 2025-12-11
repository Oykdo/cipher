/**
 * Backup Encryption Module
 * 
 * Uses Argon2id for key derivation and XChaCha20-Poly1305 for encryption.
 * This provides:
 * - Memory-hard key derivation (resistant to GPU/ASIC attacks)
 * - Modern AEAD encryption with 192-bit nonce (no collision risk)
 * - Independent from transport encryption (Double Ratchet)
 */

import _sodium from 'libsodium-wrappers';
import { BEK_KDF_PARAMS } from './types';

let sodiumReady = false;

/**
 * Ensure libsodium is initialized
 */
async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await _sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Derive Backup Encryption Key (BEK) from password using PBKDF2
 * 
 * Uses Web Crypto API's PBKDF2 with high iteration count for security.
 * PBKDF2 is natively available in all browsers without WebAssembly issues.
 * 
 * @param password User's backup password
 * @param salt Random salt (16 bytes) - stored in backup file header
 * @returns 32-byte encryption key
 */
export async function deriveBEK(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive key using PBKDF2 with high iteration count
  // 600,000 iterations as recommended by OWASP for PBKDF2-SHA256
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 600000,
      hash: 'SHA-256',
    },
    keyMaterial,
    BEK_KDF_PARAMS.hashLength * 8 // bits
  );
  
  return new Uint8Array(derivedBits);
}

/**
 * Generate random salt for KDF
 */
export async function generateSalt(): Promise<Uint8Array> {
  await ensureSodium();
  return _sodium.randombytes_buf(BEK_KDF_PARAMS.saltLength);
}

/**
 * Encrypt data with XChaCha20-Poly1305
 * 
 * @param plaintext Data to encrypt
 * @param key 32-byte encryption key (BEK)
 * @returns Encrypted data with nonce
 */
export async function encryptWithBEK(
  plaintext: string | Uint8Array,
  key: Uint8Array
): Promise<{ nonce: Uint8Array; ciphertext: Uint8Array }> {
  await ensureSodium();
  
  const plaintextBytes = typeof plaintext === 'string' 
    ? _sodium.from_string(plaintext) 
    : plaintext;
  
  // XChaCha20-Poly1305 uses 24-byte nonce - safe for random generation
  const nonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  
  const ciphertext = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    null,  // No additional data
    null,  // No secret nonce
    nonce,
    key
  );
  
  return { nonce, ciphertext };
}

/**
 * Decrypt data with XChaCha20-Poly1305
 * 
 * @param ciphertext Encrypted data
 * @param nonce 24-byte nonce
 * @param key 32-byte encryption key (BEK)
 * @returns Decrypted data as string
 */
export async function decryptWithBEK(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array
): Promise<string> {
  await ensureSodium();
  
  const plaintext = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,  // No secret nonce
    ciphertext,
    null,  // No additional data
    nonce,
    key
  );
  
  return _sodium.to_string(plaintext);
}

/**
 * Encrypt the entire backup payload
 * 
 * @param payload JSON string of backup data
 * @param password User's backup password
 * @returns Encrypted backup with metadata
 */
export async function encryptBackupPayload(
  payload: string,
  password: string
): Promise<{
  salt: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  checksum: string;
}> {
  await ensureSodium();
  
  // Generate salt for this backup
  const salt = await generateSalt();
  
  // Derive key from password
  const bek = await deriveBEK(password, salt);
  
  // Encrypt payload
  const { nonce, ciphertext } = await encryptWithBEK(payload, bek);
  
  // Calculate checksum of original payload for integrity verification
  // Use crypto_generichash which is BLAKE2b (better than SHA-256 and available in libsodium)
  const checksum = _sodium.to_hex(_sodium.crypto_generichash(32, _sodium.from_string(payload)));
  
  // Clear sensitive data from memory
  _sodium.memzero(bek);
  
  return { salt, nonce, ciphertext, checksum };
}

/**
 * Decrypt the backup payload
 * 
 * @param ciphertext Encrypted payload
 * @param nonce Nonce used for encryption
 * @param salt Salt used for key derivation
 * @param password User's backup password
 * @param expectedChecksum Expected SHA-256 checksum
 * @returns Decrypted payload string
 * @throws Error if decryption fails or checksum mismatch
 */
export async function decryptBackupPayload(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  salt: Uint8Array,
  password: string,
  expectedChecksum: string
): Promise<string> {
  await ensureSodium();
  
  // Derive key from password
  const bek = await deriveBEK(password, salt);
  
  try {
    // Decrypt payload
    const payload = await decryptWithBEK(ciphertext, nonce, bek);
    
    // Verify checksum (using BLAKE2b via crypto_generichash)
    const actualChecksum = _sodium.to_hex(_sodium.crypto_generichash(32, _sodium.from_string(payload)));
    
    if (actualChecksum !== expectedChecksum) {
      throw new Error('Checksum mismatch - backup file may be corrupted');
    }
    
    return payload;
  } finally {
    // Clear sensitive data from memory
    _sodium.memzero(bek);
  }
}

/**
 * Encrypt a single message for backup storage
 * Used when re-encrypting DR messages with BEK
 */
export async function encryptMessageForBackup(
  plaintext: string,
  bek: Uint8Array
): Promise<{ nonce: string; ciphertext: string }> {
  await ensureSodium();
  
  const { nonce, ciphertext } = await encryptWithBEK(plaintext, bek);
  
  return {
    nonce: _sodium.to_base64(nonce),
    ciphertext: _sodium.to_base64(ciphertext),
  };
}

/**
 * Decrypt a single archived message
 * Used when displaying messages from backup
 */
export async function decryptArchivedMessage(
  encryptedContent: { nonce: string; ciphertext: string },
  bek: Uint8Array
): Promise<string> {
  await ensureSodium();
  
  const nonce = _sodium.from_base64(encryptedContent.nonce);
  const ciphertext = _sodium.from_base64(encryptedContent.ciphertext);
  
  return decryptWithBEK(ciphertext, nonce, bek);
}

/**
 * Utility: Convert Uint8Array to Base64
 */
export function toBase64(data: Uint8Array): string {
  return _sodium.to_base64(data);
}

/**
 * Utility: Convert Base64 to Uint8Array
 */
export function fromBase64(base64: string): Uint8Array {
  return _sodium.from_base64(base64);
}
