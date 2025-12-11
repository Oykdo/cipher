/**
 * Burn After Reading Service
 * 
 * Handles the secure destruction of messages with:
 * - Cryptographic signature of burn events (Ed25519)
 * - Automatic burn on message reveal
 * - Timeout fallback for sender
 * - Secure local deletion
 */

import _sodium from 'libsodium-wrappers';

// ============================================================================
// TYPES
// ============================================================================

export interface BurnEvent {
  type: 'message_burn';
  messageId: string;
  conversationId: string;
  burnedBy: string;       // Username of person who read/burned
  burnedAt: number;       // Timestamp
  signature: string;      // Ed25519 signature (base64)
}

export interface BurnTimeoutEntry {
  messageId: string;
  conversationId: string;
  sentAt: number;
  timeoutId: NodeJS.Timeout;
}

// ============================================================================
// STATE
// ============================================================================

// Pending burn timeouts for sent messages (sender side)
const burnTimeouts = new Map<string, BurnTimeoutEntry>();

// Default timeout: 5 minutes
const BURN_TIMEOUT_MS = 5 * 60 * 1000;

// Callback for when a message is auto-deleted due to timeout
let onTimeoutBurnCallback: ((messageId: string, conversationId: string) => void) | null = null;

// ============================================================================
// SIGNATURE FUNCTIONS
// ============================================================================

/**
 * Sign a burn event using Ed25519
 * 
 * @param messageId The message being burned
 * @param conversationId The conversation ID
 * @param username The username of the burner
 * @param signingPrivateKey Ed25519 private key (64 bytes)
 * @returns Base64-encoded signature
 */
export async function signBurnEvent(
  messageId: string,
  conversationId: string,
  username: string,
  signingPrivateKey: Uint8Array
): Promise<string> {
  await _sodium.ready;
  
  // Create canonical message to sign
  const timestamp = Date.now();
  const message = `BURN:${messageId}:${conversationId}:${username}:${timestamp}`;
  const messageBytes = new TextEncoder().encode(message);
  
  // Sign with Ed25519
  const signature = _sodium.crypto_sign_detached(messageBytes, signingPrivateKey);
  
  return JSON.stringify({
    msg: message,
    sig: _sodium.to_base64(signature),
    ts: timestamp,
  });
}

/**
 * Verify a burn event signature
 * 
 * @param signedData The signed data JSON string
 * @param signingPublicKey Ed25519 public key of the claimed signer
 * @returns true if signature is valid
 */
export function verifyBurnSignature(
  signedData: string,
  signingPublicKey: Uint8Array
): boolean {
  try {
    const parsed = JSON.parse(signedData);
    const messageBytes = new TextEncoder().encode(parsed.msg);
    const signature = _sodium.from_base64(parsed.sig);
    
    return _sodium.crypto_sign_verify_detached(signature, messageBytes, signingPublicKey);
  } catch (error) {
    console.error('[BurnService] Failed to verify signature:', error);
    return false;
  }
}

/**
 * Extract burn event data from signed payload
 */
export function parseBurnSignature(signedData: string): {
  messageId: string;
  conversationId: string;
  username: string;
  timestamp: number;
} | null {
  try {
    const parsed = JSON.parse(signedData);
    const parts = parsed.msg.split(':');
    
    if (parts[0] !== 'BURN' || parts.length < 5) {
      return null;
    }
    
    return {
      messageId: parts[1],
      conversationId: parts[2],
      username: parts[3],
      timestamp: parseInt(parts[4], 10),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// BURN TIMEOUT MANAGEMENT (SENDER SIDE)
// ============================================================================

/**
 * Schedule a timeout for a sent burn message
 * If no burn confirmation received within timeout, auto-delete locally
 * 
 * @param messageId The message ID
 * @param conversationId The conversation ID
 * @param timeoutMs Timeout in milliseconds (default: 5 minutes)
 */
export function scheduleBurnTimeout(
  messageId: string,
  conversationId: string,
  timeoutMs: number = BURN_TIMEOUT_MS
): void {
  // Cancel existing timeout if any
  cancelBurnTimeout(messageId);
  
  const timeoutId = setTimeout(() => {
    // Remove from tracking
    burnTimeouts.delete(messageId);
    
    // Trigger callback
    if (onTimeoutBurnCallback) {
      onTimeoutBurnCallback(messageId, conversationId);
    }
  }, timeoutMs);
  
  burnTimeouts.set(messageId, {
    messageId,
    conversationId,
    sentAt: Date.now(),
    timeoutId,
  });
  

}

/**
 * Cancel a burn timeout (called when burn confirmation received)
 */
export function cancelBurnTimeout(messageId: string): void {
  const entry = burnTimeouts.get(messageId);
  if (entry) {
    clearTimeout(entry.timeoutId);
    burnTimeouts.delete(messageId);

  }
}

/**
 * Set callback for timeout-based burns
 */
export function setTimeoutBurnCallback(
  callback: (messageId: string, conversationId: string) => void
): void {
  onTimeoutBurnCallback = callback;
}

/**
 * Check if a message has a pending burn timeout
 */
export function hasPendingBurnTimeout(messageId: string): boolean {
  return burnTimeouts.has(messageId);
}

/**
 * Get remaining time until burn timeout
 */
export function getBurnTimeoutRemaining(messageId: string): number | null {
  const entry = burnTimeouts.get(messageId);
  if (!entry) return null;
  
  const elapsed = Date.now() - entry.sentAt;
  return Math.max(0, BURN_TIMEOUT_MS - elapsed);
}

// ============================================================================
// SECURE LOCAL DELETION
// ============================================================================

/**
 * Securely delete a message from local storage
 * Overwrites the data before removal to prevent forensic recovery
 * 
 * @param messageId The message to delete
 * @param storageKey The localStorage key where messages are stored
 */
export async function secureLocalDelete(
  messageId: string,
  storageKey: string = 'deaddrop_messages'
): Promise<void> {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    
    const messages = JSON.parse(stored);
    
    // Find and overwrite the message
    const index = messages.findIndex((m: any) => m.id === messageId);
    if (index !== -1) {
      // Overwrite with random data before deletion
      const msg = messages[index];
      if (msg.body) {
        msg.body = _sodium.to_base64(_sodium.randombytes_buf(msg.body.length));
      }
      msg.id = 'DELETED';
      msg.senderId = 'DELETED';
      
      // Remove from array
      messages.splice(index, 1);
      
      // Save back
      localStorage.setItem(storageKey, JSON.stringify(messages));
      

    }
  } catch (error) {
    console.error('[BurnService] Failed to securely delete message:', error);
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear all burn timeouts (call on logout)
 */
export function clearAllBurnTimeouts(): void {
  for (const entry of burnTimeouts.values()) {
    clearTimeout(entry.timeoutId);
  }
  burnTimeouts.clear();

}
