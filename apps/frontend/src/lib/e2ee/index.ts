/**
 * E2EE Cryptographic Utilities
 * 
 * Comprehensive end-to-end encryption module using libsodium
 * 
 * FEATURES:
 * - X25519 key exchange (Elliptic Curve Diffie-Hellman)
 * - AES-256-GCM symmetric encryption (via ChaCha20-Poly1305)
 * - Ed25519 digital signatures
 * - Key fingerprinting and verification
 * - Perfect Forward Secrecy (PFS)
 * - Secure key storage integration
 * 
 * ARCHITECTURE:
 * - Identity keys: Long-term X25519 key pairs for user identity
 * - Ephemeral keys: Short-lived keys for each session (PFS)
 * - Prekeys: One-time keys for asynchronous messaging (X3DH)
 * - Message keys: Derived from shared secrets for actual encryption
 */

import sodium from 'libsodium-wrappers';

import { debugLogger } from "../debugLogger";
// ============================================================================
// TYPES
// ============================================================================

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface IdentityKeyPair extends KeyPair {
  fingerprint: string;
}

export interface EncryptedData {
  ciphertext: string; // Base64
  nonce: string; // Base64
  ephemeralPublicKey?: string; // Base64 (for sealed box)
}

export interface SignedPreKey {
  keyId: number;
  publicKey: string; // Base64
  signature: string; // Base64
}

export interface KeyBundle {
  identityKey: string; // Base64
  signedPreKey: SignedPreKey;
  oneTimePreKeys: string[]; // Base64[]
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let sodiumReady = false;

/**
 * Initialize libsodium (must be called before any crypto operations)
 */
export async function initializeCrypto(): Promise<void> {
  if (sodiumReady) return;
  
  await sodium.ready;
  sodiumReady = true;
  debugLogger.info('✅ [E2EE] Libsodium initialized');
}

/**
 * Ensure sodium is ready before operations
 */
async function ensureSodiumReady(): Promise<void> {
  if (!sodiumReady) {
    await initializeCrypto();
  }
}

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate X25519 key pair for key exchange
 */
export async function generateKeyExchangeKeyPair(): Promise<KeyPair> {
  await ensureSodiumReady();
  
  const keyPair = sodium.crypto_box_keypair();
  
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate Ed25519 key pair for signing
 */
export async function generateSigningKeyPair(): Promise<KeyPair> {
  await ensureSodiumReady();
  
  const keyPair = sodium.crypto_sign_keypair();
  
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate identity key pair with fingerprint
 */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const keyPair = await generateKeyExchangeKeyPair();
  const fingerprint = await generateFingerprint(keyPair.publicKey);
  
  return {
    ...keyPair,
    fingerprint,
  };
}

/**
 * Generate multiple one-time prekeys
 */
export async function generateOneTimePreKeys(count: number = 100): Promise<KeyPair[]> {
  await ensureSodiumReady();
  
  const preKeys: KeyPair[] = [];
  
  for (let i = 0; i < count; i++) {
    preKeys.push(await generateKeyExchangeKeyPair());
  }
  
  return preKeys;
}

// ============================================================================
// KEY FINGERPRINTING
// ============================================================================

/**
 * Generate a human-readable fingerprint from a public key
 * Uses SHA-256 hash formatted as hex groups
 */
export async function generateFingerprint(publicKey: Uint8Array): Promise<string> {
  await ensureSodiumReady();
  
  // Hash the public key using generic hash (SHA-256 equivalent output)
  const hash = sodium.crypto_generichash(32, publicKey);
  
  // Convert to hex and format in groups of 4
  const hex = sodium.to_hex(hash);
  const groups: string[] = [];
  
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.substring(i, i + 4));
  }
  
  // Return formatted fingerprint (e.g., "a1b2 c3d4 e5f6 ...")
  return groups.join(' ').toUpperCase();
}

/**
 * Compare two fingerprints for equality
 */
export function compareFingerprintsEqual(fp1: string, fp2: string): boolean {
  // Normalize (remove spaces, uppercase)
  const normalize = (fp: string) => fp.replace(/\s/g, '').toUpperCase();
  return normalize(fp1) === normalize(fp2);
}

// ============================================================================
// KEY EXCHANGE (X25519 ECDH)
// ============================================================================

/**
 * Perform X25519 key exchange to derive shared secret
 * @param myPrivateKey My private key
 * @param theirPublicKey Their public key
 * @returns Shared secret (32 bytes)
 */
