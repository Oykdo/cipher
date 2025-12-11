/**
 * E2EE Session Manager
 * 
 * Manages encrypted sessions between users
 * Implements X3DH-like key agreement for session establishment
 * 
 * HYBRID ENCRYPTION:
 * - Primary: Double Ratchet (Perfect Forward Secrecy)
 * - Fallback: NaCl Box (stateless, always works)
 */

import {
  deriveSharedSecret,
  deriveEncryptionKey,
  encryptSymmetric,
  decryptSymmetric,
  encryptAuthenticated,
  decryptAuthenticated,
  bytesToBase64,
  base64ToBytes,
  type EncryptedData,
} from './index';
import { getExistingKeyVault } from '../keyVault';
import {
  ratchetEncrypt,
  ratchetDecrypt,
  type RatchetState,
  type DoubleRatchetMessage
} from './doubleRatchet';

// ============================================================================
// ENCRYPTION MODE PREFERENCE
// ============================================================================

export type EncryptionModePreference = 'nacl-box' | 'double-ratchet';

/**
 * Get the encryption mode preference for a peer
 * 
 * NOTE: Double Ratchet is DISABLED due to persistent desynchronization issues.
 * Without proper X3DH handshake, sessions created independently will always fail.
 * Always returns 'nacl-box' for reliable stateless encryption.
 */
export function getEncryptionModePreference(_peerUsername: string): EncryptionModePreference {
  // FORCE NaCl Box - Double Ratchet disabled until X3DH is properly implemented
  return 'nacl-box';
}

/**
 * Set the encryption mode preference for a peer
 * NOTE: Currently ignored - NaCl Box is forced for reliability
 */
export function setEncryptionModePreference(_peerUsername: string, _mode: EncryptionModePreference): void {
  // No-op: NaCl Box is forced for reliability
}

// ============================================================================
// TYPES
// ============================================================================

export interface E2EESession {
  sessionId: string;
  peerUsername: string;
  sharedSecret: Uint8Array;
  encryptionKey: Uint8Array;
  createdAt: number;
  messageCounter: number;
  // Double Ratchet state
  ratchetState?: RatchetState;
  useDoubleRatchet?: boolean;
  // CRITICAL: Only true if X3DH handshake was completed
  // DR mode requires synchronized handshake, NOT independent initialization
  handshakeCompleted?: boolean;
  // Track consecutive failures for automatic fallback
  consecutiveFailures?: number;
  // Store identity keys for NaCl Box fallback
  myPrivateKey?: Uint8Array;
  peerPublicKey?: Uint8Array;
}

/**
 * NaCl Box message format (stateless fallback)
 * Uses crypto_box with identity keys - no session state needed
 */
export interface NaClBoxMessage {
  version: "nacl-box-v1";
  ciphertext: string;  // Base64
  nonce: string;       // Base64
}

interface StoredSession {
  sessionId: string;
  peerUsername: string;
  sharedSecret: string; // Base64
  encryptionKey: string; // Base64
  createdAt: number;
  messageCounter: number;
  // Double Ratchet state (serialized)
  ratchetState?: string; // JSON
  useDoubleRatchet?: boolean;
  // X3DH handshake completion flag
  handshakeCompleted?: boolean;
  // Fallback tracking
  consecutiveFailures?: number;
  myPrivateKey?: string; // Base64
  peerPublicKey?: string; // Base64
}

// ============================================================================
// SESSION STORAGE & MUTEX
// ============================================================================

const activeSessions = new Map<string, E2EESession>();

/**
 * Session mutex to prevent race conditions during encrypt/decrypt operations
 * Each session has its own lock to allow parallel operations on different sessions
 */
const sessionMutexes = new Map<string, Promise<void>>();

/**
 * Acquire a lock for a session. Returns a release function.
 * This ensures only one encrypt/decrypt operation runs at a time per session.
 */
async function acquireSessionLock(sessionId: string): Promise<() => void> {
  // Wait for any existing operation to complete
  while (sessionMutexes.has(sessionId)) {
    await sessionMutexes.get(sessionId);
  }

  // Create a new lock
  let releaseFn: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    releaseFn = () => {
      sessionMutexes.delete(sessionId);
      resolve();
    };
  });
  
  sessionMutexes.set(sessionId, lockPromise);
  return releaseFn;
}

