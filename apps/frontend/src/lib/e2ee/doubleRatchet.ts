/**
 * Double Ratchet Protocol Implementation
 * 
 * Provides Perfect Forward Secrecy and Future Secrecy through:
 * - DH Ratchet: Rotation of Diffie-Hellman keys
 * - Symmetric Ratchet: KDF chains for message keys
 * 
 * Based on Signal Protocol specification:
 * https://signal.org/docs/specifications/doubleratchet/
 */

import _sodium from 'libsodium-wrappers';

import { debugLogger } from "../debugLogger";
// ============================================================================
// Types
// ============================================================================

export interface RatchetState {
  // DH Ratchet
  DHs: Uint8Array;           // Our DH key pair (private)
  DHs_pub: Uint8Array;       // Our DH public key (stored, not recomputed)
  DHr: Uint8Array | null;    // Peer's DH public key
  
  // Root Chain
  RK: Uint8Array;            // Root Key (32 bytes)
  
  // Sending Chain
  CKs: Uint8Array;           // Chain Key for sending (32 bytes)
  Ns: number;                // Message number for sending
  
  // Receiving Chain
  CKr: Uint8Array;           // Chain Key for receiving (32 bytes)
  Nr: number;                // Message number for receiving
  
  // Skipped message keys (for out-of-order messages)
  skippedKeys: Map<string, Uint8Array>;
  
  // Metadata
  peerUsername: string;
  lastUpdate: number;
}

export interface MessageHeader {
  publicKey: string;         // Base64 encoded DH public key
  previousChainLength: number;
  messageNumber: number;
}

export interface DoubleRatchetMessage {
  version: "double-ratchet-v1";
  header: MessageHeader;
  ciphertext: string;        // Base64 encoded
  nonce: string;             // Base64 encoded
}

// ============================================================================
// Constants
// ============================================================================

const MAX_SKIP = 1000;       // Maximum number of skipped message keys to store
const INFO_RK = "DoubleRatchet-RootKey";
// Reserved for future use in full Signal protocol implementation
const _INFO_MK = "DoubleRatchet-MessageKey"; void _INFO_MK;

// ============================================================================
// Cryptographic Primitives
// ============================================================================

/**
 * Generate a new Diffie-Hellman key pair
 * 
 * CRITICAL FIX: Use crypto_box_keypair instead of crypto_kx_keypair
 * to ensure compatibility with identity keys (also crypto_box).
 * Both are X25519 keys but crypto_box format is what identity keys use.
 */
export function generateDHKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const keyPair = _sodium.crypto_box_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey
  };
}

/**
 * Perform Diffie-Hellman key exchange
 */
function DH(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  // Use X25519 for DH
  return _sodium.crypto_scalarmult(privateKey, publicKey);
}

/**
 * HKDF (HMAC-based Key Derivation Function)
 */
function HKDF(salt: Uint8Array, ikm: Uint8Array, info: string, length: number): Uint8Array {
  // Extract
  const prk = _sodium.crypto_auth(ikm, salt);
  
  // Expand
  const infoBytes = _sodium.from_string(info);
  const t: Uint8Array[] = [];
  let okm: Uint8Array = new Uint8Array(0);
  
  for (let i = 0; i < Math.ceil(length / 32); i++) {
    const input = new Uint8Array([...okm, ...infoBytes, i + 1]);
    okm = new Uint8Array(_sodium.crypto_auth(input, prk));
    t.push(okm);
  }
  
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of t) {
    const copyLength = Math.min(chunk.length, length - offset);
    result.set(chunk.slice(0, copyLength), offset);
    offset += copyLength;
  }
  
  return result;
}

/**
 * KDF_RK: Root Key Derivation Function
 * Derives a new root key and chain key from the current root key and DH output
 */
function KDF_RK(rk: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  const output = HKDF(rk, dhOut, INFO_RK, 64);
  return [
    output.slice(0, 32),   // New Root Key
    output.slice(32, 64)   // New Chain Key
  ];
}

/**
 * KDF_CK: Chain Key Derivation Function
 * Derives a new chain key and message key from the current chain key
 */
function KDF_CK(ck: Uint8Array): [Uint8Array, Uint8Array] {
  const messageKey = _sodium.crypto_auth(new Uint8Array([0x01]), ck);
  const chainKey = _sodium.crypto_auth(new Uint8Array([0x02]), ck);
  return [chainKey, messageKey];
}

/**
 * Encrypt a message with authenticated encryption
 */
function ENCRYPT(key: Uint8Array, plaintext: Uint8Array, associatedData: Uint8Array): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    associatedData,
    null,
    nonce,
    key
  );
  return { ciphertext, nonce };
}

