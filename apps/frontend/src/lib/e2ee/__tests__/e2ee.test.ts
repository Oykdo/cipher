/**
 * E2EE Tests
 * 
 * Tests for end-to-end encryption functionality
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  initializeCrypto,
  generateIdentityKeyPair,
  generateKeyExchangeKeyPair,
  generateSigningKeyPair,
  deriveSharedSecret,
  deriveEncryptionKey,
  encryptSymmetric,
  decryptSymmetric,
  encryptAuthenticated,
  decryptAuthenticated,
  signData,
  verifySignature,
  generateFingerprint,
  compareFingerprintsEqual,
  bytesToBase64,
  base64ToBytes,
} from '../index';

describe('E2EE Core Functionality', () => {
  beforeAll(async () => {
    await initializeCrypto();
  });

  describe('Key Generation', () => {
    it('should generate identity key pair with fingerprint', async () => {
      const keyPair = await generateIdentityKeyPair();
      
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.fingerprint).toBeTruthy();
      expect(keyPair.fingerprint).toMatch(/^[0-9A-F\s]+$/);
    });

    it('should generate different key pairs each time', async () => {
      const keyPair1 = await generateIdentityKeyPair();
      const keyPair2 = await generateIdentityKeyPair();
      
      expect(keyPair1.fingerprint).not.toBe(keyPair2.fingerprint);
    });
  });

  describe('Key Exchange', () => {
    it('should derive same shared secret from both sides', async () => {
      const alice = await generateKeyExchangeKeyPair();
      const bob = await generateKeyExchangeKeyPair();
      
      const aliceShared = await deriveSharedSecret(alice.privateKey, bob.publicKey);
      const bobShared = await deriveSharedSecret(bob.privateKey, alice.publicKey);
      
      expect(bytesToBase64(aliceShared)).toBe(bytesToBase64(bobShared));
    });

    it('should derive encryption key from shared secret', async () => {
      const alice = await generateKeyExchangeKeyPair();
      const bob = await generateKeyExchangeKeyPair();
      
      const sharedSecret = await deriveSharedSecret(alice.privateKey, bob.publicKey);
      const encryptionKey = await deriveEncryptionKey(sharedSecret);
      
      expect(encryptionKey).toBeInstanceOf(Uint8Array);
      expect(encryptionKey.length).toBe(32);
    });
  });

  describe('Symmetric Encryption', () => {
    it('should encrypt and decrypt message', async () => {
      const message = 'Hello, World!';
      const key = new Uint8Array(32); // Zero key for testing
      
      const encrypted = await encryptSymmetric(message, key);
      const decrypted = await decryptSymmetric(encrypted, key);
      
      expect(decrypted).toBe(message);
    });

    it('should fail with wrong key', async () => {
      const message = 'Secret message';
      const key1 = new Uint8Array(32);
      const key2 = new Uint8Array(32);
      key2[0] = 1; // Different key
      
      const encrypted = await encryptSymmetric(message, key1);
      
      await expect(decryptSymmetric(encrypted, key2)).rejects.toThrow();
    });
  });

  describe('Authenticated Encryption', () => {
    it('should encrypt and decrypt with authentication', async () => {
      const message = 'Authenticated message';
      const alice = await generateKeyExchangeKeyPair();
      const bob = await generateKeyExchangeKeyPair();
      
      const encrypted = await encryptAuthenticated(message, bob.publicKey, alice.privateKey);
      const decrypted = await decryptAuthenticated(encrypted, alice.publicKey, bob.privateKey);
      
      expect(decrypted).toBe(message);
    });
  });

  describe('Digital Signatures', () => {
    it('should sign and verify data', async () => {
      const data = 'Important data';
      const alice = await generateSigningKeyPair();
      
      const signature = await signData(data, alice.privateKey);
      const isValid = await verifySignature(data, signature, alice.publicKey);
      
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong data', async () => {
      const data = 'Original data';
      const tamperedData = 'Tampered data';
      const alice = await generateSigningKeyPair();
      
      const signature = await signData(data, alice.privateKey);
      const isValid = await verifySignature(tamperedData, signature, alice.publicKey);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Fingerprints', () => {
    it('should generate consistent fingerprint for same key', async () => {
      const keyPair = await generateIdentityKeyPair();
      
      const fp1 = await generateFingerprint(keyPair.publicKey);
      const fp2 = await generateFingerprint(keyPair.publicKey);
      
      expect(fp1).toBe(fp2);
    });

    it('should compare fingerprints correctly', () => {
      const fp1 = 'A1B2 C3D4 E5F6';
      const fp2 = 'a1b2c3d4e5f6';
      const fp3 = 'A1B2 C3D4 E5F7';
      
      expect(compareFingerprintsEqual(fp1, fp2)).toBe(true);
      expect(compareFingerprintsEqual(fp1, fp3)).toBe(false);
    });
  });

  describe('Base64 Encoding', () => {
    it('should encode and decode correctly', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      
      const encoded = bytesToBase64(data);
      const decoded = base64ToBytes(encoded);
      
      expect(decoded).toEqual(data);
    });
  });
});

