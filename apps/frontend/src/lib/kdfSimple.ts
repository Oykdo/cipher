/**
 * KDF Simple - Alternative to argon2-browser for browser compatibility
 * 
 * Uses PBKDF2 (natively available in browsers) instead of Argon2id
 * 
 * ⚠️ IMPORTANT: This is a simplified version for development/testing.
 * For production, use the full kdf.ts with argon2-browser.
 */

/**
 * Normalize dice entropy: 300 dice rolls → 256-bit seed
 */
export async function normalizeDiceEntropy(diceRolls: number[]): Promise<Uint8Array> {
  if (diceRolls.length !== 300) {
    throw new Error('Exactly 300 dice rolls required');
  }

  // Convert dice rolls to hex string
  const hexString = diceRolls.map(d => d.toString(16)).join('');
  
  // Hash with SHA-512 to get 512 bits, then take first 256 bits
  const encoder = new TextEncoder();
  const data = encoder.encode(hexString);
  const hashBuffer = await crypto.subtle.digest('SHA-512', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Return first 32 bytes (256 bits)
  return hashArray.slice(0, 32);
}

/**
 * Derive master key using PBKDF2 (instead of Argon2id)
 * 
 * PBKDF2 is less secure than Argon2id but natively available in browsers
 */
export async function deriveMasterKey(
  seed: Uint8Array,
  salt: string = 'dead-drop-dicekey-v1',
  iterations: number = 100000, // Higher for PBKDF2 (Argon2 would be 3 passes)
  onProgress?: (progress: number) => void
): Promise<string> {
  // Report progress at start
  if (onProgress) onProgress(0);

  // Convert seed to CryptoKey
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(seed),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // Report progress at 50%
  if (onProgress) onProgress(0.5);

  // Derive 256 bits using PBKDF2
  const encoder = new TextEncoder();
  const saltBuffer = encoder.encode(salt);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: iterations,
      hash: 'SHA-512',
    },
    keyMaterial,
    256 // 256 bits
  );

  // Report progress at 100%
  if (onProgress) onProgress(1);

  // Convert to hex string
  const derivedArray = new Uint8Array(derivedBits);
  return Array.from(derivedArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive a sub-key from master key using HKDF-SHA512
 */
export async function deriveKey(
  masterKey: string,
  info: string,
  length: number = 32
): Promise<Uint8Array> {
  // Convert hex master key to Uint8Array
  const masterKeyBytes = new Uint8Array(
    masterKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  // Import master key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // Derive sub-key
  const encoder = new TextEncoder();
  const infoBuffer = encoder.encode(info);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      salt: new Uint8Array(32), // Zero salt (deterministic)
      info: infoBuffer,
      hash: 'SHA-512',
    },
    keyMaterial,
    length * 8 // bits
  );

  return new Uint8Array(derivedBits);
}

/**
 * Derive all keys from dice rolls
 */
export async function deriveAllKeysFromDice(
  diceRolls: number[],
  onProgress?: (progress: number) => void
): Promise<{
  masterKey: string;
  identityKeySeed: Uint8Array;  // Changed from identitySeed
  signatureKeySeed: Uint8Array; // Changed from signatureSeed
  signedPreKeySeed: Uint8Array;
  oneTimePreKeySeeds: Uint8Array[];
}> {
  // Step 1: Normalize entropy (10% progress)
  if (onProgress) onProgress(0.1);
  const seed = await normalizeDiceEntropy(diceRolls);

  // Step 2: Derive master key with PBKDF2 (10% → 70% progress)
  const masterKey = await deriveMasterKey(seed, 'dead-drop-dicekey-v1', 100000, (progress) => {
    if (onProgress) onProgress(0.1 + progress * 0.6);
  });

  // Step 3: Derive sub-keys with HKDF (70% → 90% progress)
  if (onProgress) onProgress(0.7);

  const identityKeySeed = await deriveKey(masterKey, 'identity-key-v1', 32);
  if (onProgress) onProgress(0.75);

  const signatureKeySeed = await deriveKey(masterKey, 'signature-key-v1', 32);
  if (onProgress) onProgress(0.8);

  const signedPreKeySeed = await deriveKey(masterKey, 'signed-pre-key-v1', 32);
  if (onProgress) onProgress(0.85);

  // Derive 100 One-Time Pre-Key seeds
  const oneTimePreKeySeeds: Uint8Array[] = [];
  for (let i = 0; i < 100; i++) {
    const seed = await deriveKey(masterKey, `one-time-pre-key-${i}-v1`, 32);
    oneTimePreKeySeeds.push(seed);
  }

  if (onProgress) onProgress(1);

  return {
    masterKey,
    identityKeySeed,
    signatureKeySeed,
    signedPreKeySeed,
    oneTimePreKeySeeds,
  };
}
