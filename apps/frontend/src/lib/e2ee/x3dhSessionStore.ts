/**
 * X3DH Session Store
 * 
 * Client-side secure storage for X3DH and Double Ratchet session data.
 * All cryptographic material is stored ONLY in KeyVault - never on server.
 * 
 * Data stored:
 * - Ephemeral keys used during handshake
 * - Peer identity and signing keys
 * - One-time prekey consumed during handshake
 * - Ratchet state (after handshake completion)
 * 
 * Data NOT stored here (stored in sessionManager):
 * - Derived encryption keys
 * - Message counters
 */

import _sodium from 'libsodium-wrappers';
import { getExistingE2EEVault } from '../keyVault';

import { debugLogger } from "../debugLogger";
// ============================================================================
// TYPES
// ============================================================================

/**
 * X3DH handshake state stored in KeyVault
 * Contains all ephemeral keys and peer info needed during handshake
 */
export interface X3DHHandshakeState {
  sessionId: string;
  peerUsername: string;
  
  // Our ephemeral key pair (generated for this handshake only)
  ephemeralKeyPair: {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  
  // Peer's keys received from server/handshake
  peerIdentityKey: Uint8Array;        // X25519
  peerSigningKey: Uint8Array;         // Ed25519
  peerSignedPreKey: Uint8Array;       // X25519
  peerOneTimePreKey?: Uint8Array;     // X25519 (optional, consumed)
  peerOneTimePreKeyId?: number;
  
  // Handshake state
  isInitiator: boolean;               // true = Alice, false = Bob
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  
  // Timestamps
  createdAt: number;
  completedAt?: number;
  
  // Shared secret (computed after handshake)
  sharedSecret?: Uint8Array;
}

/**
 * Serialized format for KeyVault storage
 */
interface StoredX3DHHandshakeState {
  sessionId: string;
  peerUsername: string;
  ephemeralKeyPair: {
    publicKey: string;  // Base64
    privateKey: string; // Base64
  };
  peerIdentityKey: string;      // Base64
  peerSigningKey: string;       // Base64
  peerSignedPreKey: string;     // Base64
  peerOneTimePreKey?: string;   // Base64
  peerOneTimePreKeyId?: number;
  isInitiator: boolean;
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: number;
  completedAt?: number;
  sharedSecret?: string;        // Base64
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_PREFIX = 'x3dh:handshake:';

function getStorageKey(username: string, peerUsername: string): string {
  return `${STORAGE_PREFIX}${username}:${peerUsername}`;
}

// ============================================================================
// SERIALIZATION
// ============================================================================

function serializeHandshakeState(state: X3DHHandshakeState): string {
  const stored: StoredX3DHHandshakeState = {
    sessionId: state.sessionId,
    peerUsername: state.peerUsername,
    ephemeralKeyPair: {
      publicKey: _sodium.to_base64(state.ephemeralKeyPair.publicKey),
      privateKey: _sodium.to_base64(state.ephemeralKeyPair.privateKey),
    },
    peerIdentityKey: _sodium.to_base64(state.peerIdentityKey),
    peerSigningKey: _sodium.to_base64(state.peerSigningKey),
    peerSignedPreKey: _sodium.to_base64(state.peerSignedPreKey),
    peerOneTimePreKey: state.peerOneTimePreKey 
      ? _sodium.to_base64(state.peerOneTimePreKey) 
      : undefined,
    peerOneTimePreKeyId: state.peerOneTimePreKeyId,
    isInitiator: state.isInitiator,
    state: state.state,
    createdAt: state.createdAt,
    completedAt: state.completedAt,
    sharedSecret: state.sharedSecret 
      ? _sodium.to_base64(state.sharedSecret) 
      : undefined,
  };
  return JSON.stringify(stored);
}

function deserializeHandshakeState(json: string): X3DHHandshakeState {
  const stored: StoredX3DHHandshakeState = JSON.parse(json);
  return {
    sessionId: stored.sessionId,
    peerUsername: stored.peerUsername,
    ephemeralKeyPair: {
      publicKey: _sodium.from_base64(stored.ephemeralKeyPair.publicKey),
      privateKey: _sodium.from_base64(stored.ephemeralKeyPair.privateKey),
    },
    peerIdentityKey: _sodium.from_base64(stored.peerIdentityKey),
    peerSigningKey: _sodium.from_base64(stored.peerSigningKey),
    peerSignedPreKey: _sodium.from_base64(stored.peerSignedPreKey),
    peerOneTimePreKey: stored.peerOneTimePreKey 
      ? _sodium.from_base64(stored.peerOneTimePreKey) 
      : undefined,
    peerOneTimePreKeyId: stored.peerOneTimePreKeyId,
    isInitiator: stored.isInitiator,
    state: stored.state,
    createdAt: stored.createdAt,
    completedAt: stored.completedAt,
    sharedSecret: stored.sharedSecret 
      ? _sodium.from_base64(stored.sharedSecret) 
      : undefined,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Store X3DH handshake state in KeyVault
 */
export async function storeHandshakeState(
  username: string,
  state: X3DHHandshakeState
): Promise<void> {
  await _sodium.ready;
  
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }
  
  const key = getStorageKey(username, state.peerUsername);
  const serialized = serializeHandshakeState(state);
  await vault.storeData(key, serialized);
  
  // SECURITY: crypto log removed
}

/**
 * Retrieve X3DH handshake state from KeyVault
 */
export async function getHandshakeState(
  username: string,
  peerUsername: string
): Promise<X3DHHandshakeState | null> {
  await _sodium.ready;
  
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }
  
  const key = getStorageKey(username, peerUsername);
  const serialized = await vault.getData(key);
  
  if (!serialized) {
    return null;
  }
  
  try {
    return deserializeHandshakeState(serialized);
  } catch (error) {
    console.error(`❌ [X3DH Store] Failed to deserialize handshake state:`, error);
    return null;
  }
}

/**
 * Update handshake state (e.g., when completed or failed)
 */
export async function updateHandshakeState(
  username: string,
  peerUsername: string,
  updates: Partial<X3DHHandshakeState>
): Promise<void> {
  const existing = await getHandshakeState(username, peerUsername);
  if (!existing) {
    throw new Error(`No handshake state found for ${peerUsername}`);
  }
  
  const updated = { ...existing, ...updates };
  await storeHandshakeState(username, updated);
}

/**
 * Mark handshake as completed and store shared secret
 */
export async function completeHandshake(
  username: string,
  peerUsername: string,
  sharedSecret: Uint8Array
): Promise<void> {
  await updateHandshakeState(username, peerUsername, {
    state: 'COMPLETED',
    completedAt: Date.now(),
    sharedSecret,
  });
  
  debugLogger.info('✅ [X3DH Store] Handshake completed with ${peerUsername}');
}

/**
 * Mark handshake as failed
 */
export async function failHandshake(
  username: string,
  peerUsername: string
): Promise<void> {
  await updateHandshakeState(username, peerUsername, {
    state: 'FAILED',
  });
  
  debugLogger.debug(`❌ [X3DH Store] Handshake failed with ${peerUsername}`);
}

/**
 * Delete handshake state (after session established or cleanup)
 */
export async function deleteHandshakeState(
  username: string,
  peerUsername: string
): Promise<void> {
  const vault = getExistingE2EEVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }
  