/**
 * Decrypt a message with authenticated encryption
 */
function DECRYPT(key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array, associatedData: Uint8Array): Uint8Array {
  return _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    associatedData,
    nonce,
    key
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the public key from a private key
 */
function getDHPublicKey(privateKey: Uint8Array): Uint8Array {
  return _sodium.crypto_scalarmult_base(privateKey);
}

/**
 * Create a key identifier for skipped keys
 */
function makeKeyId(publicKey: Uint8Array, n: number): string {
  return `${_sodium.to_base64(publicKey)}-${n}`;
}

/**
 * Compare two Uint8Array for equality
 * IMPORTANT: _sodium.compare() returns 0 if equal, non-zero otherwise
 * This helper returns true if arrays are equal (more intuitive)
 */
function areKeysEqual(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null) return false;
  if (a.length !== b.length) return false;
  // _sodium.compare returns 0 if equal
  return _sodium.compare(a, b) === 0;
}

// ============================================================================
// Double Ratchet Core Functions
// ============================================================================

/**
 * Initialize Double Ratchet as Alice (initiator)
 */
export function initializeAlice(
  sharedSecret: Uint8Array,
  bobPublicKey: Uint8Array,
  peerUsername: string
): RatchetState {
  // SECURITY: Never log cryptographic material
  // Initializing Double Ratchet as Alice (initiator)
  
  // Generate our DH key pair (using crypto_box for compatibility)
  const DHs = generateDHKeyPair();
  // Generated new DH key pair for session

  // Perform DH with Bob's public key
  const dhOut = DH(DHs.privateKey, bobPublicKey);
  // SECURITY: crypto log removed

  // Derive RK and CKs
  const [RK, CKs] = KDF_RK(sharedSecret, dhOut);
  // SECURITY: NEVER log root keys or chain keys (removed for production)

  return {
    DHs: DHs.privateKey,
    DHs_pub: DHs.publicKey, // CRITICAL: Store the actual public key, don't recompute
    DHr: bobPublicKey,
    RK,
    CKs,
    Ns: 0,
    CKr: new Uint8Array(32), // Will be initialized on first receive
    Nr: 0,
    skippedKeys: new Map(),
    peerUsername,
    lastUpdate: Date.now()
  };
}

/**
 * Initialize Double Ratchet as Bob (responder)
 * 
 * CRITICAL: Bob does NOT do any DH ratchet during initialization.
 * Bob waits for Alice's first message which contains her new DH public key.
 * When Bob receives, he will:
 * 1. Set DHr = Alice's public key from header
 * 2. Compute DH(Bob_priv, Alice_pub) to derive CKr
 * 3. Generate new DH key pair and derive CKs
 * 
 * This asymmetry is by design - Alice sends first, Bob responds.
 */
export function initializeBob(
  sharedSecret: Uint8Array,
  myPrivateKey: Uint8Array,
  peerUsername: string
): RatchetState {
  // Compute public key from private key
  // This works because identity keys use crypto_box format (X25519)
  const myPublicKey = _sodium.crypto_scalarmult_base(myPrivateKey);
  
  // SECURITY: Never log cryptographic material
  // Initializing Double Ratchet as Bob (responder)
  
  // Bob starts with just the shared secret as root key
  // He will perform the first DH ratchet when he receives Alice's message
  // His DHs is his identity private key (matches what Alice has as his public key)

  return {
    DHs: myPrivateKey, // Use identity private key
    DHs_pub: myPublicKey, // Computed from private key
    DHr: null, // Will be set on first receive (Alice's public key from message header)
    RK: sharedSecret, // Root key starts as shared secret
    CKs: new Uint8Array(32), // Will be initialized after first DH ratchet
    Ns: 0,
    CKr: new Uint8Array(32), // Will be initialized on first receive via dhRatchet
    Nr: 0,
    skippedKeys: new Map(),
    peerUsername,
    lastUpdate: Date.now()
  };
}

/**
 * Encrypt a message using the Double Ratchet
 */