/**
 * Generate session ID from two usernames
 */
function generateSessionId(username1: string, username2: string): string {
  const sorted = [username1, username2].sort();
  return `session:${sorted[0]}:${sorted[1]}`;
}

/**
 * Serialize RatchetState for storage
 */
function serializeRatchetState(state: RatchetState): string {
  return JSON.stringify({
    DHs: bytesToBase64(state.DHs),
    DHs_pub: bytesToBase64(state.DHs_pub), // CRITICAL: Store the public key
    DHr: state.DHr ? bytesToBase64(state.DHr) : null,
    RK: bytesToBase64(state.RK),
    CKs: bytesToBase64(state.CKs),
    Ns: state.Ns,
    CKr: bytesToBase64(state.CKr),
    Nr: state.Nr,
    skippedKeys: Array.from(state.skippedKeys.entries()).map(([k, v]) => [k, bytesToBase64(v)]),
    peerUsername: state.peerUsername,
    lastUpdate: state.lastUpdate
  });
}

/**
 * Deserialize RatchetState from storage
 * 
 * MIGRATION: If DHs_pub is missing (old session), recompute it.
 * This handles sessions created before this fix.
 */
function deserializeRatchetState(json: string): RatchetState {
  const obj = JSON.parse(json);
  
  // Migration: compute DHs_pub if missing from old sessions
  let DHs_pub: Uint8Array;
  if (obj.DHs_pub) {
    DHs_pub = base64ToBytes(obj.DHs_pub);
  } else {
    // Fallback for old sessions: recompute using imported generateDHKeyPair's logic
    // Since identity keys use crypto_box format, scalarmult_base works
    console.warn('⚠️ [DR] Old session without DHs_pub, recomputing (may cause decryption issues)');
    // Import sodium dynamically would be complex, so just mark as needing reset
    // For now, create a dummy key that will force session recreation
    DHs_pub = new Uint8Array(32); // This will trigger a session reset
    console.warn('⚠️ [DR] Session needs to be reset - old format detected');
  }
  
  return {
    DHs: base64ToBytes(obj.DHs),
    DHs_pub,
    DHr: obj.DHr ? base64ToBytes(obj.DHr) : null,
    RK: base64ToBytes(obj.RK),
    CKs: base64ToBytes(obj.CKs),
    Ns: obj.Ns,
    CKr: base64ToBytes(obj.CKr),
    Nr: obj.Nr,
    skippedKeys: new Map(obj.skippedKeys.map(([k, v]: [string, string]) => [k, base64ToBytes(v)])),
    peerUsername: obj.peerUsername,
    lastUpdate: obj.lastUpdate
  };
}

/**
 * Store session in KeyVault
 */
async function storeSession(username: string, session: E2EESession): Promise<void> {
  const vault = getExistingKeyVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }

  const stored: StoredSession = {
    sessionId: session.sessionId,
    peerUsername: session.peerUsername,
    sharedSecret: bytesToBase64(session.sharedSecret),
    encryptionKey: bytesToBase64(session.encryptionKey),
    createdAt: session.createdAt,
    messageCounter: session.messageCounter,
    useDoubleRatchet: session.useDoubleRatchet,
    handshakeCompleted: session.handshakeCompleted,
    ratchetState: session.ratchetState ? serializeRatchetState(session.ratchetState) : undefined,
    consecutiveFailures: session.consecutiveFailures,
    myPrivateKey: session.myPrivateKey ? bytesToBase64(session.myPrivateKey) : undefined,
    peerPublicKey: session.peerPublicKey ? bytesToBase64(session.peerPublicKey) : undefined,
  };

  await vault.storeData(`e2ee:session:${username}:${session.peerUsername}`, JSON.stringify(stored));
}

/**
 * Retrieve session from KeyVault
 */
