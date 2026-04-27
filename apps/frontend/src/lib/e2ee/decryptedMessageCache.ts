/**
 * Decrypted Message Cache (privacy-l1)
 *
 * Why this cache exists:
 *   1. The Double Ratchet protocol consumes a message key on each
 *      decryption — re-decrypting the same envelope fails. We must
 *      remember the plaintext after the first successful decryption.
 *   2. Decrypting on every render is wasteful — even when the ratchet
 *      tolerates it (e2ee-v2 / sender-copy / NaCl-Box), libsodium calls
 *      from the main thread are not free.
 *
 * Where the plaintext lives:
 *   - In-memory `Map` for SYNCHRONOUS reads from the UI hot path.
 *   - Encrypted IndexedDB (`KeyVault`, sealed by the user's master key)
 *     for persistence across sessions.
 *
 * Why this layout:
 *   The pre-l1 implementation stored plaintext in `localStorage` in
 *   clear, which contradicted CIPHER_PRIVACY_GUARANTEES.md. Migrating
 *   the storage to KeyVault makes the doc honest. We keep a memory
 *   layer on top so existing call sites don't have to become async.
 *
 * Threat model:
 *   An attacker with filesystem access to the device but WITHOUT the
 *   user's password sees only opaque ciphertext (the vault is sealed
 *   by PBKDF2-SHA256 600k of the password). Once the user has unlocked
 *   the vault in this session, the in-memory plaintext is reachable
 *   from the renderer process — same residual exposure as any other
 *   wallet during an active session. Locking / closing the app drops
 *   the memory layer; the encrypted vault entries persist for the next
 *   unlock unless explicitly cleared (logout).
 *
 * Lifecycle:
 *   1. After login (vault unlocked), call `hydrateCacheFromVault()` to
 *      populate the in-memory map from the persisted entries.
 *   2. UI calls `cacheDecryptedMessage()` and `getCachedDecryptedMessage()`
 *      synchronously — vault writes are fire-and-forget in the background.
 *   3. On logout, call `clearAllDecryptedCache()` (sync) and optionally
 *      `await flushPendingWrites()` if you need a hard guarantee that
 *      no further writes will land in the vault.
 */

import { getExistingE2EEVault } from '../keyVault';
import { debugLogger } from '../debugLogger';

const CACHE_KEY_PREFIX = 'e2ee:decrypted:';
const CACHE_INDEX_KEY = 'e2ee:decrypted:index';

interface CachedMessage {
  messageId: string;
  conversationId: string;
  plaintext: string;
  decryptedAt: number;
}

// ============================================================================
// IN-MEMORY LAYER (synchronous)
// ============================================================================

const memoryCache = new Map<string, CachedMessage>();
let hydrated = false;

// Tracks every async vault operation kicked off by a sync API call so
// callers (logout flow, tests) can `await flushPendingWrites()` for a
// hard guarantee.
const pendingWrites = new Set<Promise<void>>();

function trackPending(promise: Promise<void>): void {
  pendingWrites.add(promise);
  promise.finally(() => pendingWrites.delete(promise));
}

// ============================================================================
// VAULT LAYER (async, best-effort)
// ============================================================================

/**
 * Persist a single cache entry to the vault. Best-effort — failures are
 * logged but never thrown. The in-memory copy already succeeded by the
 * time this runs.
 */
async function persistEntry(messageId: string, cached: CachedMessage): Promise<void> {
  const vault = getExistingE2EEVault();
  if (!vault) {
    // No vault open in this session — keep memory-only, like the pre-l1
    // sessionStorage fallback. Hydration will not bring it back, which
    // matches the prior behavior.
    return;
  }

  try {
    await vault.storeData(`${CACHE_KEY_PREFIX}${messageId}`, JSON.stringify(cached));
    await pushToIndex(vault, messageId);
  } catch (err) {
    debugLogger.warn('[CACHE] Vault persist failed', { messageId, err });
  }
}

async function removeEntry(messageId: string): Promise<void> {
  const vault = getExistingE2EEVault();
  if (!vault) return;

  try {
    await vault.removeData(`${CACHE_KEY_PREFIX}${messageId}`);
    await dropFromIndex(vault, messageId);
  } catch (err) {
    debugLogger.warn('[CACHE] Vault remove failed', { messageId, err });
  }
}

