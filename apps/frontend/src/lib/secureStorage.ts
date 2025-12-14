/**
 * Secure Storage - IndexedDB with encryption
 * 
 * SECURITY: Encrypted storage for sensitive data
 * - Uses IndexedDB for persistence
 * - Encrypts all data with AES-GCM
 * - Derives encryption key from user password/PIN
 * - Uses unique salt per user (SECURITY FIX VULN-002)
 * - Isolated per origin
 * 
 * @module SecureStorage
 */

import { logger } from '@/core/logger';

const DB_VERSION = 2; // Incremented for salt storage
const STORE_NAME = 'vault';
const SALT_STORE_NAME = 'salts';
const SALT_KEY = 'user_encryption_salt';

interface StoredItem {
  key: string;
  encryptedValue: string;
  iv: string;
  tag: string;
  timestamp: number;
}

interface StoredSalt {
  key: string;
  salt: string;
  createdAt: number;
}

/**
 * Secure Storage using IndexedDB with AES-GCM encryption
 */
export class SecureStorage {
  private readonly dbName: string;
  private db: IDBDatabase | null = null;
  private encryptionKey: CryptoKey | null = null;
  private userSalt: Uint8Array | null = null;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  /**
   * Initialize secure storage with encryption key
   * SECURITY FIX VULN-002: Now uses unique salt per user
   */
  async initialize(password: string): Promise<void> {
    try {
      // Open IndexedDB first
      this.db = await this.openDatabase();

      // Get or create unique salt for this user
      this.userSalt = await this.getOrCreateSalt();

      // Derive encryption key from password with unique salt
      this.encryptionKey = await this.deriveKey(password, this.userSalt);

      logger.info('SecureStorage initialized with unique salt');
    } catch (error) {
      logger.error('Failed to initialize SecureStorage', error as Error);
      throw error;
    }
  }

  /**
   * SECURITY FIX VULN-002: Get or create a unique salt for this user
   * Salt is stored in IndexedDB and persisted across sessions
   */
  private async getOrCreateSalt(): Promise<Uint8Array> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const transaction = this.db.transaction([SALT_STORE_NAME], 'readonly');
      const store = transaction.objectStore(SALT_STORE_NAME);
      const existing = await this.promisifyRequest<StoredSalt>(store.get(SALT_KEY));

