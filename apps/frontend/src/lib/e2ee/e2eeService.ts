/**
 * E2EE Service - High-Level API
 * 
 * Provides a simple, unified API for E2EE operations
 * Integrates key management, session management, and encryption
 * 
 * Supports two encryption modes:
 * - NaCl Box: Stateless, reliable (default)
 * - Double Ratchet: PFS via X3DH handshake
 */

import { initializeCrypto, type EncryptedData, type KeyBundle } from './index';

// Mobile debug helper (uses global function to avoid ES module issues)
function mobileLog(level: 'info' | 'warn' | 'error', msg: string) {
  try {
    if (typeof window !== 'undefined' && window.__mobileDebugLog) {
      window.__mobileDebugLog(level, `[E2EE] ${msg}`);
    }
  } catch { /* ignore */ }
}
import {
  getOrCreateIdentityKeys,
  storePeerPublicKey,
  retrievePeerPublicKey,
  markPeerKeyVerified,
  createKeyBundle,
  type UserIdentityKeys,
} from './keyManagement';
import {
  getOrCreateSession,
  encryptSessionMessage,
  decryptSessionMessage,
  deleteSession,
  clearAllSessions,
  resetSessionToNaClBox,
  getEncryptionModePreference,
} from './sessionManager';
import { base64ToBytes, bytesToBase64, generateFingerprint } from './index';
import { useAuthStore } from '../../store/auth';
import {
  initializeX3DHManager,
  initiateX3DHHandshake,
  processHandshakeMessage,
  isHandshakeMessage,
  getHandshakeStatus,
  setPublishOPKsCallback,
  type PublicKeyBundle,
} from './x3dhManager';
import { debugLogger } from '../debugLogger';

// ============================================================================
// SERVICE STATE
// ============================================================================

let currentUsername: string | null = null;
let currentIdentityKeys: UserIdentityKeys | null = null;
let initializingPromise: Promise<void> | null = null;
let x3dhInitialized = false;
let sendHandshakeMessageFn: ((peerUsername: string, message: string) => Promise<void>) | null = null;

// Pending X3DH sessions waiting for handshake completion
const pendingX3DHSessions = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();

// Message queue for messages pending handshake completion
interface QueuedMessage {
  id: string;
  message: string;
  timestamp: number;
  onSent: (encrypted: EncryptedData) => void;
  onFailed: (error: Error) => void;
}
const messageQueues = new Map<string, QueuedMessage[]>();

// Timeout for queued messages (30 seconds)
const MESSAGE_QUEUE_TIMEOUT_MS = 30000;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize E2EE service for a user
 * Should be called after login
 */
export async function initializeE2EE(username: string): Promise<void> {
  // Capture stack trace to identify caller
  const stack = new Error().stack || '';
  const caller = stack.split('\n').slice(1, 4).join(' <- ');
  mobileLog('info', `initializeE2EE(${username}) CALLED FROM: ${caller.substring(0, 200)}`);
  
  if (isE2EEInitialized() && currentUsername === username) {
    mobileLog('info', 'Already initialized, skipping');
    return;
  }

  // Initialize libsodium
  try {
    mobileLog('info', 'Initializing libsodium...');
    await initializeCrypto();
    mobileLog('info', 'libsodium OK');
  } catch (e: any) {
    mobileLog('error', `libsodium FAILED: ${e?.message || e}`);
    throw e;
  }

  // Verify E2EE vault is initialized (keyed by masterKey, not the local device password)
  mobileLog('info', 'Checking KeyVault...');
  const { getExistingE2EEVault, getE2EEVault } = await import('../keyVault');
  let vault = getExistingE2EEVault();
  
  if (!vault) {
    mobileLog('warn', 'E2EE KeyVault not initialized, attempting auto-init...');
    
    // Try to get masterKey from various sources and initialize vault
    try {
      const { getMasterKeyHex } = await import('../secureKeyAccess');
      const masterKey = await getMasterKeyHex();
      
      if (masterKey) {
        mobileLog('info', 'Found masterKey, initializing E2EE vault...');
        vault = await getE2EEVault(masterKey);
        mobileLog('info', 'E2EE vault auto-initialized successfully');
      } else {
        mobileLog('warn', 'No masterKey found for auto-init');
      }
    } catch (autoInitErr: any) {
      mobileLog('error', `E2EE vault auto-init failed: ${autoInitErr?.message || autoInitErr}`);
    }
  }
  
  if (!vault) {
    mobileLog('error', 'KeyVault not initialized and auto-init failed');
    throw new Error('KeyVault not initialized - cannot initialize E2EE. Please re-login.');
  }
  // SECURITY: crypto log removed

  // Get or create identity keys
  currentIdentityKeys = await getOrCreateIdentityKeys(username);
  currentUsername = username;

  // Ensure we can encrypt a sender copy to ourselves (store our own public key in the peer cache)
  // This avoids noisy warnings like: "No public key found for peer: <self>"
  try {
    await storePeerPublicKey(
      username,
      username,
      currentIdentityKeys.identityKeyPair.publicKey,
      currentIdentityKeys.identityKeyPair.fingerprint
    );
  } catch {
    // Best-effort only
  }

  debugLogger.info('✅ [E2EE Service] Initialized for ${username}');
  // SECURITY: crypto log removed

  // Publish key bundle to server (async, don't block initialization)
  publishKeyBundleToServer().catch(err => {
    debugLogger.warn('[E2EE Service] Failed to publish key bundle (will retry on next init)', err);
  });
}

