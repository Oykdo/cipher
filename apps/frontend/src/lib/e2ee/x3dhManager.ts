/**
 * X3DH Handshake Manager
 * 
 * Manages the X3DH key exchange protocol for establishing
 * Double Ratchet sessions between users.
 */

import _sodium from 'libsodium-wrappers';
import {
  type HandshakeSession,
  type HandshakeInitMessage,
  type HandshakeAckMessage,
  type PublicKeyBundle,
  type SignedPreKey,
  type OneTimePreKey,
  createHandshakeSession,
  transitionHandshakeState,
  isHandshakeTimedOut,
  shouldRetry,
  generateX25519KeyPair,
  generateSigningKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  createPublicKeyBundle,
  verifySignedPreKey,
  x3dhInitiator,
  x3dhResponder,
  createHandshakeInit,
  createHandshakeAck,
  SIGNED_PREKEY_ROTATION_MS,
  ONE_TIME_PREKEY_COUNT,
} from './x3dh';
import { initializeAlice, initializeBob, type RatchetState } from './doubleRatchet';
import { getExistingE2EEVault } from '../keyVault';
import { debugLogger } from "../debugLogger";
// NOTE: These imports will be used when we fully integrate x3dhSessionStore
// import { createDoubleRatchetSession } from './sessionManager';
// import { storeHandshakeState, getHandshakeState, completeHandshake, failHandshake, createInitiatorHandshakeState, type X3DHHandshakeState } from './x3dhSessionStore';

// ============================================================================
// TYPES
// ============================================================================

