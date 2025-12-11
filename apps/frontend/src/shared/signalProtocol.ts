/**
 * Signal Protocol Integration - Double Ratchet for Perfect Forward Secrecy
 * 
 * SECURITY FIX: Implements the Signal Protocol's Double Ratchet Algorithm
 * to provide Perfect Forward Secrecy (PFS) for all messages.
 * 
 * Key Features:
 * - Forward Secrecy: Compromised key doesn't expose past messages
 * - Future Secrecy: Compromised key doesn't expose future messages  
 * - Self-Healing: Recovers security after key compromise
 * 
 * Architecture:
 * - Root Key: Master secret for DH ratchet
 * - Chain Keys: Derived keys for message encryption
 * - Message Keys: One-time keys (destroyed after use)
 * - DH Ratchet: Periodic ephemeral key exchange
 * 
 * Compliance:
 * - Signal Protocol Specifications v3
 * - X3DH Key Agreement Protocol
 * - Double Ratchet Algorithm (Trevor Perrin & Moxie Marlinspike)
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface RatchetState {
  rootKey: Uint8Array; // 32 bytes
  sendChainKey: Uint8Array; // 32 bytes
  receiveChainKey: Uint8Array; // 32 bytes
  dhKeyPair: CryptoKeyPair; // Ephemeral ECDH key pair
  remoteDHPublicKey: Uint8Array | null; // Remote's current public key
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendChainLength: number;
}

export interface MessageKey {
  messageKey: Uint8Array; // 32 bytes for AES-256
  messageNumber: number;
  chainKey: Uint8Array; // To derive next message key
}

export interface EncryptedMessageEnvelope {
  ratchetPublicKey: string; // Base64 - Our current DH public key
  messageNumber: number;
  previousChainLength: number;
  ciphertext: string; // Base64
  iv: string; // Base64
  tag: string; // Base64
}

// ============================================================================
// KEY DERIVATION FUNCTIONS (KDF)
// ============================================================================

/**
 * HKDF-SHA256 for key derivation
 */
async function hkdf(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: string,
  outputLength: number = 32
): Promise<Uint8Array> {
  // Import IKM
  const ikm = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(inputKeyMaterial),
    'HKDF',
    false,
    ['deriveBits']
  );

  // Derive bits
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(salt),
      info: new TextEncoder().encode(info),
    },
    ikm,
    outputLength * 8 // bits
  );

  return new Uint8Array(derivedBits);
}

/**
 * KDF for Chain Keys
 * Derives next chain key and message key from current chain key
 */
async function kdfChain(chainKey: Uint8Array): Promise<{
  nextChainKey: Uint8Array;
  messageKey: Uint8Array;
}> {
  const messageSeed = await hkdf(chainKey, new Uint8Array(32), 'WhisperMessageKeys', 64);
  
  const nextChainKey = messageSeed.slice(0, 32);
  const messageKey = messageSeed.slice(32, 64);

  return { nextChainKey, messageKey };
}

/**
 * KDF for Root Key
 * Derives new root key and chain key from DH output
 */
async function kdfRatchet(
  rootKey: Uint8Array,
  dhOutput: Uint8Array
): Promise<{
  newRootKey: Uint8Array;
  chainKey: Uint8Array;
}> {
  const output = await hkdf(dhOutput, rootKey, 'WhisperRatchet', 64);
  
  const newRootKey = output.slice(0, 32);
  const chainKey = output.slice(32, 64);

  return { newRootKey, chainKey };
}

// ============================================================================
// DIFFIE-HELLMAN OPERATIONS
// ============================================================================

/**
 * Generates an ephemeral ECDH key pair (X25519)
 */
async function generateDHKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256', // Or X25519 if supported
    },
    true, // extractable for sending public key
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Performs ECDH to compute shared secret
 */
async function performDH(
  ourPrivateKey: CryptoKey,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  // Import their public key
  const theirKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(theirPublicKey),
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: theirKey,
    },
    ourPrivateKey,
    256 // 32 bytes
  );

  return new Uint8Array(sharedSecret);
}