  const key = getStorageKey(username, peerUsername);
  await vault.removeData(key);
  
  debugLogger.debug(`🗑️ [X3DH Store] Deleted handshake state for ${peerUsername}`);
}

/**
 * Check if a handshake is pending with a peer
 */
export async function hasPendingHandshake(
  username: string,
  peerUsername: string
): Promise<boolean> {
  const state = await getHandshakeState(username, peerUsername);
  return state?.state === 'PENDING';
}

/**
 * Get all pending handshakes for a user
 */
export async function getPendingHandshakes(
  _username: string
): Promise<X3DHHandshakeState[]> {
  const vault = getExistingE2EEVault();
  if (!vault) {
    return [];
  }
  
  // KeyVault doesn't support listing keys, so we need to track them separately
  // For now, this is a placeholder - actual implementation would need key enumeration
  console.warn('⚠️ [X3DH Store] getPendingHandshakes requires KeyVault key enumeration');
  return [];
}

/**
 * Create initial handshake state when initiating X3DH as Alice
 */
export async function createInitiatorHandshakeState(
  username: string,
  sessionId: string,
  peerUsername: string,
  peerIdentityKey: Uint8Array,
  peerSigningKey: Uint8Array,
  peerSignedPreKey: Uint8Array,
  peerOneTimePreKey?: Uint8Array,
  peerOneTimePreKeyId?: number
): Promise<X3DHHandshakeState> {
  await _sodium.ready;
  
  // Generate ephemeral key pair for this handshake
  const ephemeralKeyPair = _sodium.crypto_box_keypair();
  
  const state: X3DHHandshakeState = {
    sessionId,
    peerUsername,
    ephemeralKeyPair: {
      publicKey: ephemeralKeyPair.publicKey,
      privateKey: ephemeralKeyPair.privateKey,
    },
    peerIdentityKey,
    peerSigningKey,
    peerSignedPreKey,
    peerOneTimePreKey,
    peerOneTimePreKeyId,
    isInitiator: true,
    state: 'PENDING',
    createdAt: Date.now(),
  };
  
  await storeHandshakeState(username, state);
  return state;
}

/**
 * Create initial handshake state when responding to X3DH as Bob
 */
export async function createResponderHandshakeState(
  username: string,
  sessionId: string,
  peerUsername: string,
  peerIdentityKey: Uint8Array,
  peerSigningKey: Uint8Array,
  peerEphemeralKey: Uint8Array
): Promise<X3DHHandshakeState> {
  await _sodium.ready;
  
  // Generate ephemeral key pair for response
  const ephemeralKeyPair = _sodium.crypto_box_keypair();
  
  const state: X3DHHandshakeState = {
    sessionId,
    peerUsername,
    ephemeralKeyPair: {
      publicKey: ephemeralKeyPair.publicKey,
      privateKey: ephemeralKeyPair.privateKey,
    },
    peerIdentityKey,
    peerSigningKey,
    peerSignedPreKey: peerEphemeralKey, // For Bob, this is Alice's ephemeral key
    isInitiator: false,
    state: 'PENDING',
    createdAt: Date.now(),
  };
  
  await storeHandshakeState(username, state);
  return state;
}
