/**
 * E2EE Key Management
 * 
 * Manages user identity keys, ephemeral keys, and prekeys
 * Integrates with KeyVault for secure storage
 */

import {
  generateIdentityKeyPair,
  generateSigningKeyPair,
  generateOneTimePreKeys,
  bytesToBase64,
  base64ToBytes,
  type IdentityKeyPair,
  type KeyPair,
  type KeyBundle,
  type SignedPreKey,
  signData,
} from './index';
import { getExistingE2EEVault } from '../keyVault';

import { debugLogger } from "../debugLogger";
// ============================================================================
// TYPES
// ============================================================================

export interface UserIdentityKeys {
  identityKeyPair: IdentityKeyPair;
  signingKeyPair: KeyPair;
  preKeys: KeyPair[];
  signedPreKey: SignedPreKey;
}

export interface StoredIdentityKeys {
  identityPublicKey: string;
  identityPrivateKey: string;
  identityFingerprint: string;
  signingPublicKey: string;
  signingPrivateKey: string;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeyPrivate: string;
  signedPreKeySignature: string;
  oneTimePreKeys: Array<{ id: number; publicKey: string; privateKey: string }>;
}

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate complete identity key bundle for a new user
 */
export async function generateUserIdentityKeys(): Promise<UserIdentityKeys> {
  // SECURITY: crypto log removed
  
  // Generate long-term identity key pair (X25519)
  const identityKeyPair = await generateIdentityKeyPair();
  // SECURITY: Sensitive log removed
  
  // Generate signing key pair (Ed25519)
  const signingKeyPair = await generateSigningKeyPair();
  // SECURITY: Sensitive log removed
  
  // Generate one-time prekeys
  const preKeys = await generateOneTimePreKeys(100);
  debugLogger.info('✅ [E2EE] Generated ${preKeys.length} one-time prekeys');

  // Generate signed prekey (we sign the first prekey's public key)
  // Use a random ID that fits in PostgreSQL integer (max ~2.1 billion)
  const preKeyId = Math.floor(Math.random() * 2000000000);
  const signedPreKeyPublicBase64 = bytesToBase64(preKeys[0].publicKey);
  const signature = await signData(signedPreKeyPublicBase64, signingKeyPair.privateKey);

  const signedPreKey: SignedPreKey = {
    keyId: preKeyId,
    publicKey: signedPreKeyPublicBase64,
    signature,
  };
  debugLogger.info('✅ [E2EE] Signed prekey generated');
  
  return {
    identityKeyPair,
    signingKeyPair,
    preKeys,
    signedPreKey,
  };
}

// ============================================================================
// KEY STORAGE (KeyVault Integration)
// ============================================================================

/**
 * Store user identity keys in KeyVault
 */
export async function storeIdentityKeys(
  username: string,
  keys: UserIdentityKeys
): Promise<void> {
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }
  
  const stored: StoredIdentityKeys = {
    identityPublicKey: bytesToBase64(keys.identityKeyPair.publicKey),
    identityPrivateKey: bytesToBase64(keys.identityKeyPair.privateKey),
    identityFingerprint: keys.identityKeyPair.fingerprint,
    signingPublicKey: bytesToBase64(keys.signingKeyPair.publicKey),
    signingPrivateKey: bytesToBase64(keys.signingKeyPair.privateKey),
    signedPreKeyId: keys.signedPreKey.keyId,
    signedPreKeyPublic: keys.signedPreKey.publicKey,
    signedPreKeyPrivate: bytesToBase64(keys.preKeys[0].privateKey), // Store first prekey as signed prekey
    signedPreKeySignature: keys.signedPreKey.signature,
    oneTimePreKeys: keys.preKeys.map((key, index) => ({
      id: index,
      publicKey: bytesToBase64(key.publicKey),
      privateKey: bytesToBase64(key.privateKey),
    })),
  };
  
  await vault.storeData(`e2ee:identity:${username}`, JSON.stringify(stored));
  debugLogger.info('✅ [E2EE] Identity keys stored for user: ${username}');
}

/**
 * Retrieve user identity keys from KeyVault
 */
export async function retrieveIdentityKeys(
  username: string
): Promise<UserIdentityKeys | null> {
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }
  
  const storedJson = await vault.getData(`e2ee:identity:${username}`);
  if (!storedJson) {
    return null;
  }
  
  const stored: StoredIdentityKeys = JSON.parse(storedJson);
  
  return {
    identityKeyPair: {
      publicKey: base64ToBytes(stored.identityPublicKey),
      privateKey: base64ToBytes(stored.identityPrivateKey),
      fingerprint: stored.identityFingerprint,
    },
    signingKeyPair: {
      publicKey: base64ToBytes(stored.signingPublicKey),
      privateKey: base64ToBytes(stored.signingPrivateKey),
    },
    preKeys: stored.oneTimePreKeys.map(key => ({
      publicKey: base64ToBytes(key.publicKey),
      privateKey: base64ToBytes(key.privateKey),
    })),
    signedPreKey: {
      keyId: stored.signedPreKeyId,
      publicKey: stored.signedPreKeyPublic,
      signature: stored.signedPreKeySignature,
    },
  };
}

