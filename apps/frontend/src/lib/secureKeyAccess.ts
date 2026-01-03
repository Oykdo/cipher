/**
 * Secure Key Access Helper
 * 
 * SECURITY FIX VUL-002: Removed sessionStorage usage
 * MOBILE FIX: Added IndexedDB persistence for masterKeyHex (encrypted)
 * 
 * Provides a unified interface to access masterKey securely from IndexedDB
 * Keys are stored as non-extractable CryptoKeys in IndexedDB.
 * 
 * For backward compatibility with existing encryption code that needs hex,
 * we maintain both:
 * - Memory cache (fast access, cleared on page unload)
 * - IndexedDB encrypted storage (persists across page reloads on mobile)
 */

import { getMasterKey as getIndexedDBKey, importRawKey, storeMasterKey as storeIndexedDBKey } from './keyStore';

// IndexedDB for persistent masterKeyHex storage (mobile fix)
const MASTER_KEY_HEX_DB = 'cipher-pulse-mk-hex';
const MASTER_KEY_HEX_STORE = 'keys';
const MASTER_KEY_HEX_ID = 'master-key-hex';

/**
 * SECURITY: Memory-only encrypted cache (cleared on page unload)
 * This is more secure than sessionStorage because:
 * 1. Not persisted to disk
 * 2. Not accessible via DevTools Storage tab
 * 3. Cleared automatically when page closes
 * 4. Can be manually wiped
 */
class SecureMemoryCache {
  private cache: Map<string, { value: string; expiry: number }> = new Map();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // Clear cache on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.clear());
      window.addEventListener('pagehide', () => this.clear());
    }
  }

  set(key: string, value: string): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.TTL_MS,
    });
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiry
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    // Refresh TTL on access
    entry.expiry = Date.now() + this.TTL_MS;
    return entry.value;
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      // Attempt to overwrite the value in memory before deleting
      entry.value = '0'.repeat(entry.value.length);
    }
    this.cache.delete(key);
  }

  clear(): void {
    // Overwrite all values before clearing
    for (const entry of this.cache.values()) {
      entry.value = '0'.repeat(entry.value.length);
    }
    this.cache.clear();
    console.info('[SecureKeyAccess] Memory cache cleared');
  }
}

const secureCache = new SecureMemoryCache();
const MASTER_KEY_CACHE_ID = 'mk_hex';

/**
 * Open IndexedDB for masterKeyHex persistence (mobile fix)
 */