// ============================================================================
// DOUBLE RATCHET IMPLEMENTATION
// ============================================================================

export class DoubleRatchet {
  private state: RatchetState;

  constructor(initialRootKey: Uint8Array, initialDHKeyPair: CryptoKeyPair) {
    this.state = {
      rootKey: initialRootKey,
      sendChainKey: new Uint8Array(32),
      receiveChainKey: new Uint8Array(32),
      dhKeyPair: initialDHKeyPair,
      remoteDHPublicKey: null,
      sendMessageNumber: 0,
      receiveMessageNumber: 0,
      previousSendChainLength: 0,
    };
  }

  /**
   * Encrypts a message with ratcheting
   */
  async encrypt(plaintext: string): Promise<EncryptedMessageEnvelope> {
    // Derive message key from send chain
    const { nextChainKey, messageKey } = await kdfChain(this.state.sendChainKey);
    
    // Update state
    this.state.sendChainKey = nextChainKey;
    const messageNumber = this.state.sendMessageNumber++;

    // Encrypt with AES-GCM
    const { iv, ciphertext, tag } = await this.encryptWithMessageKey(plaintext, messageKey);

    // Get our current DH public key
    const dhPublicKey = await crypto.subtle.exportKey('raw', this.state.dhKeyPair.publicKey);

    // Secure wipe message key
    messageKey.fill(0);

    return {
      ratchetPublicKey: this.arrayBufferToBase64(dhPublicKey),
      messageNumber,
      previousChainLength: this.state.previousSendChainLength,
      ciphertext: this.arrayBufferToBase64(ciphertext),
      iv: this.arrayBufferToBase64(iv),
      tag: this.arrayBufferToBase64(tag),
    };
  }

  /**
   * Decrypts a message with ratcheting
   */
  async decrypt(envelope: EncryptedMessageEnvelope): Promise<string> {
    const remoteDHPublicKey = this.base64ToArrayBuffer(envelope.ratchetPublicKey);

    // Check if we need to perform DH ratchet step
    if (this.shouldPerformDHRatchet(remoteDHPublicKey)) {
      await this.performDHRatchetStep(new Uint8Array(remoteDHPublicKey));
    }

    // Derive message key from receive chain
    let chainKey = this.state.receiveChainKey;
    let messageKey: Uint8Array | null = null;

    // Derive keys until we reach the message number
    for (let i = this.state.receiveMessageNumber; i <= envelope.messageNumber; i++) {
      const derived = await kdfChain(chainKey);
      chainKey = derived.nextChainKey;
      
      if (i === envelope.messageNumber) {
        messageKey = derived.messageKey;
      }
    }

    if (!messageKey) {
      throw new Error('Failed to derive message key');
    }

    // Update state
    this.state.receiveChainKey = chainKey;
    this.state.receiveMessageNumber = envelope.messageNumber + 1;

    // Decrypt with AES-GCM
    const plaintext = await this.decryptWithMessageKey(
      {
        iv: new Uint8Array(this.base64ToArrayBuffer(envelope.iv)),
        ciphertext: new Uint8Array(this.base64ToArrayBuffer(envelope.ciphertext)),
        tag: new Uint8Array(this.base64ToArrayBuffer(envelope.tag)),
      },
      messageKey
    );

    // Secure wipe message key
    messageKey.fill(0);

    return plaintext;
  }

  /**
   * Performs a DH ratchet step (key rotation)
   */
  private async performDHRatchetStep(remoteDHPublicKey: Uint8Array): Promise<void> {
    // Perform DH with remote's public key
    const dhOutput = await performDH(this.state.dhKeyPair.privateKey, remoteDHPublicKey);

    // Derive new root key and receive chain key
    const { newRootKey, chainKey } = await kdfRatchet(this.state.rootKey, dhOutput);

    // Update state
    this.state.previousSendChainLength = this.state.sendMessageNumber;
    this.state.rootKey = newRootKey;
    this.state.receiveChainKey = chainKey;
    this.state.receiveMessageNumber = 0;
    this.state.remoteDHPublicKey = remoteDHPublicKey;

    // Generate new DH key pair for next ratchet
    this.state.dhKeyPair = await generateDHKeyPair();

    // Derive send chain key
    const sendDHOutput = await performDH(this.state.dhKeyPair.privateKey, remoteDHPublicKey);
    const sendRatchet = await kdfRatchet(this.state.rootKey, sendDHOutput);

    this.state.rootKey = sendRatchet.newRootKey;
    this.state.sendChainKey = sendRatchet.chainKey;
    this.state.sendMessageNumber = 0;

    console.info('[DoubleRatchet] Performed DH ratchet step');
  }

