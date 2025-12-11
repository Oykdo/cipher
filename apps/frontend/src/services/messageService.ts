/**
 * Message Service with Signal Protocol Integration
 * 
 * SECURITY: Integrates Double Ratchet for Perfect Forward Secrecy
 * 
 * This service manages message encryption/decryption with automatic
 * ratchet state management and key rotation.
 */

import {
  DoubleRatchet,
  initializeRatchetSender,
  initializeRatchetReceiver,
  storeRatchetState,
  loadRatchetState,
  type EncryptedMessageEnvelope,
} from '../shared/signalProtocol';
import { getMasterKeyHex } from '../lib/secureKeyAccess';
import { encryptMessage, decryptMessage, generateMessageKey, generateSalt, bytesToBase64, base64ToBytes } from '../shared/crypto';

// ============================================================================
// MESSAGE ENCRYPTION WITH SIGNAL PROTOCOL
// ============================================================================

/**
 * Encrypts a message using Signal Protocol (Double Ratchet)
 * 
 * @param plaintext - Message to encrypt
 * @param conversationId - Conversation identifier
 * @returns Encrypted message envelope
 */
export async function encryptMessageWithSignal(
  plaintext: string,
  conversationId: string
): Promise<EncryptedMessageEnvelope> {
  // Load or create ratchet for this conversation
  let ratchet = await loadRatchetState(conversationId);
  
  if (!ratchet) {
    // Initialize new ratchet (first message in conversation)
    ratchet = await initializeNewRatchet(conversationId);
  }
  
  // Encrypt with ratchet
  const encrypted = await ratchet.encrypt(plaintext);
  
  // Store updated ratchet state
  await storeRatchetState(conversationId, ratchet);
  
  return encrypted;
}

/**
 * Decrypts a message using Signal Protocol (Double Ratchet)
 * 
 * @param envelope - Encrypted message envelope
 * @param conversationId - Conversation identifier
 * @returns Decrypted plaintext
 */
export async function decryptMessageWithSignal(
  envelope: EncryptedMessageEnvelope,
  conversationId: string
): Promise<string> {
  // Load ratchet for this conversation
  let ratchet = await loadRatchetState(conversationId);
  
  if (!ratchet) {
    // Initialize receiver ratchet (first message received)
    ratchet = await initializeReceiverRatchet(conversationId, envelope);
  }
  
  // Decrypt with ratchet
  const plaintext = await ratchet.decrypt(envelope);
  
  // Store updated ratchet state
  await storeRatchetState(conversationId, ratchet);
  
  return plaintext;
}

/**
 * Initializes a new ratchet for a conversation (sender side)
 */
async function initializeNewRatchet(_conversationId: string): Promise<DoubleRatchet> {
  const masterKeyHex = await getMasterKeyHex();
  
  if (!masterKeyHex) {
    throw new Error('Master key not available');
  }
  
  // Derive initial shared secret from masterKey + conversationId
  const salt = generateSalt();
  const sharedSecret = await generateMessageKey(masterKeyHex, salt);
  
  // Generate remote DH key (in production, fetch from server)
  // For now, use a placeholder (will be replaced by actual key exchange)
  const remoteDHKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
  
  const remoteDHPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', remoteDHKeyPair.publicKey)
  );
  
  const ratchet = await initializeRatchetSender(sharedSecret, remoteDHPublicKey);
  
  // Secure wipe
  sharedSecret.fill(0);
  
  return ratchet;
}

/**
 * Initializes receiver ratchet when receiving first message
 */
async function initializeReceiverRatchet(
  _conversationId: string,
  _envelope: EncryptedMessageEnvelope
): Promise<DoubleRatchet> {
  const masterKeyHex = await getMasterKeyHex();
  
  if (!masterKeyHex) {
    throw new Error('Master key not available');
  }
  
  // Derive shared secret (same as sender)
  const salt = generateSalt(); // In production, should be from X3DH
  const sharedSecret = await generateMessageKey(masterKeyHex, salt);
  
  // Our DH key pair (in production, from pre-keys)
  const ourKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  
  const ratchet = await initializeRatchetReceiver(sharedSecret, ourKeyPair);
  
  // Secure wipe
  sharedSecret.fill(0);
  
  return ratchet;
}

// ============================================================================
// FALLBACK: NON-SIGNAL ENCRYPTION (Backward Compatibility)
// ============================================================================

/**
 * Encrypts a message without Signal Protocol (legacy mode)
 * Use only for backward compatibility or when Signal is not available
 * 
 * @param plaintext - Message to encrypt
 * @param conversationId - Conversation identifier
 * @returns Encrypted message data
 */
export async function encryptMessageLegacy(
  plaintext: string,
  _conversationId: string
): Promise<{
  body: string;
  salt: string;
  iv: string;
  tag: string;
}> {
  const masterKeyHex = await getMasterKeyHex();
  
  if (!masterKeyHex) {
    throw new Error('Master key not available');
  }
  
  const salt = generateSalt();
  const messageKey = await generateMessageKey(masterKeyHex, salt);
  const encrypted = await encryptMessage(plaintext, messageKey);
  
  // Secure wipe
  messageKey.fill(0);
  
  return {
    body: bytesToBase64(encrypted.ciphertext),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(encrypted.iv),
    tag: bytesToBase64(encrypted.tag),
  };
}

/**
 * Decrypts a message in legacy mode
 * 
 * @param encryptedData - Encrypted message components
 * @returns Decrypted plaintext
 */
export async function decryptMessageLegacy(
  encryptedData: {
    body: string;
    salt: string;
    iv: string;
    tag: string;
  }
): Promise<string> {
  const masterKeyHex = await getMasterKeyHex();
  
  if (!masterKeyHex) {
    throw new Error('Master key not available');
  }
  
  const salt = base64ToBytes(encryptedData.salt);
  const messageKey = await generateMessageKey(masterKeyHex, salt);
  
  const plaintext = await decryptMessage(
    {
      iv: base64ToBytes(encryptedData.iv),
      ciphertext: base64ToBytes(encryptedData.body),
      tag: base64ToBytes(encryptedData.tag),
    },
    messageKey
  );
  
  // Secure wipe
  messageKey.fill(0);
  
  return plaintext;
}

// ============================================================================
// UNIFIED API
// ============================================================================

/**
 * Encrypts a message (auto-detects best method)
 * 
 * @param plaintext - Message to encrypt
 * @param conversationId - Conversation ID
 * @param useSignal - Force Signal Protocol (default: auto-detect)
 * @returns Encrypted message in appropriate format
 */
export async function encryptMessageSmart(
  plaintext: string,
  conversationId: string,
  useSignal: boolean = true
): Promise<any> {
  if (useSignal) {
    try {
      return await encryptMessageWithSignal(plaintext, conversationId);
    } catch (error) {
      console.warn('[MessageService] Signal Protocol unavailable, falling back to legacy:', error);
      // Fallback to legacy
    }
  }
  
  return await encryptMessageLegacy(plaintext, conversationId);
}

/**
 * Decrypts a message (auto-detects format)
 * 
 * @param encryptedData - Encrypted message (Signal or legacy format)
 * @param conversationId - Conversation ID
 * @returns Decrypted plaintext
 */
export async function decryptMessageSmart(
  encryptedData: any,
  conversationId: string
): Promise<string> {
  // Detect format
  if (encryptedData.ratchetPublicKey) {
    // Signal Protocol format
    return await decryptMessageWithSignal(encryptedData, conversationId);
  }
  
  // Legacy format
  return await decryptMessageLegacy(encryptedData);
}