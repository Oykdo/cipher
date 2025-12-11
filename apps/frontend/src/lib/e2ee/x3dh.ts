/**
 * X3DH (Extended Triple Diffie-Hellman) Protocol Implementation
 * 
 * This implements the Signal Protocol's X3DH key agreement protocol
 * for establishing secure sessions before Double Ratchet messaging.
 * 
 * Reference: https://signal.org/docs/specifications/x3dh/
 */

import _sodium from 'libsodium-wrappers';

import { debugLogger } from '../lib/debugLogger';
// ============================================================================
// TYPES
// ============================================================================

/**
 * Identity Key Pair - Long-term keys for user identity
 */
export interface IdentityKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Signed Pre-Key - Medium-term key signed by identity key
 */
export interface SignedPreKey {
  id: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  signature: Uint8Array;
  timestamp: number;
}

/**
 * One-Time Pre-Key - Single-use ephemeral key
 */
export interface OneTimePreKey {
  id: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Key Bundle published to server
 * 
 * IMPORTANT: signingKey is the Ed25519 public key used to verify SPK signatures.
 * This is separate from identityKey (X25519) which is used for DH operations.
 */
export interface PublicKeyBundle {
  identityKey: Uint8Array;        // X25519 public key for DH
  signingKey: Uint8Array;         // Ed25519 public key for signature verification
  signedPreKey: {
    id: number;
    publicKey: Uint8Array;
    signature: Uint8Array;        // Ed25519 signature (not HMAC)
  };
  oneTimePreKeys: Array<{
    id: number;
    publicKey: Uint8Array;
  }>;
  timestamp: number;
}

/**
 * Handshake session state
 */
export type HandshakeState = 'IDLE' | 'INIT_SENT' | 'INIT_RECEIVED' | 'ACTIVE' | 'FAILED';

/**
 * Handshake session tracking
 */
export interface HandshakeSession {
  sessionId: string; // UUID v4 - unique identifier for this handshake
  state: HandshakeState;
  peerUsername: string;
  // Keys used in handshake
  ephemeralKeyPair?: {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  peerIdentityKey?: Uint8Array;
  peerEphemeralKey?: Uint8Array;
  peerSignedPreKey?: Uint8Array;
  usedOneTimePreKeyId?: number;
  // Timing
  initiatedAt?: number;
  lastRetryAt?: number;
  retryCount: number;
  // Derived secret
  sharedSecret?: Uint8Array;
}

/**
 * HANDSHAKE_INIT message payload
 */
export interface HandshakeInitMessage {
  type: 'HANDSHAKE_INIT';
  version: number;
  sessionId: string; // UUID v4 - unique identifier for this handshake session
  senderIdentityKey: string; // base64
  senderEphemeralKey: string; // base64
  usedOneTimePreKeyId?: number;
  timestamp: number;
  nonce: string; // For replay protection
}

/**
 * HANDSHAKE_ACK message payload
 */
export interface HandshakeAckMessage {
  type: 'HANDSHAKE_ACK';
  version: number;
  sessionId: string; // UUID v4 - must match INIT sessionId
  senderEphemeralKey: string; // base64
  timestamp: number;
  nonce: string; // Echo nonce for replay protection
}

/**
 * Union type for handshake messages
 */
export type HandshakeMessage = HandshakeInitMessage | HandshakeAckMessage;

// ============================================================================
// CONSTANTS
// ============================================================================

const X3DH_VERSION = 1;
const HANDSHAKE_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRY_COUNT = 3;
const RETRY_INTERVAL_BASE_MS = 2000; // 2 seconds, exponential backoff
const ONE_TIME_PREKEY_COUNT = 100; // Number of OPKs to generate
const SIGNED_PREKEY_ROTATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Ensure libsodium is ready
 */
async function ensureSodiumReady(): Promise<void> {
  await _sodium.ready;
}

/**
 * Generate a new key pair for X25519 key exchange
 */
export function generateX25519KeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const keyPair = _sodium.crypto_box_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate Ed25519 signing key pair
 * Used for signing SPKs and other data requiring authentication
 */
export function generateSigningKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const keyPair = _sodium.crypto_sign_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate a Signed Pre-Key with Ed25519 signature
 * 
 * @param signingPrivateKey Ed25519 private key for signing (NOT X25519)
 * @param id Unique identifier for this SPK
 * @returns SignedPreKey with Ed25519 signature
 */
export async function generateSignedPreKey(
  signingPrivateKey: Uint8Array,
  id: number
): Promise<SignedPreKey> {
  await ensureSodiumReady();
  
  // Generate X25519 key pair for DH operations
  const keyPair = generateX25519KeyPair();
  
  // Create message to sign: publicKey || id (big-endian)
  const message = new Uint8Array([...keyPair.publicKey, ...numberToBytes(id)]);
  
  // Sign with Ed25519 (crypto_sign_detached)
  // This is the correct approach per Signal Protocol specification
  const signature = _sodium.crypto_sign_detached(message, signingPrivateKey);
  
  // SECURITY: crypto log removed
  
  return {
    id,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    signature,
    timestamp: Date.now(),
  };
}

/**
 * Generate a batch of One-Time Pre-Keys
 */
export function generateOneTimePreKeys(startId: number, count: number = ONE_TIME_PREKEY_COUNT): OneTimePreKey[] {
  const preKeys: OneTimePreKey[] = [];
  
  for (let i = 0; i < count; i++) {
    const keyPair = generateX25519KeyPair();
    preKeys.push({
      id: startId + i,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    });
  }
  
  return preKeys;
}

/**
 * Create a public key bundle for publishing to server
 * 
 * @param identityKey X25519 public key for DH operations
 * @param signingKey Ed25519 public key for SPK signature verification
 * @param signedPreKey The signed pre-key (signed with Ed25519)
 * @param oneTimePreKeys Array of one-time pre-keys
 */
export function createPublicKeyBundle(
  identityKey: Uint8Array,
  signingKey: Uint8Array,
  signedPreKey: SignedPreKey,
  oneTimePreKeys: OneTimePreKey[]
): PublicKeyBundle {
  return {
    identityKey,
    signingKey,
    signedPreKey: {
      id: signedPreKey.id,
      publicKey: signedPreKey.publicKey,
      signature: signedPreKey.signature,
    },
    oneTimePreKeys: oneTimePreKeys.map(opk => ({
      id: opk.id,
      publicKey: opk.publicKey,
    })),
    timestamp: Date.now(),
  };
}

// ============================================================================
// SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify the Ed25519 signature of a signed pre-key
 * 
 * @param signedPreKey The SPK to verify
 * @param signingKey Ed25519 PUBLIC key of the signer (NOT X25519 identity key)
 * @returns true if signature is valid
 */
export function verifySignedPreKey(
  signedPreKey: { id: number; publicKey: Uint8Array; signature: Uint8Array },
  signingKey: Uint8Array
): boolean {
  try {
    // Reconstruct the message that was signed
    const message = new Uint8Array([...signedPreKey.publicKey, ...numberToBytes(signedPreKey.id)]);
    
    // Verify with Ed25519 (crypto_sign_verify_detached)
    const isValid = _sodium.crypto_sign_verify_detached(signedPreKey.signature, message, signingKey);
    
    if (!isValid) {
      console.warn(`⚠️ [X3DH] SPK #${signedPreKey.id} signature verification failed`);
    }
    
    return isValid;
  } catch (error) {
    console.error(`❌ [X3DH] SPK signature verification error:`, error);
    return false;
  }
}

// ============================================================================
// X3DH KEY EXCHANGE
// ============================================================================

/**
 * Perform X3DH as the initiator (Alice)
 * 
 * Alice computes the shared secret using:
 * - Her identity key
 * - Her ephemeral key
 * - Bob's identity key, signed pre-key, and one-time pre-key
 */
export async function x3dhInitiator(
  myIdentityPrivateKey: Uint8Array,
  myEphemeralPrivateKey: Uint8Array,
  peerIdentityKey: Uint8Array,
  peerSignedPreKey: Uint8Array,
  peerOneTimePreKey?: Uint8Array
): Promise<Uint8Array> {
  await ensureSodiumReady();
  
  // DH1: DH(IK_A, SPK_B) - Identity to Signed Pre-Key
  const dh1 = _sodium.crypto_scalarmult(myIdentityPrivateKey, peerSignedPreKey);
  
  // DH2: DH(EK_A, IK_B) - Ephemeral to Identity
  const dh2 = _sodium.crypto_scalarmult(myEphemeralPrivateKey, peerIdentityKey);
  
  // DH3: DH(EK_A, SPK_B) - Ephemeral to Signed Pre-Key
  const dh3 = _sodium.crypto_scalarmult(myEphemeralPrivateKey, peerSignedPreKey);
  
  // DH4: DH(EK_A, OPK_B) - Ephemeral to One-Time Pre-Key (optional)
  let dhConcat: Uint8Array;
  if (peerOneTimePreKey) {
    const dh4 = _sodium.crypto_scalarmult(myEphemeralPrivateKey, peerOneTimePreKey);
    dhConcat = new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4]);
  } else {
    dhConcat = new Uint8Array([...dh1, ...dh2, ...dh3]);
  }
  
