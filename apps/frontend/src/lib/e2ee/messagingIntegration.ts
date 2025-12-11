/**
 * E2EE Messaging Integration
 * 
 * Integrates E2EE with the existing messaging system
 * Provides transparent encryption/decryption for messages
 * 
 * HYBRID ENCRYPTION:
 * - Primary: Double Ratchet (Perfect Forward Secrecy)
 * - Fallback: NaCl Box (stateless, always works)
 */

import {
  encryptMessageForPeer,
  decryptMessageFromPeer,
  isE2EEInitialized,
  addPeerPublicKey,
  getPeerFingerprint,
  ensureE2EEInitializedForSession,
} from './e2eeService';

async function requireE2EE(): Promise<void> {
  if (isE2EEInitialized()) return;

  try {
    await ensureE2EEInitializedForSession();
  } catch (error) {
    console.error('[E2EE] Failed to initialize for current session:', error);
    throw new Error('E2EE not initialized. Please re-login to enable encryption.');
  }

  if (!isE2EEInitialized()) {
    throw new Error('E2EE not initialized. Please re-login to enable encryption.');
  }
}

// ============================================================================
// PEER KEY MANAGEMENT
// ============================================================================

/**
 * Ensure we have the peer's public key AND it matches the server
 * 
 * CRITICAL FIX: Always verify fingerprint with server to detect key regeneration.
 * If peer regenerated their keys, we MUST update our cache and reset the session.
 * 
 * Returns true if we have a valid key, false otherwise
 */
export async function ensurePeerKey(peerUsername: string): Promise<boolean> {
  if (!isE2EEInitialized()) {
    try {
      await requireE2EE();
    } catch {
      return false;
    }
  }

  try {
    const { apiv2 } = await import('../../services/api-v2');
    
    // ALWAYS fetch from server to check for key changes
    const keyBundle = await apiv2.getPeerKeyBundle(peerUsername);

    if (!keyBundle) {
      console.warn(`[E2EE] Peer ${peerUsername} has not published E2EE keys`);
      return false;
    }

    // Check if we have a cached key and if it matches
    const existingFingerprint = await getPeerFingerprint(peerUsername);
    
    if (existingFingerprint && existingFingerprint === keyBundle.fingerprint) {
      // Key hasn't changed, we're good
      console.log(`✅ [E2EE] Peer key for ${peerUsername} verified (fingerprint match)`);
      return true;
    }
    
    if (existingFingerprint && existingFingerprint !== keyBundle.fingerprint) {
      // KEY CHANGED! Peer regenerated their keys
      console.warn(`⚠️ [E2EE] Peer ${peerUsername} key changed! Old: ${existingFingerprint.substring(0, 16)}..., New: ${keyBundle.fingerprint.substring(0, 16)}...`);
      console.warn(`⚠️ [E2EE] Resetting E2EE session with ${peerUsername} due to key change`);
      
      // Import deletePeerSession to clear the old session
      const { deletePeerSession } = await import('./e2eeService');
      
      // Delete the old session (it's now invalid)
      try {
        await deletePeerSession(peerUsername);
      } catch (e) {
        console.warn(`[E2EE] Failed to delete old session:`, e);
      }
    }

    // Store the (new) peer's public key
    await addPeerPublicKey(
      peerUsername,
      keyBundle.identityKey,
      keyBundle.fingerprint
    );

    console.log(`✅ [E2EE] Fetched and stored public key for ${peerUsername}`);
    return true;
  } catch (error) {
    console.error(`[E2EE] Failed to fetch key for ${peerUsername}:`, error);
    
    // If we can't reach server but have a cached key, use it (offline mode)
    const existingFingerprint = await getPeerFingerprint(peerUsername);
    if (existingFingerprint) {
      console.warn(`[E2EE] Using cached key for ${peerUsername} (server unreachable)`);
      return true;
    }
    
    return false;
  }
}

// ============================================================================
// MESSAGE ENCRYPTION
// ============================================================================

/**
 * Encrypt a message before sending
 * Uses E2EE only - legacy fallback removed (broken by design with separate masterKeys)
 */
export async function encryptMessageForSending(
  recipientUsername: string,
  plaintext: string,
  _legacyEncryptFn?: (text: string) => Promise<any> // Kept for API compatibility, but unused
): Promise<string> {
  // Check if E2EE is initialized
  await requireE2EE();

  // Ensure we have peer's public key (fetch if needed)
  const hasPeerKey = await ensurePeerKey(recipientUsername);

  if (!hasPeerKey) {
    console.error(`[E2EE] No public key for ${recipientUsername} - recipient needs to publish their keys`);
    throw new Error(`Cannot send encrypted message: ${recipientUsername} has not published their encryption keys. They need to log in first.`);
  }

  // Encrypt with E2EE
  const encrypted = await encryptMessageForPeer(recipientUsername, plaintext);

  // Wrap in envelope to indicate E2EE
  const envelope = {
    version: 'e2ee-v1',
    encrypted,
  };

  return JSON.stringify(envelope);
}

