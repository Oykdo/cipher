/**
 * Double Ratchet Algorithm (Signal Protocol)
 * 
 * SECURITY: Perfect Forward Secrecy
 * - Each message has unique ephemeral key
 * - Compromise of one key doesn't affect others
 * - Automatic key rotation
 * 
 * Based on Signal Protocol specification
 * 
 * @module DoubleRatchet
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 as sha256Hash } from '@noble/hashes/sha256';
import { x25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from '@noble/hashes/utils';
import { logger } from '@/core/logger';

// Helper to ensure proper ArrayBuffer type
const toArrayBuffer = (arr: Uint8Array): ArrayBuffer => {
  // Create a new ArrayBuffer with the exact size
  const buffer = new ArrayBuffer(arr.length);
  const view = new Uint8Array(buffer);
  view.set(arr);
  return buffer;
};

const INFO_MESSAGE_KEY = new TextEncoder().encode('Pulse Message Key');
const INFO_CHAIN_KEY = new TextEncoder().encode('Pulse Chain Key');
const INFO_ROOT_KEY = new TextEncoder().encode('Pulse Root Key');

export interface RatchetState {
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array;
  receivingChainKey: Uint8Array;
  sendingRatchetKey: Uint8Array;
  receivingRatchetKey: Uint8Array;
  sendCounter: number;
  receiveCounter: number;
  previousSendingChainLength: number;
}

export interface EncryptedRatchetMessage {
  ciphertext: string;
  header: {
    publicKey: string;
    counter: number;
    previousChainLength: number;
  };
  iv: string;
  tag: string;
}

/**
 * Double Ratchet implementation for Perfect Forward Secrecy
 */
export class DoubleRatchet {
  private state: RatchetState;
  private skippedMessageKeys: Map<string, Uint8Array> = new Map();

  constructor(
    private conversationId: string,
    initialRootKey: Uint8Array,
    isInitiator: boolean
  ) {
    // Generate initial ratchet keys
    const sendingKeyPair = x25519.utils.randomSecretKey();
    const receivingKeyPair = x25519.utils.randomSecretKey();

    this.state = {
      rootKey: initialRootKey,
      sendingChainKey: new Uint8Array(32),
      receivingChainKey: new Uint8Array(32),
      sendingRatchetKey: sendingKeyPair,
      receivingRatchetKey: receivingKeyPair,
      sendCounter: 0,
      receiveCounter: 0,
      previousSendingChainLength: 0,
    };

    logger.debug('DoubleRatchet initialized', {
      conversationId,
      isInitiator,
    });
  }

  /**
   * Encrypt message with ephemeral key
   */
  async encryptMessage(plaintext: string): Promise<EncryptedRatchetMessage> {
    // Derive message key from chain key
    const messageKey = await this.deriveMessageKey(this.state.sendingChainKey);

    // Encrypt with message key
    const encrypted = await this.encryptWithKey(plaintext, messageKey);

    // Get public key for header
    const publicKey = x25519.getPublicKey(this.state.sendingRatchetKey);

    // Ratchet forward
    this.state.sendingChainKey = await this.ratchetChainKey(
      this.state.sendingChainKey
    );
    this.state.sendCounter++;

    logger.debug('Message encrypted with ratchet', {
      conversationId: this.conversationId,
      counter: this.state.sendCounter - 1,
    });

    return {
      ...encrypted,
      header: {
        publicKey: this.bytesToBase64(publicKey),
        counter: this.state.sendCounter - 1,
        previousChainLength: this.state.previousSendingChainLength,
      },
    };
  }

  /**
   * Decrypt message with ephemeral key
   */
  async decryptMessage(
    encrypted: EncryptedRatchetMessage
  ): Promise<string> {
    const theirPublicKey = this.base64ToBytes(encrypted.header.publicKey);

    // Check if we need to perform DH ratchet
    if (!this.arraysEqual(theirPublicKey, x25519.getPublicKey(this.state.receivingRatchetKey))) {
      await this.performDHRatchet(theirPublicKey);
    }

    // Try to get message key
    let messageKey: Uint8Array;

    if (encrypted.header.counter === this.state.receiveCounter) {
      // Current message
      messageKey = await this.deriveMessageKey(this.state.receivingChainKey);
      this.state.receivingChainKey = await this.ratchetChainKey(
        this.state.receivingChainKey
      );
      this.state.receiveCounter++;
    } else if (encrypted.header.counter > this.state.receiveCounter) {
      // Skipped messages - store keys for later
      messageKey = await this.handleSkippedMessages(
        encrypted.header.counter
      );
    } else {
      // Old message - check skipped keys
      const keyId = this.getMessageKeyId(
        theirPublicKey,
        encrypted.header.counter
      );
      const skippedKey = this.skippedMessageKeys.get(keyId);

      if (!skippedKey) {
        throw new Error('Message key not found (too old or duplicate)');
      }

      messageKey = skippedKey;
      this.skippedMessageKeys.delete(keyId);
    }

    // Decrypt with message key
    const plaintext = await this.decryptWithKey(encrypted, messageKey);

    logger.debug('Message decrypted with ratchet', {
      conversationId: this.conversationId,
      counter: encrypted.header.counter,
    });

    return plaintext;
  }

  /**
   * Export state for persistence
   */
  exportState(): string {
    return JSON.stringify({
      rootKey: this.bytesToBase64(this.state.rootKey),
      sendingChainKey: this.bytesToBase64(this.state.sendingChainKey),
      receivingChainKey: this.bytesToBase64(this.state.receivingChainKey),
      sendingRatchetKey: this.bytesToBase64(this.state.sendingRatchetKey),
      receivingRatchetKey: this.bytesToBase64(this.state.receivingRatchetKey),
      sendCounter: this.state.sendCounter,
      receiveCounter: this.state.receiveCounter,
      previousSendingChainLength: this.state.previousSendingChainLength,
    });
  }