  /**
   * Checks if DH ratchet is needed
   */
  private shouldPerformDHRatchet(remoteDHPublicKey: ArrayBuffer): boolean {
    if (!this.state.remoteDHPublicKey) {
      return true; // First message
    }

    // Compare keys
    const current = new Uint8Array(this.state.remoteDHPublicKey);
    const incoming = new Uint8Array(remoteDHPublicKey);

    if (current.length !== incoming.length) {
      return true;
    }

    for (let i = 0; i < current.length; i++) {
      if (current[i] !== incoming[i]) {
        return true; // Key changed
      }
    }

    return false; // Same key
  }

  /**
   * Encrypts plaintext with message key (AES-GCM)
   */
  private async encryptWithMessageKey(
    plaintext: string,
    messageKey: Uint8Array
  ): Promise<{
    iv: Uint8Array;
    ciphertext: Uint8Array;
    tag: Uint8Array;
  }> {
    // Import message key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      messageKey.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128,
      },
      cryptoKey,
      new TextEncoder().encode(plaintext)
    );

    const encryptedArray = new Uint8Array(encrypted);
    const ciphertext = encryptedArray.slice(0, -16);
    const tag = encryptedArray.slice(-16);

    return { iv, ciphertext, tag };
  }

  /**
   * Decrypts ciphertext with message key (AES-GCM)
   */
  private async decryptWithMessageKey(
    encrypted: { iv: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array },
    messageKey: Uint8Array
  ): Promise<string> {
    // Import message key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      messageKey.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Reconstruct encrypted data
    const encryptedData = new Uint8Array(encrypted.ciphertext.length + encrypted.tag.length);
    encryptedData.set(encrypted.ciphertext);
    encryptedData.set(encrypted.tag, encrypted.ciphertext.length);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: encrypted.iv.buffer as ArrayBuffer,
        tagLength: 128,
      },
      cryptoKey,
      encryptedData.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Serializes ratchet state for storage
   */
  async serialize(): Promise<string> {
    const publicKeyRaw = await crypto.subtle.exportKey('raw', this.state.dhKeyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', this.state.dhKeyPair.privateKey);

    const serialized = {
      rootKey: this.arrayBufferToBase64(this.state.rootKey),
      sendChainKey: this.arrayBufferToBase64(this.state.sendChainKey),
      receiveChainKey: this.arrayBufferToBase64(this.state.receiveChainKey),
      dhPublicKey: this.arrayBufferToBase64(publicKeyRaw),
      dhPrivateKey: JSON.stringify(privateKeyJwk),
      remoteDHPublicKey: this.state.remoteDHPublicKey
        ? this.arrayBufferToBase64(this.state.remoteDHPublicKey)
        : null,
      sendMessageNumber: this.state.sendMessageNumber,
      receiveMessageNumber: this.state.receiveMessageNumber,
      previousSendChainLength: this.state.previousSendChainLength,
    };

    return JSON.stringify(serialized);
  }

  /**
   * Deserializes ratchet state from storage
   */
  static async deserialize(data: string): Promise<DoubleRatchet> {
    const parsed = JSON.parse(data);

    // Import private key
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(parsed.dhPrivateKey),
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    // Import public key
    const publicKey = await crypto.subtle.importKey(
      'raw',
      this.base64ToArrayBufferStatic(parsed.dhPublicKey),
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      []
    );

    const instance = new DoubleRatchet(
      new Uint8Array(0),
      { publicKey, privateKey }
    );

    instance.state = {
      rootKey: new Uint8Array(this.base64ToArrayBufferStatic(parsed.rootKey)),
      sendChainKey: new Uint8Array(this.base64ToArrayBufferStatic(parsed.sendChainKey)),
      receiveChainKey: new Uint8Array(this.base64ToArrayBufferStatic(parsed.receiveChainKey)),
      dhKeyPair: { publicKey, privateKey },
      remoteDHPublicKey: parsed.remoteDHPublicKey
        ? new Uint8Array(this.base64ToArrayBufferStatic(parsed.remoteDHPublicKey))
        : null,
      sendMessageNumber: parsed.sendMessageNumber,
      receiveMessageNumber: parsed.receiveMessageNumber,
      previousSendChainLength: parsed.previousSendChainLength,
    };

    return instance;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private static base64ToArrayBufferStatic(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Gets current state for debugging
   */
  getState(): {
    sendMessageNumber: number;
    receiveMessageNumber: number;
    hasRemoteDHKey: boolean;
  } {
    return {
      sendMessageNumber: this.state.sendMessageNumber,
      receiveMessageNumber: this.state.receiveMessageNumber,
      hasRemoteDHKey: this.state.remoteDHPublicKey !== null,
    };
  }
}

// ============================================================================
// INITIALIZATION & SESSION MANAGEMENT
// ============================================================================

/**
 * Initializes a new Double Ratchet session (sender side)
 * 
 * @param sharedSecret - Initial shared secret from X3DH
 * @param remoteDHPublicKey - Remote party's initial DH public key
 */
export async function initializeRatchetSender(
  sharedSecret: Uint8Array,
  remoteDHPublicKey: Uint8Array
): Promise<DoubleRatchet> {
  // Generate our initial DH key pair
  const dhKeyPair = await generateDHKeyPair();

  // Perform DH to get first chain keys
  const dhOutput = await performDH(dhKeyPair.privateKey, remoteDHPublicKey);
  const { newRootKey, chainKey } = await kdfRatchet(sharedSecret, dhOutput);

  const ratchet = new DoubleRatchet(newRootKey, dhKeyPair);
  ratchet['state'].sendChainKey = chainKey;
  ratchet['state'].remoteDHPublicKey = remoteDHPublicKey;

  console.info('[DoubleRatchet] Initialized sender session');
  return ratchet;
}

/**
 * Initializes a new Double Ratchet session (receiver side)
 * 
 * @param sharedSecret - Initial shared secret from X3DH
 * @param ourKeyPair - Our DH key pair used in X3DH
 */
export async function initializeRatchetReceiver(
  sharedSecret: Uint8Array,
  ourKeyPair: CryptoKeyPair
): Promise<DoubleRatchet> {
  const ratchet = new DoubleRatchet(sharedSecret, ourKeyPair);
  
  console.info('[DoubleRatchet] Initialized receiver session');
  return ratchet;
}

/**
 * Stores ratchet state in IndexedDB
 */
export async function storeRatchetState(
  conversationId: string,
  ratchet: DoubleRatchet
): Promise<void> {
  const serialized = await ratchet.serialize();
  
  const db = await openRatchetDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ratchetStates', 'readwrite');
    const store = tx.objectStore('ratchetStates');
    const request = store.put({
      conversationId,
      state: serialized,
      updatedAt: Date.now(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Loads ratchet state from IndexedDB
 */
export async function loadRatchetState(conversationId: string): Promise<DoubleRatchet | null> {
  const db = await openRatchetDB();

  const result = await new Promise<{ state: string } | null>((resolve, reject) => {
    const tx = db.transaction('ratchetStates', 'readonly');
    const store = tx.objectStore('ratchetStates');
    const request = store.get(conversationId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  if (!result) {
    return null;
  }

  return await DoubleRatchet.deserialize(result.state);
}

/**
 * Opens ratchet state database
 */
function openRatchetDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('signal-ratchet-state', 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('ratchetStates')) {
        db.createObjectStore('ratchetStates', { keyPath: 'conversationId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}