      if (existing && existing.salt) {
        return this.base64ToUint8Array(existing.salt);
      }
    } catch {
      // Salt store might not exist yet, will create below
    }

    // Generate new unique salt (32 bytes = 256 bits)
    const newSalt = crypto.getRandomValues(new Uint8Array(32));

    // Store salt
    try {
      const transaction = this.db.transaction([SALT_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(SALT_STORE_NAME);
      const saltItem: StoredSalt = {
        key: SALT_KEY,
        salt: this.arrayBufferToBase64(newSalt),
        createdAt: Date.now(),
      };
      await this.promisifyRequest(store.put(saltItem));
      logger.info('SecureStorage: New unique salt generated and stored');
    } catch (error) {
      logger.error('Failed to store salt', error as Error);
      // Continue with the salt even if storage fails
    }

    return newSalt;
  }

  /**
   * Convert Base64 to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Store encrypted value
   */
  async setItem(key: string, value: string): Promise<void> {
    if (!this.db || !this.encryptionKey) {
      throw new Error('SecureStorage not initialized');
    }

    try {
      // Encrypt value
      const encrypted = await this.encrypt(value);

      // Store in IndexedDB
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const item: StoredItem = {
        key,
        encryptedValue: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        timestamp: Date.now(),
      };

      await this.promisifyRequest(store.put(item));

      logger.debug('SecureStorage: Item stored', { key });
    } catch (error) {
      logger.error('Failed to store item', error as Error, { key });
      throw error;
    }
  }

  /**
   * Retrieve and decrypt value
   */
  async getItem(key: string): Promise<string | null> {
    if (!this.db || !this.encryptionKey) {
      throw new Error('SecureStorage not initialized');
    }

    try {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const item = await this.promisifyRequest<StoredItem>(store.get(key));

      if (!item) {
        return null;
      }

      // Decrypt value
      const decrypted = await this.decrypt({
        ciphertext: item.encryptedValue,
        iv: item.iv,
        tag: item.tag,
      });

      logger.debug('SecureStorage: Item retrieved', { key });
      return decrypted;
    } catch (error) {
      logger.error('Failed to retrieve item', error as Error, { key });
      return null;
    }
  }

  /**
   * Remove item
   */
  async removeItem(key: string): Promise<void> {
    if (!this.db) {
      throw new Error('SecureStorage not initialized');
    }

    try {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await this.promisifyRequest(store.delete(key));

      logger.debug('SecureStorage: Item removed', { key });
    } catch (error) {
      logger.error('Failed to remove item', error as Error, { key });
      throw error;
    }
  }

  /**
   * Clear all items
   */
  async clear(): Promise<void> {
    if (!this.db) {
      throw new Error('SecureStorage not initialized');
    }

    try {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await this.promisifyRequest(store.clear());

      logger.info('SecureStorage: All items cleared');
    } catch (error) {
      logger.error('Failed to clear storage', error as Error);
      throw error;
    }
  }

  /**
   * Get all keys
   */
  async keys(): Promise<string[]> {
    if (!this.db) {
      throw new Error('SecureStorage not initialized');
    }

    try {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const keys = await this.promisifyRequest<string[]>(store.getAllKeys());

      return keys as string[];
    } catch (error) {
      logger.error('Failed to get keys', error as Error);
      return [];
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.encryptionKey = null;
      logger.info('SecureStorage closed');
    }
  }

  // Private methods

  /**
   * Open IndexedDB database
   * SECURITY FIX VULN-002: Added salt store for unique per-user salts
   */
  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create vault store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // SECURITY FIX VULN-002: Create salt store for unique per-user salts
        if (!db.objectStoreNames.contains(SALT_STORE_NAME)) {
          db.createObjectStore(SALT_STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Derive encryption key from password using PBKDF2
   * SECURITY FIX VULN-002: Now requires unique salt parameter
   * @param password - User password
   * @param salt - Unique salt (32 bytes) for this user
   */
  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // SECURITY FIX VULN-002: Use unique salt instead of static one
    // Increased iterations to 600000 per OWASP recommendation
    // Convert salt to ArrayBuffer for crypto.subtle compatibility
    const saltBuffer = new Uint8Array(salt).buffer;
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 600000, // OWASP recommended for SHA-256
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data with AES-GCM
   */
  private async encrypt(
    plaintext: string
  ): Promise<{ ciphertext: string; iv: string; tag: string }> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      data
    );

    // Split ciphertext and tag
    const ciphertext = new Uint8Array(encrypted.slice(0, -16));
    const tag = new Uint8Array(encrypted.slice(-16));

    return {
      ciphertext: this.arrayBufferToBase64(ciphertext),
      iv: this.arrayBufferToBase64(iv),
      tag: this.arrayBufferToBase64(tag),
    };
  }

  /**
   * Decrypt data with AES-GCM
   */
  private async decrypt(encrypted: {
    ciphertext: string;
    iv: string;
    tag: string;
  }): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const ciphertext = this.base64ToArrayBuffer(encrypted.ciphertext);
    const iv = this.base64ToArrayBuffer(encrypted.iv);
    const tag = this.base64ToArrayBuffer(encrypted.tag);

    // Combine ciphertext and tag
    const combined = new Uint8Array(ciphertext.byteLength + tag.byteLength);
    combined.set(new Uint8Array(ciphertext));
    combined.set(new Uint8Array(tag), ciphertext.byteLength);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      combined
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Promisify IDBRequest
   */
  private promisifyRequest<T>(request: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instances (keyed by db name)
const secureStorageInstances = new Map<string, SecureStorage>();

/**
 * Get or create SecureStorage instance
 */
export async function getSecureStorage(password: string, dbName = 'CipherPulseSecure'): Promise<SecureStorage> {
  const existing = secureStorageInstances.get(dbName);
  if (existing) {
    return existing;
  }

  const storage = new SecureStorage(dbName);
  await storage.initialize(password);
  secureStorageInstances.set(dbName, storage);
  return storage;
}

/**
 * Close and reset SecureStorage instance
 */
export function closeSecureStorage(): void {
  for (const storage of secureStorageInstances.values()) {
    storage.close();
  }
  secureStorageInstances.clear();
}