  /**
   * Import state from persistence
   */
  static importState(conversationId: string, stateJson: string): DoubleRatchet {
    const data = JSON.parse(stateJson);
    const instance = new DoubleRatchet(
      conversationId,
      new Uint8Array(32),
      false
    );

    instance.state = {
      rootKey: instance.base64ToBytes(data.rootKey),
      sendingChainKey: instance.base64ToBytes(data.sendingChainKey),
      receivingChainKey: instance.base64ToBytes(data.receivingChainKey),
      sendingRatchetKey: instance.base64ToBytes(data.sendingRatchetKey),
      receivingRatchetKey: instance.base64ToBytes(data.receivingRatchetKey),
      sendCounter: data.sendCounter,
      receiveCounter: data.receiveCounter,
      previousSendingChainLength: data.previousSendingChainLength,
    };

    return instance;
  }

  // Private methods

  /**
   * Derive message key from chain key using HKDF
   */
  private async deriveMessageKey(chainKey: Uint8Array): Promise<Uint8Array> {
    return hkdf(sha256Hash, chainKey, undefined, INFO_MESSAGE_KEY, 32);
  }

  /**
   * Ratchet chain key forward
   */
  private async ratchetChainKey(chainKey: Uint8Array): Promise<Uint8Array> {
    return hkdf(sha256Hash, chainKey, undefined, INFO_CHAIN_KEY, 32);
  }

  /**
   * Perform Diffie-Hellman ratchet
   */
  private async performDHRatchet(theirPublicKey: Uint8Array): Promise<void> {
    // Store previous chain length
    this.state.previousSendingChainLength = this.state.sendCounter;

    // Compute DH
    const sharedSecret = x25519.getSharedSecret(
      this.state.sendingRatchetKey,
      theirPublicKey
    );

    // Derive new root key and receiving chain key
    const derived = hkdf(sha256Hash, sharedSecret, this.state.rootKey, INFO_ROOT_KEY, 64);
    this.state.rootKey = derived.slice(0, 32);
    this.state.receivingChainKey = derived.slice(32, 64);

    // Reset receive counter
    this.state.receiveCounter = 0;

    // Generate new sending ratchet key
    this.state.sendingRatchetKey = x25519.utils.randomSecretKey();

    // Compute new DH
    const newSharedSecret = x25519.getSharedSecret(
      this.state.sendingRatchetKey,
      theirPublicKey
    );

    // Derive new sending chain key
    const newDerived = hkdf(
      sha256Hash,
      newSharedSecret,
      this.state.rootKey,
      INFO_ROOT_KEY,
      64
    );
    this.state.rootKey = newDerived.slice(0, 32);
    this.state.sendingChainKey = newDerived.slice(32, 64);

    // Reset send counter
    this.state.sendCounter = 0;

    logger.debug('DH ratchet performed', {
      conversationId: this.conversationId,
    });
  }

  /**
   * Handle skipped messages
   */
  private async handleSkippedMessages(targetCounter: number): Promise<Uint8Array> {
    const publicKey = x25519.getPublicKey(this.state.receivingRatchetKey);

    // Store keys for skipped messages
    while (this.state.receiveCounter < targetCounter) {
      const messageKey = await this.deriveMessageKey(
        this.state.receivingChainKey
      );

      const keyId = this.getMessageKeyId(publicKey, this.state.receiveCounter);
      this.skippedMessageKeys.set(keyId, messageKey);

      this.state.receivingChainKey = await this.ratchetChainKey(
        this.state.receivingChainKey
      );
      this.state.receiveCounter++;
    }

    // Derive current message key
    const messageKey = await this.deriveMessageKey(this.state.receivingChainKey);
    this.state.receivingChainKey = await this.ratchetChainKey(
      this.state.receivingChainKey
    );
    this.state.receiveCounter++;

    return messageKey;
  }

  /**
   * Encrypt with AES-GCM
   */
  private async encryptWithKey(
    plaintext: string,
    key: Uint8Array
  ): Promise<{ ciphertext: string; iv: string; tag: string }> {
    const iv = randomBytes(12);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(key),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      cryptoKey,
      encoded
    );

    const ciphertext = new Uint8Array(encrypted.slice(0, -16));
    const tag = new Uint8Array(encrypted.slice(-16));

    return {
      ciphertext: this.bytesToBase64(ciphertext),
      iv: this.bytesToBase64(iv),
      tag: this.bytesToBase64(tag),
    };
  }

  /**
   * Decrypt with AES-GCM
   */
  private async decryptWithKey(
    encrypted: { ciphertext: string; iv: string; tag: string },
    key: Uint8Array
  ): Promise<string> {
    const ciphertext = this.base64ToBytes(encrypted.ciphertext);
    const iv = this.base64ToBytes(encrypted.iv);
    const tag = this.base64ToBytes(encrypted.tag);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(key),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Combine ciphertext and tag
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      cryptoKey,
      toArrayBuffer(combined)
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Get message key ID for storage
   */
  private getMessageKeyId(publicKey: Uint8Array, counter: number): string {
    return `${this.bytesToBase64(publicKey)}:${counter}`;
  }

  /**
   * Compare arrays
   */
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Convert bytes to base64
   */
  private bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Convert base64 to bytes
   */
  private base64ToBytes(base64: string): Uint8Array {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }
}
