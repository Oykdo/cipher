/**
 * Key Derivation Functions (KDF) Module
 * 
 * ARCHITECTURE: DiceKey (300 rolls) → Master Key → Hierarchical Sub-Keys
 * 
 * Pipeline:
 * 1. Normalization: 300 dice rolls → 256-bit seed
 * 2. Memory-Hard KDF: Argon2id(seed) → Master Key (256 bits)
 * 3. HKDF Derivation: Master Key → Identity, Signature, Pre-Keys
 * 
 * Security:
 * - Argon2id: Memory-hard (512MB), resistant to GPU/ASIC attacks
 * - HKDF-SHA512: NIST-approved key derivation
 * - Deterministic: Same input always produces same output
 * 
 * Compliance:
 * - OWASP Key Management Best Practices
 * - NIST SP 800-108 (Key Derivation)
 * - NIST SP 800-132 (Password-Based Key Derivation)
 */

import { diceRollsToHex } from './diceKey';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const ARGON2_CONFIG = {
  memory: 65536,      // 64 MB (browser-friendly, still secure)
  iterations: 3,      // 3 passes (OWASP minimum)
  parallelism: 1,     // Single-thread (browser limitation)
  hashLength: 32,     // 256 bits output
  type: 'argon2id',   // Hybrid mode (best of argon2i + argon2d)
};

const PROTOCOL_VERSION = 'DeadDrop-v1';

// Context strings for HKDF (deterministic derivation)
const CONTEXTS = {
  MASTER_KEY: `${PROTOCOL_VERSION}-MasterKey`,
  IDENTITY_KEY: `${PROTOCOL_VERSION}-IdentityKey`,
  SIGNATURE_KEY: `${PROTOCOL_VERSION}-SignatureKey`,
  SIGNED_PRE_KEY: `${PROTOCOL_VERSION}-SignedPreKey`,
  ONE_TIME_PRE_KEY: `${PROTOCOL_VERSION}-OneTimePreKey`,
};

// ============================================================================
// STEP 1: ENTROPY NORMALIZATION (300 dice → 256-bit seed)
// ============================================================================

/**
 * Normalizes 300 dice rolls into a uniform 256-bit seed
 * 
 * Process:
 * 1. Convert dice rolls to hexadecimal string
 * 2. Hash with SHA-512 for uniform distribution
 * 3. Extract first 256 bits as seed
 * 
 * @param diceRolls - Array of 300 integers (1-6)
 * @returns 256-bit seed as Uint8Array (32 bytes)
 */
export async function normalizeDiceEntropy(diceRolls: number[]): Promise<Uint8Array> {
  if (diceRolls.length !== 300) {
    throw new Error(`Expected 300 dice rolls, got ${diceRolls.length}`);
  }

  // Convert to hex representation
  const hexString = diceRollsToHex(diceRolls);
  
  // Hash with SHA-512 for uniform distribution
  const encoder = new TextEncoder();
  const data = encoder.encode(hexString);
  const hashBuffer = await crypto.subtle.digest('SHA-512', data);
  
  // Extract first 256 bits (32 bytes)
  return new Uint8Array(hashBuffer).slice(0, 32);
}

// ============================================================================
// STEP 2: ARGON2ID KEY DERIVATION (seed → Master Key)
// ============================================================================

/**
 * Derives Master Key from seed using Argon2id
 * 
 * SECURITY: Argon2id is memory-hard, making brute-force attacks economically infeasible
 * 
 * Note: Browser implementation uses argon2-browser (WebAssembly)
 * For production, consider server-side generation with higher memory (512MB-1GB)
 * 
 * @param seed - 256-bit normalized seed
 * @param salt - Optional salt (generated if not provided)
 * @returns Master Key (256 bits) as Uint8Array
 */
export async function deriveMasterKey(
  seed: Uint8Array,
  salt?: Uint8Array
): Promise<{ masterKey: Uint8Array; salt: Uint8Array }> {
  // Generate salt if not provided (deterministic if seed is deterministic)
  const actualSalt = salt || await generateDeterministicSalt(seed);
  
  // Import argon2-browser (lazy load for performance)
  const argon2 = await import('argon2-browser');
  
  // Derive key with Argon2id
  const result = await argon2.hash({
    pass: seed,
    salt: actualSalt,
    time: ARGON2_CONFIG.iterations,
    mem: ARGON2_CONFIG.memory,
    parallelism: ARGON2_CONFIG.parallelism,
    hashLen: ARGON2_CONFIG.hashLength,
    type: argon2.ArgonType.Argon2id,
  });
  
  // result.hash is already a Uint8Array
  const masterKey = result.hash;
  
  return { masterKey, salt: actualSalt };
}

/**
 * Generates a deterministic salt from seed (for reproducibility)
 * 
 * @param seed - Input seed
 * @returns 16-byte salt
 */
async function generateDeterministicSalt(seed: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const saltInput = encoder.encode(CONTEXTS.MASTER_KEY + '-salt');
  
  // Concatenate context and seed
  const combined = new Uint8Array(saltInput.length + seed.length);
  combined.set(saltInput);
  combined.set(seed, saltInput.length);
  
  // Hash to generate salt
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(hashBuffer).slice(0, 16); // 128-bit salt
}

// ============================================================================
// STEP 3: HKDF DERIVATION (Master Key → Sub-Keys)
// ============================================================================

/**
 * HKDF-Extract: Derives a pseudorandom key from input key material
 * 
 * @param salt - Salt value
 * @param ikm - Input key material (Master Key)
 * @returns Pseudorandom key (PRK)
 */