/**
 * Ensure E2EE is initialized for the active session
 * Attempts a lazy re-initialization when state was lost (e.g., after refresh)
 */
export async function ensureE2EEInitializedForSession(username?: string): Promise<void> {
  mobileLog('info', 'ensureE2EEInitializedForSession() called');
  
  if (isE2EEInitialized()) {
    mobileLog('info', 'Already initialized, returning');
    return;
  }

  const targetUsername = username || useAuthStore.getState().session?.user?.username;
  mobileLog('info', `Target username: ${targetUsername || 'NONE'}`);
  
  if (!targetUsername) {
    mobileLog('error', 'No active session - no username');
    throw new Error('No active session available for E2EE initialization. Please log in again.');
  }

  mobileLog('info', 'Checking KeyVault...');
  const { getExistingE2EEVault, getE2EEVault } = await import('../keyVault');
  let vault = getExistingE2EEVault();
  
  if (!vault) {
    mobileLog('warn', 'KeyVault NOT initialized - attempting recovery...');
    
    // Try to recover by getting masterKey from legacy storage and initializing vault
    try {
      const { getMasterKeyHex } = await import('../secureKeyAccess');
      mobileLog('info', 'Trying legacy masterKey...');
      const masterKey = await getMasterKeyHex();
      
      if (masterKey) {
        mobileLog('info', 'Legacy masterKey found, initializing E2EE vault...');
        vault = await getE2EEVault(masterKey);
        mobileLog('info', 'E2EE vault recovered from legacy masterKey');
      } else {
        mobileLog('warn', 'No legacy masterKey found');
      }
    } catch (recoveryErr: any) {
      mobileLog('error', `Recovery failed: ${recoveryErr?.message || recoveryErr}`);
    }
    
    // Still no vault? Try session storage as last resort
    if (!vault) {
      try {
        const { resolveMasterKeyForSession } = await import('../masterKeyResolver');
        const session = useAuthStore.getState().session;
        mobileLog('info', 'Trying resolveMasterKeyForSession...');
        const masterKey = await resolveMasterKeyForSession(session);
        
        if (masterKey) {
          mobileLog('info', 'MasterKey resolved, initializing E2EE vault...');
          vault = await getE2EEVault(masterKey);
          mobileLog('info', 'E2EE vault initialized from resolved masterKey');
        }
      } catch (resolveErr: any) {
        mobileLog('error', `Resolve failed: ${resolveErr?.message || resolveErr}`);
      }
    }
    
    if (!vault) {
      mobileLog('error', 'All recovery attempts failed');
      throw new Error('KeyVault not initialized - unlock with your password and retry.');
    }
  }
  
  mobileLog('info', 'KeyVault OK, calling initializeE2EE...');

  if (!initializingPromise) {
    initializingPromise = initializeE2EE(targetUsername).finally(() => {
      initializingPromise = null;
    });
  }

  return initializingPromise;
}

/**
 * Publish current user's key bundle to the server
 * This allows other users to retrieve the keys for encrypted communication
 */
