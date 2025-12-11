/**
 * Cryptographic Key Generation Module
 * 
 * ARCHITECTURE: Generates Ed25519 and X25519 key pairs from seeds
 * 
 * Key Types:
 * - Ed25519: Digital signatures (Identity, Signature keys)
 * - X25519: Key exchange / ECDH (Pre-Keys for session establishment)
 * 
 * Security:
 * - Deterministic: Same seed always produces same key pair
 * - Uses TweetNaCl for Ed25519/X25519 (audited, battle-tested)
 * - Compatible with Signal Protocol (X3DH)
 * 
 * Compliance:
 * - RFC 8032 (EdDSA / Ed25519)
 * - RFC 7748 (Elliptic Curves for Security - X25519)
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Ed25519KeyPair {
  publicKey: Uint8Array;   // 32 bytes
  secretKey: Uint8Array;   // 64 bytes (includes public key)
}

export interface X25519KeyPair {
  publicKey: Uint8Array;   // 32 bytes
  secretKey: Uint8Array;   // 32 bytes
}

export interface SignedPreKey {
  keyId: number;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  signature: Uint8Array;   // Signed with Signature Key
  timestamp: number;
}

export interface OneTimePreKey {
  keyId: number;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface CompleteKeySet {
  identityKey: Ed25519KeyPair;
  signatureKey: Ed25519KeyPair;
  signedPreKey: SignedPreKey;
  oneTimePreKeys: OneTimePreKey[];
}

// ============================================================================
// ED25519 KEY GENERATION (Identity & Signature)
// ============================================================================

/**
 * Generates an Ed25519 key pair from a 32-byte seed
 * 
 * Ed25519 properties:
 * - Public key: 32 bytes
 * - Secret key: 64 bytes (32-byte seed + 32-byte public key)
 * - Signature: 64 bytes
 * - Deterministic: Same seed always produces same key pair
 * 
 * @param seed - 32-byte seed (from HKDF)
 * @returns Ed25519 key pair
 */
export function generateEd25519KeyPair(seed: Uint8Array): Ed25519KeyPair {
  if (seed.length !== 32) {
    throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  };
}

/**
 * Signs a message with Ed25519
 * 
 * @param message - Message to sign
 * @param secretKey - Ed25519 secret key (64 bytes)
 * @returns 64-byte signature
 */
export function signEd25519(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

/**
 * Verifies an Ed25519 signature
 * 
 * @param signature - 64-byte signature
 * @param message - Original message
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns true if signature is valid
 */
export function verifyEd25519(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey);
}

// ============================================================================
// X25519 KEY GENERATION (Pre-Keys for Key Exchange)
// ============================================================================

/**
 * Generates an X25519 key pair from a 32-byte seed
 * 
 * X25519 properties:
 * - Public key: 32 bytes
 * - Secret key: 32 bytes
 * - Used for ECDH (Elliptic Curve Diffie-Hellman)
 * - Deterministic: Same seed always produces same key pair
 * 
 * Note: TweetNaCl doesn't have deterministic X25519 from seed,
 * so we use the seed as the secret key directly (valid for X25519)
 * 
 * @param seed - 32-byte seed (from HKDF)
 * @returns X25519 key pair
 */
export function generateX25519KeyPair(seed: Uint8Array): X25519KeyPair {
  if (seed.length !== 32) {
    throw new Error(`X25519 seed must be 32 bytes, got ${seed.length}`);
  }
  
  // Use seed as secret key and derive public key
  const secretKey = seed;
  const publicKey = nacl.scalarMult.base(secretKey);
  
  return {
    publicKey,
    secretKey,
  };
}

/**
 * Performs X25519 Diffie-Hellman key exchange
 * 
 * @param ourSecretKey - Our X25519 secret key
 * @param theirPublicKey - Their X25519 public key
 * @returns Shared secret (32 bytes)
 */
export function x25519KeyExchange(
  ourSecretKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  return nacl.scalarMult(ourSecretKey, theirPublicKey);
}

// ============================================================================
// SIGNED PRE-KEY GENERATION
// ============================================================================

/**
 * Generates a Signed Pre-Key (X25519) with signature
 * 
 * Process:
 * 1. Generate X25519 key pair from seed
 * 2. Sign the public key with Signature Key (Ed25519)
 * 3. Return key pair + signature + metadata
 * 
 * @param seed - 32-byte seed for X25519 generation
 * @param signatureKey - Ed25519 key pair for signing
 * @param keyId - Unique ID for this pre-key
 * @returns Signed Pre-Key
 */