  // Derive the shared secret using HKDF
  const sharedSecret = kdf(dhConcat, 'X3DH_SharedSecret');
  
  // SECURITY: NEVER log cryptographic material (removed for production)
  
  return sharedSecret;
}

/**
 * Perform X3DH as the responder (Bob)
 * 
 * Bob computes the shared secret using:
 * - His identity key, signed pre-key, and one-time pre-key
 * - Alice's identity key and ephemeral key
 */
export async function x3dhResponder(
  myIdentityPrivateKey: Uint8Array,
  mySignedPreKeyPrivate: Uint8Array,
  myOneTimePreKeyPrivate: Uint8Array | undefined,
  peerIdentityKey: Uint8Array,
  peerEphemeralKey: Uint8Array
): Promise<Uint8Array> {
  await ensureSodiumReady();
  
  // DH1: DH(SPK_B, IK_A) - Signed Pre-Key to Identity
  const dh1 = _sodium.crypto_scalarmult(mySignedPreKeyPrivate, peerIdentityKey);
  
  // DH2: DH(IK_B, EK_A) - Identity to Ephemeral
  const dh2 = _sodium.crypto_scalarmult(myIdentityPrivateKey, peerEphemeralKey);
  
  // DH3: DH(SPK_B, EK_A) - Signed Pre-Key to Ephemeral
  const dh3 = _sodium.crypto_scalarmult(mySignedPreKeyPrivate, peerEphemeralKey);
  
  // DH4: DH(OPK_B, EK_A) - One-Time Pre-Key to Ephemeral (optional)
  let dhConcat: Uint8Array;
  if (myOneTimePreKeyPrivate) {
    const dh4 = _sodium.crypto_scalarmult(myOneTimePreKeyPrivate, peerEphemeralKey);
    dhConcat = new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4]);
  } else {
    dhConcat = new Uint8Array([...dh1, ...dh2, ...dh3]);
  }
  
  // Derive the shared secret using HKDF
  const sharedSecret = kdf(dhConcat, 'X3DH_SharedSecret');
  
  // SECURITY: NEVER log cryptographic material (removed for production)
  
  return sharedSecret;
}

