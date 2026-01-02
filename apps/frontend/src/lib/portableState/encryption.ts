/**
 * Wallet-based encryption module for portable state backup.
 *
 * Provides functions to derive encryption keys from wallet signatures
 * and encrypt/decrypt UserStatePayload using AES-GCM-256.
 *
 * @module portableState/encryption
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import type { UserStatePayload, EncryptedBlob } from './types';

/**
 * Error codes for encryption operations.
 */
export type EncryptionErrorCode =
  | 'WALLET_NOT_CONNECTED'
  | 'SIGNATURE_REJECTED'
  | 'KEY_DERIVATION_FAILED'
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'TAMPERED_DATA'
  | 'INVALID_BLOB';

/**
 * Custom error class for encryption operations with error codes.
 */
export class EncryptionError extends Error {
  constructor(
    public readonly code: EncryptionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'EncryptionError';
  }
}

/**
 * Signature function type for wallet message signing.
 */
export type SignFn = (message: string) => Promise<string>;

/**
 * Fixed message used for deterministic key derivation.
 * Using a fixed timestamp ensures the same key is derived on any device.
 * @requirements 2.1
 */
const KEY_DERIVATION_MESSAGE =
  'CipherPulse State Backup Key Derivation v1\nTimestamp: 1704067200000';

/**
 * Salt used for HKDF key derivation.
 */
const HKDF_SALT = new TextEncoder().encode('cipher-pulse-backup');

/**
 * Info string used for HKDF key derivation.
 */
const HKDF_INFO = new TextEncoder().encode('aes-gcm-256');

/**
 * IV length for AES-GCM (12 bytes recommended by NIST).
 */
const IV_LENGTH = 12;


/**
 * Derives an AES-GCM-256 encryption key from a wallet signature.
 *
 * The key derivation process:
 * 1. Sign a fixed message with the wallet's private key
 * 2. Hash the signature using SHA-256 to get key material
 * 3. Derive a 256-bit AES-GCM key using HKDF
 *
 * Using a fixed message ensures the same key is derived on any device,
 * allowing cross-device backup restoration.
 *
 * @param signMessage - Function to sign a message with the wallet
 * @returns Promise resolving to a CryptoKey for AES-GCM encryption
 * @throws EncryptionError with code 'SIGNATURE_REJECTED' if signing fails
 * @throws EncryptionError with code 'KEY_DERIVATION_FAILED' if crypto operations fail
 * @requirements 2.1
 */
