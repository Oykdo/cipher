/**
 * Property-Based Tests for Wallet-Based Encryption
 *
 * Feature: encrypted-state-sharding, Property 3: Encryption Round-Trip with Integrity
 * Validates: Requirements 2.1, 2.3, 2.5
 *
 * @module portableState/__tests__/encryption.property.test
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { ResonanceCore } from '../../../core/resonance/ResonanceCore';
import { serializeFromCore } from '../serializer';
import { deriveEncryptionKey, encryptPayload, decryptPayload } from '../encryption';
import type { UserStatePayload } from '../types';

/**
 * Arbitrary generator for AetherVestingEntry
 */
const arbitraryVestingEntry = fc.record({
  amount: fc.float({ min: 0, max: 10000, noNaN: true }),
  unlockAt: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
});

/**
 * Arbitrary generator for AetherState
 */
const arbitraryAetherState = fc.record({
  available: fc.float({ min: 0, max: 100000, noNaN: true }),
  staked: fc.float({ min: 0, max: 100000, noNaN: true }),
  vesting: fc.array(arbitraryVestingEntry, { minLength: 0, maxLength: 10 }),
});

/**
 * Arbitrary generator for peer trust records (rho values between 0 and 1)
 */
const arbitraryPeerRho = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.float({ min: 0, max: 1, noNaN: true })
);

/**
 * Arbitrary generator for peer last seen timestamps
 */
const arbitraryPeerLastSeenAt = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })
);

/**
 * Arbitrary generator for ResonancePersistedState
 */
const arbitraryResonanceState = fc.record({
  rho: fc.float({ min: 0, max: 1, noNaN: true }),
  lastMessageAt: fc.option(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), { nil: null }),
  lockedUntil: fc.option(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), { nil: null }),
  aether: arbitraryAetherState,
  peerRho: arbitraryPeerRho,
  peerLastSeenAt: arbitraryPeerLastSeenAt,
});

/**
 * Arbitrary generator for user IDs
 */
const arbitraryUserId = fc.string({ minLength: 1, maxLength: 50 });

/**
 * Arbitrary generator for wallet signatures (alphanumeric strings simulating hex)
 */
const arbitrarySignature = fc.string({ minLength: 64, maxLength: 132 });

/**
 * Creates a mock sign function that returns a fixed signature.
 */
function createMockSignFn(signature: string): (message: string) => Promise<string> {
  return async () => signature;
}

/**
 * Deep equality check for UserStatePayload objects.
 * Handles floating-point comparison with tolerance.
 */
function isDeepEqual(a: UserStatePayload, b: UserStatePayload, tolerance = 1e-9): boolean {
  // Check primitive fields
  if (a.version !== b.version) return false;
  if (a.userId !== b.userId) return false;
  if (a.createdAt !== b.createdAt) return false;
  if (Math.abs(a.rho - b.rho) > tolerance) return false;
  if (a.lastMessageAt !== b.lastMessageAt) return false;
  if (a.lockedUntil !== b.lockedUntil) return false;
  if (a.checksum !== b.checksum) return false;

  // Check aether state
  if (Math.abs(a.aether.available - b.aether.available) > tolerance) return false;
  if (Math.abs(a.aether.staked - b.aether.staked) > tolerance) return false;
  if (a.aether.vesting.length !== b.aether.vesting.length) return false;
  for (let i = 0; i < a.aether.vesting.length; i++) {
    if (Math.abs(a.aether.vesting[i].amount - b.aether.vesting[i].amount) > tolerance) return false;
    if (a.aether.vesting[i].unlockAt !== b.aether.vesting[i].unlockAt) return false;
  }

  // Check peerRho
  const aPeerRhoKeys = Object.keys(a.peerRho).sort();
  const bPeerRhoKeys = Object.keys(b.peerRho).sort();
  if (aPeerRhoKeys.length !== bPeerRhoKeys.length) return false;
  for (const key of aPeerRhoKeys) {
    if (!(key in b.peerRho)) return false;
    if (Math.abs(a.peerRho[key] - b.peerRho[key]) > tolerance) return false;
  }

  // Check peerLastSeenAt
  const aPeerLastSeenKeys = Object.keys(a.peerLastSeenAt).sort();
  const bPeerLastSeenKeys = Object.keys(b.peerLastSeenAt).sort();
  if (aPeerLastSeenKeys.length !== bPeerLastSeenKeys.length) return false;
  for (const key of aPeerLastSeenKeys) {
    if (!(key in b.peerLastSeenAt)) return false;
    if (a.peerLastSeenAt[key] !== b.peerLastSeenAt[key]) return false;
  }

  return true;
}