/**
 * Get or create identity keys for a user
 */
export async function getOrCreateIdentityKeys(
  username: string
): Promise<UserIdentityKeys> {
  // Try to retrieve existing keys
  let keys = await retrieveIdentityKeys(username);

  if (!keys) {
    // Generate new keys if none exist
    // SECURITY: crypto log removed
    keys = await generateUserIdentityKeys();
    await storeIdentityKeys(username, keys);
  } else {
    debugLogger.info('✅ [E2EE] Retrieved existing keys for ${username}');
  }

  return keys;
}

// ============================================================================
// KEY BUNDLE CREATION
// ============================================================================

/**
 * Create a key bundle for publishing to server
 * This bundle allows others to initiate encrypted conversations
 */
export async function createKeyBundle(
  keys: UserIdentityKeys
): Promise<KeyBundle> {
  return {
    identityKey: bytesToBase64(keys.identityKeyPair.publicKey),
    signedPreKey: keys.signedPreKey,
    oneTimePreKeys: keys.preKeys.slice(0, 50).map(key => bytesToBase64(key.publicKey)),
  };
}

// ============================================================================
// PEER KEY STORAGE
// ============================================================================

/**
 * Store a peer's public identity key
 */
export async function storePeerPublicKey(
  username: string,
  peerUsername: string,
  publicKey: Uint8Array,
  fingerprint: string
): Promise<void> {
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }

  const data = {
    publicKey: bytesToBase64(publicKey),
    fingerprint,
    verifiedAt: null as number | null,
  };

  await vault.storeData(`e2ee:peer:${username}:${peerUsername}`, JSON.stringify(data));
  // SECURITY: Sensitive log removed
}

/**
 * Retrieve a peer's public identity key
 */
export async function retrievePeerPublicKey(
  username: string,
  peerUsername: string
): Promise<{ publicKey: Uint8Array; fingerprint: string; verifiedAt: number | null } | null> {
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }

  const dataJson = await vault.getData(`e2ee:peer:${username}:${peerUsername}`);
  if (!dataJson) {
    return null;
  }

  const data = JSON.parse(dataJson);

  return {
    publicKey: base64ToBytes(data.publicKey),
    fingerprint: data.fingerprint,
    verifiedAt: data.verifiedAt,
  };
}

/**
 * Mark a peer's key as verified
 */
export async function markPeerKeyVerified(
  username: string,
  peerUsername: string
): Promise<void> {
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }

  const dataJson = await vault.getData(`e2ee:peer:${username}:${peerUsername}`);
  if (!dataJson) {
    throw new Error('Peer key not found');
  }

  const data = JSON.parse(dataJson);
  data.verifiedAt = Date.now();

  await vault.storeData(`e2ee:peer:${username}:${peerUsername}`, JSON.stringify(data));
  // SECURITY: Sensitive log removed
}

// ============================================================================
// KEY EXPORT/BACKUP
// ============================================================================

/**
 * Export identity keys for backup (encrypted with password)
 */
export async function exportIdentityKeys(
  username: string,
  password: string
): Promise<string> {
  const keys = await retrieveIdentityKeys(username);
  if (!keys) {
    throw new Error('No identity keys found');
  }

  // Import encryption utilities
  const { encryptSymmetric, deriveEncryptionKey } = await import('./index');

  // Derive key from password
  const passwordBytes = new TextEncoder().encode(password);
  const salt = new Uint8Array(32); // Could use random salt and include it
  const encryptionKey = await deriveEncryptionKey(passwordBytes, salt);

  // Serialize keys
  const keysJson = JSON.stringify({
    identityPublicKey: bytesToBase64(keys.identityKeyPair.publicKey),
    identityPrivateKey: bytesToBase64(keys.identityKeyPair.privateKey),
    signingPublicKey: bytesToBase64(keys.signingKeyPair.publicKey),
    signingPrivateKey: bytesToBase64(keys.signingKeyPair.privateKey),
  });

  // Encrypt
  const encrypted = await encryptSymmetric(keysJson, encryptionKey);

  return JSON.stringify(encrypted);
}

/**
 * Import identity keys from backup
 */
export async function importIdentityKeys(
  username: string,
  encryptedBackup: string,
  password: string
): Promise<void> {
  // Import encryption utilities
  const { decryptSymmetric, deriveEncryptionKey } = await import('./index');

  // Derive key from password
  const passwordBytes = new TextEncoder().encode(password);
  const salt = new Uint8Array(32);
  const encryptionKey = await deriveEncryptionKey(passwordBytes, salt);

  // Decrypt
  const encrypted = JSON.parse(encryptedBackup);
  const keysJson = await decryptSymmetric(encrypted, encryptionKey);
  // Validate JSON structure before storing
  JSON.parse(keysJson);

  // Store in KeyVault
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }

  await vault.storeData(`e2ee:identity:${username}`, keysJson);
  debugLogger.info('✅ [E2EE] Imported identity keys for user: ${username}');
}