interface LocalKeyBundle {
  // Ed25519 signing key pair (for SPK signatures)
  signingKeyPair: {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  signedPreKey: SignedPreKey;
  oneTimePreKeys: OneTimePreKey[];
  lastRotation: number;
  nextOPKId: number;
}

interface PendingHandshake {
  session: HandshakeSession;
  onComplete: (sharedSecret: Uint8Array, ratchetState: RatchetState) => void;
  onFailed: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// STATE
// ============================================================================



// Local key bundle (SPK + OPKs)
let localKeyBundle: LocalKeyBundle | null = null;

// Active handshake sessions
const pendingHandshakes = new Map<string, PendingHandshake>();

// Callbacks for sending messages
let sendHandshakeMessage: ((peerUsername: string, message: string) => Promise<void>) | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the X3DH manager with identity and signing keys
 * 
 * @param identityPrivateKey X25519 private key for DH operations
 * @param signingKeyPair Ed25519 key pair for SPK signatures
 * @param onSendMessage Callback to send handshake messages via WebSocket
 */
export async function initializeX3DHManager(
  identityPrivateKey: Uint8Array,
  signingKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array },
  onSendMessage: (peerUsername: string, message: string) => Promise<void>
): Promise<PublicKeyBundle> {
  await _sodium.ready;
  
  sendHandshakeMessage = onSendMessage;
  
  // Load or generate local key bundle
  const vault = getExistingE2EEVault();
  const stored = vault ? await vault.getData('x3dh_local_bundle') : null;
  
  if (stored) {
    try {
      localKeyBundle = deserializeLocalKeyBundle(stored);
      
      // Update signing key pair (may have changed if user re-logged)
      localKeyBundle.signingKeyPair = signingKeyPair;
      
      // SECURITY: Sensitive log removed
      
      // Check if SPK needs rotation
      if (Date.now() - localKeyBundle.lastRotation > SIGNED_PREKEY_ROTATION_MS) {
        // SECURITY: Sensitive log removed
        await rotateSignedPreKey();
      }
    } catch (e) {
      console.warn(`⚠️ [X3DH] Failed to load key bundle, regenerating...`, e);
      localKeyBundle = null;
    }
  }
  
  if (!localKeyBundle) {
    // Generate new key bundle with Ed25519 signed SPK
    const signedPreKey = await generateSignedPreKey(signingKeyPair.privateKey, 1);
    const oneTimePreKeys = generateOneTimePreKeys(1, ONE_TIME_PREKEY_COUNT);
    
    localKeyBundle = {
      signingKeyPair,
      signedPreKey,
      oneTimePreKeys,
      lastRotation: Date.now(),
      nextOPKId: ONE_TIME_PREKEY_COUNT + 1,
    };
    
    // Persist
    if (vault) {
      await vault.storeData('x3dh_local_bundle', serializeLocalKeyBundle(localKeyBundle));
    }
    // SECURITY: Sensitive log removed`);
  }
  
  // Create public bundle for publishing (includes Ed25519 signing key)
  const identityPublicKey = _sodium.crypto_scalarmult_base(identityPrivateKey);
  return createPublicKeyBundle(
    identityPublicKey,
    localKeyBundle.signingKeyPair.publicKey, // Ed25519 public key for SPK verification
    localKeyBundle.signedPreKey,
    localKeyBundle.oneTimePreKeys
  );
}

/**
 * Rotate the signed pre-key using the stored Ed25519 signing key
 */
async function rotateSignedPreKey(): Promise<void> {
  if (!localKeyBundle) return;
  
  const newId = localKeyBundle.signedPreKey.id + 1;
  // Sign with Ed25519 using stored signing key
  localKeyBundle.signedPreKey = await generateSignedPreKey(
    localKeyBundle.signingKeyPair.privateKey,
    newId
  );
  localKeyBundle.lastRotation = Date.now();
  
  // Persist
  const vault = getExistingE2EEVault();
  if (vault) {
    await vault.storeData('x3dh_local_bundle', serializeLocalKeyBundle(localKeyBundle));
  }
  
  // SECURITY: crypto log removed
}

// OPK replenishment configuration
const OPK_LOW_THRESHOLD = 20; // Replenish when below this count
const OPK_REPLENISH_BATCH = 50; // How many to generate at once

// Callback for publishing OPKs to server
let publishOPKsCallback: ((opks: Array<{ id: number; publicKey: string }>) => Promise<void>) | null = null;

/**
 * Set the callback for publishing new OPKs to server
 */
export function setPublishOPKsCallback(
  callback: (opks: Array<{ id: number; publicKey: string }>) => Promise<void>
): void {
  publishOPKsCallback = callback;
}

/**
 * Consume a one-time pre-key (called when used in handshake)
 */
async function consumeOneTimePreKey(id: number): Promise<OneTimePreKey | undefined> {
  if (!localKeyBundle) return undefined;
  
  const index = localKeyBundle.oneTimePreKeys.findIndex(opk => opk.id === id);
  if (index === -1) return undefined;
  
  const [consumed] = localKeyBundle.oneTimePreKeys.splice(index, 1);
  
  // Generate replacement
  const newOPK = generateOneTimePreKeys(localKeyBundle.nextOPKId, 1)[0];
  localKeyBundle.oneTimePreKeys.push(newOPK);
  localKeyBundle.nextOPKId++;
  
  // Persist
  const vault = getExistingE2EEVault();
  if (vault) {
    await vault.storeData('x3dh_local_bundle', serializeLocalKeyBundle(localKeyBundle));
  }
  
  // SECURITY: crypto log removed
  
  // Check if we need to replenish OPKs
  await checkAndReplenishOPKs();
  
  return consumed;
}

/**
 * Check OPK count and replenish if below threshold
 */
async function checkAndReplenishOPKs(): Promise<void> {
  if (!localKeyBundle) return;
  
  const currentCount = localKeyBundle.oneTimePreKeys.length;
  
  if (currentCount < OPK_LOW_THRESHOLD) {
    debugLogger.debug(`⚠️ [X3DH] OPK count low (${currentCount});, replenishing...`);
    await replenishOPKs(OPK_REPLENISH_BATCH);
  }
}

/**
 * Generate and publish new OPKs
 * @param count Number of OPKs to generate
 */
export async function replenishOPKs(count: number = OPK_REPLENISH_BATCH): Promise<void> {
  if (!localKeyBundle) {
    console.warn('⚠️ [X3DH] Cannot replenish OPKs - manager not initialized');
    return;
  }
  
  // Generate new OPKs
  const newOPKs = generateOneTimePreKeys(localKeyBundle.nextOPKId, count);
  localKeyBundle.oneTimePreKeys.push(...newOPKs);
  localKeyBundle.nextOPKId += count;
  
  // Persist locally
  const vault = getExistingE2EEVault();
  if (vault) {
    await vault.storeData('x3dh_local_bundle', serializeLocalKeyBundle(localKeyBundle));
  }
  
  // SECURITY: crypto log removed
  
  // Publish to server if callback is set
  if (publishOPKsCallback) {
    try {
      const opksForServer = newOPKs.map(opk => ({
        id: opk.id,
        publicKey: _sodium.to_base64(opk.publicKey),
      }));
      await publishOPKsCallback(opksForServer);
      debugLogger.info('✅ [X3DH] Published ${count} new OPKs to server');
    } catch (error) {
      console.error('❌ [X3DH] Failed to publish OPKs to server:', error);
    }
  }
}

/**
 * Get current OPK count for monitoring
 */
export function getOPKCount(): number {
  return localKeyBundle?.oneTimePreKeys.length ?? 0;
}

// ============================================================================
// HANDSHAKE INITIATION (Alice's side)
// ============================================================================

/**
 * Initiate X3DH handshake with a peer
 */
export async function initiateX3DHHandshake(
  myIdentityPrivateKey: Uint8Array,
  myIdentityPublicKey: Uint8Array,
  peerUsername: string,
  peerKeyBundle: PublicKeyBundle
): Promise<{ sharedSecret: Uint8Array; ratchetState: RatchetState }> {
  await _sodium.ready;
  
  return new Promise((resolve, reject) => {
    // Verify peer's signed pre-key using their Ed25519 signing key
    if (!verifySignedPreKey(peerKeyBundle.signedPreKey, peerKeyBundle.signingKey)) {
      reject(new Error('Invalid signed pre-key signature (Ed25519 verification failed)'));
      return;
    }
    debugLogger.info('✅ [X3DH] Peer SPK signature verified (Ed25519)');
    
    // Create handshake session
    let session = createHandshakeSession(peerUsername);
    
    // Generate ephemeral key pair
    const ephemeralKeyPair = generateX25519KeyPair();
    session.ephemeralKeyPair = ephemeralKeyPair;
    session.peerIdentityKey = peerKeyBundle.identityKey;
    session.peerSignedPreKey = peerKeyBundle.signedPreKey.publicKey;
    
    // Select a one-time pre-key if available
    let selectedOPK: { id: number; publicKey: Uint8Array } | undefined;
    if (peerKeyBundle.oneTimePreKeys.length > 0) {
      selectedOPK = peerKeyBundle.oneTimePreKeys[0]; // Server should provide unused one
      session.usedOneTimePreKeyId = selectedOPK.id;
    }
    
    // Compute shared secret immediately (Alice's side)
    x3dhInitiator(
      myIdentityPrivateKey,
      ephemeralKeyPair.privateKey,
      peerKeyBundle.identityKey,
      peerKeyBundle.signedPreKey.publicKey,
      selectedOPK?.publicKey
    ).then(sharedSecret => {
      session.sharedSecret = sharedSecret;
      
      // Create HANDSHAKE_INIT message with session ID
      const initMessage = createHandshakeInit(
        session.sessionId,
        myIdentityPublicKey,
        ephemeralKeyPair.publicKey,
        session.usedOneTimePreKeyId
      );
      // SECURITY: crypto log removed
      
      // Transition state
      session = transitionHandshakeState(session, 'SEND_INIT');
      
      // Store pending handshake
      const pending: PendingHandshake = {
        session,
        onComplete: (secret, ratchetState) => {
          clearTimeout(pending.timeoutId);
          pendingHandshakes.delete(peerUsername);
          resolve({ sharedSecret: secret, ratchetState });
        },
        onFailed: (error) => {
          clearTimeout(pending.timeoutId);
          pendingHandshakes.delete(peerUsername);
          reject(error);
        },
      };
      
      // Set timeout
      pending.timeoutId = setTimeout(() => {
        handleHandshakeTimeout(peerUsername);
      }, 30000);
      
      pendingHandshakes.set(peerUsername, pending);
      
      // Send the message
      if (sendHandshakeMessage) {
        sendHandshakeMessage(peerUsername, JSON.stringify(initMessage))
          .catch(err => {
            console.error(`❌ [X3DH] Failed to send HANDSHAKE_INIT:`, err);
            pending.onFailed(err);
          });
      }
      
      debugLogger.debug(`📤 [X3DH] Sent HANDSHAKE_INIT to ${peerUsername}`);
    }).catch(reject);
  });
}

/**
 * Handle handshake timeout
 */
function handleHandshakeTimeout(peerUsername: string): void {
  const pending = pendingHandshakes.get(peerUsername);
  if (!pending) return;
  
  if (isHandshakeTimedOut(pending.session)) {
    if (shouldRetry(pending.session)) {
      debugLogger.debug(`🔄 [X3DH] Retrying handshake with ${peerUsername} (attempt ${pending.session.retryCount + 1});`);
      pending.session = transitionHandshakeState(pending.session, 'TIMEOUT');
      // Retry logic would go here
    } else {
      console.error(`❌ [X3DH] Handshake with ${peerUsername} failed after max retries`);
      pending.session = transitionHandshakeState(pending.session, 'TIMEOUT');
      pending.onFailed(new Error('Handshake timeout after max retries'));
    }
  }
}

// ============================================================================
// HANDSHAKE RESPONSE (Bob's side)
// ============================================================================

/**
 * Handle received HANDSHAKE_INIT message
 */
export async function handleHandshakeInit(
  myIdentityPrivateKey: Uint8Array,
  _myIdentityPublicKey: Uint8Array, // Used for future extensions
  peerUsername: string,
  initMessage: HandshakeInitMessage
): Promise<{ sharedSecret: Uint8Array; ratchetState: RatchetState; ackMessage: HandshakeAckMessage }> {
  await _sodium.ready;
  
  if (!localKeyBundle) {
    throw new Error('X3DH manager not initialized');
  }
  
  // Parse peer's keys
  const peerIdentityKey = _sodium.from_base64(initMessage.senderIdentityKey);
  const peerEphemeralKey = _sodium.from_base64(initMessage.senderEphemeralKey);
  
  // Get OPK if used
  let opkPrivate: Uint8Array | undefined;
  if (initMessage.usedOneTimePreKeyId !== undefined) {
    const opk = await consumeOneTimePreKey(initMessage.usedOneTimePreKeyId);
    if (opk) {
      opkPrivate = opk.privateKey;
    } else {
      console.warn(`⚠️ [X3DH] OPK #${initMessage.usedOneTimePreKeyId} not found, proceeding without it`);
    }
  }
  
  // Compute shared secret (Bob's side)
  const sharedSecret = await x3dhResponder(
    myIdentityPrivateKey,
    localKeyBundle.signedPreKey.privateKey,
    opkPrivate,
    peerIdentityKey,
    peerEphemeralKey
  );
  
  // Generate ephemeral key pair for the response
  const ephemeralKeyPair = generateX25519KeyPair();
  
  // Initialize Double Ratchet as Bob
  // Bob uses the shared secret and his identity key
  const ratchetState = initializeBob(sharedSecret, myIdentityPrivateKey, peerUsername);
  
  // Create ACK message with same sessionId as INIT
  const ackMessage = createHandshakeAck(initMessage.sessionId, ephemeralKeyPair.publicKey, initMessage.nonce);
  
  debugLogger.debug(`📥 [X3DH] Received HANDSHAKE_INIT from ${peerUsername} (sessionId: ${initMessage.sessionId});, sending ACK`);
  
  // Send ACK
  if (sendHandshakeMessage) {
    await sendHandshakeMessage(peerUsername, JSON.stringify(ackMessage));
  }
  
  return { sharedSecret, ratchetState, ackMessage };
}

/**
 * Handle received HANDSHAKE_ACK message
 */
export async function handleHandshakeAck(
  peerUsername: string,
  ackMessage: HandshakeAckMessage
): Promise<void> {
  const pending = pendingHandshakes.get(peerUsername);
  if (!pending) {
    console.warn(`⚠️ [X3DH] Received ACK but no pending handshake for ${peerUsername}`);
    return;
  }
  
  if (pending.session.state !== 'INIT_SENT') {
    console.warn(`⚠️ [X3DH] Received ACK in unexpected state: ${pending.session.state}`);
    return;
  }
  
  // Verify sessionId matches
  if (ackMessage.sessionId !== pending.session.sessionId) {
    console.error(`❌ [X3DH] SessionId mismatch! Expected: ${pending.session.sessionId}, Got: ${ackMessage.sessionId}`);
    pending.onFailed(new Error('SessionId mismatch in HANDSHAKE_ACK'));
    return;
  }
  
  // Transition to ACTIVE
  pending.session = transitionHandshakeState(pending.session, 'RECEIVE_ACK');
  
  // Initialize Double Ratchet as Alice
  const sharedSecret = pending.session.sharedSecret!;
  // Note: peerEphemeralKey from ACK could be used for additional verification
  // const peerEphemeralKey = _sodium.from_base64(ackMessage.senderEphemeralKey);
  
  // Alice initializes with peer's signed pre-key as the first ratchet key
  const ratchetState = initializeAlice(
    sharedSecret,
    pending.session.peerSignedPreKey!,
    peerUsername
  );
  
  debugLogger.debug(`📥 [X3DH] Received HANDSHAKE_ACK from ${peerUsername} (sessionId: ${ackMessage.sessionId});, session ACTIVE`);
  
  // Complete the handshake
  pending.onComplete(sharedSecret, ratchetState);
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Process an incoming handshake message
 */
export async function processHandshakeMessage(
  myIdentityPrivateKey: Uint8Array,
  myIdentityPublicKey: Uint8Array,
  peerUsername: string,
  messageJson: string
): Promise<{ sharedSecret: Uint8Array; ratchetState: RatchetState } | null> {
  try {
    const message = JSON.parse(messageJson);
    
    if (message.type === 'HANDSHAKE_INIT') {
      const result = await handleHandshakeInit(
        myIdentityPrivateKey,
        myIdentityPublicKey,
        peerUsername,
        message as HandshakeInitMessage
      );
      return { sharedSecret: result.sharedSecret, ratchetState: result.ratchetState };
    }
    
    if (message.type === 'HANDSHAKE_ACK') {
      await handleHandshakeAck(peerUsername, message as HandshakeAckMessage);
      // The pending handshake callback will handle completion
      return null;
    }
    
    return null;
  } catch (e) {
    console.error(`❌ [X3DH] Failed to process handshake message:`, e);
    return null;
  }
}

/**
 * Check if a message is a handshake message
 */
export function isHandshakeMessage(messageJson: string): boolean {
  try {
    const message = JSON.parse(messageJson);
    return message.type === 'HANDSHAKE_INIT' || message.type === 'HANDSHAKE_ACK';
  } catch {
    return false;
  }
}

// ============================================================================
// SERIALIZATION
// ============================================================================

function serializeLocalKeyBundle(bundle: LocalKeyBundle): string {
  return JSON.stringify({
    // Ed25519 signing key pair (CRITICAL: required for SPK signatures)
    signingKeyPair: {
      publicKey: _sodium.to_base64(bundle.signingKeyPair.publicKey),
      privateKey: _sodium.to_base64(bundle.signingKeyPair.privateKey),
    },
    signedPreKey: {
      id: bundle.signedPreKey.id,
      publicKey: _sodium.to_base64(bundle.signedPreKey.publicKey),
      privateKey: _sodium.to_base64(bundle.signedPreKey.privateKey),
      signature: _sodium.to_base64(bundle.signedPreKey.signature),
      timestamp: bundle.signedPreKey.timestamp,
    },
    oneTimePreKeys: bundle.oneTimePreKeys.map(opk => ({
      id: opk.id,
      publicKey: _sodium.to_base64(opk.publicKey),
      privateKey: _sodium.to_base64(opk.privateKey),
    })),
    lastRotation: bundle.lastRotation,
    nextOPKId: bundle.nextOPKId,
  });
}

function deserializeLocalKeyBundle(json: string): LocalKeyBundle {
  const obj = JSON.parse(json);
  
  // Handle migration: old bundles without signingKeyPair
  // In this case, we generate a new one (will be overwritten by initializeX3DHManager)
  let signingKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  if (obj.signingKeyPair) {
    signingKeyPair = {
      publicKey: _sodium.from_base64(obj.signingKeyPair.publicKey),
      privateKey: _sodium.from_base64(obj.signingKeyPair.privateKey),
    };
  } else {
    // Migration: generate temporary key pair (will be replaced)
    console.warn('⚠️ [X3DH] Old bundle format detected, signing key will be updated');
    signingKeyPair = generateSigningKeyPair();
  }
  
  return {
    signingKeyPair,
    signedPreKey: {
      id: obj.signedPreKey.id,
      publicKey: _sodium.from_base64(obj.signedPreKey.publicKey),
      privateKey: _sodium.from_base64(obj.signedPreKey.privateKey),
      signature: _sodium.from_base64(obj.signedPreKey.signature),
      timestamp: obj.signedPreKey.timestamp,
    },
    oneTimePreKeys: obj.oneTimePreKeys.map((opk: { id: number; publicKey: string; privateKey: string }) => ({
      id: opk.id,
      publicKey: _sodium.from_base64(opk.publicKey),
      privateKey: _sodium.from_base64(opk.privateKey),
    })),
    lastRotation: obj.lastRotation,
    nextOPKId: obj.nextOPKId,
  };
}

// ============================================================================
// STATUS AND DEBUGGING
// ============================================================================

/**
 * Get pending handshake status for a peer
 */
export function getHandshakeStatus(peerUsername: string): HandshakeSession | null {
  const pending = pendingHandshakes.get(peerUsername);
  return pending?.session ?? null;
}

/**
 * Get all pending handshakes
 */
export function getAllPendingHandshakes(): Map<string, HandshakeSession> {
  const result = new Map<string, HandshakeSession>();
  pendingHandshakes.forEach((pending, username) => {
    result.set(username, pending.session);
  });
  return result;
}

/**
 * Cancel a pending handshake
 */
export function cancelHandshake(peerUsername: string): void {
  const pending = pendingHandshakes.get(peerUsername);
  if (pending) {
    clearTimeout(pending.timeoutId);
    pending.onFailed(new Error('Handshake cancelled'));
    pendingHandshakes.delete(peerUsername);
  }
}

/**
 * Get local key bundle stats
 */
export function getKeyBundleStats(): { opkCount: number; spkAge: number } | null {
  if (!localKeyBundle) return null;
  return {
    opkCount: localKeyBundle.oneTimePreKeys.length,
    spkAge: Date.now() - localKeyBundle.lastRotation,
  };
}

// Re-export types from x3dh.ts for convenience
export type { PublicKeyBundle, HandshakeSession } from './x3dh';
