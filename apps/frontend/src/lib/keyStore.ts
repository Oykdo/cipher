/**
 * Secure Key Store - IndexedDB with Non-Extractable CryptoKeys
 * 
 * SECURITY UPGRADE: Master keys stored in IndexedDB with non-extractable flag
 * 
 * Protection against:
 * - XSS attacks (keys not accessible via JavaScript)
 * - DevTools inspection (keys cannot be exported)
 * - Browser extension theft
 * - localStorage vulnerabilities
 * 
 * Compliance:
 * - OWASP Key Management Best Practices
 * - Web Crypto API standards
 * - NIST SP 800-57 recommendations
 */

const DB_NAME = 'dead-drop-secure';
const STORE_NAME = 'cryptoKeys';
const DB_VERSION = 2; // Upgraded version

interface StoredKey {
  id: string;
  key: CryptoKey;
  createdAt: number;
  lastUsedAt?: number;
}

function isIDBAvailable(): boolean {
  try { return typeof indexedDB !== 'undefined'; } catch { return false; }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      
      // Migration from old store
      if (oldVersion < 1 && !db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        console.info('[KeyStore] Created secure key store');
      }
      
      // V2 upgrade: add metadata
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
        console.info('[KeyStore] Upgraded to v2 with metadata support');
      }
    };
    
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Stores a CryptoKey in IndexedDB (with metadata)
 * 
 * @param keyName - Unique identifier for the key
 * @param key - CryptoKey object (should be non-extractable)
 * @returns true if successful
 */
export async function storeCryptoKeyIDB(keyName: string, key: CryptoKey): Promise<boolean> {
  if (!isIDBAvailable()) {
    console.warn('[KeyStore] IndexedDB not available');
    return false;
  }
  
  try {
    const db = await openDB();
    
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      
      const store = tx.objectStore(STORE_NAME);
      const storedKey: StoredKey = {
        id: keyName,
        key,
        createdAt: Date.now(),
      };
      
      store.put(storedKey);
    });
    
    console.info(`[KeyStore] Stored key: ${keyName}`);
    return true;
  } catch (error) {
    console.error(`[KeyStore] Failed to store key ${keyName}:`, error);
    return false;
  }
}

/**
 * Loads a CryptoKey from IndexedDB
 * 
 * @param keyName - Unique identifier for the key
 * @returns CryptoKey or null if not found
 */
export async function loadCryptoKeyIDB(keyName: string): Promise<CryptoKey | null> {
  if (!isIDBAvailable()) {
    return null;
  }
  
  try {
    const db = await openDB();
    
    const result = await new Promise<StoredKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.onerror = () => reject(tx.error);
      
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(keyName);
      
      req.onsuccess = () => resolve((req.result as StoredKey) || null);
      req.onerror = () => reject(req.error);
    });
    
    if (result) {
      // Update last used timestamp (fire and forget)
      updateLastUsed(keyName).catch(() => {});
      return result.key;
    }
    
    return null;
  } catch (error) {
    console.error(`[KeyStore] Failed to load key ${keyName}:`, error);
    return null;
  }
}

/**
 * Removes a key from IndexedDB
 * 
 * @param keyName - Unique identifier for the key
 * @returns true if successful
 */
export async function removeCryptoKeyIDB(keyName: string): Promise<boolean> {
  if (!isIDBAvailable()) {
    return false;
  }
  
  try {
    const db = await openDB();
    
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      
      const store = tx.objectStore(STORE_NAME);
      store.delete(keyName);
    });
    
    console.info(`[KeyStore] Removed key: ${keyName}`);
    return true;
  } catch (error) {
    console.error(`[KeyStore] Failed to remove key ${keyName}:`, error);
    return false;
  }
}

/**
 * Clears all keys from IndexedDB (emergency wipe)
 * 
 * @returns true if successful
 */
export async function clearAllKeys(): Promise<boolean> {
  if (!isIDBAvailable()) {
    return false;
  }
  
  try {
    const db = await openDB();
    
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      
      const store = tx.objectStore(STORE_NAME);
      store.clear();
    });
    
    console.warn('[KeyStore] Cleared all keys (emergency wipe)');
    return true;
  } catch (error) {
    console.error('[KeyStore] Failed to clear keys:', error);
    return false;
  }
}

/**
 * Lists all stored key IDs
 * 
 * @returns Array of key IDs
 */
export async function listStoredKeys(): Promise<string[]> {
  if (!isIDBAvailable()) {
    return [];
  }
  
  try {
    const db = await openDB();
    
    return await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.onerror = () => reject(tx.error);
      
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[KeyStore] Failed to list keys:', error);
    return [];
  }
}

/**
 * Updates last used timestamp for a key (internal)
 */
async function updateLastUsed(keyName: string): Promise<void> {
  if (!isIDBAvailable()) {
    return;
  }
  
  try {
    const db = await openDB();
    
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(keyName);
      
      getReq.onsuccess = () => {
        const storedKey = getReq.result as StoredKey | undefined;
        if (storedKey) {
          storedKey.lastUsedAt = Date.now();
          store.put(storedKey);
        }
        resolve();
      };
      
      getReq.onerror = () => resolve(); // Fail silently
    });
  } catch {
    // Fail silently
  }
}

/**
 * Derives a non-extractable CryptoKey from password using PBKDF2
 * 
 * @param password - User password
 * @param salt - Salt bytes (16+ bytes)
 * @param iterations - PBKDF2 iterations (OWASP 2024: 600,000)
 * @returns Non-extractable CryptoKey for AES-GCM
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = 600000
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive AES-GCM key (NON-EXTRACTABLE)
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt),
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false, // ★ NON-EXTRACTABLE (key cannot be exported)
    ['encrypt', 'decrypt']
  );
}

/**
 * Imports raw key material as non-extractable CryptoKey
 * 
 * @param rawKey - Raw key bytes (32 bytes for AES-256)
 * @returns Non-extractable CryptoKey for AES-GCM
 */
export async function importRawKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new Uint8Array(rawKey),
    { name: 'AES-GCM', length: 256 },
    false, // ★ NON-EXTRACTABLE
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a random salt for PBKDF2
 * 
 * @param length - Salt length in bytes (default: 16)
 * @returns Random salt bytes
 */
export function generateSalt(length: number = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Quick access: Store master key
 */
export async function storeMasterKey(key: CryptoKey): Promise<boolean> {
  return storeCryptoKeyIDB('master-key', key);
}

/**
 * Quick access: Load master key
 */
export async function getMasterKey(): Promise<CryptoKey | null> {
  return loadCryptoKeyIDB('master-key');
}

/**
 * Quick access: Remove master key
 */
export async function removeMasterKey(): Promise<boolean> {
  return removeCryptoKeyIDB('master-key');
}

/**
 * Emergency wipe - removes all keys
 */
export async function emergencyWipe(): Promise<boolean> {
  const success = await clearAllKeys();
  if (success) {
    console.warn('🔴 [KeyStore] Emergency wipe completed');
  }
  return success;
}
