/**
 * Public Key Service - Récupération et mise en cache des clés publiques
 * 
 * Responsabilités :
 * - Récupérer les clés publiques des autres utilisateurs depuis le backend
 * - Mettre en cache les clés pour éviter les requêtes répétées
 * - Invalider le cache si nécessaire
 * - Gérer les clés pour les conversations de groupe
 */

import _sodium from 'libsodium-wrappers';
import { 
  getPublicKeys as apiGetPublicKeys,
  getConversationMembers as apiGetConversationMembers,
} from '../../services/api-v2';

// ============================================================================
// TYPES
// ============================================================================

export interface PublicKeyInfo {
  userId: string;
  username: string;
  publicKey: Uint8Array;       // Curve25519 - Pour chiffrement
  signPublicKey: Uint8Array;   // Ed25519 - Pour signatures
  fetchedAt: number;           // Timestamp du fetch
}

export interface SerializedPublicKeyInfo {
  userId: string;
  username: string;
  publicKey: string;           // Base64
  signPublicKey: string;       // Base64
  fetchedAt: number;
}

// ============================================================================
// CACHE
// ============================================================================

// In-memory cache (invalidé au rechargement de la page)
const publicKeyCache = new Map<string, PublicKeyInfo>();

// Persistent cache in localStorage (survit au rechargement)
const CACHE_KEY_PREFIX = 'cipher-pulse-pubkey:';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Save public key to persistent cache
 */
function saveToPersistentCache(keyInfo: PublicKeyInfo): void {
  const serialized: SerializedPublicKeyInfo = {
    userId: keyInfo.userId,
    username: keyInfo.username,
    publicKey: _sodium.to_base64(keyInfo.publicKey),
    signPublicKey: _sodium.to_base64(keyInfo.signPublicKey),
    fetchedAt: keyInfo.fetchedAt,
  };
  
  const cacheKey = `${CACHE_KEY_PREFIX}${keyInfo.userId}`;
  localStorage.setItem(cacheKey, JSON.stringify(serialized));
}

/**
 * Load public key from persistent cache
 */