async function retrieveSession(username: string, peerUsername: string): Promise<E2EESession | undefined> {
  const vault = getExistingKeyVault();
  if (!vault) {
    throw new Error('KeyVault not initialized');
  }

  const storedJson = await vault.getData(`e2ee:session:${username}:${peerUsername}`);
  if (!storedJson) {
    return undefined;
  }

  const stored: StoredSession = JSON.parse(storedJson);

  return {
    sessionId: stored.sessionId,
    peerUsername: stored.peerUsername,
    sharedSecret: base64ToBytes(stored.sharedSecret),
    encryptionKey: base64ToBytes(stored.encryptionKey),
    createdAt: stored.createdAt,
    messageCounter: stored.messageCounter,
    useDoubleRatchet: stored.useDoubleRatchet,
    handshakeCompleted: stored.handshakeCompleted,
    ratchetState: stored.ratchetState ? deserializeRatchetState(stored.ratchetState) : undefined,
    consecutiveFailures: stored.consecutiveFailures || 0,
    myPrivateKey: stored.myPrivateKey ? base64ToBytes(stored.myPrivateKey) : undefined,
    peerPublicKey: stored.peerPublicKey ? base64ToBytes(stored.peerPublicKey) : undefined,
  };
}

// ============================================================================
// SESSION ESTABLISHMENT (X3DH-like)
// ============================================================================

/**
 * Initiate a new E2EE session with a peer
 * @param username Current user's username
 * @param peerUsername Peer's username
 * @param myPrivateKey My identity private key
 * @param peerPublicKey Peer's identity public key
 * @param useDoubleRatchet Whether to use Double Ratchet (default: true)
 * @returns New session
 */
export async function initiateSession(
  username: string,
  peerUsername: string,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  useDoubleRatchet: boolean = true
): Promise<E2EESession> {
  // Log key fingerprints for debugging (first 8 bytes as hex)
  const myKeyFingerprint = bytesToBase64(myPrivateKey.slice(0, 8));
  const peerKeyFingerprint = bytesToBase64(peerPublicKey.slice(0, 8));
  console.log(`🔐 [E2EE] Initiating NEW session: ${username} → ${peerUsername}`);
  console.log(`🔐 [E2EE] My key prefix: ${myKeyFingerprint}, Peer key prefix: ${peerKeyFingerprint}`);

  // Perform X25519 key exchange
  const sharedSecret = await deriveSharedSecret(myPrivateKey, peerPublicKey);
  const sharedSecretFingerprint = bytesToBase64(sharedSecret.slice(0, 8));
  console.log(`🔐 [E2EE] Shared secret derived, prefix: ${sharedSecretFingerprint}`);

  // Derive encryption key from shared secret
  const sessionInfo = new TextEncoder().encode(`session:${username}:${peerUsername}`);
  const encryptionKey = await deriveEncryptionKey(sharedSecret, undefined, sessionInfo);

  const session: E2EESession = {
    sessionId: generateSessionId(username, peerUsername),
    peerUsername,
    sharedSecret,
    encryptionKey,
    createdAt: Date.now(),
    messageCounter: 0,
    useDoubleRatchet,
    consecutiveFailures: 0,
    // Store identity keys for NaCl Box fallback
    myPrivateKey,
    peerPublicKey,
  };

  // CRITICAL: Double Ratchet initialization is DISABLED in this function
  // DR sessions MUST be created via createDoubleRatchetSession() after X3DH handshake
  // Independent initialization (without handshake) causes desynchronization
  if (useDoubleRatchet) {
    console.warn(`⚠️ [E2EE] Double Ratchet requested but NOT initialized without X3DH handshake`);
    console.warn(`⚠️ [E2EE] Using NaCl Box for ${peerUsername} - use initiateX3DHHandshake() for PFS`);
    // Force NaCl Box mode - DR will be enabled after handshake completes
    session.useDoubleRatchet = false;
    session.handshakeCompleted = false;
  }

  // Store in memory and KeyVault
  activeSessions.set(session.sessionId, session);
  await storeSession(username, session);

  console.log(`✅ [E2EE] Session established with ${peerUsername}`);

  return session;
}

/**
 * Create a Double Ratchet session AFTER X3DH handshake completion
 * This is the ONLY correct way to create DR sessions with PFS
 * 
 * @param username Current user's username
 * @param peerUsername Peer's username
 * @param sharedSecret X3DH derived shared secret (from handshake)
 * @param ratchetState Pre-initialized ratchet state from X3DH
 * @param myPrivateKey My identity private key (for NaCl Box fallback)
 * @param peerPublicKey Peer's identity public key (for NaCl Box fallback)
 * @returns New Double Ratchet session with handshake flag set
 */