/**
 * Decryption result including encryption type for UI display
 */
export interface DecryptionResult {
  text: string;
  encryptionType?: 'nacl-box-v1' | 'double-ratchet-v1' | 'legacy' | string;
}

/**
 * Decrypt a received message
 * Uses E2EE only - legacy removed (broken by design with separate masterKeys)
 * 
 * HYBRID DECRYPTION:
 * - Handles both Double Ratchet and NaCl Box messages
 * - Automatically retries with session reset on persistent failures
 * 
 * @returns DecryptionResult with decrypted text and encryption type
 */
export async function decryptReceivedMessage(
  senderUsername: string,
  encryptedBody: string,
  _legacyDecryptFn?: (encrypted: any) => Promise<string> // Kept for API compatibility, but unused
): Promise<string>;
export async function decryptReceivedMessage(
  senderUsername: string,
  encryptedBody: string,
  _legacyDecryptFn: undefined,
  returnDetails: true
): Promise<DecryptionResult>;
export async function decryptReceivedMessage(
  senderUsername: string,
  encryptedBody: string,
  _legacyDecryptFn?: (encrypted: any) => Promise<string>,
  returnDetails?: boolean
): Promise<string | DecryptionResult> {
  const makeResult = (text: string, encryptionType?: string): string | DecryptionResult => {
    if (returnDetails) {
      return { text, encryptionType };
    }
    return text;
  };

  let parsed: any;
  try {
    parsed = JSON.parse(encryptedBody);
  } catch (e) {
    console.error('[E2EE] Invalid JSON in message body');
    return makeResult('[Invalid message format]');
  }

  // Check if it's an E2EE envelope
  if (parsed.version === 'e2ee-v1' && parsed.encrypted) {
    try {
      await requireE2EE();
    } catch (error) {
      console.error('[E2EE] E2EE message received but initialization failed:', error);
      return makeResult('[E2EE not initialized - please re-login]');
    }

    // Ensure we have sender's public key (fetch if needed)
    const hasPeerKey = await ensurePeerKey(senderUsername);
    if (!hasPeerKey) {
      console.error(`[E2EE] Cannot decrypt: no public key for sender ${senderUsername}`);
      return makeResult('[Cannot decrypt - sender key not found]');
    }

    // Determine encryption type from the encrypted payload
    const encryptionType = parsed.encrypted.version || 'unknown';
    console.log(`[E2EE] Decrypting ${encryptionType} message from ${senderUsername}`);

    try {
      // Decrypt with E2EE (handles both Double Ratchet and NaCl Box)
      const decrypted = await decryptMessageFromPeer(senderUsername, parsed.encrypted);
      return makeResult(decrypted, encryptionType);
    } catch (error) {
      // Double Ratchet messages can't be recovered - they need the exact session state
      // This is EXPECTED behavior when session state is lost, not an error
      if (encryptionType === 'double-ratchet-v1') {
        // Use debug level logging since this is expected for old DR messages
        console.debug(`[E2EE] DR message from ${senderUsername} cannot be decrypted (session state lost)`);
        return makeResult('[Old DR message - unrecoverable]', encryptionType);
      }
      
      // Log actual errors (non-DR failures) at error level
      console.error(`[E2EE] Decryption failed (${encryptionType}):`, error);
      return makeResult('[Decryption failed]', encryptionType);
    }
  }

  // Not an E2EE envelope - this is an old/invalid message
  console.warn('[E2EE] Message is not E2EE encrypted - cannot decrypt');
  return makeResult('[Message not encrypted with E2EE]', 'legacy');
}

// ============================================================================
// KEY EXCHANGE
// ============================================================================

/**
 * Exchange public keys with a peer
 * This should be called when starting a conversation
 */
export async function exchangeKeysWithPeer(
  peerUsername: string,
  peerPublicKeyBase64: string,
  peerFingerprint: string
): Promise<void> {
  if (!isE2EEInitialized()) {
    throw new Error('E2EE not initialized');
  }

  await addPeerPublicKey(peerUsername, peerPublicKeyBase64, peerFingerprint);
  console.log(`✅ [E2EE] Keys exchanged with ${peerUsername}`);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a message is E2EE encrypted
 */
export function isE2EEMessage(encryptedBody: string): boolean {
  try {
    const parsed = JSON.parse(encryptedBody);
    return parsed.version === 'e2ee-v1';
  } catch {
    return false;
  }
}

/**
 * Get encryption status for a conversation
 */
export async function getConversationEncryptionStatus(
  peerUsername: string
): Promise<'e2ee' | 'legacy' | 'none'> {
  if (!isE2EEInitialized()) {
    return 'legacy';
  }

  const peerFingerprint = await getPeerFingerprint(peerUsername);
  return peerFingerprint ? 'e2ee' : 'legacy';
}