export async function publishKeyBundleToServer(): Promise<void> {
  if (!currentIdentityKeys || !currentUsername) {
    debugLogger.warn('[E2EE Service] Cannot publish key bundle - E2EE not initialized');
    return;
  }

  try {
    // Import dynamically to avoid circular dependency
    const { apiv2 } = await import('../../services/api-v2');

    const keyBundle = await createKeyBundle(currentIdentityKeys);

    // Validate and convert types to ensure Zod validation passes on server
    // PostgreSQL integer max is ~2.1 billion, so we modulo if keyId is too large
    let keyId = Number(keyBundle.signedPreKey.keyId);
    if (isNaN(keyId)) {
      console.error('❌ [E2EE Service] Invalid keyId:', keyBundle.signedPreKey.keyId);
      return;
    }
    // Ensure keyId fits in PostgreSQL integer range (max 2,147,483,647)
    if (keyId > 2000000000) {
      keyId = keyId % 2000000000;
    }

    const bundleToPublish = {
      identityKey: String(keyBundle.identityKey || ''),
      fingerprint: String(currentIdentityKeys.identityKeyPair.fingerprint || ''),
      signedPreKey: {
        keyId: keyId,
        publicKey: String(keyBundle.signedPreKey.publicKey || ''),
        signature: String(keyBundle.signedPreKey.signature || ''),
      },
      oneTimePreKeys: (keyBundle.oneTimePreKeys || []).map(k => String(k)),
    };

    // Validate all required fields exist
    if (!bundleToPublish.identityKey || !bundleToPublish.fingerprint ||
        !bundleToPublish.signedPreKey.publicKey || !bundleToPublish.signedPreKey.signature) {
      console.error('❌ [E2EE Service] Missing required fields in key bundle:', {
        hasIdentityKey: !!bundleToPublish.identityKey,
        hasFingerprint: !!bundleToPublish.fingerprint,
        hasPublicKey: !!bundleToPublish.signedPreKey.publicKey,
        hasSignature: !!bundleToPublish.signedPreKey.signature,
      });
      return;
    }

    // Debug logging
    // SECURITY: Sensitive log removed

    await apiv2.publishKeyBundle(bundleToPublish);

    // SECURITY: Sensitive log removed
  } catch (error: any) {
    // Don't throw - key bundle publish failure shouldn't break the app
    console.warn('⚠️ [E2EE Service] Failed to publish key bundle (E2EE may still work locally)');
    console.warn('  Error message:', error?.message);
    console.warn('  Error details:', error?.details);
    console.warn('  Full error:', error);
  }
}

/**
 * Shutdown E2EE service
 * Should be called on logout
 */
export async function shutdownE2EE(): Promise<void> {
  // SECURITY: crypto log removed

  // Clear sessions
  await clearAllSessions();

  // Clear state
  currentUsername = null;
  currentIdentityKeys = null;

  debugLogger.info('✅ [E2EE Service] Shutdown complete');
}

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * Get current user's fingerprint
 */
export function getMyFingerprint(): string | null {
  return currentIdentityKeys?.identityKeyPair.fingerprint || null;
}

/**
 * Get current user's key bundle for publishing
 */
export async function getMyKeyBundle(): Promise<KeyBundle | null> {
  if (!currentIdentityKeys) {
    return null;
  }

  return createKeyBundle(currentIdentityKeys);
}

/**
 * Store a peer's public key
 */
export async function addPeerPublicKey(
  peerUsername: string,
  publicKeyBase64: string,
  fingerprint: string
): Promise<void> {
  if (!currentUsername) {
    throw new Error('E2EE not initialized');
  }

  const publicKey = base64ToBytes(publicKeyBase64);
  await storePeerPublicKey(currentUsername, peerUsername, publicKey, fingerprint);
}

/**
 * Get a peer's fingerprint
 */
export async function getPeerFingerprint(peerUsername: string): Promise<string | null> {
  if (!currentUsername) {
    throw new Error('E2EE not initialized');
  }

  const peerKey = await retrievePeerPublicKey(currentUsername, peerUsername);
  return peerKey?.fingerprint || null;
}

/**
 * Return cached peer key info (if present).
 * Used to detect/repair corrupted caches (e.g., base64url decoding mismatch).
 */
export async function getPeerKeyInfo(peerUsername: string): Promise<{ publicKey: Uint8Array; fingerprint: string; verifiedAt: number | null } | null> {
  if (!currentUsername) {
    throw new Error('E2EE not initialized');
  }
  return await retrievePeerPublicKey(currentUsername, peerUsername);
}

