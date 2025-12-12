/**
 * Tests for PublicKeyService (e2ee-v2)
 * 
 * Tests:
 * - Public key fetching
 * - Cache management (memory + persistent)
 * - Conversation participant keys
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPublicKey,
  getPublicKeys,
  getConversationParticipantKeys,
  preloadPublicKeys,
  invalidateCache,
  getCacheStats,
  cleanExpiredCache,
} from '../publicKeyService';
import type { PublicKeyInfo } from '../publicKeyService';
import _sodium from 'libsodium-wrappers';
import * as api from '../../../services/api-v2';

// Mock API
vi.mock('../../../services/api-v2', () => ({
  getPublicKeys: vi.fn(),
  getConversationMembers: vi.fn(),
}));

// Helper to generate mock key
async function generateMockPublicKey(userId: string, username: string): Promise<PublicKeyInfo> {
  await _sodium.ready;
  const keypair = _sodium.crypto_box_keypair();
  const signKeypair = _sodium.crypto_sign_keypair();

  return {
    userId,
    username,
    publicKey: keypair.publicKey,
    signPublicKey: signKeypair.publicKey,
    fetchedAt: Date.now(),
  };
}

describe('PublicKeyService - Fetching', () => {
  beforeEach(async () => {
    await _sodium.ready;
    invalidateCache(); // Clear cache before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateCache();
  });

  it('should fetch single public key from API', async () => {
    const mockKey = await generateMockPublicKey('user1', 'alice');

    // Mock API response
    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey.userId,
          username: mockKey.username,
          publicKey: _sodium.to_base64(mockKey.publicKey),
          signPublicKey: _sodium.to_base64(mockKey.signPublicKey),
        },
      ],
    });

    const result = await getPublicKey('user1');

    // Verify API was called
    expect(api.getPublicKeys).toHaveBeenCalledWith(['user1']);

    // Verify result
    expect(result).toBeDefined();
    expect(result!.userId).toBe('user1');
    expect(result!.username).toBe('alice');
    expect(result!.publicKey).toBeInstanceOf(Uint8Array);
    expect(result!.signPublicKey).toBeInstanceOf(Uint8Array);
  });

  it('should fetch multiple public keys from API', async () => {
    const mockKey1 = await generateMockPublicKey('user1', 'alice');
    const mockKey2 = await generateMockPublicKey('user2', 'bob');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey1.userId,
          username: mockKey1.username,
          publicKey: _sodium.to_base64(mockKey1.publicKey),
          signPublicKey: _sodium.to_base64(mockKey1.signPublicKey),
        },
        {
          userId: mockKey2.userId,
          username: mockKey2.username,
          publicKey: _sodium.to_base64(mockKey2.publicKey),
          signPublicKey: _sodium.to_base64(mockKey2.signPublicKey),
        },
      ],
    });

    const results = await getPublicKeys(['user1', 'user2']);

    expect(api.getPublicKeys).toHaveBeenCalledWith(['user1', 'user2']);
    expect(results).toHaveLength(2);
    expect(results[0].userId).toBe('user1');
    expect(results[1].userId).toBe('user2');
  });

  it('should return empty array for empty input', async () => {
    const results = await getPublicKeys([]);

    expect(api.getPublicKeys).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('should return null for non-existent user', async () => {
    vi.mocked(api.getPublicKeys).mockResolvedValue({ keys: [] });

    const result = await getPublicKey('non-existent-user');

    expect(result).toBeNull();
  });

  it('should handle API errors gracefully', async () => {
    vi.mocked(api.getPublicKeys).mockRejectedValue(
      new Error('Network error')
    );

    await expect(getPublicKey('user1')).rejects.toThrow(/failed to fetch/i);
  });
});

describe('PublicKeyService - Cache (Memory)', () => {
  beforeEach(async () => {
    await _sodium.ready;
    invalidateCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateCache();
  });

  it('should cache keys in memory after first fetch', async () => {
    const mockKey = await generateMockPublicKey('user1', 'alice');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey.userId,
          username: mockKey.username,
          publicKey: _sodium.to_base64(mockKey.publicKey),
          signPublicKey: _sodium.to_base64(mockKey.signPublicKey),
        },
      ],
    });

    // First call - should hit API
    await getPublicKey('user1');
    expect(api.getPublicKeys).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    await getPublicKey('user1');
    expect(api.getPublicKeys).toHaveBeenCalledTimes(1); // Still 1, not called again

    // Verify cache stats
    const stats = getCacheStats();
    expect(stats.memoryCount).toBe(1);
  });

  it('should use cache for batch requests', async () => {
    const mockKey1 = await generateMockPublicKey('user1', 'alice');
    const mockKey2 = await generateMockPublicKey('user2', 'bob');

    vi.mocked(api.getPublicKeys)
      .mockResolvedValueOnce({
        keys: [
          {
            userId: mockKey1.userId,
            username: mockKey1.username,
            publicKey: _sodium.to_base64(mockKey1.publicKey),
            signPublicKey: _sodium.to_base64(mockKey1.signPublicKey),
          },
        ],
      })
      .mockResolvedValueOnce({
        keys: [
          {
            userId: mockKey2.userId,
            username: mockKey2.username,
            publicKey: _sodium.to_base64(mockKey2.publicKey),
            signPublicKey: _sodium.to_base64(mockKey2.signPublicKey),
          },
        ],
      });

    // Fetch user1
    await getPublicKey('user1');

    // Fetch both (user1 should be cached, only user2 fetched)
    await getPublicKeys(['user1', 'user2']);

    // API should be called twice total (once for user1, once for user2)
    expect(api.getPublicKeys).toHaveBeenCalledTimes(2);
    expect(api.getPublicKeys).toHaveBeenNthCalledWith(1, ['user1']);
    expect(api.getPublicKeys).toHaveBeenNthCalledWith(2, ['user2']);
  });

  it('should force refresh when force option is true', async () => {
    const mockKey = await generateMockPublicKey('user1', 'alice');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey.userId,
          username: mockKey.username,
          publicKey: _sodium.to_base64(mockKey.publicKey),
          signPublicKey: _sodium.to_base64(mockKey.signPublicKey),
        },
      ],
    });

    // First call
    await getPublicKey('user1');
    expect(api.getPublicKeys).toHaveBeenCalledTimes(1);

    // Force refresh
    await getPublicKey('user1', { force: true });
    expect(api.getPublicKeys).toHaveBeenCalledTimes(2);
  });
});

describe('PublicKeyService - Cache (Persistent)', () => {
  beforeEach(async () => {
    await _sodium.ready;
    invalidateCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateCache();
  });

  it('should persist cache to localStorage', async () => {
    const mockKey = await generateMockPublicKey('user1', 'alice');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey.userId,
          username: mockKey.username,
          publicKey: _sodium.to_base64(mockKey.publicKey),
          signPublicKey: _sodium.to_base64(mockKey.signPublicKey),
        },
      ],
    });

    await getPublicKey('user1');

    // Check localStorage
    const stored = localStorage.getItem('cipher-pulse-pubkey:user1');
    expect(stored).toBeDefined();

    const parsed = JSON.parse(stored!);
    expect(parsed.userId).toBe('user1');
    expect(parsed.username).toBe('alice');
    expect(parsed.publicKey).toBeDefined();
    expect(parsed.fetchedAt).toBeGreaterThan(0);
  });

  it('should load from persistent cache after memory cache is cleared', async () => {
    const mockKey = await generateMockPublicKey('user1', 'alice');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey.userId,
          username: mockKey.username,
          publicKey: _sodium.to_base64(mockKey.publicKey),
          signPublicKey: _sodium.to_base64(mockKey.signPublicKey),
        },
      ],
    });

    // First fetch - populates both caches
    await getPublicKey('user1');
    expect(api.getPublicKeys).toHaveBeenCalledTimes(1);

    // Simulate page reload - clear memory cache but keep localStorage
    vi.resetModules();
    const reloaded = await import('../publicKeyService');
    
    // Second fetch - should load from localStorage, not API
    await reloaded.getPublicKey('user1');
    expect(api.getPublicKeys).toHaveBeenCalledTimes(1); // Still 1

    const stats = reloaded.getCacheStats();
    expect(stats.persistentCount).toBe(1);
  });
});

describe('PublicKeyService - Cache Expiry', () => {
  beforeEach(async () => {
    await _sodium.ready;
    invalidateCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateCache();
  });

  it('should expire old cache entries', async () => {
    // Manually create an expired cache entry
    const expiredKey = {
      userId: 'expired-user',
      username: 'expired',
      publicKey: _sodium.to_base64(_sodium.randombytes_buf(32)),
      signPublicKey: _sodium.to_base64(_sodium.randombytes_buf(32)),
      fetchedAt: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
    };

    localStorage.setItem(
      'cipher-pulse-pubkey:expired-user',
      JSON.stringify(expiredKey)
    );

    // Clean expired cache
    cleanExpiredCache();

    // Entry should be removed
    const stored = localStorage.getItem('cipher-pulse-pubkey:expired-user');
    expect(stored).toBeNull();
  });

  it('should not expire recent cache entries', async () => {
    const recentKey = {
      userId: 'recent-user',
      username: 'recent',
      publicKey: _sodium.to_base64(_sodium.randombytes_buf(32)),
      signPublicKey: _sodium.to_base64(_sodium.randombytes_buf(32)),
      fetchedAt: Date.now() - (1 * 60 * 60 * 1000), // 1 hour ago
    };

    localStorage.setItem(
      'cipher-pulse-pubkey:recent-user',
      JSON.stringify(recentKey)
    );

    // Clean expired cache
    cleanExpiredCache();

    // Entry should still exist
    const stored = localStorage.getItem('cipher-pulse-pubkey:recent-user');
    expect(stored).not.toBeNull();
  });
});

describe('PublicKeyService - Cache Invalidation', () => {
  beforeEach(async () => {
    await _sodium.ready;
    invalidateCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateCache();
  });

  it('should invalidate specific user cache', async () => {
    const mockKey1 = await generateMockPublicKey('user1', 'alice');
    const mockKey2 = await generateMockPublicKey('user2', 'bob');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey1.userId,
          username: mockKey1.username,
          publicKey: _sodium.to_base64(mockKey1.publicKey),
          signPublicKey: _sodium.to_base64(mockKey1.signPublicKey),
        },
        {
          userId: mockKey2.userId,
          username: mockKey2.username,
          publicKey: _sodium.to_base64(mockKey2.publicKey),
          signPublicKey: _sodium.to_base64(mockKey2.signPublicKey),
        },
      ],
    });

    // Fetch both
    await getPublicKeys(['user1', 'user2']);

    // Invalidate user1
    invalidateCache(['user1']);

    // user1 should be removed from cache
    const stats = getCacheStats();
    expect(stats.memoryCount).toBe(1); // Only user2 remains
  });

  it('should invalidate all cache when no userIds provided', async () => {
    const mockKey = await generateMockPublicKey('user1', 'alice');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey.userId,
          username: mockKey.username,
          publicKey: _sodium.to_base64(mockKey.publicKey),
          signPublicKey: _sodium.to_base64(mockKey.signPublicKey),
        },
      ],
    });

    await getPublicKey('user1');

    let stats = getCacheStats();
    expect(stats.memoryCount).toBeGreaterThan(0);

    // Invalidate all
    invalidateCache();

    stats = getCacheStats();
    expect(stats.memoryCount).toBe(0);
    expect(stats.persistentCount).toBe(0);
  });
});

describe('PublicKeyService - Conversation Participants', () => {
  beforeEach(async () => {
    await _sodium.ready;
    invalidateCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateCache();
  });

  it('should fetch conversation participant keys', async () => {
    const mockKey1 = await generateMockPublicKey('user1', 'alice');
    const mockKey2 = await generateMockPublicKey('user2', 'bob');

    // Mock conversation members API
    vi.mocked(api.getConversationMembers).mockResolvedValue([
      { userId: 'user1', username: 'alice' },
      { userId: 'user2', username: 'bob' },
    ]);

    // Mock public keys API
    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey1.userId,
          username: mockKey1.username,
          publicKey: _sodium.to_base64(mockKey1.publicKey),
          signPublicKey: _sodium.to_base64(mockKey1.signPublicKey),
        },
        {
          userId: mockKey2.userId,
          username: mockKey2.username,
          publicKey: _sodium.to_base64(mockKey2.publicKey),
          signPublicKey: _sodium.to_base64(mockKey2.signPublicKey),
        },
      ],
    });

    const keys = await getConversationParticipantKeys('conv-123');

    expect(api.getConversationMembers).toHaveBeenCalledWith('conv-123');
    expect(api.getPublicKeys).toHaveBeenCalledWith(['user1', 'user2']);
    expect(keys).toHaveLength(2);
    expect(keys[0].userId).toBe('user1');
    expect(keys[1].userId).toBe('user2');
  });

  it('should handle conversation API errors', async () => {
    vi.mocked(api.getConversationMembers).mockRejectedValue(
      new Error('Conversation not found')
    );

    await expect(
      getConversationParticipantKeys('invalid-conv')
    ).rejects.toThrow(/failed to get participant keys/i);
  });
});

describe('PublicKeyService - Preloading', () => {
  beforeEach(async () => {
    await _sodium.ready;
    invalidateCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateCache();
  });

  it('should preload multiple keys', async () => {
    const mockKey1 = await generateMockPublicKey('user1', 'alice');
    const mockKey2 = await generateMockPublicKey('user2', 'bob');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey1.userId,
          username: mockKey1.username,
          publicKey: _sodium.to_base64(mockKey1.publicKey),
          signPublicKey: _sodium.to_base64(mockKey1.signPublicKey),
        },
        {
          userId: mockKey2.userId,
          username: mockKey2.username,
          publicKey: _sodium.to_base64(mockKey2.publicKey),
          signPublicKey: _sodium.to_base64(mockKey2.signPublicKey),
        },
      ],
    });

    await preloadPublicKeys(['user1', 'user2']);

    expect(api.getPublicKeys).toHaveBeenCalledWith(['user1', 'user2']);

    const stats = getCacheStats();
    expect(stats.memoryCount).toBe(2);
  });

  it('should not throw on preload errors', async () => {
    vi.mocked(api.getPublicKeys).mockRejectedValue(
      new Error('Network error')
    );

    // Should not throw
    await expect(
      preloadPublicKeys(['user1'])
    ).resolves.toBeUndefined();
  });
});

describe('PublicKeyService - Cache Stats', () => {
  beforeEach(async () => {
    await _sodium.ready;
    invalidateCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateCache();
  });

  it('should report accurate cache statistics', async () => {
    const mockKey1 = await generateMockPublicKey('user1', 'alice');
    const mockKey2 = await generateMockPublicKey('user2', 'bob');

    vi.mocked(api.getPublicKeys).mockResolvedValue({
      keys: [
        {
          userId: mockKey1.userId,
          username: mockKey1.username,
          publicKey: _sodium.to_base64(mockKey1.publicKey),
          signPublicKey: _sodium.to_base64(mockKey1.signPublicKey),
        },
        {
          userId: mockKey2.userId,
          username: mockKey2.username,
          publicKey: _sodium.to_base64(mockKey2.publicKey),
          signPublicKey: _sodium.to_base64(mockKey2.signPublicKey),
        },
      ],
    });

    await getPublicKeys(['user1', 'user2']);

    const stats = getCacheStats();
    expect(stats.memoryCount).toBe(2);
    expect(stats.persistentCount).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
  });
});
