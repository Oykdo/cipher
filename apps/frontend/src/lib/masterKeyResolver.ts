import type { AuthSession } from '../store/auth';
import { getExistingKeyVault } from './keyVault';
import { getMasterKeyHex as getLegacyMasterKeyHex, setTemporaryMasterKey } from './secureKeyAccess';

import { debugLogger } from './debugLogger';

// Mobile debug helper
function mobileLog(level: 'info' | 'warn' | 'error', msg: string) {
  try {
    if (typeof window !== 'undefined' && (window as any).__mobileDebugLog) {
      (window as any).__mobileDebugLog(level, `[MKResolver] ${msg}`);
    }
  } catch { /* ignore */ }
}
/**
 * SECURITY FIX: Non-extractable CryptoKey cache
 * 
 * Instead of caching the masterKey as a string (vulnerable to XSS/memory dump),
 * we cache a non-extractable CryptoKey that can only be used for crypto operations.
 * 
 * The raw key material CANNOT be read back from a non-extractable CryptoKey,
 * even via DevTools or malicious JavaScript.
 */
let cachedCryptoKey: CryptoKey | null = null;

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Import masterKey as non-extractable CryptoKey
 * 
 * SECURITY: extractable=false means:
 * - Key cannot be exported via crypto.subtle.exportKey()
 * - Key is not accessible via JavaScript inspection
 * - Key can only be used for encrypt/decrypt operations
 */
async function importAsNonExtractable(masterKeyHex: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(masterKeyHex);
  return await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false, // NON-EXTRACTABLE - key cannot be read back
    ['encrypt', 'decrypt']
  );
}

/**
 * Store masterKey as non-extractable CryptoKey in memory
 * 
 * SECURITY: The string is converted to CryptoKey immediately,
 * then the original string should be cleared by the caller.
 * 
 * MOBILE FIX: Also persists to IndexedDB via setTemporaryMasterKey
 * for recovery after page reload on mobile browsers.
 */
export async function setSessionMasterKey(masterKey: string): Promise<void> {
  mobileLog('info', 'setSessionMasterKey() called');
  
  try {
    cachedCryptoKey = await importAsNonExtractable(masterKey);
    mobileLog('info', 'CryptoKey imported');
    
    // MOBILE FIX: Also persist to IndexedDB for page reload recovery
    await setTemporaryMasterKey(masterKey);
    mobileLog('info', 'MasterKey persisted to IndexedDB');
  } catch (err) {
    mobileLog('error', `Failed: ${(err as Error)?.message || err}`);
    console.error('[masterKeyResolver] Failed to import masterKey as CryptoKey', err);
    throw err;
  }
}

/**
 * Clear cached CryptoKey (call on logout)
 */
export function clearSessionMasterKey(): void {
  cachedCryptoKey = null;
  debugLogger.debug('[masterKeyResolver] CryptoKey cache cleared');
}

/**
 * Get the cached non-extractable CryptoKey for direct crypto operations
 * 
 * SECURITY: This is the preferred method - use the CryptoKey directly
 * without ever exposing the raw key material.
 */
export function getSessionCryptoKey(): CryptoKey | null {
  return cachedCryptoKey;
}

/**
 * Check if a session CryptoKey is cached
 */
export function hasSessionCryptoKey(): boolean {
  return cachedCryptoKey !== null;
}

/**
 * Resolves the encryption master key for a given session.
 * 
 * SECURITY NOTE: This returns the raw hex string for legacy compatibility.
 * Prefer using getSessionCryptoKey() + direct crypto operations when possible.
 *
 * Priority:
 * 1. KeyVault (masterKey:<username>) - encrypted in IndexedDB
 * 2. Legacy secureKeyAccess (IndexedDB CryptoKey + memory cache)
 * 
 * NOTE: We no longer cache the string in memory for security.
 * Each call fetches from encrypted storage.
 */
export async function resolveMasterKeyForSession(
  session: AuthSession | null
): Promise<string | null> {
  const username = session?.user?.username;

  // 1) KeyVault (encrypted in IndexedDB, opened during login)
  try {
    const vault = getExistingKeyVault();
    if (vault && username) {
      const normalizedUsername = username.toLowerCase();
      const stored =
        (await vault.getData(`masterKey:${normalizedUsername}`)) ||
        (await vault.getData(`masterKey:${username}`));
      if (stored) {
        // SECURITY: MasterKey found (not logging for security)
        // SECURITY: Do NOT cache the string - return directly
        // If CryptoKey not cached yet, cache it now
        if (!cachedCryptoKey) {
          cachedCryptoKey = await importAsNonExtractable(stored);
          // SECURITY: Cached (not logging for security)
        }
        return stored;
      }
    }
  } catch (err) {
    console.error('[masterKeyResolver] Failed to read masterKey from KeyVault', err);
  }

  // 2) Legacy secureKeyAccess (IndexedDB CryptoKey + memory cache)
  try {
    const legacy = await getLegacyMasterKeyHex();
    if (legacy) {
      // SECURITY: MasterKey found in legacy storage (not logging for security)
      // SECURITY: Do NOT cache the string - return directly
      // If CryptoKey not cached yet, cache it now
      if (!cachedCryptoKey) {
        cachedCryptoKey = await importAsNonExtractable(legacy);
        // SECURITY: Cached (not logging for security)
      }
      return legacy;
    }
  } catch (err) {
    console.error('[masterKeyResolver] Failed to read legacy masterKey', err);
  }

  console.error('[masterKeyResolver] No masterKey found in any source');
  return null;
}

/**
 * Encrypt data using the cached non-extractable CryptoKey
 * 
 * SECURITY: Use this instead of getting the raw key and encrypting separately.
 * The key material never leaves the secure CryptoKey container.
 */
export async function encryptWithSessionKey(
  plaintext: Uint8Array,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  if (!cachedCryptoKey) {
    throw new Error('No session CryptoKey available - user not logged in?');
  }
  
  return await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cachedCryptoKey,
    plaintext as BufferSource
  );
}

/**
 * Decrypt data using the cached non-extractable CryptoKey
 * 
 * SECURITY: Use this instead of getting the raw key and decrypting separately.
 * The key material never leaves the secure CryptoKey container.
 */
export async function decryptWithSessionKey(
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  if (!cachedCryptoKey) {
    throw new Error('No session CryptoKey available - user not logged in?');
  }
  
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cachedCryptoKey,
    ciphertext as BufferSource
  );
}
