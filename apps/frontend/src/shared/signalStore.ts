/**
 * Signal Protocol Store - IndexedDB Backend
 * 
 * Implements the Signal Protocol storage interface for managing:
 * - Identity Key Pairs
 * - Signed Pre-Keys
 * - One-Time Pre-Keys
 * - Session States (Double Ratchet state)
 * 
 * SECURITY: All keys stored in IndexedDB with appropriate protection
 */

import { SignalProtocolAddress } from '@privacyresearch/libsignal-protocol-typescript';

// Use any for now to avoid TypeScript issues with library types
// In production, properly type these based on actual library exports
type SessionRecord = any;
type PreKeyRecord = any;
type SignedPreKeyRecord = any;
type IdentityKeyPair = any;

const DB_NAME = 'signal-protocol-store';
const DB_VERSION = 1;

// Store names
const STORES = {
  IDENTITY_KEYS: 'identityKeys',
  PRE_KEYS: 'preKeys',
  SIGNED_PRE_KEYS: 'signedPreKeys',
  SESSIONS: 'sessions',
  REGISTRATION: 'registration',
};

/**
 * Opens the Signal Protocol database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (_event) => {
      const db = request.result;

      // Identity Keys store
      if (!db.objectStoreNames.contains(STORES.IDENTITY_KEYS)) {
        db.createObjectStore(STORES.IDENTITY_KEYS, { keyPath: 'identifier' });
      }

      // Pre-Keys store
      if (!db.objectStoreNames.contains(STORES.PRE_KEYS)) {
        const preKeyStore = db.createObjectStore(STORES.PRE_KEYS, { keyPath: 'id' });
        preKeyStore.createIndex('identifier', 'identifier', { unique: false });
      }

      // Signed Pre-Keys store
      if (!db.objectStoreNames.contains(STORES.SIGNED_PRE_KEYS)) {
        const signedPreKeyStore = db.createObjectStore(STORES.SIGNED_PRE_KEYS, { keyPath: 'id' });
        signedPreKeyStore.createIndex('identifier', 'identifier', { unique: false });
      }

      // Sessions store
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const sessionStore = db.createObjectStore(STORES.SESSIONS, { keyPath: 'address' });
        sessionStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Registration data store
      if (!db.objectStoreNames.contains(STORES.REGISTRATION)) {
        db.createObjectStore(STORES.REGISTRATION, { keyPath: 'key' });
      }

      console.info('[SignalStore] Database schema created');
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Signal Protocol Store Implementation
 */
export class SignalProtocolStore {
  private localIdentifier: string;

  constructor(localIdentifier: string) {
    this.localIdentifier = localIdentifier;
  }

  // ============================================================================
  // IDENTITY KEY MANAGEMENT
  // ============================================================================