function loadFromPersistentCache(userId: string): PublicKeyInfo | null {
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  const stored = localStorage.getItem(cacheKey);
  
  if (!stored) return null;
  
  try {
    const serialized: SerializedPublicKeyInfo = JSON.parse(stored);
    
    // Check expiry
    const age = Date.now() - serialized.fetchedAt;
    if (age > CACHE_EXPIRY_MS) {
      // Cache expired
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return {
      userId: serialized.userId,
      username: serialized.username,
      publicKey: _sodium.from_base64(serialized.publicKey),
      signPublicKey: _sodium.from_base64(serialized.signPublicKey),
      fetchedAt: serialized.fetchedAt,
    };
  } catch (error) {
    console.error(`[PublicKeyService] Failed to load cached key for ${userId}:`, error);
    localStorage.removeItem(cacheKey);
    return null;
  }
}

/**
 * Get public key from cache (memory or persistent)
 */
function getFromCache(userId: string): PublicKeyInfo | null {
  // Check memory cache first
  const memCached = publicKeyCache.get(userId);
  if (memCached) {
    return memCached;
  }
  
  // Check persistent cache
  const persistCached = loadFromPersistentCache(userId);
  if (persistCached) {
    // Populate memory cache
    publicKeyCache.set(userId, persistCached);
    return persistCached;
  }
  
  return null;
}

/**
 * Store public key in cache (memory and persistent)
 */
function storeInCache(keyInfo: PublicKeyInfo): void {
  publicKeyCache.set(keyInfo.userId, keyInfo);
  saveToPersistentCache(keyInfo);
}

// ============================================================================
// API FETCHING
// ============================================================================

/**
 * Fetch public keys from backend
 * 
 * @param userIds Array of user IDs
 * @returns Array of public key info
 */
async function fetchPublicKeysFromAPI(userIds: string[]): Promise<PublicKeyInfo[]> {
  try {
    const response = await apiGetPublicKeys(userIds);
    
    const results: PublicKeyInfo[] = [];
    
    for (const key of response.keys) {
      const keyInfo: PublicKeyInfo = {
        userId: key.userId,
        username: key.username,
        publicKey: _sodium.from_base64(key.publicKey),
        signPublicKey: _sodium.from_base64(key.signPublicKey),
        fetchedAt: Date.now(),
      };
      
      results.push(keyInfo);
      storeInCache(keyInfo);
    }
    
    return results;
  } catch (error) {
    console.error('[PublicKeyService] Failed to fetch public keys:', error);
    throw new Error(`Failed to fetch public keys: ${error}`);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get public keys for multiple users
 * Uses cache when possible, fetches from API when needed
 * 
 * @param userIds Array of user IDs
 * @param options Options { force: boolean } - Force refresh from API
 * @returns Array of public key info
 */
export async function getPublicKeys(
  userIds: string[],
  options: { force?: boolean } = {}
): Promise<PublicKeyInfo[]> {
  await _sodium.ready;
  
  if (userIds.length === 0) {
    return [];
  }
  
  const results: PublicKeyInfo[] = [];
  const toFetch: string[] = [];
  
  // Check cache first (unless force refresh)
  for (const userId of userIds) {
    if (options.force) {
      toFetch.push(userId);
    } else {
      const cached = getFromCache(userId);
      if (cached) {
        results.push(cached);
      } else {
        toFetch.push(userId);
      }
    }
  }
  
  // Fetch missing keys from API
  if (toFetch.length > 0) {
    const fetched = await fetchPublicKeysFromAPI(toFetch);
    results.push(...fetched);
  }
  
  return results;
}

/**
 * Get public key for a single user
 * 
 * @param userId User ID
 * @param options Options { force: boolean }
 * @returns Public key info or null if not found
 */
export async function getPublicKey(
  userId: string,
  options: { force?: boolean } = {}
): Promise<PublicKeyInfo | null> {
  const results = await getPublicKeys([userId], options);
  return results.length > 0 ? results[0] : null;
}

/**
 * Get public keys for all participants in a conversation
 * 
 * @param conversationId Conversation ID
 * @param options Options { force: boolean }
 * @returns Array of public key info
 */
export async function getConversationParticipantKeys(
  conversationId: string,
  options: { force?: boolean } = {}
): Promise<PublicKeyInfo[]> {
  try {
    // Get conversation members from API
    const members = await apiGetConversationMembers(conversationId);
    
    // Get public keys for all members
    const userIds = members.map(m => m.userId);
    return getPublicKeys(userIds, options);
  } catch (error) {
    console.error('[PublicKeyService] Failed to get conversation participant keys:', error);
    throw new Error(`Failed to get participant keys: ${error}`);
  }
}

/**
 * Preload public keys for multiple users
 * Useful for warming up cache before sending messages
 * 
 * @param userIds Array of user IDs
 */
export async function preloadPublicKeys(userIds: string[]): Promise<void> {
  try {
    await getPublicKeys(userIds, { force: false });
    console.log(`✅ [PublicKeyService] Preloaded ${userIds.length} public keys`);
  } catch (error) {
    console.error('[PublicKeyService] Failed to preload public keys:', error);
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Invalidate cache for specific user(s)
 * 
 * @param userIds User IDs to invalidate (empty = invalidate all)
 */
export function invalidateCache(userIds?: string[]): void {
  if (!userIds || userIds.length === 0) {
    // Clear all cache
    publicKeyCache.clear();
    
    // Clear persistent cache
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));
    
    console.log(`✅ [PublicKeyService] Cleared all cached public keys`);
  } else {
    // Clear specific users
    userIds.forEach(userId => {
      publicKeyCache.delete(userId);
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
    });
    
    console.log(`✅ [PublicKeyService] Invalidated cache for ${userIds.length} users`);
  }
}

/**
 * Refresh cache for specific user(s)
 * Force fetch from API and update cache
 * 
 * @param userIds User IDs to refresh
 */
export async function refreshCache(userIds: string[]): Promise<void> {
  await getPublicKeys(userIds, { force: true });
  console.log(`✅ [PublicKeyService] Refreshed cache for ${userIds.length} users`);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  memoryCount: number;
  persistentCount: number;
  totalSize: number;
} {
  const memoryCount = publicKeyCache.size;
  
  let persistentCount = 0;
  let totalSize = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_KEY_PREFIX)) {
      persistentCount++;
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += value.length;
      }
    }
  }
  
  return {
    memoryCount,
    persistentCount,
    totalSize,
  };
}

/**
 * Clean expired cache entries
 */
export function cleanExpiredCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_KEY_PREFIX)) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const serialized: SerializedPublicKeyInfo = JSON.parse(stored);
          const age = now - serialized.fetchedAt;
          
          if (age > CACHE_EXPIRY_MS) {
            keysToDelete.push(key);
          }
        } catch {
          // Invalid entry, delete it
          keysToDelete.push(key);
        }
      }
    }
  }
  
  keysToDelete.forEach(key => localStorage.removeItem(key));
  
  if (keysToDelete.length > 0) {
    console.log(`✅ [PublicKeyService] Cleaned ${keysToDelete.length} expired cache entries`);
  }
}

// Auto-clean expired cache on module load
cleanExpiredCache();