// ============================================================================
// HANDSHAKE MESSAGE CREATION
// ============================================================================

/**
 * Generate a UUID v4 for session identification
 */
export function generateSessionId(): string {
  const bytes = _sodium.randombytes_buf(16);
  // Set version to 4 (random)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant to RFC4122
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Create a HANDSHAKE_INIT message
 * @param sessionId UUID v4 for this handshake session (use generateSessionId())
 */
export function createHandshakeInit(
  sessionId: string,
  identityKey: Uint8Array,
  ephemeralKey: Uint8Array,
  usedOneTimePreKeyId?: number
): HandshakeInitMessage {
  return {
    type: 'HANDSHAKE_INIT',
    version: X3DH_VERSION,
    sessionId,
    senderIdentityKey: _sodium.to_base64(identityKey),
    senderEphemeralKey: _sodium.to_base64(ephemeralKey),
    usedOneTimePreKeyId,
    timestamp: Date.now(),
    nonce: _sodium.to_base64(_sodium.randombytes_buf(16)),
  };
}

/**
 * Create a HANDSHAKE_ACK message
 * @param sessionId Must match the sessionId from HANDSHAKE_INIT
 */
export function createHandshakeAck(
  sessionId: string,
  ephemeralKey: Uint8Array,
  initNonce: string
): HandshakeAckMessage {
  return {
    type: 'HANDSHAKE_ACK',
    version: X3DH_VERSION,
    sessionId,
    senderEphemeralKey: _sodium.to_base64(ephemeralKey),
    timestamp: Date.now(),
    nonce: initNonce, // Echo back for replay protection
  };
}

/**
 * Parse a handshake message from JSON
 */
export function parseHandshakeMessage(json: string): HandshakeMessage | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.type === 'HANDSHAKE_INIT' || parsed.type === 'HANDSHAKE_ACK') {
      return parsed as HandshakeMessage;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// HANDSHAKE STATE MACHINE
// ============================================================================

/**
 * Create a new handshake session with unique sessionId
 */
export function createHandshakeSession(peerUsername: string, sessionId?: string): HandshakeSession {
  return {
    sessionId: sessionId || generateSessionId(),
    state: 'IDLE',
    peerUsername,
    retryCount: 0,
  };
}

/**
 * Transition handshake state
 */
export function transitionHandshakeState(
  session: HandshakeSession,
  event: 'SEND_INIT' | 'RECEIVE_INIT' | 'SEND_ACK' | 'RECEIVE_ACK' | 'TIMEOUT' | 'ERROR' | 'RESET'
): HandshakeSession {
  const newSession = { ...session };
  
  switch (event) {
    case 'SEND_INIT':
      if (session.state === 'IDLE') {
        newSession.state = 'INIT_SENT';
        newSession.initiatedAt = Date.now();
        newSession.lastRetryAt = Date.now();
      }
      break;
      
    case 'RECEIVE_INIT':
      if (session.state === 'IDLE') {
        newSession.state = 'INIT_RECEIVED';
      }
      break;
      
    case 'SEND_ACK':
      if (session.state === 'INIT_RECEIVED') {
        newSession.state = 'ACTIVE';
      }
      break;
      
    case 'RECEIVE_ACK':
      if (session.state === 'INIT_SENT') {
        newSession.state = 'ACTIVE';
      }
      break;
      
    case 'TIMEOUT':
      if (session.state === 'INIT_SENT') {
        if (session.retryCount < MAX_RETRY_COUNT) {
          newSession.retryCount++;
          newSession.lastRetryAt = Date.now();
          // Stay in INIT_SENT for retry
        } else {
          newSession.state = 'FAILED';
        }
      }
      break;
      
    case 'ERROR':
      newSession.state = 'FAILED';
      break;
      
    case 'RESET':
      return createHandshakeSession(session.peerUsername); // Generates new sessionId
  }
  
  debugLogger.debug(`🔄 [X3DH] State transition: ${session.state} -> ${newSession.state} (event: ${event});`);
  
  return newSession;
}

/**
 * Check if handshake has timed out
 */
export function isHandshakeTimedOut(session: HandshakeSession): boolean {
  if (session.state !== 'INIT_SENT' || !session.initiatedAt) {
    return false;
  }
  return Date.now() - session.initiatedAt > HANDSHAKE_TIMEOUT_MS;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(session: HandshakeSession): number {
  return RETRY_INTERVAL_BASE_MS * Math.pow(2, session.retryCount);
}

/**
 * Check if should retry
 */
export function shouldRetry(session: HandshakeSession): boolean {
  if (session.state !== 'INIT_SENT' || !session.lastRetryAt) {
    return false;
  }
  const delay = getRetryDelay(session);
  return Date.now() - session.lastRetryAt > delay && session.retryCount < MAX_RETRY_COUNT;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Simple KDF using HKDF-like construction
 */
function kdf(input: Uint8Array, info: string): Uint8Array {
  // Use HKDF: Extract with empty salt, then expand
  const salt = new Uint8Array(32); // Zero salt
  const prk = _sodium.crypto_generichash(32, input, salt);
  
  // Expand
  const infoBytes = _sodium.from_string(info);
  const output = _sodium.crypto_generichash(32, new Uint8Array([...prk, ...infoBytes, 1]));
  
  return output;
}

/**
 * Convert number to bytes
 */
function numberToBytes(num: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, num, false); // Big-endian
  return new Uint8Array(buffer);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  X3DH_VERSION,
  HANDSHAKE_TIMEOUT_MS,
  MAX_RETRY_COUNT,
  ONE_TIME_PREKEY_COUNT,
  SIGNED_PREKEY_ROTATION_MS,
};
