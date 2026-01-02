/**
 * Serialization utilities for portable state backup.
 *
 * Provides functions to serialize ResonanceCore state to UserStatePayload
 * and deserialize back to ResonancePersistedState.
 *
 * @module portableState/serializer
 * @requirements 1.5
 */

import type { ResonanceCore } from '../../core/resonance/ResonanceCore';
import type { ResonancePersistedState } from '../../core/resonance/ResonanceCore';
import type { UserStatePayload } from './types';
import { PAYLOAD_VERSION } from './types';

/**
 * Computes a SHA-256 checksum for payload integrity verification.
 * The checksum is computed over all fields except the checksum itself.
 *
 * @param payload - The payload without the checksum field
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeChecksum(
  payload: Omit<UserStatePayload, 'checksum'>
): Promise<string> {
  // Create a deterministic JSON string for hashing
  const serialized = JSON.stringify({
    version: payload.version,
    userId: payload.userId,
    createdAt: payload.createdAt,
    rho: payload.rho,
    lastMessageAt: payload.lastMessageAt,
    lockedUntil: payload.lockedUntil,
    aether: {
      available: payload.aether.available,
      staked: payload.aether.staked,
      vesting: payload.aether.vesting.map((v) => ({
        amount: v.amount,
        unlockAt: v.unlockAt,
      })),
    },
    peerRho: Object.fromEntries(
      Object.entries(payload.peerRho).sort(([a], [b]) => a.localeCompare(b))
    ),
    peerLastSeenAt: Object.fromEntries(
      Object.entries(payload.peerLastSeenAt).sort(([a], [b]) => a.localeCompare(b))
    ),
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Serializes ResonanceCore state to a portable UserStatePayload.
 *
 * Extracts current values from ResonanceCore and creates a versioned,
 * checksummed payload suitable for encryption and storage.
 *
 * @param core - The ResonanceCore instance to serialize
 * @param userId - User identifier (wallet address or internal ID)
 * @returns Promise resolving to the complete UserStatePayload
 * @requirements 1.5
 */
export async function serializeFromCore(
  core: ResonanceCore,
  userId: string
): Promise<UserStatePayload> {
  const state = core.toJSON();
  const now = Date.now();

  const payloadWithoutChecksum: Omit<UserStatePayload, 'checksum'> = {
    version: PAYLOAD_VERSION,
    userId,
    createdAt: now,
    rho: state.rho,
    lastMessageAt: state.lastMessageAt,
    lockedUntil: state.lockedUntil,
    aether: {
      available: state.aether.available,
      staked: state.aether.staked,
      vesting: state.aether.vesting.map((v) => ({
        amount: v.amount,
        unlockAt: v.unlockAt,
      })),
    },
    peerRho: { ...state.peerRho },
    peerLastSeenAt: { ...state.peerLastSeenAt },
  };

  const checksum = await computeChecksum(payloadWithoutChecksum);

  return {
    ...payloadWithoutChecksum,
    checksum,
  };
}

/**
 * Deserializes a UserStatePayload to ResonancePersistedState.
 *
 * Converts the portable payload format back to the internal state
 * structure used by ResonanceCore.
 *
 * @param payload - The validated UserStatePayload to deserialize
 * @returns ResonancePersistedState suitable for ResonanceCore constructor
 * @requirements 1.5
 */
export function deserializeToState(payload: UserStatePayload): ResonancePersistedState {
  return {
    rho: payload.rho,
    lastMessageAt: payload.lastMessageAt,
    lockedUntil: payload.lockedUntil,
    aether: {
      available: payload.aether.available,
      staked: payload.aether.staked,
      vesting: payload.aether.vesting.map((v) => ({
        amount: v.amount,
        unlockAt: v.unlockAt,
      })),
    },
    peerRho: { ...payload.peerRho },
    peerLastSeenAt: { ...payload.peerLastSeenAt },
  };
}
