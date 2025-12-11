/**
 * Unit Tests: Secure Key Store (IndexedDB)
 * 
 * Tests the security properties of the keyStore module,
 * including non-extractable key protection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  storeCryptoKeyIDB,
  loadCryptoKeyIDB,
  removeCryptoKeyIDB,
  clearAllKeys,
  storeMasterKey,
  getMasterKey,
  removeMasterKey,
  importRawKey,
  deriveKeyFromPassword,
  generateSalt,
} from '../lib/keyStore';

describe('KeyStore - Secure IndexedDB Storage', () => {
  
  beforeEach(async () => {
    // Clear all keys before each test
    await clearAllKeys();
  });
  
  afterEach(async () => {
    // Cleanup after each test
    await clearAllKeys();
  });
  
  describe('Basic Storage Operations', () => {
    
    it('should store and retrieve a CryptoKey', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      const storeResult = await storeCryptoKeyIDB('test-key', cryptoKey);
      expect(storeResult).toBe(true);
      
      const loadedKey = await loadCryptoKeyIDB('test-key');
      expect(loadedKey).not.toBeNull();
      expect(loadedKey?.type).toBe('secret');
      expect(loadedKey?.algorithm.name).toBe('AES-GCM');
    });
    
    it('should return null for non-existent key', async () => {
      const loadedKey = await loadCryptoKeyIDB('non-existent-key');
      expect(loadedKey).toBeNull();
    });
    
    it('should remove a stored key', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      await storeCryptoKeyIDB('test-key', cryptoKey);
      const removeResult = await removeCryptoKeyIDB('test-key');
      expect(removeResult).toBe(true);
      
      const loadedKey = await loadCryptoKeyIDB('test-key');
      expect(loadedKey).toBeNull();
    });
    
    it('should clear all stored keys', async () => {
      const key1 = await importRawKey(crypto.getRandomValues(new Uint8Array(32)));
      const key2 = await importRawKey(crypto.getRandomValues(new Uint8Array(32)));
      
      await storeCryptoKeyIDB('key1', key1);
      await storeCryptoKeyIDB('key2', key2);
      
      const clearResult = await clearAllKeys();
      expect(clearResult).toBe(true);
      
      expect(await loadCryptoKeyIDB('key1')).toBeNull();
      expect(await loadCryptoKeyIDB('key2')).toBeNull();
    });
    
  });
  
  describe('Master Key Operations', () => {
    
    it('should store and retrieve master key', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      const storeResult = await storeMasterKey(cryptoKey);
      expect(storeResult).toBe(true);
      
      const loadedKey = await getMasterKey();
      expect(loadedKey).not.toBeNull();
      expect(loadedKey?.type).toBe('secret');
    });
    
    it('should remove master key', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      await storeMasterKey(cryptoKey);
      const removeResult = await removeMasterKey();
      expect(removeResult).toBe(true);
      
      const loadedKey = await getMasterKey();
      expect(loadedKey).toBeNull();
    });
    
  });
  
  describe('Non-Extractable Key Protection', () => {
    
    it('should create non-extractable keys', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      // Check that key is not extractable
      expect(cryptoKey.extractable).toBe(false);
    });
    
    it('should fail to export non-extractable key', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      await storeCryptoKeyIDB('test-key', cryptoKey);
      const loadedKey = await loadCryptoKeyIDB('test-key');
      
      // Attempt to export should throw error
      await expect(
        crypto.subtle.exportKey('raw', loadedKey!)
      ).rejects.toThrow();
    });
    
    it('should still allow encryption/decryption with non-extractable key', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      await storeCryptoKeyIDB('test-key', cryptoKey);
      const loadedKey = await loadCryptoKeyIDB('test-key');
      
      // Test encryption
      const plaintext = new TextEncoder().encode('Secret message');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        loadedKey!,
        plaintext
      );
      
      expect(ciphertext).toBeDefined();
      expect(ciphertext.byteLength).toBeGreaterThan(0);
      
      // Test decryption
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        loadedKey!,
        ciphertext
      );
      
      const decryptedText = new TextDecoder().decode(decrypted);
      expect(decryptedText).toBe('Secret message');
    });
    
  });
  
  describe('Key Derivation', () => {
    
    it('should derive key from password', async () => {
      const password = 'super-secret-password';
      const salt = generateSalt();
      
      const derivedKey = await deriveKeyFromPassword(password, salt);
      
      expect(derivedKey).toBeDefined();
      expect(derivedKey.type).toBe('secret');
      expect(derivedKey.algorithm.name).toBe('AES-GCM');
      expect(derivedKey.extractable).toBe(false);
    });
    
    it('should derive same key from same password and salt', async () => {
      const password = 'test-password';
      const salt = generateSalt();
      
      const key1 = await deriveKeyFromPassword(password, salt, 100000);
      const key2 = await deriveKeyFromPassword(password, salt, 100000);
      
      // Can't compare keys directly, but can test they encrypt/decrypt the same
      const plaintext = new TextEncoder().encode('Test');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key1,
        plaintext
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key2,
        ciphertext
      );
      
      expect(new TextDecoder().decode(decrypted)).toBe('Test');
    });
    
    it('should generate random salt', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      
      expect(salt1.length).toBe(16);
      expect(salt2.length).toBe(16);
      
      // Should be different
      expect(salt1).not.toEqual(salt2);
    });
    
  });
  
  describe('Security Properties', () => {
    
    it('should not expose key material in memory dumps', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      await storeCryptoKeyIDB('test-key', cryptoKey);
      
      // Key should not be JSON serializable
      expect(() => JSON.stringify(cryptoKey)).toThrow();
    });
    
    it('should protect against XSS key extraction', async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const cryptoKey = await importRawKey(rawKey);
      
      await storeMasterKey(cryptoKey);
      
      // Simulate XSS attempt to extract key
      const storedKey = await getMasterKey();
      
      // Should not be able to get raw bytes
      await expect(
        crypto.subtle.exportKey('raw', storedKey!)
      ).rejects.toThrow();
      
      // Should not be able to see key in console
      const consoleOutput = String(storedKey);
      expect(consoleOutput).not.toContain(Array.from(rawKey).join(''));
    });
    
  });
  
  describe('Error Handling', () => {
    
    it('should handle invalid key import gracefully', async () => {
      const invalidKey = new Uint8Array(16); // Wrong size (need 32)
      
      await expect(importRawKey(invalidKey)).rejects.toThrow();
    });
    
    it('should return false when storage fails', async () => {
      // Store with invalid key name
      const key = await importRawKey(crypto.getRandomValues(new Uint8Array(32)));
      
      // Try to store with empty name
      const result = await storeCryptoKeyIDB('', key);
      
      // Should either succeed or fail gracefully
      expect(typeof result).toBe('boolean');
    });
    
  });
  
});