async function readIndex(vault: NonNullable<ReturnType<typeof getExistingE2EEVault>>): Promise<string[]> {
  try {
    const raw = await vault.getData(CACHE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIndex(
  vault: NonNullable<ReturnType<typeof getExistingE2EEVault>>,
  ids: string[]
): Promise<void> {
  await vault.storeData(CACHE_INDEX_KEY, JSON.stringify(ids));
}

async function pushToIndex(
  vault: NonNullable<ReturnType<typeof getExistingE2EEVault>>,
  messageId: string
): Promise<void> {
  const current = await readIndex(vault);
  if (current.includes(messageId)) return;
  current.push(messageId);
  await writeIndex(vault, current);
}

async function dropFromIndex(
  vault: NonNullable<ReturnType<typeof getExistingE2EEVault>>,
  messageId: string
): Promise<void> {
  const current = await readIndex(vault);
  const next = current.filter((id) => id !== messageId);
  if (next.length === current.length) return;
  await writeIndex(vault, next);
}

// ============================================================================
// PUBLIC API — synchronous, mirrors the pre-l1 surface
// ============================================================================

/**
 * Hydrate the in-memory cache from the encrypted vault. Idempotent — a
 * second call is a no-op. Callers should invoke this once per session
 * after the KeyVault has been unlocked (login / quick-unlock / signup).
 */
export async function hydrateCacheFromVault(): Promise<void> {
  if (hydrated) return;
  const vault = getExistingE2EEVault();
  if (!vault) {
    // No vault open yet — try again later. Don't mark as hydrated so a
    // subsequent call after vault unlock can still run.
    return;
  }

  try {
    const ids = await readIndex(vault);
    let loaded = 0;
    for (const messageId of ids) {
      const raw = await vault.getData(`${CACHE_KEY_PREFIX}${messageId}`);
      if (!raw) continue;
      try {
        const cached = JSON.parse(raw) as CachedMessage;
        memoryCache.set(messageId, cached);
        loaded++;
      } catch {
        // Skip malformed entry but keep going
      }
    }
    hydrated = true;
    debugLogger.debug('[CACHE] Hydrated from vault', { loaded });
  } catch (err) {
    debugLogger.warn('[CACHE] Hydration failed', { err });
  }
}

/**
 * Store a decrypted message in cache (sync).
 * In-memory write is immediate; vault persistence is fired in the
 * background. Callers don't need to await — the next sync read will
 * see the value, and the vault catches up shortly after.
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

  memoryCache.set(messageId, cached);
  trackPending(persistEntry(messageId, cached));
}

/**
 * Get a cached decrypted message (sync). Returns null if not cached
 * in memory. If the cache has not been hydrated yet, vault entries
 * are invisible — call `hydrateCacheFromVault()` once after login.
 */
export function getCachedDecryptedMessage(messageId: string): string | null {
  const cached = memoryCache.get(messageId);
  return cached ? cached.plaintext : null;
}

/**
 * Check if a message is in the in-memory cache.
 */
export function isMessageCached(messageId: string): boolean {
  return memoryCache.has(messageId);
}

/**
 * Clear cache for a specific message (e.g. after burn). Sync update,
 * background vault wipe.
 */
export function clearMessageCache(messageId: string): void {
  memoryCache.delete(messageId);
  trackPending(removeEntry(messageId));
}

/**
 * Clear cache for a specific conversation. Sync update, background
 * vault wipe.
 */
export function clearConversationCache(conversationId: string): void {
  const targets: string[] = [];
  for (const [messageId, cached] of memoryCache) {
    if (cached.conversationId === conversationId) {
      targets.push(messageId);
    }
  }
  for (const messageId of targets) {
    memoryCache.delete(messageId);
  }
  trackPending(
    (async () => {
      for (const messageId of targets) {
        await removeEntry(messageId);
      }
    })()
  );
}

/**
 * Clear all decrypted cache (logout / session reset).
 *
 * Hard guarantee: callers that want to be sure no entry survives the
 * call should `await flushPendingWrites()` after this. The hydrated
 * flag is reset so the next session can re-populate from a fresh vault.
 */
export function clearAllDecryptedCache(): void {
  const targets = Array.from(memoryCache.keys());
  memoryCache.clear();
  hydrated = false;

  trackPending(
    (async () => {
      const vault = getExistingE2EEVault();
      if (!vault) return;
      for (const messageId of targets) {
        try {
          await vault.removeData(`${CACHE_KEY_PREFIX}${messageId}`);
        } catch {
          // best-effort
        }
      }
      try {
        await vault.removeData(CACHE_INDEX_KEY);
      } catch {
        // best-effort
      }
    })()
  );
}

/**
 * Wait for every fire-and-forget vault operation kicked off by the
 * sync APIs above to settle. Useful in logout flows that want to be
 * sure the vault is clean before tearing down the session, and in
 * tests that need deterministic ordering.
 */
export async function flushPendingWrites(): Promise<void> {
  while (pendingWrites.size > 0) {
    await Promise.allSettled(Array.from(pendingWrites));
  }
}

/**
 * Get cache statistics from the in-memory layer.
 */
export function getCacheStats(): { count: number; oldestAt: number | null } {
  let oldestAt: number | null = null;
  for (const cached of memoryCache.values()) {
    if (oldestAt === null || cached.decryptedAt < oldestAt) {
      oldestAt = cached.decryptedAt;
    }
  }
  return { count: memoryCache.size, oldestAt };
}
