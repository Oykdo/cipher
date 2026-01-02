/**
 * Unit Tests for Encryption Error Handling
 *
 * Tests specific error conditions and edge cases for the encryption module.
 *
 * @module portableState/__tests__/encryption.unit.test
 * @requirements 2.6
 */

import { describe, it, expect } from 'vitest';
import { ResonanceCore } from '../../../core/resonance/ResonanceCore';
import { serializeFromCore } from '../serializer';
import {
  deriveEncryptionKey,
  encryptPayload,
  decryptPayload,
  EncryptionError,
} from '../encryption';
import type { EncryptedBlob } from '../types';

/**
 * Creates a mock sign function that returns a fixed signature.
 */
function createMockSignFn(signature: string): (message: string) => Promise<string> {
  return async () => signature;
}

/**
 * Creates a mock sign function that rejects with an error.
 */
function createRejectingSignFn(errorMessage: string): (message: string) => Promise<string> {
  return async () => {
    throw new Error(errorMessage);
  };
}

/**
 * Creates a valid test payload for encryption tests.
 */
async function createTestPayload() {
  const core = new ResonanceCore({
    rho: 0.5,
    lastMessageAt: null,
    lockedUntil: null,
    aether: { available: 100, staked: 50, vesting: [] },
    peerRho: {},
    peerLastSeenAt: {},
  });
  return serializeFromCore(core, 'test-user');
}