export function ratchetEncrypt(
  state: RatchetState,
  plaintext: string
): DoubleRatchetMessage {
  // Diagnostic: log chain key state before derivation
  // SECURITY: crypto log removed
  // SECURITY: NEVER log key material (removed for production)
  
  // Derive message key
  const [newCKs, messageKey] = KDF_CK(state.CKs);
  state.CKs = newCKs;
  
  // SECURITY: Never log derived keys (even prefixes)

  // Create header - CRITICAL: Use stored public key, not recomputed
  const header: MessageHeader = {
    publicKey: _sodium.to_base64(state.DHs_pub),
    previousChainLength: state.Ns,
    messageNumber: state.Ns
  };

  // Prepare associated data (header)
  const ad = _sodium.from_string(JSON.stringify(header));

  // Encrypt
  const plaintextBytes = _sodium.from_string(plaintext);
  const { ciphertext, nonce } = ENCRYPT(messageKey, plaintextBytes, ad);

  // Increment message number
  state.Ns++;
  state.lastUpdate = Date.now();

  return {
    version: "double-ratchet-v1",
    header,
    ciphertext: _sodium.to_base64(ciphertext),
    nonce: _sodium.to_base64(nonce)
  };
}

/**
 * Decrypt a message using the Double Ratchet
 * 
 * SECURITY FIX: Corrected key comparison logic and added null safety checks
 */
export function ratchetDecrypt(
  state: RatchetState,
  message: DoubleRatchetMessage
): string {
  const { header, ciphertext, nonce } = message;

  // Diagnostic logs (non-sensitive)
  debugLogger.debug(`🔓 [DR] Decrypting message #${header.messageNumber} from chain with pubkey prefix: ${header.publicKey.substring(0, 8)}...`);
  debugLogger.debug(`🔓 [DR] Current state: Nr=${state.Nr}, skippedKeys.size=${state.skippedKeys.size}`);

  // Prepare associated data
  const ad = _sodium.from_string(JSON.stringify(header));

  // Try skipped message keys first
  const plaintextFromSkipped = trySkippedMessageKeys(state, header, ciphertext, nonce, ad);
  if (plaintextFromSkipped) {
    // SECURITY: Sensitive log removed
    return plaintextFromSkipped;
  }

  // Check if we need to perform DH ratchet
  // FIX: Use areKeysEqual() instead of !_sodium.compare() which was inverted
  const headerPubKey = _sodium.from_base64(header.publicKey);
  let needsDHRatchet = !areKeysEqual(headerPubKey, state.DHr);
  
  // CRITICAL FIX: If CKr is uninitialized (all zeros), we MUST do a DH ratchet
  // This handles the case where DHr was set but dhRatchet was never executed
  const ckrUninitialized = state.CKr.every(b => b === 0);
  if (ckrUninitialized && !needsDHRatchet) {
    debugLogger.debug(`🔓 [DR] CKr is uninitialized but DHr matches header - forcing DH ratchet`);
    needsDHRatchet = true;
  }
  
  debugLogger.debug(`🔓 [DR] DH ratchet needed: ${needsDHRatchet}, DHr is ${state.DHr ? 'set' : 'null'}, CKr initialized: ${!ckrUninitialized}`);

  if (needsDHRatchet) {
    // Skip message keys from previous chain before ratcheting
    // Only skip if we have a valid receiving chain (DHr set and CKr initialized)
    if (state.DHr !== null && !ckrUninitialized) {
      debugLogger.debug(`🔓 [DR] Skipping ${header.previousChainLength - state.Nr} keys from previous chain before DH ratchet`);
      skipMessageKeys(state, header.previousChainLength);
    } else {
      debugLogger.debug(`🔓 [DR] First message from peer or CKr uninitialized, no previous chain to skip`);
    }
    
    // Perform DH ratchet - this initializes CKr
    dhRatchet(state, headerPubKey);
    debugLogger.debug(`🔓 [DR] DH ratchet completed, CKr initialized, Nr=0`);
  }

  // Skip message keys if needed (for out-of-order messages within current chain)
  if (header.messageNumber > state.Nr) {
    debugLogger.debug(`🔓 [DR] Skipping ${header.messageNumber - state.Nr} keys in current chain (${state.Nr} -> ${header.messageNumber});`);
    skipMessageKeys(state, header.messageNumber);
  }

  // Validate CKr is initialized before deriving message key
  // This should never happen after a successful DH ratchet
  if (state.CKr.every(b => b === 0)) {
    console.error(`🔓 [DR] CRITICAL: CKr still uninitialized after DH ratchet!`);
    console.error(`🔓 [DR] State: DHr=${state.DHr ? 'set' : 'null'}, Nr=${state.Nr}, needsDHRatchet=${needsDHRatchet}`);
    throw new Error(`Cannot decrypt: receiving chain key (CKr) not initialized. Session may need reset.`);
  }

  // Diagnostic: log CKr before derivation
  const ckrBefore = _sodium.to_base64(state.CKr.slice(0, 8));
  debugLogger.debug(`🔓 [DR-DEC] CKr prefix before KDF: ${ckrBefore}`);

  // Derive message key
  const [newCKr, messageKey] = KDF_CK(state.CKr);
  
  // SECURITY: Never log derived keys
  
  state.CKr = newCKr;
  state.Nr++;
  state.lastUpdate = Date.now();

  // SECURITY: Sensitive log removed

  // Decrypt
  const ciphertextBytes = _sodium.from_base64(ciphertext);
  const nonceBytes = _sodium.from_base64(nonce);
  const plaintextBytes = DECRYPT(messageKey, ciphertextBytes, nonceBytes, ad);

  return _sodium.to_string(plaintextBytes);
}