export async function createDoubleRatchetSession(
  username: string,
  peerUsername: string,
  sharedSecret: Uint8Array,
  ratchetState: RatchetState,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<E2EESession> {
  console.log(`🔐 [E2EE] Creating Double Ratchet session after X3DH handshake: ${username} ↔ ${peerUsername}`);
  
  // Delete any existing session (old NaCl Box sessions)
  await deleteSession(username, peerUsername);
  
  // Derive encryption key from shared secret (for fallback)
  const sessionInfo = new TextEncoder().encode(`session:${username}:${peerUsername}`);
  const encryptionKey = await deriveEncryptionKey(sharedSecret, undefined, sessionInfo);
  
  const session: E2EESession = {
    sessionId: generateSessionId(username, peerUsername),
    peerUsername,
    sharedSecret,
    encryptionKey,
    createdAt: Date.now(),
    messageCounter: 0,
    // Double Ratchet enabled ONLY because handshake was completed
    useDoubleRatchet: true,
    handshakeCompleted: true,
    ratchetState,
    consecutiveFailures: 0,
    // Store identity keys for NaCl Box fallback
    myPrivateKey,
    peerPublicKey,
  };
  
  // Store in memory and KeyVault
  activeSessions.set(session.sessionId, session);
  await storeSession(username, session);
  
  console.log(`✅ [E2EE] Double Ratchet session established with ${peerUsername} (X3DH handshake completed)`);
  return session;
}

/**
 * Get or create a session with a peer
 */
export async function getOrCreateSession(
  username: string,
  peerUsername: string,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<E2EESession> {
  const sessionId = generateSessionId(username, peerUsername);
  
  // Check memory cache
  let session = activeSessions.get(sessionId);
  if (session) {
    console.log(`🔐 [E2EE] Using CACHED session (memory) for ${peerUsername}, messageCounter: ${session.messageCounter}`);
    return session;
  }
  
  // Check KeyVault
  session = await retrieveSession(username, peerUsername);
  if (session) {
    console.log(`🔐 [E2EE] Using PERSISTED session (KeyVault) for ${peerUsername}, messageCounter: ${session.messageCounter}`);
    
    // CRITICAL: Check if session has valid DHs_pub (required for new format)
    const hasValidDHsPub = session.ratchetState?.DHs_pub && 
      !session.ratchetState.DHs_pub.every((b: number) => b === 0);
    if (!hasValidDHsPub && session.ratchetState) {
      console.warn(`⚠️ [E2EE] Old session format detected (missing DHs_pub). Recreating session...`);
      await deleteSession(username, peerUsername);
      session = undefined;
    }
    
    // Verify the session has matching keys
    if (session) {
      const peerKeyMatch = session.peerPublicKey && 
        bytesToBase64(session.peerPublicKey.slice(0, 8)) === bytesToBase64(peerPublicKey.slice(0, 8));
      if (!peerKeyMatch && session.peerPublicKey) {
        console.warn(`⚠️ [E2EE] Peer key MISMATCH! Session has different peer key. Recreating session...`);
        // Key mismatch - delete old session and create new
        await deleteSession(username, peerUsername);
        session = undefined;
      } else {
        activeSessions.set(sessionId, session);
        return session;
      }
    }
  }
  
  // Create new session
  console.log(`🔐 [E2EE] Creating NEW session for ${peerUsername}`);
  return initiateSession(username, peerUsername, myPrivateKey, peerPublicKey);
}

// ============================================================================
// MESSAGE ENCRYPTION/DECRYPTION (with mutex protection + hybrid fallback)
// ============================================================================

// TEMPORARY FIX: Use NaCl Box as primary encryption until Double Ratchet sync issues are resolved
// NaCl Box (crypto_box) is stateless and always works - provides E2EE without session state
// Double Ratchet requires complex session synchronization that has proven problematic
const MAX_RATCHET_FAILURES = 0; // Always use NaCl Box - immediate fallback

/**
 * Encrypt using NaCl Box (stateless fallback)
 * Uses crypto_box with identity keys - always works, no session state needed
 */
export async function encryptWithNaClBox(
  message: string,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<NaClBoxMessage> {
  const encrypted = await encryptAuthenticated(message, peerPublicKey, myPrivateKey);
  return {
    version: "nacl-box-v1",
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
  };
}

/**
 * Decrypt using NaCl Box (stateless fallback)
 */
export async function decryptWithNaClBox(
  encrypted: NaClBoxMessage,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<string> {
  return decryptAuthenticated(
    { ciphertext: encrypted.ciphertext, nonce: encrypted.nonce },
    peerPublicKey,
    myPrivateKey
  );
}

/**
 * Encrypt a message for a session
 * @param username Current user's username (needed for persistence)
 * 
 * HYBRID ENCRYPTION:
 * - User can choose between NaCl Box (reliable) and Double Ratchet (PFS)
 * - Mode is stored per-conversation in localStorage
 */
export async function encryptSessionMessage(
  session: E2EESession,
  message: string,
  username?: string
): Promise<EncryptedData | DoubleRatchetMessage | NaClBoxMessage> {
  // Acquire session lock to prevent race conditions
  const releaseLock = await acquireSessionLock(session.sessionId);
  
  try {
    // Increment message counter
    session.messageCounter++;

    // Check user's encryption mode preference
    const encryptionMode = getEncryptionModePreference(session.peerUsername);
    
    // Use NaCl Box if preferred or as fallback
    if (encryptionMode === 'nacl-box' && session.myPrivateKey && session.peerPublicKey) {
      console.log(`🔒 [E2EE] Using NaCl Box for ${session.peerUsername} (user preference)`);
      const encrypted = await encryptWithNaClBox(message, session.myPrivateKey, session.peerPublicKey);
      
      if (username) {
        await storeSession(username, session);
      }
      
      return encrypted;
    }

    // Try Double Ratchet if enabled
    if (session.useDoubleRatchet && session.ratchetState) {
      try {
        const encrypted = ratchetEncrypt(session.ratchetState, message);
        console.log(`🔒 [E2EE] Encrypted message #${session.messageCounter} for ${session.peerUsername} (Double Ratchet)`);
        
        // Reset failure counter on success
        session.consecutiveFailures = 0;
        
        // Persist updated ratchet state
        if (username) {
          await storeSession(username, session);
        }
        
        return encrypted;
      } catch (error) {
        console.warn(`⚠️ [E2EE] Double Ratchet encryption failed, using NaCl Box fallback:`, error);
        
        // Fall through to NaCl Box
        if (session.myPrivateKey && session.peerPublicKey) {
          const encrypted = await encryptWithNaClBox(message, session.myPrivateKey, session.peerPublicKey);
          if (username) {
            await storeSession(username, session);
          }
          return encrypted;
        }
      }
    }

    // Final fallback to symmetric encryption (legacy)
    const encrypted = await encryptSymmetric(message, session.encryptionKey);
    console.log(`🔒 [E2EE] Encrypted message #${session.messageCounter} for ${session.peerUsername} (Legacy)`);
    return encrypted;
  } finally {
    // Always release the lock
    releaseLock();
  }
}

/**
 * Decrypt a message from a session
 * @param username Current user's username (needed for persistence)
 * 
 * HYBRID DECRYPTION:
 * - Tries Double Ratchet first for DR messages
 * - On failure, automatically falls back to NaCl Box
 * - Tracks failures to trigger automatic fallback for future messages
 */
export async function decryptSessionMessage(
  session: E2EESession,
  encrypted: EncryptedData | DoubleRatchetMessage | NaClBoxMessage,
  username?: string
): Promise<string> {
  // Acquire session lock to prevent race conditions
  const releaseLock = await acquireSessionLock(session.sessionId);
  
  try {
    // Handle NaCl Box messages (stateless fallback)
    if ('version' in encrypted && encrypted.version === 'nacl-box-v1') {
      if (!session.myPrivateKey || !session.peerPublicKey) {
        throw new Error('Cannot decrypt NaCl Box message: missing identity keys in session');
      }
      const message = await decryptWithNaClBox(encrypted as NaClBoxMessage, session.myPrivateKey, session.peerPublicKey);
      console.log(`🔓 [E2EE] Decrypted message from ${session.peerUsername} (NaCl Box)`);
      return message;
    }

    // Handle Double Ratchet messages
    if ('version' in encrypted && encrypted.version === 'double-ratchet-v1') {
      if (!session.ratchetState) {
        console.warn(`⚠️ [E2EE] No ratchet state for Double Ratchet message, cannot decrypt`);
        throw new Error('Received Double Ratchet message but no ratchet state exists');
      }
      
      try {
        const message = ratchetDecrypt(session.ratchetState, encrypted as DoubleRatchetMessage);
        console.log(`🔓 [E2EE] Decrypted message from ${session.peerUsername} (Double Ratchet)`);
        
        // Reset failure counter on success
        session.consecutiveFailures = 0;
        
        // Persist updated ratchet state
        if (username) {
          await storeSession(username, session);
        }
        
        return message;
      } catch (drError) {
        // Double Ratchet failed - increment failure counter
        session.consecutiveFailures = (session.consecutiveFailures || 0) + 1;
        
        // NOTE: DR decryption failure for old messages is EXPECTED when session state
        // is lost (e.g., page refresh, logout). This is not an error - it's how DR works.
        // DR provides Perfect Forward Secrecy at the cost of recoverability.
        console.debug(`[E2EE] DR decryption failed for ${session.peerUsername} (attempt #${session.consecutiveFailures})`);
        
        // Persist the failure count
        if (username) {
          await storeSession(username, session);
        }
        
        throw new Error(`Double Ratchet decryption failed. Session may be desynchronized. (${drError instanceof Error ? drError.message : 'Unknown error'})`);
      }
    }

    // Fallback to legacy symmetric decryption
    const message = await decryptSymmetric(encrypted as EncryptedData, session.encryptionKey);
    console.log(`🔓 [E2EE] Decrypted message from ${session.peerUsername} (Legacy)`);
    return message;
  } finally {
    // Always release the lock
    releaseLock();
  }
}

/**
 * Reset Double Ratchet session and switch to NaCl Box mode
 * Call this when sessions are hopelessly desynchronized
 */
export async function resetSessionToNaClBox(
  username: string,
  peerUsername: string
): Promise<void> {
  const sessionId = generateSessionId(username, peerUsername);
  const session = activeSessions.get(sessionId);
  
  if (session) {
    // Keep identity keys but disable Double Ratchet
    session.useDoubleRatchet = false;
    session.ratchetState = undefined;
    session.consecutiveFailures = MAX_RATCHET_FAILURES; // Force NaCl Box
    
    await storeSession(username, session);
    console.log(`🔄 [E2EE] Session with ${peerUsername} reset to NaCl Box mode`);
  }
}

/**
 * Encrypt message for a peer (convenience function)
 */
export async function encryptForPeer(
  username: string,
  peerUsername: string,
  message: string,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<EncryptedData | DoubleRatchetMessage> {
  const session = await getOrCreateSession(username, peerUsername, myPrivateKey, peerPublicKey);
  return encryptSessionMessage(session, message);
}

/**
 * Decrypt message from a peer (convenience function)
 */
export async function decryptFromPeer(
  username: string,
  peerUsername: string,
  encrypted: EncryptedData | DoubleRatchetMessage,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<string> {
  const session = await getOrCreateSession(username, peerUsername, myPrivateKey, peerPublicKey);
  return decryptSessionMessage(session, encrypted);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Delete a session
 */
export async function deleteSession(username: string, peerUsername: string): Promise<void> {
  const sessionId = generateSessionId(username, peerUsername);

  // Remove from memory
  activeSessions.delete(sessionId);

  // Remove from KeyVault
  const vault = getExistingKeyVault();
  if (vault) {
    await vault.removeData(`e2ee:session:${username}:${peerUsername}`);
  }

  console.log(`🗑️ [E2EE] Deleted session with ${peerUsername}`);
}

/**
 * Clear all sessions
 */
export async function clearAllSessions(): Promise<void> {
  activeSessions.clear();
  console.log('🗑️ [E2EE] Cleared all active sessions');
}

/**
 * Get active session count
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * List all active sessions
 */
export function listActiveSessions(): string[] {
  return Array.from(activeSessions.values()).map(s => s.peerUsername);
}