/**
 * Compute a fingerprint from the locally cached peer key bytes.
 */
export async function getPeerComputedFingerprint(peerUsername: string): Promise<string | null> {
  const info = await getPeerKeyInfo(peerUsername);
  if (!info) return null;
  return await generateFingerprint(info.publicKey);
}

/**
 * Verify a peer's key
 */
export async function verifyPeerKey(peerUsername: string): Promise<void> {
  if (!currentUsername) {
    throw new Error('E2EE not initialized');
  }

  await markPeerKeyVerified(currentUsername, peerUsername);
}

/**
 * Check if a peer's key is verified
 */
export async function isPeerKeyVerified(peerUsername: string): Promise<boolean> {
  if (!currentUsername) {
    throw new Error('E2EE not initialized');
  }

  const peerKey = await retrievePeerPublicKey(currentUsername, peerUsername);
  return peerKey?.verifiedAt !== null;
}

// ============================================================================
// MESSAGE QUEUE (for messages pending handshake)
// ============================================================================

/**
 * Queue a message to be sent after handshake completes
 */
export function queueMessageForHandshake(
  peerUsername: string,
  message: string,
  onSent: (encrypted: EncryptedData) => void,
  onFailed: (error: Error) => void
): string {
  const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const queuedMessage: QueuedMessage = {
    id,
    message,
    timestamp: Date.now(),
    onSent,
    onFailed,
  };
  
  const queue = messageQueues.get(peerUsername) || [];
  queue.push(queuedMessage);
  messageQueues.set(peerUsername, queue);
  
  debugLogger.debug(`📥 [E2EE Service] Queued message ${id} for ${peerUsername} (${queue.length} in queue);`);
  
  // Set timeout to fail the message if handshake takes too long
  setTimeout(() => {
    const currentQueue = messageQueues.get(peerUsername);
    const msgIndex = currentQueue?.findIndex(m => m.id === id);
    if (msgIndex !== undefined && msgIndex >= 0 && currentQueue) {
      const [failedMsg] = currentQueue.splice(msgIndex, 1);
      failedMsg.onFailed(new Error('Handshake timeout - message not sent'));
      console.warn(`⏰ [E2EE Service] Message ${id} timed out waiting for handshake`);
    }
  }, MESSAGE_QUEUE_TIMEOUT_MS);
  
  return id;
}

/**
 * Process queued messages after handshake completes
 * Called internally when handshake succeeds
 */
export async function processQueuedMessages(peerUsername: string): Promise<void> {
  const queue = messageQueues.get(peerUsername);
  if (!queue || queue.length === 0) {
    return;
  }
  
  debugLogger.debug(`📤 [E2EE Service] Processing ${queue.length} queued messages for ${peerUsername}`);
  
  // Clear the queue
  messageQueues.delete(peerUsername);
  
  // Process each message
  for (const queuedMsg of queue) {
    try {
      const encrypted = await encryptMessageForPeer(peerUsername, queuedMsg.message);
      queuedMsg.onSent(encrypted);
      debugLogger.info('✅ [E2EE Service] Sent queued message ${queuedMsg.id}');
    } catch (error: any) {
      queuedMsg.onFailed(error);
      console.error(`❌ [E2EE Service] Failed to send queued message ${queuedMsg.id}:`, error);
    }
  }
}

/**
 * Cancel queued messages for a peer (e.g., on handshake failure)
 */
export function cancelQueuedMessages(peerUsername: string, reason: string): void {
  const queue = messageQueues.get(peerUsername);
  if (!queue || queue.length === 0) {
    return;
  }
  
  console.warn(`🚫 [E2EE Service] Cancelling ${queue.length} queued messages for ${peerUsername}: ${reason}`);
  
  for (const msg of queue) {
    msg.onFailed(new Error(reason));
  }
  
  messageQueues.delete(peerUsername);
}

/**
 * Get count of queued messages for a peer
 */
export function getQueuedMessageCount(peerUsername: string): number {
  return messageQueues.get(peerUsername)?.length ?? 0;
}

// ============================================================================
// MESSAGE ENCRYPTION/DECRYPTION
// ============================================================================

/**
 * Encrypt a message for a peer
 */