async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  // Import salt as HMAC key
  const saltKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(salt),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  
  // HMAC(salt, ikm)
  const prk = await crypto.subtle.sign('HMAC', saltKey, new Uint8Array(ikm));
  return new Uint8Array(prk);
}

/**
 * HKDF-Expand: Expands a pseudorandom key into multiple output keys
 * 
 * @param prk - Pseudorandom key from Extract step
 * @param info - Context/application specific info
 * @param length - Desired output length in bytes
 * @returns Derived key material
 */
async function hkdfExpand(
  prk: Uint8Array,
  info: string,
  length: number
): Promise<Uint8Array> {
  const hashLength = 64; // SHA-512 output length
  const iterations = Math.ceil(length / hashLength);
  
  if (iterations > 255) {
    throw new Error('HKDF output length too large');
  }
  
  // Import PRK as HMAC key
  const prkKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(prk),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  
  const encoder = new TextEncoder();
  const infoBytes = encoder.encode(info);
  
  let okm = new Uint8Array(0);
  let previousBlock = new Uint8Array(0);
  
  for (let i = 1; i <= iterations; i++) {
    // T(i) = HMAC(PRK, T(i-1) | info | i)
    const data = new Uint8Array(previousBlock.length + infoBytes.length + 1);
    data.set(previousBlock);
    data.set(infoBytes, previousBlock.length);
    data[data.length - 1] = i;
    
    const block = await crypto.subtle.sign('HMAC', prkKey, data);
    const blockArray = new Uint8Array(block);
    
    // Append to output
    const newOkm = new Uint8Array(okm.length + blockArray.length);
    newOkm.set(okm);
    newOkm.set(blockArray, okm.length);
    okm = newOkm;
    
    previousBlock = blockArray;
  }
  
  return okm.slice(0, length);
}

/**
 * HKDF: Full key derivation (Extract + Expand)
 * 
 * @param masterKey - Master Key (IKM)
 * @param context - Context string for derivation
 * @param length - Desired output length in bytes
 * @returns Derived key
 */
export async function deriveKey(
  masterKey: Uint8Array,
  context: string,
  length: number = 32
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(PROTOCOL_VERSION + '-' + context);
  
  // Extract
  const prk = await hkdfExtract(salt, masterKey);
  
  // Expand
  return await hkdfExpand(prk, context, length);
}

// ============================================================================
// HIGH-LEVEL API: DERIVE ALL KEYS FROM DICE ROLLS
// ============================================================================

export interface DerivedKeys {
  masterKey: Uint8Array;
  identityKeySeed: Uint8Array;
  signatureKeySeed: Uint8Array;
  signedPreKeySeed: Uint8Array;
  oneTimePreKeySeeds: Uint8Array[]; // Seeds for 100 OPKs
}

/**
 * Derives all cryptographic keys from 300 dice rolls
 * 
 * Complete pipeline:
 * 1. Normalize entropy: 300 dice → 256-bit seed
 * 2. Apply Argon2id: seed → Master Key
 * 3. HKDF derivation: Master Key → all sub-keys
 * 
 * @param diceRolls - Array of 300 integers (1-6)
 * @returns All derived keys
 */
export async function deriveAllKeysFromDice(diceRolls: number[]): Promise<DerivedKeys> {
  console.time('[KDF] Full key derivation');
  
  // Step 1: Normalize entropy
  console.time('[KDF] Normalize entropy');
  const seed = await normalizeDiceEntropy(diceRolls);
  console.timeEnd('[KDF] Normalize entropy');
  
  // Step 2: Derive Master Key with Argon2id
  console.time('[KDF] Argon2id');
  const { masterKey } = await deriveMasterKey(seed);
  console.timeEnd('[KDF] Argon2id');
  
  // Step 3: Derive all sub-keys with HKDF
  console.time('[KDF] HKDF derivation');
  
  const identityKeySeed = await deriveKey(masterKey, CONTEXTS.IDENTITY_KEY, 32);
  const signatureKeySeed = await deriveKey(masterKey, CONTEXTS.SIGNATURE_KEY, 32);
  const signedPreKeySeed = await deriveKey(masterKey, CONTEXTS.SIGNED_PRE_KEY, 32);
  
  // Derive 100 One-Time Pre-Key seeds
  const oneTimePreKeySeeds: Uint8Array[] = [];
  for (let i = 0; i < 100; i++) {
    const seed = await deriveKey(masterKey, `${CONTEXTS.ONE_TIME_PRE_KEY}-${i}`, 32);
    oneTimePreKeySeeds.push(seed);
  }
  
  console.timeEnd('[KDF] HKDF derivation');
  console.timeEnd('[KDF] Full key derivation');
  
  console.info(
    `✅ [KDF] Derived all keys:\n` +
    `   - Master Key: 256 bits\n` +
    `   - Identity Key Seed: 256 bits\n` +
    `   - Signature Key Seed: 256 bits\n` +
    `   - Signed Pre-Key Seed: 256 bits\n` +
    `   - One-Time Pre-Keys: 100 seeds × 256 bits`
  );
  
  return {
    masterKey,
    identityKeySeed,
    signatureKeySeed,
    signedPreKeySeed,
    oneTimePreKeySeeds,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Converts Uint8Array to hex string (for debugging)
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Securely wipes a Uint8Array from memory
 */
export function secureWipe(data: Uint8Array): void {
  crypto.getRandomValues(data); // Overwrite with random data
  data.fill(0);                  // Then fill with zeros
}