describe('Encryption Property Tests', () => {
  /**
   * Feature: encrypted-state-sharding, Property 3: Encryption Round-Trip with Integrity
   *
   * For any valid UserStatePayload and wallet signature, encrypting then decrypting
   * with the same derived key SHALL produce an identical payload, and each encryption
   * SHALL use a unique IV.
   *
   * Validates: Requirements 2.1, 2.3, 2.5
   */
  it('Property 3: Encryption Round-Trip with Integrity - encrypt then decrypt produces identical payload', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryResonanceState,
        arbitraryUserId,
        arbitrarySignature,
        async (initialState, userId, signature) => {
          // Create ResonanceCore and serialize to get a valid payload
          const core = new ResonanceCore(initialState);
          const payload = await serializeFromCore(core, userId);

          // Derive encryption key from signature
          const signFn = createMockSignFn(signature);
          const key = await deriveEncryptionKey(signFn);

          // Encrypt the payload
          const encrypted = await encryptPayload(payload, key);

          // Decrypt the payload
          const decrypted = await decryptPayload(encrypted, key);

          // Verify the decrypted payload matches the original
          return isDeepEqual(payload, decrypted);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: Each encryption produces a unique IV
   */
  it('Property 3 (continued): Each encryption produces a unique IV', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryResonanceState,
        arbitraryUserId,
        arbitrarySignature,
        async (initialState, userId, signature) => {
          // Create ResonanceCore and serialize to get a valid payload
          const core = new ResonanceCore(initialState);
          const payload = await serializeFromCore(core, userId);

          const signFn = createMockSignFn(signature);
          const key = await deriveEncryptionKey(signFn);

          // Encrypt the same payload twice
          const encrypted1 = await encryptPayload(payload, key);
          const encrypted2 = await encryptPayload(payload, key);

          // IVs should be different
          return encrypted1.iv !== encrypted2.iv;
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Wrong Key Rejection Property Tests', () => {
  /**
   * Feature: encrypted-state-sharding, Property 4: Wrong Key Rejection
   *
   * For any encrypted blob, attempting to decrypt with a key derived from a different
   * wallet signature SHALL fail with an authentication error (AES-GCM tag verification failure).
   *
   * Validates: Requirements 2.4
   */
  it('Property 4: Wrong Key Rejection - decryption with different key fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryResonanceState,
        arbitraryUserId,
        arbitrarySignature,
        arbitrarySignature,
        async (initialState, userId, signature1, signature2) => {
          // Ensure signatures are different
          fc.pre(signature1 !== signature2);

          // Create ResonanceCore and serialize to get a valid payload
          const core = new ResonanceCore(initialState);
          const payload = await serializeFromCore(core, userId);

          // Derive two different encryption keys
          const signFn1 = createMockSignFn(signature1);
          const signFn2 = createMockSignFn(signature2);
          const key1 = await deriveEncryptionKey(signFn1);
          const key2 = await deriveEncryptionKey(signFn2);

          // Encrypt with key1
          const encrypted = await encryptPayload(payload, key1);

          // Attempt to decrypt with key2 - should fail
          try {
            await decryptPayload(encrypted, key2);
            // If we get here, decryption succeeded when it should have failed
            return false;
          } catch (error) {
            // Decryption should fail with DECRYPTION_FAILED or TAMPERED_DATA error
            if (error instanceof Error && 'code' in error) {
              const code = (error as { code: string }).code;
              return code === 'DECRYPTION_FAILED' || code === 'TAMPERED_DATA';
            }
            // Any other error is also acceptable (crypto API errors)
            return true;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