export function generateSignedPreKey(
  seed: Uint8Array,
  signatureKey: Ed25519KeyPair,
  keyId: number = 1
): SignedPreKey {
  // Generate X25519 key pair
  const keyPair = generateX25519KeyPair(seed);
  
  // Create signature payload: public key || timestamp
  // Use seconds since 2020-01-01 to fit in PostgreSQL integer (max ~2.1 billion)
  const EPOCH_2020 = 1577836800000; // 2020-01-01T00:00:00Z in ms
  const timestamp = Math.floor((Date.now() - EPOCH_2020) / 1000);
  const timestampBytes = new Uint8Array(8);
  new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp), false);
  
  const signaturePayload = new Uint8Array(keyPair.publicKey.length + timestampBytes.length);
  signaturePayload.set(keyPair.publicKey);
  signaturePayload.set(timestampBytes, keyPair.publicKey.length);
  
  // Sign with Signature Key
  const signature = signEd25519(signaturePayload, signatureKey.secretKey);
  
  return {
    keyId,
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    signature,
    timestamp,
  };
}

/**
 * Verifies a Signed Pre-Key signature
 * 
 * @param spk - Signed Pre-Key to verify
 * @param signaturePublicKey - Ed25519 public key that signed it
 * @returns true if signature is valid
 */
export function verifySignedPreKey(
  spk: SignedPreKey,
  signaturePublicKey: Uint8Array
): boolean {
  // Reconstruct signature payload
  const timestampBytes = new Uint8Array(8);
  new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(spk.timestamp), false);
  
  const signaturePayload = new Uint8Array(spk.publicKey.length + timestampBytes.length);
  signaturePayload.set(spk.publicKey);
  signaturePayload.set(timestampBytes, spk.publicKey.length);
  
  return verifyEd25519(spk.signature, signaturePayload, signaturePublicKey);
}

// ============================================================================
// ONE-TIME PRE-KEY BUNDLE GENERATION
// ============================================================================

/**
 * Generates a bundle of One-Time Pre-Keys
 * 
 * @param seeds - Array of 32-byte seeds (one per OPK)
 * @param startKeyId - Starting key ID (default: 1)
 * @returns Array of One-Time Pre-Keys
 */
export function generateOneTimePreKeyBundle(
  seeds: Uint8Array[],
  startKeyId: number = 1
): OneTimePreKey[] {
  return seeds.map((seed, index) => {
    const keyPair = generateX25519KeyPair(seed);
    return {
      keyId: startKeyId + index,
      publicKey: keyPair.publicKey,
      secretKey: keyPair.secretKey,
    };
  });
}

// ============================================================================
// COMPLETE KEY SET GENERATION (FROM DERIVED KEYS)
// ============================================================================

/**
 * Generates complete key set from KDF-derived seeds
 * 
 * This is the main entry point for creating all keys from dice rolls.
 * 
 * @param derivedKeys - Seeds from KDF module (deriveAllKeysFromDice)
 * @returns Complete key set ready for registration
 */
export function generateCompleteKeySet(derivedKeys: {
  identityKeySeed: Uint8Array;
  signatureKeySeed: Uint8Array;
  signedPreKeySeed: Uint8Array;
  oneTimePreKeySeeds: Uint8Array[];
}): CompleteKeySet {
  console.time('[KeyGen] Complete key set generation');
  
  // 1. Generate Identity Key (Ed25519)
  console.time('[KeyGen] Identity Key');
  const identityKey = generateEd25519KeyPair(derivedKeys.identityKeySeed);
  console.timeEnd('[KeyGen] Identity Key');
  
  // 2. Generate Signature Key (Ed25519)
  console.time('[KeyGen] Signature Key');
  const signatureKey = generateEd25519KeyPair(derivedKeys.signatureKeySeed);
  console.timeEnd('[KeyGen] Signature Key');
  
  // 3. Generate Signed Pre-Key (X25519 + signature)
  console.time('[KeyGen] Signed Pre-Key');
  const signedPreKey = generateSignedPreKey(
    derivedKeys.signedPreKeySeed,
    signatureKey,
    1
  );
  console.timeEnd('[KeyGen] Signed Pre-Key');
  
  // 4. Generate One-Time Pre-Key bundle (100 X25519 keys)
  console.time('[KeyGen] One-Time Pre-Keys');
  const oneTimePreKeys = generateOneTimePreKeyBundle(derivedKeys.oneTimePreKeySeeds);
  console.timeEnd('[KeyGen] One-Time Pre-Keys');
  
  console.timeEnd('[KeyGen] Complete key set generation');
  
  console.info(
    `✅ [KeyGen] Complete key set generated:\n` +
    `   - Identity Key: Ed25519 (32-byte pub, 64-byte sec)\n` +
    `   - Signature Key: Ed25519 (32-byte pub, 64-byte sec)\n` +
    `   - Signed Pre-Key: X25519 + Ed25519 signature\n` +
    `   - One-Time Pre-Keys: ${oneTimePreKeys.length} X25519 keys`
  );
  
  return {
    identityKey,
    signatureKey,
    signedPreKey,
    oneTimePreKeys,
  };
}

