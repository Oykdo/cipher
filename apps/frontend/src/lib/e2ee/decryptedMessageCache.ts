/**
 * Decrypted Message Cache
 * 
 * CRITICAL: The Double Ratchet protocol is stateful - each decryption operation
 * consumes the message key and advances the ratchet. If we try to decrypt the
 * same message twice, the key has already been "used up" and decryption fails.
 * 
 * This cache stores successfully decrypted messages to prevent re-decryption
 * attempts that would fail due to ratchet state advancement.
 * 
 * Storage: localStorage (persists across sessions so sender can see their own messages)
 * NOTE: Messages are stored locally on your device. Clear on logout for security.
 */

const CACHE_KEY_PREFIX = 'e2ee:decrypted:';
const CACHE_INDEX_KEY = 'e2ee:decrypted:index';

// Use localStorage instead of sessionStorage for persistence across browser sessions
const storage = localStorage;

interface CachedMessage {
  messageId: string;
  conversationId: string;
  plaintext: string;
  decryptedAt: number;
}

/**
 * Get the cache index (list of all cached message IDs)
 */
function getCacheIndex(): string[] {
  try {
    const index = storage.getItem(CACHE_INDEX_KEY);
    return index ? JSON.parse(index) : [];
  } catch {
    return [];
  }
}

/**
 * Update the cache index
 */
function updateCacheIndex(messageIds: string[]): void {
  storage.setItem(CACHE_INDEX_KEY, JSON.stringify(messageIds));
}

/**
 * Store a decrypted message in cache
 */
export function cacheDecryptedMessage(
  messageId: string,
  conversationId: string,
  plaintext: string
): void {
  const cached: CachedMessage = {
    messageId,
    conversationId,
    plaintext,
    decryptedAt: Date.now(),
  };

  const key = `${CACHE_KEY_PREFIX}${messageId}`;
  storage.setItem(key, JSON.stringify(cached));

  // Update index
  const index = getCacheIndex();
  if (!index.includes(messageId)) {
    index.push(messageId);
    updateCacheIndex(index);
  }
}

/**
 * Get a cached decrypted message
 * Returns null if not in cache
 */
export function getCachedDecryptedMessage(messageId: string): string | null {
  const key = `${CACHE_KEY_PREFIX}${messageId}`;
  const cached = storage.getItem(key);

  if (!cached) {
    return null;
  }

  try {
    const data: CachedMessage = JSON.parse(cached);
    return data.plaintext;
  } catch {
    return null;
  }
}

/**
 * Check if a message is in the cache
 */
export function isMessageCached(messageId: string): boolean {
  const key = `${CACHE_KEY_PREFIX}${messageId}`;
  return storage.getItem(key) !== null;
}

/**
 * Clear cache for a specific conversation
 */
export function clearConversationCache(conversationId: string): void {
  const index = getCacheIndex();
  const newIndex: string[] = [];

  for (const messageId of index) {
    const key = `${CACHE_KEY_PREFIX}${messageId}`;
    const cached = storage.getItem(key);

    if (cached) {
      try {
        const data: CachedMessage = JSON.parse(cached);
        if (data.conversationId === conversationId) {
          storage.removeItem(key);
        } else {
          newIndex.push(messageId);
        }
      } catch {
        storage.removeItem(key);
      }
    }
  }

  updateCacheIndex(newIndex);
}

/**
 * Clear all decrypted message cache
 * Called on logout or session reset
 */
export function clearAllDecryptedCache(): void {
  const index = getCacheIndex();

  for (const messageId of index) {
    const key = `${CACHE_KEY_PREFIX}${messageId}`;
    storage.removeItem(key);
  }

  storage.removeItem(CACHE_INDEX_KEY);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { count: number; oldestAt: number | null } {
  const index = getCacheIndex();
  let oldestAt: number | null = null;

  for (const messageId of index) {
    const key = `${CACHE_KEY_PREFIX}${messageId}`;
    const cached = storage.getItem(key);

    if (cached) {
      try {
        const data: CachedMessage = JSON.parse(cached);
        if (oldestAt === null || data.decryptedAt < oldestAt) {
          oldestAt = data.decryptedAt;
        }
      } catch {
        // Skip invalid entries
      }
    }
  }

  return { count: index.length, oldestAt };
}