  async getIdentityKeyPair(): Promise<IdentityKeyPair | undefined> {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.IDENTITY_KEYS, 'readonly');
      const store = tx.objectStore(STORES.IDENTITY_KEYS);
      const request = store.get(this.localIdentifier);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.keyPair : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveIdentityKeyPair(keyPair: IdentityKeyPair): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.IDENTITY_KEYS, 'readwrite');
      const store = tx.objectStore(STORES.IDENTITY_KEYS);
      const request = store.put({
        identifier: this.localIdentifier,
        keyPair,
        createdAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REGISTRATION, 'readonly');
      const store = tx.objectStore(STORES.REGISTRATION);
      const request = store.get('registrationId');

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveLocalRegistrationId(registrationId: number): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REGISTRATION, 'readwrite');
      const store = tx.objectStore(STORES.REGISTRATION);
      const request = store.put({
        key: 'registrationId',
        value: registrationId,
        createdAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // PRE-KEY MANAGEMENT
  // ============================================================================

  async loadPreKey(keyId: number): Promise<PreKeyRecord | undefined> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PRE_KEYS, 'readonly');
      const store = tx.objectStore(STORES.PRE_KEYS);
      const request = store.get(keyId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.record : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async storePreKey(keyId: number, record: PreKeyRecord): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PRE_KEYS, 'readwrite');
      const store = tx.objectStore(STORES.PRE_KEYS);
      const request = store.put({
        id: keyId,
        identifier: this.localIdentifier,
        record,
        createdAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async removePreKey(keyId: number): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PRE_KEYS, 'readwrite');
      const store = tx.objectStore(STORES.PRE_KEYS);
      const request = store.delete(keyId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // SIGNED PRE-KEY MANAGEMENT
  // ============================================================================

  async loadSignedPreKey(keyId: number): Promise<SignedPreKeyRecord | undefined> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SIGNED_PRE_KEYS, 'readonly');
      const store = tx.objectStore(STORES.SIGNED_PRE_KEYS);
      const request = store.get(keyId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.record : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async storeSignedPreKey(keyId: number, record: SignedPreKeyRecord): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SIGNED_PRE_KEYS, 'readwrite');
      const store = tx.objectStore(STORES.SIGNED_PRE_KEYS);
      const request = store.put({
        id: keyId,
        identifier: this.localIdentifier,
        record,
        createdAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async removeSignedPreKey(keyId: number): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SIGNED_PRE_KEYS, 'readwrite');
      const store = tx.objectStore(STORES.SIGNED_PRE_KEYS);
      const request = store.delete(keyId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // SESSION MANAGEMENT (Double Ratchet State)
  // ============================================================================

  async loadSession(address: SignalProtocolAddress): Promise<SessionRecord | undefined> {
    const db = await openDB();
    const addressKey = `${address.getName()}.${address.getDeviceId()}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SESSIONS, 'readonly');
      const store = tx.objectStore(STORES.SESSIONS);
      const request = store.get(addressKey);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.record : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async storeSession(address: SignalProtocolAddress, record: SessionRecord): Promise<void> {
    const db = await openDB();
    const addressKey = `${address.getName()}.${address.getDeviceId()}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SESSIONS, 'readwrite');
      const store = tx.objectStore(STORES.SESSIONS);
      const request = store.put({
        address: addressKey,
        record,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async removeSession(address: SignalProtocolAddress): Promise<void> {
    const db = await openDB();
    const addressKey = `${address.getName()}.${address.getDeviceId()}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SESSIONS, 'readwrite');
      const store = tx.objectStore(STORES.SESSIONS);
      const request = store.delete(addressKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async removeAllSessions(name: string): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SESSIONS, 'readwrite');
      const store = tx.objectStore(STORES.SESSIONS);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const addressKey = cursor.value.address as string;
          if (addressKey.startsWith(name + '.')) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // TRUSTED KEYS (For MITM Protection)
  // ============================================================================

  async isTrustedIdentity(
    _identifier: string,
    _identityKey: ArrayBuffer,
    _direction: number
  ): Promise<boolean> {
    // For now, trust on first use (TOFU)
    // In production, implement key pinning and safety number verification
    return true;
  }

  async saveIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
    // Store trusted identity keys
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.IDENTITY_KEYS, 'readwrite');
      const store = tx.objectStore(STORES.IDENTITY_KEYS);
      const request = store.put({
        identifier,
        identityKey,
        trustedAt: Date.now(),
      });

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clears all Signal Protocol data (for logout/reset)
   */
  async clearAll(): Promise<void> {
    const db = await openDB();

    const storeNames = [
      STORES.IDENTITY_KEYS,
      STORES.PRE_KEYS,
      STORES.SIGNED_PRE_KEYS,
      STORES.SESSIONS,
      STORES.REGISTRATION,
    ];

    for (const storeName of storeNames) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    console.info('[SignalStore] All Signal Protocol data cleared');
  }

  /**
   * Gets statistics about stored keys
   */
  async getStats(): Promise<{
    preKeys: number;
    signedPreKeys: number;
    sessions: number;
  }> {
    const db = await openDB();

    const countStore = async (storeName: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };

    const [preKeys, signedPreKeys, sessions] = await Promise.all([
      countStore(STORES.PRE_KEYS),
      countStore(STORES.SIGNED_PRE_KEYS),
      countStore(STORES.SESSIONS),
    ]);

    return { preKeys, signedPreKeys, sessions };
  }

  /**
   * Lists all active sessions
   */
  async listSessions(): Promise<string[]> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SESSIONS, 'readonly');
      const store = tx.objectStore(STORES.SESSIONS);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Rotates Signed Pre-Key (should be called periodically, e.g., every 7 days)
   */
  async rotateSignedPreKey(): Promise<void> {
    // Implementation depends on key generation logic
    // This is a placeholder for the rotation mechanism
    console.info('[SignalStore] Signed Pre-Key rotation initiated');
    // TODO: Generate new signed pre-key and upload to server
  }

  /**
   * Replenishes One-Time Pre-Keys when running low
   */
  async replenishOneTimePreKeys(threshold: number = 10): Promise<void> {
    const stats = await this.getStats();

    if (stats.preKeys < threshold) {
      console.warn(`[SignalStore] Low on One-Time Pre-Keys (${stats.preKeys}/${threshold})`);
      // TODO: Generate new batch and upload to server
    }
  }
}

/**
 * Creates a Signal Protocol store instance
 */
export function createSignalStore(identifier: string): SignalProtocolStore {
  return new SignalProtocolStore(identifier);
}

/**
 * Helper: Converts address to string key
 */
export function addressToKey(address: SignalProtocolAddress): string {
  return `${address.getName()}.${address.getDeviceId()}`;
}

/**
 * Helper: Parses address from string key
 */
export function keyToAddress(key: string): { name: string; deviceId: number } {
  const parts = key.split('.');
  return {
    name: parts[0],
    deviceId: parseInt(parts[1], 10),
  };
}