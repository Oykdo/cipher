/**
 * Enhanced Cryptography Module - Message Encryption for Database
 * 
 * SECURITY FIX: Application-level encryption for messages before database storage
 * 
 * This module provides server-side message encryption to ensure messages
 * are never stored in plaintext in the database.
 */

/**
 * Generates a dedicated message encryption key using HKDF-SHA256
 * 
 * @param masterKey - User's master key (hex string)
 * @param salt - Random salt (16+ bytes)
 * @returns Derived key for message encryption (32 bytes)
 */
export async function generateMessageKey(
  masterKey: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  // Convert hex masterKey to bytes
  const masterKeyBytes = hexToBytes(masterKey);
  
  // Import as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes.buffer as ArrayBuffer,
    'HKDF',
    false,
    ['deriveBits']
  );
  
  // Derive key using HKDF-SHA256
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt.buffer as ArrayBuffer,
      info: new TextEncoder().encode('DeadDrop-MessageKey-v1'),
    },
    keyMaterial,
    256 // 32 bytes
  );
  
  return new Uint8Array(derivedBits);
}

/**
 * Encrypts a message using AES-GCM-256
 * 
 * @param plaintext - Message to encrypt
 * @param key - Encryption key (32 bytes)
 * @returns Encrypted data with IV and authentication tag
 */
export async function encryptMessage(
  plaintext: string,
  key: Uint8Array
): Promise<{
  iv: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}> {
  // Import key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128, // 16-byte authentication tag
    },
    cryptoKey,
    plaintextBytes
  );
  
  // Split ciphertext and tag
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, -16);
  const tag = encryptedArray.slice(-16);
  
  return { iv, ciphertext, tag };
}

/**
 * Decrypts a message using AES-GCM-256
 * 
 * @param encryptedData - Encrypted message data
 * @param key - Decryption key (32 bytes)
 * @returns Decrypted plaintext message
 */
export async function decryptMessage(
  encryptedData: {
    iv: Uint8Array;
    ciphertext: Uint8Array;
    tag: Uint8Array;
  },
  key: Uint8Array
): Promise<string> {
  // Import key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Reconstruct encrypted data (ciphertext + tag)
  const encryptedBytes = new Uint8Array(
    encryptedData.ciphertext.length + encryptedData.tag.length
  );
  encryptedBytes.set(encryptedData.ciphertext);
  encryptedBytes.set(encryptedData.tag, encryptedData.ciphertext.length);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: encryptedData.iv.buffer as ArrayBuffer,
      tagLength: 128,
    },
    cryptoKey,
    encryptedBytes.buffer as ArrayBuffer
  );
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Converts hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[\s:-]/g, '');
  
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }
  
  const bytes = new Uint8Array(cleanHex.length / 2);
  
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts Uint8Array to Base64
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts Base64 to Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates cryptographically secure random salt
 */
export function generateSalt(length: number = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Securely wipe sensitive data from memory
 */
export function secureWipe(data: Uint8Array): void {
  crypto.getRandomValues(data); // Overwrite with random
  data.fill(0); // Then fill with zeros
}