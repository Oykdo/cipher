/**
 * Property-Based Tests for Portable State Serialization
 *
 * Feature: encrypted-state-sharding, Property 1: Serialization Round-Trip
 * Validates: Requirements 1.5, 6.6
 *
 * @module portableState/__tests__/serializer.property.test
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { ResonanceCore, type ResonancePersistedState } from '../../../core/resonance/ResonanceCore';
import { serializeFromCore, deserializeToState } from '../serializer';

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
 * Compares two ResonancePersistedState objects for equivalence.
 * Uses tolerance for floating-point comparisons.
 */
function isEquivalentState(
  original: ResonancePersistedState,
  restored: ResonancePersistedState,
  tolerance = 1e-9
): boolean {
  // Compare rho with tolerance
  if (Math.abs(original.rho - restored.rho) > tolerance) {
    return false;
  }

  // Compare timestamps (exact match for integers)
  if (original.lastMessageAt !== restored.lastMessageAt) {
    return false;
  }
  if (original.lockedUntil !== restored.lockedUntil) {
    return false;
  }

  // Compare aether state
  if (Math.abs(original.aether.available - restored.aether.available) > tolerance) {
    return false;
  }
  if (Math.abs(original.aether.staked - restored.aether.staked) > tolerance) {
    return false;
  }

  // Compare vesting entries
  if (original.aether.vesting.length !== restored.aether.vesting.length) {
    return false;
  }
  for (let i = 0; i < original.aether.vesting.length; i++) {
    const origEntry = original.aether.vesting[i];
    const restoredEntry = restored.aether.vesting[i];
    if (Math.abs(origEntry.amount - restoredEntry.amount) > tolerance) {
      return false;
    }
    if (origEntry.unlockAt !== restoredEntry.unlockAt) {
      return false;
    }
  }

  // Compare peerRho
  const origPeerRhoKeys = Object.keys(original.peerRho).sort();
  const restoredPeerRhoKeys = Object.keys(restored.peerRho).sort();
  if (origPeerRhoKeys.length !== restoredPeerRhoKeys.length) {
    return false;
  }
  for (const key of origPeerRhoKeys) {
    if (!(key in restored.peerRho)) {
      return false;
    }
    if (Math.abs(original.peerRho[key] - restored.peerRho[key]) > tolerance) {
      return false;
    }
  }

  // Compare peerLastSeenAt
  const origPeerLastSeenKeys = Object.keys(original.peerLastSeenAt).sort();
  const restoredPeerLastSeenKeys = Object.keys(restored.peerLastSeenAt).sort();
  if (origPeerLastSeenKeys.length !== restoredPeerLastSeenKeys.length) {
    return false;
  }
  for (const key of origPeerLastSeenKeys) {
    if (!(key in restored.peerLastSeenAt)) {
      return false;
    }
    if (original.peerLastSeenAt[key] !== restored.peerLastSeenAt[key]) {
      return false;
    }
  }

  return true;
}

describe('Serialization Property Tests', () => {
  /**
   * Feature: encrypted-state-sharding, Property 1: Serialization Round-Trip
   *
   * For any valid ResonanceCore state, serializing to UserStatePayload and then
   * restoring back to ResonanceCore SHALL produce an equivalent state (rho, aether,
   * peerRho values match within floating-point tolerance).
   *
   * Validates: Requirements 1.5, 6.6
   */
  it('Property 1: Serialization Round-Trip - serialize then deserialize produces equivalent state', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryResonanceState, async (initialState) => {
        // Create ResonanceCore with the generated state
        const core = new ResonanceCore(initialState);

        // Get the actual state from the core (it may normalize some values)
        const coreState = core.toJSON();

        // Serialize to UserStatePayload
        const userId = 'test-user-' + Math.random().toString(36).substring(7);
        const payload = await serializeFromCore(core, userId);

        // Deserialize back to ResonancePersistedState
        const restoredState = deserializeToState(payload);

        // Create a new ResonanceCore with the restored state
        const restoredCore = new ResonanceCore(restoredState);
        const restoredCoreState = restoredCore.toJSON();

        // Verify equivalence
        return isEquivalentState(coreState, restoredCoreState);
      }),
      { numRuns: 100 }
    );
  });
});
