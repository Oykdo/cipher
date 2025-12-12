/**
 * Tests for KeyManager (e2ee-v2)
 * 
 * Tests:
 * - Key generation
 * - Secure storage and retrieval
 * - Key deletion
 * - Backup export/import
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateUserKeys,
  storeUserKeys,
  loadUserKeys,
  deleteUserKeys,
  hasUserKeys,
  getPublicKeys,
  exportSecureBackup,
  importSecureBackup,
  clearAllKeys,
  getKeyStats,
} from '../keyManager';
import _sodium from 'libsodium-wrappers';

describe('KeyManager - Key Generation', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should generate valid key pair with correct structure', async () => {
    const userId = 'test-user-123';
    const username = 'testuser';

    const keys = await generateUserKeys(userId, username);

    // Validate structure
    expect(keys).toBeDefined();
    expect(keys.userId).toBe(userId);
    expect(keys.username).toBe(username);
    expect(keys.version).toBe('key-v1');
    expect(keys.createdAt).toBeGreaterThan(0);

    // Validate key types and lengths
    expect(keys.publicKey).toBeInstanceOf(Uint8Array);
    expect(keys.privateKey).toBeInstanceOf(Uint8Array);
    expect(keys.signPublicKey).toBeInstanceOf(Uint8Array);
    expect(keys.signPrivateKey).toBeInstanceOf(Uint8Array);

    // Curve25519 keys are 32 bytes
    expect(keys.publicKey.length).toBe(32);
    expect(keys.privateKey.length).toBe(32);

    // Ed25519 keys are 32 bytes (public) and 64 bytes (private)
    expect(keys.signPublicKey.length).toBe(32);
    expect(keys.signPrivateKey.length).toBe(64);
  });

  it('should generate unique keys for each call', async () => {
    const keys1 = await generateUserKeys('user1', 'username1');
    const keys2 = await generateUserKeys('user2', 'username2');

    // Keys should be different
    expect(_sodium.to_base64(keys1.publicKey)).not.toBe(_sodium.to_base64(keys2.publicKey));
    expect(_sodium.to_base64(keys1.privateKey)).not.toBe(_sodium.to_base64(keys2.privateKey));
    expect(_sodium.to_base64(keys1.signPublicKey)).not.toBe(_sodium.to_base64(keys2.signPublicKey));
    expect(_sodium.to_base64(keys1.signPrivateKey)).not.toBe(_sodium.to_base64(keys2.signPrivateKey));
  });
});

describe('KeyManager - Storage', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should store and load keys correctly', async () => {
    const userId = 'test-user-456';
    const username = 'storetest';
    const keys = await generateUserKeys(userId, username);

    // Store keys
    await storeUserKeys(keys);

    // Verify storage
    expect(hasUserKeys(userId)).toBe(true);

    // Load keys
    const loaded = await loadUserKeys(userId);

    // Verify loaded keys match original
    expect(loaded).toBeDefined();
    expect(loaded!.userId).toBe(keys.userId);
    expect(loaded!.username).toBe(keys.username);
    expect(_sodium.to_base64(loaded!.publicKey)).toBe(_sodium.to_base64(keys.publicKey));
    expect(_sodium.to_base64(loaded!.privateKey)).toBe(_sodium.to_base64(keys.privateKey));
    expect(_sodium.to_base64(loaded!.signPublicKey)).toBe(_sodium.to_base64(keys.signPublicKey));
    expect(_sodium.to_base64(loaded!.signPrivateKey)).toBe(_sodium.to_base64(keys.signPrivateKey));
  });

  it('should set current user when storing keys', async () => {
    const userId = 'current-user-789';
    const username = 'currentuser';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);

    // Current user should be set
    const currentUserId = localStorage.getItem('cipher-pulse-current-user');
    expect(currentUserId).toBe(userId);

    // Load without specifying userId (should use current user)
    const loaded = await loadUserKeys();
    expect(loaded).toBeDefined();
    expect(loaded!.userId).toBe(userId);
  });

  it('should return null when loading non-existent keys', async () => {
    const loaded = await loadUserKeys('non-existent-user');
    expect(loaded).toBeNull();
  });

  it('should store private keys encrypted', async () => {
    const userId = 'encrypted-test';
    const username = 'encrypttest';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);

    // Check localStorage - private keys should NOT be stored in plaintext
    const storageKey = `cipher-pulse-keys:${userId}`;
    const stored = localStorage.getItem(storageKey);
    expect(stored).toBeDefined();

    const parsed = JSON.parse(stored!);
    
    // Public keys should be readable base64
    const publicKeyB64 = _sodium.to_base64(keys.publicKey);
    expect(parsed.publicKey).toBe(publicKeyB64);

    // Private keys should be encrypted (different from original base64)
    const privateKeyB64 = _sodium.to_base64(keys.privateKey);
    expect(parsed.privateKey).not.toBe(privateKeyB64);
    expect(parsed.privateKey).toMatch(/^[A-Za-z0-9+/_-]+=*$/);
  });
});

describe('KeyManager - Deletion', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should delete keys correctly', async () => {
    const userId = 'delete-test';
    const username = 'deleteuser';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);
    expect(hasUserKeys(userId)).toBe(true);

    deleteUserKeys(userId);
    expect(hasUserKeys(userId)).toBe(false);

    const loaded = await loadUserKeys(userId);
    expect(loaded).toBeNull();
  });

  it('should clear current user reference when deleting current user', async () => {
    const userId = 'current-delete-test';
    const username = 'currentdeleteuser';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);
    expect(localStorage.getItem('cipher-pulse-current-user')).toBe(userId);

    deleteUserKeys(userId);
    expect(localStorage.getItem('cipher-pulse-current-user')).toBeNull();
  });

  it('should clear all keys', async () => {
    // Generate and store multiple users
    const user1 = await generateUserKeys('user1', 'username1');
    const user2 = await generateUserKeys('user2', 'username2');
    const user3 = await generateUserKeys('user3', 'username3');

    await storeUserKeys(user1);
    await storeUserKeys(user2);
    await storeUserKeys(user3);

    expect(hasUserKeys('user1')).toBe(true);
    expect(hasUserKeys('user2')).toBe(true);
    expect(hasUserKeys('user3')).toBe(true);

    clearAllKeys();

    expect(hasUserKeys('user1')).toBe(false);
    expect(hasUserKeys('user2')).toBe(false);
    expect(hasUserKeys('user3')).toBe(false);
    expect(localStorage.getItem('cipher-pulse-current-user')).toBeNull();
  });
});

describe('KeyManager - Public Keys', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should retrieve public keys without decryption', async () => {
    const userId = 'pubkey-test';
    const username = 'pubkeyuser';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);

    // Get public keys (should not require master key decryption)
    const pubKeys = getPublicKeys(userId);

    expect(pubKeys).toBeDefined();
    expect(pubKeys!.userId).toBe(userId);
    expect(_sodium.to_base64(pubKeys!.publicKey)).toBe(_sodium.to_base64(keys.publicKey));
    expect(_sodium.to_base64(pubKeys!.signPublicKey)).toBe(_sodium.to_base64(keys.signPublicKey));
  });

  it('should return null for non-existent public keys', () => {
    const pubKeys = getPublicKeys('non-existent');
    expect(pubKeys).toBeNull();
  });
});

describe('KeyManager - Backup & Restore', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should export secure backup', async () => {
    const userId = 'backup-test';
    const username = 'backupuser';
    const password = 'strong-password-123';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);

    const backupJson = await exportSecureBackup(password);

    // Backup should be valid JSON
    const backup = JSON.parse(backupJson);
    expect(backup.version).toBe('cipher-pulse-backup-v1');
    expect(backup.salt).toBeDefined();
    expect(backup.iv).toBeDefined();
    expect(backup.encrypted).toBeDefined();
    expect(backup.exportedAt).toBeGreaterThan(0);

    // Encrypted data should be base64
    expect(backup.encrypted).toMatch(/^[A-Za-z0-9+/_-]+=*$/);
  });

  it('should restore keys from backup with correct password', async () => {
    const userId = 'restore-test';
    const username = 'restoreuser';
    const password = 'my-secure-password-456';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);

    // Export backup
    const backupJson = await exportSecureBackup(password);

    // Clear all keys (simulate device loss)
    clearAllKeys();
    expect(hasUserKeys(userId)).toBe(false);

    // Restore from backup
    await importSecureBackup(backupJson, password);

    // Verify keys were restored
    expect(hasUserKeys(userId)).toBe(true);
    const restored = await loadUserKeys(userId);

    expect(restored).toBeDefined();
    expect(restored!.userId).toBe(keys.userId);
    expect(restored!.username).toBe(keys.username);
    expect(_sodium.to_base64(restored!.publicKey)).toBe(_sodium.to_base64(keys.publicKey));
    expect(_sodium.to_base64(restored!.privateKey)).toBe(_sodium.to_base64(keys.privateKey));
  });

  it('should fail to restore with incorrect password', async () => {
    const userId = 'wrong-password-test';
    const username = 'wrongpassword';
    const correctPassword = 'correct-password-789';
    const wrongPassword = 'wrong-password-000';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);

    // Export backup with correct password
    const backupJson = await exportSecureBackup(correctPassword);

    clearAllKeys();

    // Try to restore with wrong password
    await expect(
      importSecureBackup(backupJson, wrongPassword)
    ).rejects.toThrow(/incorrect password/i);

    // Keys should not be restored
    expect(hasUserKeys(userId)).toBe(false);
  });

  it('should fail to restore invalid backup JSON', async () => {
    const invalidBackup = JSON.stringify({ invalid: 'data' });

    await expect(
      importSecureBackup(invalidBackup, 'any-password')
    ).rejects.toThrow();
  });

  it('should fail to export when no keys exist', async () => {
    await expect(
      exportSecureBackup('password')
    ).rejects.toThrow(/no keys to export/i);
  });
});

describe('KeyManager - Key Statistics', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should report correct key statistics', async () => {
    // Initially no keys
    let stats = getKeyStats();
    expect(stats.hasCurrentUser).toBe(false);
    expect(stats.currentUserId).toBeNull();
    expect(stats.keyCount).toBe(0);

    // Add one user
    const keys1 = await generateUserKeys('user1', 'username1');
    await storeUserKeys(keys1);

    stats = getKeyStats();
    expect(stats.hasCurrentUser).toBe(true);
    expect(stats.currentUserId).toBe('user1');
    expect(stats.keyCount).toBe(1);

    // Add second user (without setting as current)
    const keys2 = await generateUserKeys('user2', 'username2');
    await storeUserKeys(keys2);

    stats = getKeyStats();
    expect(stats.hasCurrentUser).toBe(true);
    expect(stats.currentUserId).toBe('user2'); // Last stored becomes current
    expect(stats.keyCount).toBe(2);
  });
});

describe('KeyManager - Edge Cases', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should handle multiple users independently', async () => {
    const user1 = await generateUserKeys('user1', 'alice');
    const user2 = await generateUserKeys('user2', 'bob');

    await storeUserKeys(user1);
    await storeUserKeys(user2);

    // Both should be stored
    expect(hasUserKeys('user1')).toBe(true);
    expect(hasUserKeys('user2')).toBe(true);

    // Load each independently
    const loaded1 = await loadUserKeys('user1');
    const loaded2 = await loadUserKeys('user2');

    expect(loaded1!.username).toBe('alice');
    expect(loaded2!.username).toBe('bob');

    // Delete user1, user2 should remain
    deleteUserKeys('user1');
    expect(hasUserKeys('user1')).toBe(false);
    expect(hasUserKeys('user2')).toBe(true);
  });

  it('should handle special characters in username', async () => {
    const userId = 'special-char-test';
    const username = 'user@example.com!#$%';
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);
    const loaded = await loadUserKeys(userId);

    expect(loaded!.username).toBe(username);
  });

  it('should handle very long usernames', async () => {
    const userId = 'long-username-test';
    const username = 'a'.repeat(1000);
    const keys = await generateUserKeys(userId, username);

    await storeUserKeys(keys);
    const loaded = await loadUserKeys(userId);

    expect(loaded!.username).toBe(username);
  });
});