// ============================================================================
// KEY SERIALIZATION (for storage & transmission)
// ============================================================================

/**
 * Encodes a key to Base64 (for transmission)
 */
export function encodeKey(key: Uint8Array): string {
  return encodeBase64(key);
}

/**
 * Decodes a Base64 key
 */
export function decodeKey(encoded: string): Uint8Array {
  return decodeBase64(encoded);
}

/**
 * Serializes a complete key set for storage
 */
export interface SerializedKeySet {
  identityKey: {
    publicKey: string;
    secretKey: string;
  };
  signatureKey: {
    publicKey: string;
    secretKey: string;
  };
  signedPreKey: {
    keyId: number;
    publicKey: string;
    secretKey: string;
    signature: string;
    timestamp: number;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
    secretKey: string;
  }>;
}

export function serializeKeySet(keySet: CompleteKeySet): SerializedKeySet {
  return {
    identityKey: {
      publicKey: encodeKey(keySet.identityKey.publicKey),
      secretKey: encodeKey(keySet.identityKey.secretKey),
    },
    signatureKey: {
      publicKey: encodeKey(keySet.signatureKey.publicKey),
      secretKey: encodeKey(keySet.signatureKey.secretKey),
    },
    signedPreKey: {
      keyId: keySet.signedPreKey.keyId,
      publicKey: encodeKey(keySet.signedPreKey.publicKey),
      secretKey: encodeKey(keySet.signedPreKey.secretKey),
      signature: encodeKey(keySet.signedPreKey.signature),
      timestamp: keySet.signedPreKey.timestamp,
    },
    oneTimePreKeys: keySet.oneTimePreKeys.map(opk => ({
      keyId: opk.keyId,
      publicKey: encodeKey(opk.publicKey),
      secretKey: encodeKey(opk.secretKey),
    })),
  };
}

export function deserializeKeySet(serialized: SerializedKeySet): CompleteKeySet {
  return {
    identityKey: {
      publicKey: decodeKey(serialized.identityKey.publicKey),
      secretKey: decodeKey(serialized.identityKey.secretKey),
    },
    signatureKey: {
      publicKey: decodeKey(serialized.signatureKey.publicKey),
      secretKey: decodeKey(serialized.signatureKey.secretKey),
    },
    signedPreKey: {
      keyId: serialized.signedPreKey.keyId,
      publicKey: decodeKey(serialized.signedPreKey.publicKey),
      secretKey: decodeKey(serialized.signedPreKey.secretKey),
      signature: decodeKey(serialized.signedPreKey.signature),
      timestamp: serialized.signedPreKey.timestamp,
    },
    oneTimePreKeys: serialized.oneTimePreKeys.map(opk => ({
      keyId: opk.keyId,
      publicKey: decodeKey(opk.publicKey),
      secretKey: decodeKey(opk.secretKey),
    })),
  };
}

// ============================================================================
// KEY FINGERPRINT (for verification)
// ============================================================================

/**
 * Generates a human-readable fingerprint from a public key
 * 
 * Format: "a3f7:c9e2:d8b1:4e6f:..." (hex groups separated by colons)
 * 
 * @param publicKey - Public key bytes
 * @returns Fingerprint string
 */
export async function generateFingerprint(publicKey: Uint8Array): Promise<string> {
  // Hash public key with SHA-256
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(publicKey));
  const hashArray = new Uint8Array(hash);
  
  // Convert to hex groups
  const hex = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Format as "xxxx:xxxx:xxxx:..."
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.substring(i, i + 4));
  }
  
  return groups.join(':');
}

/**
 * Generates a short user ID from Identity Public Key
 * 
 * @param identityPublicKey - Identity Key public key
 * @returns 12-character hex user ID
 */
export async function generateUserId(identityPublicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(identityPublicKey));
  const hashArray = new Uint8Array(hash);
  
  // Take first 6 bytes (48 bits)
  return Array.from(hashArray.slice(0, 6))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