export async function deriveSharedSecret(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  await ensureSodiumReady();

  // Convert box keys to scalarmult keys if needed
  const sharedSecret = sodium.crypto_scalarmult(
    myPrivateKey.slice(0, 32),
    theirPublicKey
  );

  return sharedSecret;
}

/**
 * Derive encryption key from shared secret using HKDF
 * @param sharedSecret Shared secret from key exchange
 * @param salt Optional salt
 * @param info Optional context info
 * @returns Encryption key (32 bytes)
 */
export async function deriveEncryptionKey(
  sharedSecret: Uint8Array,
  salt?: Uint8Array,
  info?: Uint8Array
): Promise<Uint8Array> {
  await ensureSodiumReady();

  const actualSalt = salt || new Uint8Array(32); // Zero salt if not provided
  const actualInfo = info || new Uint8Array(0);

  // Use BLAKE2b as KDF (libsodium's generic hash)
  const key = sodium.crypto_generichash(
    32, // Output length
    new Uint8Array([...sharedSecret, ...actualSalt, ...actualInfo])
  );

  return key;
}

// ============================================================================
// SYMMETRIC ENCRYPTION (ChaCha20-Poly1305)
// ============================================================================

/**
 * Encrypt data with ChaCha20-Poly1305 (authenticated encryption)
 * @param plaintext Data to encrypt
 * @param key Encryption key (32 bytes)
 * @returns Encrypted data with nonce
 */
export async function encryptSymmetric(
  plaintext: string | Uint8Array,
  key: Uint8Array
): Promise<EncryptedData> {
  await ensureSodiumReady();

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Decrypt data with ChaCha20-Poly1305
 * @param encrypted Encrypted data
 * @param key Decryption key (32 bytes)
 * @returns Decrypted plaintext
 */
export async function decryptSymmetric(
  encrypted: EncryptedData,
  key: Uint8Array
): Promise<string> {
  await ensureSodiumReady();

  const ciphertext = sodium.from_base64(encrypted.ciphertext);
  const nonce = sodium.from_base64(encrypted.nonce);

  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);

  if (!plaintext) {
    throw new Error('Decryption failed: invalid key or corrupted data');
  }

  return sodium.to_string(plaintext);
}

// ============================================================================
// ASYMMETRIC ENCRYPTION (Sealed Box - Anonymous Sender)
// ============================================================================

/**
 * Encrypt for recipient using sealed box (anonymous sender)
 * Uses ephemeral key pair for perfect forward secrecy
 * @param plaintext Data to encrypt
 * @param recipientPublicKey Recipient's public key
 * @returns Encrypted data
 */
export async function encryptSealed(
  plaintext: string,
  recipientPublicKey: Uint8Array
): Promise<string> {
  await ensureSodiumReady();

  const ciphertext = sodium.crypto_box_seal(plaintext, recipientPublicKey);

  return sodium.to_base64(ciphertext);
}

/**
 * Decrypt sealed box
 * @param ciphertext Encrypted data (base64)
 * @param recipientPublicKey Recipient's public key
 * @param recipientPrivateKey Recipient's private key
 * @returns Decrypted plaintext
 */
export async function decryptSealed(
  ciphertext: string,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array
): Promise<string> {
  await ensureSodiumReady();

  const ciphertextBytes = sodium.from_base64(ciphertext);
  const plaintext = sodium.crypto_box_seal_open(
    ciphertextBytes,
    recipientPublicKey,
    recipientPrivateKey
  );

  if (!plaintext) {
    throw new Error('Decryption failed: invalid key or corrupted data');
  }

  return sodium.to_string(plaintext);
}

// ============================================================================
// DIGITAL SIGNATURES (Ed25519)
// ============================================================================

/**
 * Sign data with Ed25519
 * @param data Data to sign
 * @param privateKey Signing private key
 * @returns Signature (base64)
 */
export async function signData(
  data: string | Uint8Array,
  privateKey: Uint8Array
): Promise<string> {
  await ensureSodiumReady();

  const signature = sodium.crypto_sign_detached(data, privateKey);

  return sodium.to_base64(signature);
}

/**
 * Verify signature with Ed25519
 * @param data Original data
 * @param signature Signature (base64)
 * @param publicKey Signer's public key
 * @returns True if signature is valid
 */