/**
 * Perform DH ratchet step
 */
function dhRatchet(state: RatchetState, headerPubKey: Uint8Array) {
  debugLogger.debug(`🔄 [DR-RATCHET] Starting DH ratchet`);
  // SECURITY: NEVER log key material (removed for production)
  
  // Update peer's public key
  state.DHr = headerPubKey;

  // Perform DH and derive new RK and CKr
  const dhOut = DH(state.DHs, state.DHr);
  // SECURITY: Sensitive log removed}`);
  
  const [newRK, newCKr] = KDF_RK(state.RK, dhOut);
  // SECURITY: NEVER log derived keys (removed for production)
  
  state.RK = newRK;
  state.CKr = newCKr;
  state.Nr = 0;

  // Generate new DH key pair
  const newDHs = generateDHKeyPair();
  state.DHs = newDHs.privateKey;
  state.DHs_pub = newDHs.publicKey; // CRITICAL: Store the actual public key
  // SECURITY: Sensitive log removed}`);

  // Perform DH again and derive new CKs
  const dhOut2 = DH(state.DHs, state.DHr);
  const [newRK2, newCKs] = KDF_RK(state.RK, dhOut2);
  // SECURITY: NEVER log derived keys (removed for production)
  
  state.RK = newRK2;
  state.CKs = newCKs;
  state.Ns = 0;
  
  debugLogger.debug(`🔄 [DR-RATCHET] DH ratchet complete`);
}

/**
 * Skip message keys and store them for later
 * 
 * SECURITY FIX: Added null safety for DHr and CKr validation
 */
function skipMessageKeys(state: RatchetState, until: number) {
  // Safety check: cannot skip if DHr is null (no peer key yet)
  if (state.DHr === null) {
    // This is normal for first message - not an error
    debugLogger.debug(`🔓 [DR] skipMessageKeys: DHr is null (first message);, nothing to skip`);
    return;
  }

  // Safety check: cannot skip if CKr is not initialized (no receiving chain yet)
  if (state.CKr.every(b => b === 0)) {
    // This is normal before first DH ratchet - not an error
    debugLogger.debug(`🔓 [DR] skipMessageKeys: CKr not initialized (before first DH ratchet);, nothing to skip`);
    return;
  }

  // Nothing to skip if we're already at or past the target
  if (state.Nr >= until) {
    return;
  }

  const toSkip = until - state.Nr;
  if (toSkip > MAX_SKIP) {
    throw new Error(`Too many skipped messages (${toSkip} > ${MAX_SKIP}). Session may be desynchronized.`);
  }

  debugLogger.debug(`🔓 [DR] Storing ${toSkip} skipped keys (messages ${state.Nr} to ${until - 1});`);

  while (state.Nr < until) {
    const [newCKr, messageKey] = KDF_CK(state.CKr);
    const keyId = makeKeyId(state.DHr, state.Nr);
    state.skippedKeys.set(keyId, messageKey);
    state.CKr = newCKr;
    state.Nr++;
  }
}

/**
 * Try to decrypt using skipped message keys
 */
function trySkippedMessageKeys(
  state: RatchetState,
  header: MessageHeader,
  ciphertext: string,
  nonce: string,
  ad: Uint8Array
): string | null {
  const headerPubKey = _sodium.from_base64(header.publicKey);
  const keyId = makeKeyId(headerPubKey, header.messageNumber);

  const messageKey = state.skippedKeys.get(keyId);
  if (!messageKey) {
    return null;
  }

  // Remove the key (one-time use)
  state.skippedKeys.delete(keyId);

  // Decrypt
  try {
    const ciphertextBytes = _sodium.from_base64(ciphertext);
    const nonceBytes = _sodium.from_base64(nonce);
    const plaintextBytes = DECRYPT(messageKey, ciphertextBytes, nonceBytes, ad);
    return _sodium.to_string(plaintextBytes);
  } catch (error) {
    console.error('Failed to decrypt with skipped key:', error);
    return null;
  }
}