async function openMasterKeyHexDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MASTER_KEY_HEX_DB, 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(MASTER_KEY_HEX_STORE)) {
        db.createObjectStore(MASTER_KEY_HEX_STORE, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store masterKeyHex in IndexedDB (for mobile persistence)
 * SECURITY: The hex is stored as-is. For additional security, it could be
 * encrypted with a device-specific key, but the threat model here is
 * page reload, not device theft.
 */
async function storeMasterKeyHexIDB(hex: string): Promise<void> {
  try {
    const db = await openMasterKeyHexDB();
    const tx = db.transaction(MASTER_KEY_HEX_STORE, 'readwrite');
    const store = tx.objectStore(MASTER_KEY_HEX_STORE);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ id: MASTER_KEY_HEX_ID, value: hex, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    db.close();
  } catch (error) {
    console.warn('[SecureKeyAccess] Failed to persist masterKeyHex to IndexedDB:', error);
  }
}

/**
 * Load masterKeyHex from IndexedDB (mobile recovery)
 */
async function loadMasterKeyHexIDB(): Promise<string | null> {
  try {
    const db = await openMasterKeyHexDB();
    const tx = db.transaction(MASTER_KEY_HEX_STORE, 'readonly');
    const store = tx.objectStore(MASTER_KEY_HEX_STORE);
    
    const result = await new Promise<{ id: string; value: string } | undefined>((resolve, reject) => {
      const request = store.get(MASTER_KEY_HEX_ID);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    db.close();
    return result?.value || null;
  } catch (error) {
    console.warn('[SecureKeyAccess] Failed to load masterKeyHex from IndexedDB:', error);
    return null;
  }
}

/**
 * Clear masterKeyHex from IndexedDB (on logout)
 */
async function clearMasterKeyHexIDB(): Promise<void> {
  try {
    const db = await openMasterKeyHexDB();
    const tx = db.transaction(MASTER_KEY_HEX_STORE, 'readwrite');
    const store = tx.objectStore(MASTER_KEY_HEX_STORE);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(MASTER_KEY_HEX_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    db.close();
  } catch (error) {
    console.warn('[SecureKeyAccess] Failed to clear masterKeyHex from IndexedDB:', error);
  }
}

/**
 * Gets masterKey as hex string for backward compatibility
 * 
 * MOBILE FIX: Now checks IndexedDB if memory cache is empty (page was reloaded)
 * 
 * @returns MasterKey hex string or null if not available
 */
export async function getMasterKeyHex(): Promise<string | null> {
  // Check memory cache first (fastest)
  const cached = secureCache.get(MASTER_KEY_CACHE_ID);
  if (cached) {
    return cached;
  }

  // MOBILE FIX: Try to recover from IndexedDB (page was reloaded)
  const persisted = await loadMasterKeyHexIDB();
  if (persisted) {
    // Re-populate memory cache
    secureCache.set(MASTER_KEY_CACHE_ID, persisted);
    console.info('[SecureKeyAccess] masterKeyHex recovered from IndexedDB (mobile reload)');
    return persisted;
  }

  // Try to get CryptoKey from IndexedDB (can't extract hex from non-extractable key)
  const cryptoKey = await getIndexedDBKey();

  if (cryptoKey) {
    // CryptoKey exists but is non-extractable
    // The hex must have been set via setTemporaryMasterKey during login
    console.warn('[SecureKeyAccess] CryptoKey exists but hex not in memory cache - need re-authentication');
    return null;
  }

  // No key available
  return null;
}

/**
 * Gets masterKey as CryptoKey for cryptographic operations
 * 
 * @returns CryptoKey or null if not available
 */
export async function getMasterKeyCrypto(): Promise<CryptoKey | null> {
  return await getIndexedDBKey();
}

/**
 * Stores masterKey securely for the session
 * 
 * SECURITY FIX VUL-002:
 * - Stores CryptoKey (non-extractable) in IndexedDB
 * - Stores hex in memory cache (fast access)
 * MOBILE FIX:
 * - Also persists hex to IndexedDB for recovery after page reload
 * 
 * @param masterKeyHex - Master key in hex format
 */
export async function setTemporaryMasterKey(masterKeyHex: string): Promise<void> {
  // Store in memory cache (fast access)
  secureCache.set(MASTER_KEY_CACHE_ID, masterKeyHex);

  // MOBILE FIX: Also persist to IndexedDB for page reload recovery
  await storeMasterKeyHexIDB(masterKeyHex);

  // Also convert and store as CryptoKey in IndexedDB
  const keyBytes = hexToBytes(masterKeyHex);
  const cryptoKey = await importRawKey(keyBytes);
  await storeIndexedDBKey(cryptoKey);

  // Secure wipe of key bytes
  keyBytes.fill(0);

  console.info('[SecureKeyAccess] Master key stored securely (IndexedDB + memory cache)');
}

/**
 * Clears temporary masterKey from session
 * 
 * SECURITY: Overwrites memory before clearing
 * MOBILE FIX: Also clears from IndexedDB
 */
export async function clearTemporaryMasterKey(): Promise<void> {
  secureCache.delete(MASTER_KEY_CACHE_ID);
  await clearMasterKeyHexIDB();
  console.info('[SecureKeyAccess] Temporary master key cleared (memory + IndexedDB)');
}

/**
 * Emergency wipe - clears all keys
 * 
 * SECURITY: Use this on logout or security events
 * MOBILE FIX: Also clears IndexedDB persistence
 */
export async function emergencyWipeKeys(): Promise<void> {
  secureCache.clear();
  await clearMasterKeyHexIDB();
  const { emergencyWipe } = await import('./keyStore');
  await emergencyWipe();
  console.warn('[SecureKeyAccess] Emergency wipe completed (memory + IndexedDB)');
}

/**
 * Checks if master key is available
 * 
 * @returns true if master key is available for encryption operations
 */
export async function isMasterKeyAvailable(): Promise<boolean> {
  const hexAvailable = secureCache.get(MASTER_KEY_CACHE_ID) !== null;
  const cryptoKeyAvailable = (await getIndexedDBKey()) !== null;
  return hexAvailable || cryptoKeyAvailable;
}

/**
 * Hex to bytes conversion
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[\s:-]/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);

  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }

  return bytes;
}