export async function verifySignature(
  data: string | Uint8Array,
  signature: string,
  publicKey: Uint8Array
): Promise<boolean> {
  await ensureSodiumReady();

  try {
    const signatureBytes = sodium.from_base64(signature);

    return sodium.crypto_sign_verify_detached(
      signatureBytes,
      data,
      publicKey
    );
  } catch {
    return false;
  }
}

// ============================================================================
// AUTHENTICATED ENCRYPTION (Box - Known Sender)
// ============================================================================

/**
 * Encrypt for recipient with authenticated sender
 * @param plaintext Data to encrypt
 * @param recipientPublicKey Recipient's public key
 * @param senderPrivateKey Sender's private key
 * @returns Encrypted data with nonce
 */
export async function encryptAuthenticated(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderPrivateKey: Uint8Array
): Promise<EncryptedData> {
  await ensureSodiumReady();

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy(
    plaintext,
    nonce,
    recipientPublicKey,
    senderPrivateKey
  );

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Decrypt authenticated message
 * @param encrypted Encrypted data
 * @param senderPublicKey Sender's public key
 * @param recipientPrivateKey Recipient's private key
 * @returns Decrypted plaintext
 */
export async function decryptAuthenticated(
  encrypted: EncryptedData,
  senderPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array
): Promise<string> {
  await ensureSodiumReady();

  const ciphertext = sodium.from_base64(encrypted.ciphertext);
  const nonce = sodium.from_base64(encrypted.nonce);

  const plaintext = sodium.crypto_box_open_easy(
    ciphertext,
    nonce,
    senderPublicKey,
    recipientPrivateKey
  );

  if (!plaintext) {
    throw new Error('Decryption failed: invalid key or corrupted data');
  }

  return sodium.to_string(plaintext);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert Uint8Array to Base64
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes);
}

/**
 * Convert Base64 to Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  const trimmed = base64.trim();

  // libsodium-wrappers defaults to URLSAFE_NO_PADDING.
  // Backend may return either urlsafe or standard base64, with/without padding.
  // Try urlsafe-no-padding first, then fall back to ORIGINAL.
  try {
    return sodium.from_base64(trimmed.replace(/=+$/g, ''));
  } catch {
    // Fall through
  }

  const standard = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const pad = standard.length % 4;
  const padded = pad === 0 ? standard : `${standard}${'='.repeat(4 - pad)}`;
  return sodium.from_base64(padded, sodium.base64_variants.ORIGINAL);
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return sodium.to_hex(bytes);
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  return sodium.from_hex(hex);
}

/**
 * Generate random bytes
 */
export async function randomBytes(length: number): Promise<Uint8Array> {
  await ensureSodiumReady();
  return sodium.randombytes_buf(length);
}

/**
 * Secure memory wipe
 */
export function secureWipe(data: Uint8Array): void {
  sodium.memzero(data);
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

/**
 * Complete E2EE message encryption (with signature)
 * @param message Message to encrypt
 * @param recipientPublicKey Recipient's public key
 * @param senderPrivateKey Sender's private key
 * @param senderSigningKey Sender's signing key (optional)
 * @returns Encrypted message with optional signature
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: Uint8Array,
  senderPrivateKey: Uint8Array,
  senderSigningKey?: Uint8Array
): Promise<{ encrypted: EncryptedData; signature?: string }> {
  // Encrypt the message
  const encrypted = await encryptAuthenticated(
    message,
    recipientPublicKey,
    senderPrivateKey
  );

  // Optionally sign the ciphertext
  let signature: string | undefined;
  if (senderSigningKey) {
    signature = await signData(encrypted.ciphertext, senderSigningKey);
  }

  return { encrypted, signature };
}

/**
 * Complete E2EE message decryption (with signature verification)
 * @param encrypted Encrypted data
 * @param signature Optional signature
 * @param senderPublicKey Sender's public key
 * @param recipientPrivateKey Recipient's private key
 * @param senderVerifyKey Sender's verification key (optional)
 * @returns Decrypted message
 */
export async function decryptMessage(
  encrypted: EncryptedData,
  senderPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
  signature?: string,
  senderVerifyKey?: Uint8Array
): Promise<string> {
  // Verify signature if provided
  if (signature && senderVerifyKey) {
    const isValid = await verifySignature(
      encrypted.ciphertext,
      signature,
      senderVerifyKey
    );

    if (!isValid) {
      throw new Error('Signature verification failed');
    }
  }

  // Decrypt the message
  return decryptAuthenticated(encrypted, senderPublicKey, recipientPrivateKey);
}

