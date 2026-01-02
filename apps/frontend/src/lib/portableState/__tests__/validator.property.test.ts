/**
 * Property-Based Tests for Payload Structure Validation
 *
 * Feature: encrypted-state-sharding, Property 2: Payload Structure Completeness
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6
 *
 * @module portableState/__tests__/validator.property.test
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ResonanceCore } from '../../../core/resonance/ResonanceCore';
import { serializeFromCore } from '../serializer';
import { validatePayloadStructure, validatePayload, isValidPayloadStructure } from '../validator';
import { PAYLOAD_VERSION } from '../types';

/**
 * Arbitrary generator for AetherVestingEntry
 */
const arbitraryVestingEntry = fc.record({
  amount: fc.float({ min: 0, max: 10000, noNaN: true }),
  unlockAt: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
});

/**
 * Arbitrary generator for AetherLedgerState
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

describe('Payload Structure Completeness Property Tests', () => {
  /**
   * Feature: encrypted-state-sharding, Property 2: Payload Structure Completeness
   *
   * For any serialized UserStatePayload, the payload SHALL contain all required fields
   * (version, userId, createdAt, rho, aether, peerRho, peerLastSeenAt, checksum) with
   * correct types, and validation SHALL accept it.
   *
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6
   */
  it('Property 2: Payload Structure Completeness - serialized payloads contain all required fields and pass validation', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryResonanceState, arbitraryUserId, async (initialState, userId) => {
        // Create ResonanceCore with the generated state
        const core = new ResonanceCore(initialState);

        // Serialize to UserStatePayload
        const payload = await serializeFromCore(core, userId);

        // Verify all required fields exist with correct types
        // Requirement 1.2: version field (number)
        expect(payload).toHaveProperty('version');
        expect(typeof payload.version).toBe('number');
        expect(payload.version).toBe(PAYLOAD_VERSION);
        expect(Number.isInteger(payload.version)).toBe(true);
        expect(payload.version).toBeGreaterThanOrEqual(1);

        // Requirement 1.4: userId field (string)
        expect(payload).toHaveProperty('userId');
        expect(typeof payload.userId).toBe('string');
        expect(payload.userId.length).toBeGreaterThan(0);
        expect(payload.userId).toBe(userId);

        // Requirement 1.3: createdAt field (number timestamp)
        expect(payload).toHaveProperty('createdAt');
        expect(typeof payload.createdAt).toBe('number');
        expect(payload.createdAt).toBeGreaterThanOrEqual(0);

        // Requirement 1.1: rho field (number between 0 and 1)
        expect(payload).toHaveProperty('rho');
        expect(typeof payload.rho).toBe('number');
        expect(payload.rho).toBeGreaterThanOrEqual(0);
        expect(payload.rho).toBeLessThanOrEqual(1);

        // lastMessageAt field (number or null)
        expect(payload).toHaveProperty('lastMessageAt');
        expect(payload.lastMessageAt === null || typeof payload.lastMessageAt === 'number').toBe(true);

        // lockedUntil field (number or null)
        expect(payload).toHaveProperty('lockedUntil');
        expect(payload.lockedUntil === null || typeof payload.lockedUntil === 'number').toBe(true);

        // Requirement 1.1: aether field (AetherState)
        expect(payload).toHaveProperty('aether');
        expect(typeof payload.aether).toBe('object');
        expect(payload.aether).not.toBeNull();
        expect(payload.aether).toHaveProperty('available');
        expect(payload.aether).toHaveProperty('staked');
        expect(payload.aether).toHaveProperty('vesting');
        expect(typeof payload.aether.available).toBe('number');
        expect(typeof payload.aether.staked).toBe('number');
        expect(Array.isArray(payload.aether.vesting)).toBe(true);

        // Requirement 1.1: peerRho field (Record<string, number>)
        expect(payload).toHaveProperty('peerRho');
        expect(typeof payload.peerRho).toBe('object');
        expect(payload.peerRho).not.toBeNull();

        // peerLastSeenAt field (Record<string, number>)
        expect(payload).toHaveProperty('peerLastSeenAt');
        expect(typeof payload.peerLastSeenAt).toBe('object');
        expect(payload.peerLastSeenAt).not.toBeNull();

        // checksum field (string)
        expect(payload).toHaveProperty('checksum');
        expect(typeof payload.checksum).toBe('string');
        expect(payload.checksum.length).toBeGreaterThan(0);

        // Requirement 1.6: Validation SHALL accept the payload
        const structureResult = validatePayloadStructure(payload);
        expect(structureResult.valid).toBe(true);

        const isValidStructure = isValidPayloadStructure(payload);
        expect(isValidStructure).toBe(true);

        // Full validation including checksum
        const isValid = await validatePayload(payload);
        expect(isValid).toBe(true);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
