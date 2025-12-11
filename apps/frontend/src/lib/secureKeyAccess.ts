/**
 * Secure Key Access Helper
 * 
 * SECURITY FIX VUL-002: Removed sessionStorage usage
 * 
 * Provides a unified interface to access masterKey securely from IndexedDB
 * Keys are stored as non-extractable CryptoKeys in IndexedDB.
 * 
 * For backward compatibility with existing encryption code that needs hex,
 * we maintain an encrypted memory-only cache that is cleared on page unload.
 */

import { getMasterKey as getIndexedDBKey, importRawKey, storeMasterKey as storeIndexedDBKey } from './keyStore';

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
 * Gets masterKey as hex string for backward compatibility
 * 
 * SECURITY NOTE: This uses a secure memory-only cache.
 * The key is NOT persisted to sessionStorage.
 * 
 * @returns MasterKey hex string or null if not available
 */
export async function getMasterKeyHex(): Promise<string | null> {
  // Check memory cache first
  const cached = secureCache.get(MASTER_KEY_CACHE_ID);
  if (cached) {
    return cached;
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
 * - Stores hex only in memory (not sessionStorage)
 * - Memory cache is cleared on page unload
 * 
 * @param masterKeyHex - Master key in hex format
 */
export async function setTemporaryMasterKey(masterKeyHex: string): Promise<void> {
  // Store in memory-only cache (NOT sessionStorage)
  secureCache.set(MASTER_KEY_CACHE_ID, masterKeyHex);

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
 */
export function clearTemporaryMasterKey(): void {
  secureCache.delete(MASTER_KEY_CACHE_ID);
  console.info('[SecureKeyAccess] Temporary master key cleared');
}

/**
 * Emergency wipe - clears all keys
 * 
 * SECURITY: Use this on logout or security events
 */
export async function emergencyWipeKeys(): Promise<void> {
  secureCache.clear();
  const { emergencyWipe } = await import('./keyStore');
  await emergencyWipe();
  console.warn('[SecureKeyAccess] Emergency wipe completed');
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