export async function deriveEncryptionKey(signMessage: SignFn): Promise<CryptoKey> {
  let signature: string;

  try {
    signature = await signMessage(KEY_DERIVATION_MESSAGE);
  } catch (error) {
    throw new EncryptionError(
      'SIGNATURE_REJECTED',
      `Failed to sign key derivation message: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  try {
    // Convert signature to bytes
    const encoder = new TextEncoder();
    const signatureBytes = encoder.encode(signature);

    // Hash the signature to get key material
    const keyMaterial = await crypto.subtle.digest('SHA-256', signatureBytes);

    // Import the key material for HKDF
    const baseKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );

    // Derive the AES-GCM key using HKDF
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt: HKDF_SALT,
        info: HKDF_INFO,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, // Not extractable for security
      ['encrypt', 'decrypt']
    );

    return aesKey;
  } catch (error) {
    throw new EncryptionError(
      'KEY_DERIVATION_FAILED',
      `Failed to derive encryption key: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}


/**
 * Converts an ArrayBuffer to a base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to an ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypts a UserStatePayload using AES-GCM-256.
 *
 * Each encryption generates a unique IV (Initialization Vector) to ensure
 * that encrypting the same payload twice produces different ciphertexts.
 *
 * @param payload - The UserStatePayload to encrypt
 * @param key - The AES-GCM CryptoKey derived from wallet signature
 * @returns Promise resolving to an EncryptedBlob containing ciphertext and IV
 * @throws EncryptionError with code 'ENCRYPTION_FAILED' if encryption fails
 * @requirements 2.2, 2.3
 */
export async function encryptPayload(
  payload: UserStatePayload,
  key: CryptoKey
): Promise<EncryptedBlob> {
  try {
    // Serialize payload to JSON
    const plaintext = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // Generate a unique IV for this encryption (12 bytes for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt using AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      plaintextBytes
    );

    return {
      ciphertext: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv.buffer),
      algorithm: 'AES-GCM-256',
      version: payload.version,
    };
  } catch (error) {
    throw new EncryptionError(
      'ENCRYPTION_FAILED',
      `Failed to encrypt payload: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypts an EncryptedBlob back to a UserStatePayload.
 *
 * AES-GCM provides authenticated encryption, so decryption will fail
 * if the ciphertext has been tampered with or if the wrong key is used.
 *
 * @param blob - The EncryptedBlob to decrypt
 * @param key - The AES-GCM CryptoKey derived from wallet signature
 * @returns Promise resolving to the decrypted UserStatePayload
 * @throws EncryptionError with code 'INVALID_BLOB' if blob structure is invalid
 * @throws EncryptionError with code 'DECRYPTION_FAILED' if wrong key is used
 * @throws EncryptionError with code 'TAMPERED_DATA' if ciphertext was modified
 * @requirements 2.5, 2.6
 */
export async function decryptPayload(
  blob: EncryptedBlob,
  key: CryptoKey
): Promise<UserStatePayload> {
  // Validate blob structure
  if (!blob || typeof blob !== 'object') {
    throw new EncryptionError('INVALID_BLOB', 'Encrypted blob must be a non-null object');
  }

  if (blob.algorithm !== 'AES-GCM-256') {
    throw new EncryptionError(
      'INVALID_BLOB',
      `Unsupported encryption algorithm: ${blob.algorithm}`
    );
  }

  if (typeof blob.ciphertext !== 'string' || blob.ciphertext.length === 0) {
    throw new EncryptionError('INVALID_BLOB', 'Ciphertext must be a non-empty string');
  }

  if (typeof blob.iv !== 'string' || blob.iv.length === 0) {
    throw new EncryptionError('INVALID_BLOB', 'IV must be a non-empty string');
  }

  let ciphertextBuffer: ArrayBuffer;
  let ivBuffer: ArrayBuffer;

  try {
    ciphertextBuffer = base64ToArrayBuffer(blob.ciphertext);
    ivBuffer = base64ToArrayBuffer(blob.iv);
  } catch (error) {
    throw new EncryptionError(
      'INVALID_BLOB',
      `Failed to decode base64 data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate IV length
  if (ivBuffer.byteLength !== IV_LENGTH) {
    throw new EncryptionError(
      'INVALID_BLOB',
      `Invalid IV length: expected ${IV_LENGTH} bytes, got ${ivBuffer.byteLength}`
    );
  }

  let plaintextBuffer: ArrayBuffer;

  try {
    plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(ivBuffer),
      },
      key,
      ciphertextBuffer
    );
  } catch (error) {
    // AES-GCM decryption fails with OperationError for both wrong key and tampered data
    // We differentiate based on the error message when possible
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.toLowerCase().includes('tag')) {
      throw new EncryptionError(
        'TAMPERED_DATA',
        'Decryption failed: authentication tag mismatch indicates data tampering'
      );
    }

    throw new EncryptionError(
      'DECRYPTION_FAILED',
      `Decryption failed: wrong key or corrupted data. ${errorMessage}`
    );
  }

  // Decode and parse the plaintext
  const decoder = new TextDecoder();
  const plaintext = decoder.decode(plaintextBuffer);

  let payload: UserStatePayload;

  try {
    payload = JSON.parse(plaintext) as UserStatePayload;
  } catch (error) {
    throw new EncryptionError(
      'TAMPERED_DATA',
      `Failed to parse decrypted payload as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return payload;
}