export async function encryptMessageForPeer(
  peerUsername: string,
  message: string
): Promise<EncryptedData> {
  if (!currentUsername || !currentIdentityKeys) {
    throw new Error('E2EE not initialized');
  }

  // Get peer's public key
  const peerKey = await retrievePeerPublicKey(currentUsername, peerUsername);
  if (!peerKey) {
    throw new Error(`No public key found for peer: ${peerUsername}`);
  }

  // Get or create session
  const session = await getOrCreateSession(
    currentUsername,
    peerUsername,
    currentIdentityKeys.identityKeyPair.privateKey,
    peerKey.publicKey
  );

  // Encrypt message (pass username for state persistence)
  return encryptSessionMessage(session, message, currentUsername);
}

/**
 * Decrypt a message from a peer
 */
export async function decryptMessageFromPeer(
  peerUsername: string,
  encrypted: EncryptedData
): Promise<string> {
  if (!currentUsername || !currentIdentityKeys) {
    throw new Error('E2EE not initialized');
  }

  // Get peer's public key
  const peerKey = await retrievePeerPublicKey(currentUsername, peerUsername);
  if (!peerKey) {
    throw new Error(`No public key found for peer: ${peerUsername}`);
  }

  // Get or create session
  const session = await getOrCreateSession(
    currentUsername,
    peerUsername,
    currentIdentityKeys.identityKeyPair.privateKey,
    peerKey.publicKey
  );

  // Decrypt message (pass username for state persistence)
  return decryptSessionMessage(session, encrypted, currentUsername);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Check if a Double Ratchet session with completed handshake exists for a peer
 */
export async function hasActiveDoubleRatchetSession(peerUsername: string): Promise<boolean> {
  if (!currentUsername || !currentIdentityKeys) {
    return false;
  }
  
  const session = await getOrCreateSession(
    currentUsername,
    peerUsername,
    currentIdentityKeys.identityKeyPair.privateKey,
    (await retrievePeerPublicKey(currentUsername, peerUsername))?.publicKey || new Uint8Array(32)
  );
  
  return session.useDoubleRatchet === true && session.handshakeCompleted === true;
}

/**
 * Ensure a Double Ratchet session is established before sending messages
 * Returns true if DR session is ready, false if fallback to NaCl Box is recommended
 * 
 * @param peerUsername The peer to establish session with
 * @param autoInitiate If true, automatically initiate handshake if needed
 * @returns Promise<boolean> - true if DR session ready, false otherwise
 */
export async function ensureDoubleRatchetSession(
  peerUsername: string,
  autoInitiate: boolean = true
): Promise<boolean> {
  if (!currentUsername || !currentIdentityKeys) {
    return false;
  }
  
  // Check if DR session already exists
  if (await hasActiveDoubleRatchetSession(peerUsername)) {
    debugLogger.info(`✅ [E2EE Service] DR session already active with ${peerUsername}`);
    return true;
  }
  
  // Check if handshake is in progress
  const handshakeStatus = getHandshakeStatus(peerUsername);
  if (handshakeStatus && (handshakeStatus.state === 'INIT_SENT' || handshakeStatus.state === 'INIT_RECEIVED')) {
    debugLogger.debug(`🔄 [E2EE Service] Handshake in progress with ${peerUsername}`);
    return false; // Caller should wait or use NaCl Box
  }
  
  if (!autoInitiate) {
    return false;
  }
  
  // Try to initiate handshake
  try {
    await ensureX3DHInitialized();
    await initiateX3DHSession(peerUsername);

    // initiateX3DHSession awaits handshake completion and creates the DR session.
    // Verify and report readiness.
    const ready = await hasActiveDoubleRatchetSession(peerUsername);
    if (ready) {
      debugLogger.info(`✅ [E2EE Service] DR session established with ${peerUsername}`);
    }
    return ready;
  } catch (error: any) {
    console.warn(`⚠️ [E2EE Service] Could not initiate handshake with ${peerUsername}: ${error.message}`);
    return false; // Fallback to NaCl Box
  }
}

/**
 * Get session encryption mode for a peer
 */
export function getSessionMode(peerUsername: string): 'nacl-box' | 'double-ratchet' | 'unknown' {
  const status = getHandshakeStatus(peerUsername);
  if (status?.state === 'ACTIVE') {
    return 'double-ratchet';
  }
  return 'nacl-box';
}

/**
 * Delete session with a peer
 */
export async function deletePeerSession(peerUsername: string): Promise<void> {
  if (!currentUsername) {
    throw new Error('E2EE not initialized');
  }

  await deleteSession(currentUsername, peerUsername);
}

/**
 * Clear all sessions
 */
export async function clearSessions(): Promise<void> {
  await clearAllSessions();
}

/**
 * Reset E2EE session with a specific peer
 * This forces a new key exchange on next message
 */
export async function resetPeerSession(peerUsername: string): Promise<void> {
  if (!currentUsername || !currentIdentityKeys) {
    throw new Error('E2EE not initialized');
  }

  debugLogger.debug(`🔄 [E2EE Service] Resetting session with ${peerUsername}...`);

  // Delete existing session
  await deleteSession(currentUsername, peerUsername);

  // Get peer's public key
  const peerKey = await retrievePeerPublicKey(currentUsername, peerUsername);
  if (peerKey) {
    // Re-create session with fresh ratchet state
    const { initiateSession } = await import('./sessionManager');
    await initiateSession(
      currentUsername,
      peerUsername,
      currentIdentityKeys.identityKeyPair.privateKey,
      peerKey.publicKey,
      true // useDoubleRatchet
    );
    debugLogger.info('✅ [E2EE Service] Session reset complete with ${peerUsername}');
  } else {
    // SECURITY: Sensitive log removed
  }
}

/**
 * Reset all E2EE sessions
 * Use this when sessions are desynchronized
 */
export async function resetAllSessions(): Promise<void> {
  debugLogger.debug('🔄 [E2EE Service] Resetting all E2EE sessions...');
  
  // Clear all sessions from memory and storage
  await clearAllSessions();
  
  // Note: Session data in KeyVault will be cleared when clearAllSessions
  // removes them from the internal session list. The KeyVault entries
  // for specific peers are managed by deleteSession calls.
  
  debugLogger.info('✅ [E2EE Service] All sessions reset');
}

/**
 * Force a session to use NaCl Box mode (stateless encryption)
 * Use this when Double Ratchet is persistently failing
 * 
 * NaCl Box provides:
 * - Authenticated encryption (sender identity verified)
 * - Confidentiality (only recipient can decrypt)
 * - No session state required (always works)
 * - Reduced forward secrecy (tradeoff for reliability)
 */
export async function forceNaClBoxMode(peerUsername: string): Promise<void> {
  if (!currentUsername) {
    throw new Error('E2EE not initialized');
  }

  debugLogger.debug(`🔄 [E2EE Service] Forcing NaCl Box mode for ${peerUsername}...`);
  await resetSessionToNaClBox(currentUsername, peerUsername);
  debugLogger.info('✅ [E2EE Service] ${peerUsername} now uses NaCl Box encryption');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if E2EE is initialized
 */
export function isE2EEInitialized(): boolean {
  return currentUsername !== null && currentIdentityKeys !== null;
}

/**
 * Get current username
 */
export function getCurrentUsername(): string | null {
  return currentUsername;
}

/**
 * Format fingerprint for display
 */
export function formatFingerprint(fingerprint: string): string {
  // Split into groups of 4 characters
  const groups = fingerprint.match(/.{1,4}/g) || [];

  // Format in rows of 8 groups (32 chars per row)
  const rows: string[] = [];
  for (let i = 0; i < groups.length; i += 8) {
    rows.push(groups.slice(i, i + 8).join(' '));
  }

  return rows.join('\n');
}

// ============================================================================
// X3DH INTEGRATION
// ============================================================================

/**
 * Set the function to send handshake messages via WebSocket/P2P
 * Must be called before using Double Ratchet mode
 */
export function setHandshakeMessageSender(
  sender: (peerUsername: string, message: string) => Promise<void>
): void {
  sendHandshakeMessageFn = sender;
  // SECURITY: crypto log removed
}

/**
 * Initialize X3DH manager for Double Ratchet support
 * Called lazily when Double Ratchet mode is first used
 */
async function ensureX3DHInitialized(): Promise<void> {
  if (x3dhInitialized || !currentIdentityKeys) return;
  
  if (!sendHandshakeMessageFn) {
    console.warn('⚠️ [E2EE Service] Handshake sender not configured, X3DH unavailable');
    return;
  }
  
  // Ensure signing key pair exists
  if (!currentIdentityKeys.signingKeyPair) {
    console.error('❌ [E2EE Service] No signing key pair found, X3DH unavailable');
    return;
  }
  
  try {
    // Set up OPK replenishment callback before initializing
    setPublishOPKsCallback(async (opks) => {
      const { apiv2 } = await import('../../services/api-v2');
      await apiv2.replenishOPKs(opks);
    });
    
    const publicBundle = await initializeX3DHManager(
      currentIdentityKeys.identityKeyPair.privateKey,
      currentIdentityKeys.signingKeyPair, // Ed25519 key pair for SPK signatures
      sendHandshakeMessageFn
    );
    
    x3dhInitialized = true;
    // SECURITY: crypto log removed
    
    // Publish X3DH key bundle to server (includes signingKey)
    await publishX3DHKeyBundle(publicBundle);
  } catch (error) {
    console.error('❌ [E2EE Service] Failed to initialize X3DH:', error);
  }
}

/**
 * Publish X3DH key bundle to server
 * Includes Ed25519 signing key for SPK verification
 */
async function publishX3DHKeyBundle(bundle: PublicKeyBundle): Promise<void> {
  try {
    const { apiv2 } = await import('../../services/api-v2');
    
    // Convert to server format (includes signingKey for Ed25519 SPK verification)
    const serverBundle = {
      identityKey: bytesToBase64(bundle.identityKey),
      signingKey: bytesToBase64(bundle.signingKey), // Ed25519 public key
      fingerprint: currentIdentityKeys?.identityKeyPair.fingerprint || '',
      signedPreKey: {
        keyId: bundle.signedPreKey.id,
        publicKey: bytesToBase64(bundle.signedPreKey.publicKey),
        signature: bytesToBase64(bundle.signedPreKey.signature), // Ed25519 signature
      },
      oneTimePreKeys: bundle.oneTimePreKeys.map((opk: { id: number; publicKey: Uint8Array }) => ({
        id: opk.id,
        publicKey: bytesToBase64(opk.publicKey),
      })),
    };
    
    await apiv2.publishKeyBundle(serverBundle);
    // SECURITY: Sensitive log removed');
  } catch (error) {
    console.warn('⚠️ [E2EE Service] Failed to publish X3DH bundle:', error);
  }
}

/**
 * Handle incoming handshake message
 * Called by WebSocket/P2P message handler
 */
export async function handleIncomingHandshakeMessage(
  peerUsername: string,
  messageJson: string
): Promise<boolean> {
  if (!isHandshakeMessage(messageJson)) {
    return false;
  }
  
  if (!currentIdentityKeys) {
    console.warn('⚠️ [E2EE Service] Cannot process handshake - E2EE not initialized');
    return false;
  }
  
  debugLogger.debug(`📨 [E2EE Service] Processing handshake message from ${peerUsername}`);
  
  const result = await processHandshakeMessage(
    currentIdentityKeys.identityKeyPair.privateKey,
    currentIdentityKeys.identityKeyPair.publicKey,
    peerUsername,
    messageJson
  );
  
  if (result) {
    // Handshake completed - this means we are Bob (received INIT, sent ACK)
    debugLogger.info('✅ [E2EE Service] X3DH handshake completed with ${peerUsername} (as responder)');
    
    // Create Double Ratchet session for Bob
    const { createDoubleRatchetSession } = await import('./sessionManager');
    
    // Get peer's public key from the message
    const message = JSON.parse(messageJson);
    const peerPublicKey = base64ToBytes(message.senderIdentityKey);
    
    await createDoubleRatchetSession(
      currentUsername!,
      peerUsername,
      result.sharedSecret,
      result.ratchetState,
      currentIdentityKeys.identityKeyPair.privateKey,
      peerPublicKey
    );
    
    debugLogger.info('✅ [E2EE Service] DR session created as responder for ${peerUsername}');
    
    // Process any queued messages now that handshake is complete
    await processQueuedMessages(peerUsername);
    
    // Resolve any pending session request
    const pending = pendingX3DHSessions.get(peerUsername);
    if (pending) {
      pending.resolve(result);
      pendingX3DHSessions.delete(peerUsername);
    }
  }
  
  return true;
}

/**
 * Initiate X3DH handshake with a peer (for Double Ratchet mode)
 */
export async function initiateX3DHSession(peerUsername: string): Promise<void> {
  if (!currentIdentityKeys) {
    throw new Error('E2EE not initialized');
  }
  
  await ensureX3DHInitialized();
  
  if (!x3dhInitialized) {
    throw new Error('X3DH not available - handshake sender not configured');
  }
  
  // Check if handshake already in progress
  const status = getHandshakeStatus(peerUsername);
  if (status && status.state !== 'IDLE' && status.state !== 'FAILED') {
    debugLogger.debug(`🔄 [E2EE Service] X3DH handshake already in progress with ${peerUsername}`);
    return;
  }
  
  // Fetch peer's X3DH key bundle from server
  const { apiv2 } = await import('../../services/api-v2');
  
  try {
    // Use consume-opk endpoint to atomically get and consume an OPK
    const response = await apiv2.consumeOPK(peerUsername);
    
    if (!response || !response.identityKey) {
      throw new Error('Peer has no X3DH key bundle');
    }
    
    // Verify peer has Ed25519 signing key (required for Signal Protocol compliance)
    if (!response.signingKey) {
      console.warn(`⚠️ [E2EE Service] Peer ${peerUsername} has old key bundle without Ed25519 signing key`);
      throw new Error('Peer key bundle missing Ed25519 signing key (requires re-registration)');
    }
    
    // Convert to internal format
    const peerBundle: PublicKeyBundle = {
      identityKey: base64ToBytes(response.identityKey),
      signingKey: base64ToBytes(response.signingKey), // Ed25519 public key for SPK verification
      signedPreKey: {
        id: response.signedPreKey.keyId,
        publicKey: base64ToBytes(response.signedPreKey.publicKey),
        signature: base64ToBytes(response.signedPreKey.signature),
      },
      oneTimePreKeys: response.oneTimePreKey ? [{
        id: typeof response.oneTimePreKey === 'object' ? response.oneTimePreKey.id : 0,
        publicKey: base64ToBytes(
          typeof response.oneTimePreKey === 'object' 
            ? response.oneTimePreKey.publicKey 
            : response.oneTimePreKey
        ),
      }] : [],
      timestamp: Date.now(),
    };
    
    debugLogger.debug(`🤝 [E2EE Service] Initiating X3DH handshake with ${peerUsername}`);
    
    // Start the handshake and wait for completion
    const { sharedSecret, ratchetState } = await initiateX3DHHandshake(
      currentIdentityKeys.identityKeyPair.privateKey,
      currentIdentityKeys.identityKeyPair.publicKey,
      peerUsername,
      peerBundle
    );
    
    // Create Double Ratchet session with the handshake result
    // This is the ONLY way to create a valid DR session
    if (!currentUsername) {
      throw new Error('Current username not set');
    }
    const { createDoubleRatchetSession } = await import('./sessionManager');
    await createDoubleRatchetSession(
      currentUsername,
      peerUsername,
      sharedSecret,
      ratchetState,
      currentIdentityKeys.identityKeyPair.privateKey,
      peerBundle.identityKey
    );
    
    debugLogger.info('✅ [E2EE Service] X3DH handshake completed and DR session created with ${peerUsername}');
    
    // Process any queued messages now that handshake is complete
    await processQueuedMessages(peerUsername);
  } catch (error: any) {
    console.error(`❌ [E2EE Service] X3DH handshake failed with ${peerUsername}:`, error);
    // Cancel queued messages on failure
    cancelQueuedMessages(peerUsername, `Handshake failed: ${error.message}`);
    throw error;
  }
}

/**
 * Check if Double Ratchet mode should use X3DH handshake
 */
export function shouldUseX3DH(peerUsername: string): boolean {
  const mode = getEncryptionModePreference(peerUsername);
  return mode === 'double-ratchet' && x3dhInitialized;
}

/**
 * Get X3DH handshake status for a peer
 */
export function getX3DHStatus(peerUsername: string) {
  return getHandshakeStatus(peerUsername);
}

// Re-export encryption mode functions for convenience
export { getEncryptionModePreference } from './sessionManager';

/**
 * Get the current user's Ed25519 signing key pair
 * Used for signing burn events and other authenticated operations
 * 
 * @returns Signing key pair or null if not initialized
 */
export function getSigningKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } | null {
  if (!currentIdentityKeys?.signingKeyPair) {
    console.warn('[E2EE Service] No signing key pair available');
    return null;
  }
  return currentIdentityKeys.signingKeyPair;
}