describe('Encryption Error Handling Unit Tests', () => {
  describe('Key Derivation Errors', () => {
    it('should throw SIGNATURE_REJECTED when wallet rejects signature', async () => {
      const signFn = createRejectingSignFn('User rejected the request');

      await expect(deriveEncryptionKey(signFn)).rejects.toThrow(EncryptionError);

      try {
        await deriveEncryptionKey(signFn);
      } catch (error) {
        expect(error).toBeInstanceOf(EncryptionError);
        expect((error as EncryptionError).code).toBe('SIGNATURE_REJECTED');
        expect((error as EncryptionError).message).toContain('User rejected the request');
      }
    });
  });

  describe('Decryption with Wrong Key', () => {
    it('should throw descriptive error when decrypting with wrong key', async () => {
      const payload = await createTestPayload();

      // Encrypt with key1
      const signFn1 = createMockSignFn('signature-for-key-1');
      const key1 = await deriveEncryptionKey(signFn1);
      const encrypted = await encryptPayload(payload, key1);

      // Try to decrypt with key2
      const signFn2 = createMockSignFn('signature-for-key-2');
      const key2 = await deriveEncryptionKey(signFn2);

      await expect(decryptPayload(encrypted, key2)).rejects.toThrow(EncryptionError);

      try {
        await decryptPayload(encrypted, key2);
      } catch (error) {
        expect(error).toBeInstanceOf(EncryptionError);
        const encError = error as EncryptionError;
        // Should be either DECRYPTION_FAILED or TAMPERED_DATA
        expect(['DECRYPTION_FAILED', 'TAMPERED_DATA']).toContain(encError.code);
      }
    });
  });

  describe('Tampered Ciphertext Detection', () => {
    it('should detect tampered ciphertext', async () => {
      const payload = await createTestPayload();

      const signFn = createMockSignFn('test-signature');
      const key = await deriveEncryptionKey(signFn);
      const encrypted = await encryptPayload(payload, key);

      // Tamper with the ciphertext by modifying a character
      const tamperedCiphertext = encrypted.ciphertext.slice(0, -4) + 'XXXX';
      const tamperedBlob: EncryptedBlob = {
        ...encrypted,
        ciphertext: tamperedCiphertext,
      };

      await expect(decryptPayload(tamperedBlob, key)).rejects.toThrow(EncryptionError);

      try {
        await decryptPayload(tamperedBlob, key);
      } catch (error) {
        expect(error).toBeInstanceOf(EncryptionError);
        const encError = error as EncryptionError;
        // Should detect tampering
        expect(['DECRYPTION_FAILED', 'TAMPERED_DATA']).toContain(encError.code);
      }
    });

    it('should detect tampered IV', async () => {
      const payload = await createTestPayload();

      const signFn = createMockSignFn('test-signature');
      const key = await deriveEncryptionKey(signFn);
      const encrypted = await encryptPayload(payload, key);

      // Tamper with the IV
      const tamperedIv = encrypted.iv.slice(0, -2) + 'XX';
      const tamperedBlob: EncryptedBlob = {
        ...encrypted,
        iv: tamperedIv,
      };

      await expect(decryptPayload(tamperedBlob, key)).rejects.toThrow(EncryptionError);

      try {
        await decryptPayload(tamperedBlob, key);
      } catch (error) {
        expect(error).toBeInstanceOf(EncryptionError);
        const encError = error as EncryptionError;
        // Should detect tampering or invalid blob
        expect(['DECRYPTION_FAILED', 'TAMPERED_DATA', 'INVALID_BLOB']).toContain(encError.code);
      }
    });
  });

  describe('Invalid Blob Validation', () => {
    it('should reject blob with invalid algorithm', async () => {
      const signFn = createMockSignFn('test-signature');
      const key = await deriveEncryptionKey(signFn);

      const invalidBlob = {
        ciphertext: 'dGVzdA==',
        iv: 'dGVzdGl2MTIzNDU2',
        algorithm: 'AES-CBC-256',
        version: 1,
      } as unknown as EncryptedBlob;

      await expect(decryptPayload(invalidBlob, key)).rejects.toThrow(EncryptionError);

      try {
        await decryptPayload(invalidBlob, key);
      } catch (error) {
        expect(error).toBeInstanceOf(EncryptionError);
        expect((error as EncryptionError).code).toBe('INVALID_BLOB');
      }
    });

    it('should reject blob with empty ciphertext', async () => {
      const signFn = createMockSignFn('test-signature');
      const key = await deriveEncryptionKey(signFn);

      const invalidBlob: EncryptedBlob = {
        ciphertext: '',
        iv: 'dGVzdGl2MTIzNDU2',
        algorithm: 'AES-GCM-256',
        version: 1,
      };

      await expect(decryptPayload(invalidBlob, key)).rejects.toThrow(EncryptionError);

      try {
        await decryptPayload(invalidBlob, key);
      } catch (error) {
        expect(error).toBeInstanceOf(EncryptionError);
        expect((error as EncryptionError).code).toBe('INVALID_BLOB');
      }
    });

    it('should reject blob with empty IV', async () => {
      const signFn = createMockSignFn('test-signature');
      const key = await deriveEncryptionKey(signFn);

      const invalidBlob: EncryptedBlob = {
        ciphertext: 'dGVzdA==',
        iv: '',
        algorithm: 'AES-GCM-256',
        version: 1,
      };

      await expect(decryptPayload(invalidBlob, key)).rejects.toThrow(EncryptionError);

      try {
        await decryptPayload(invalidBlob, key);
      } catch (error) {
        expect(error).toBeInstanceOf(EncryptionError);
        expect((error as EncryptionError).code).toBe('INVALID_BLOB');
      }
    });

    it('should reject blob with invalid IV length', async () => {
      const signFn = createMockSignFn('test-signature');
      const key = await deriveEncryptionKey(signFn);

      // Create a valid encrypted blob first
      const payload = await createTestPayload();
      const encrypted = await encryptPayload(payload, key);

      // Replace IV with wrong length (should be 12 bytes = 16 base64 chars)
      const invalidBlob: EncryptedBlob = {
        ...encrypted,
        iv: 'c2hvcnQ=', // "short" in base64, only 5 bytes
      };

      await expect(decryptPayload(invalidBlob, key)).rejects.toThrow(EncryptionError);

      try {
        await decryptPayload(invalidBlob, key);
      } catch (error) {
        expect(error).toBeInstanceOf(EncryptionError);
        expect((error as EncryptionError).code).toBe('INVALID_BLOB');
      }
    });
  });
});
