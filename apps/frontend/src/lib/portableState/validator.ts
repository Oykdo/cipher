/**
 * Validation utilities for portable state payloads.
 *
 * Provides type guards and validation functions to ensure payload
 * integrity before restoration.
 *
 * @module portableState/validator
 * @requirements 1.6
 */

import type { UserStatePayload, AetherState, AetherVestingEntry } from './types';
import { computeChecksum } from './serializer';

/**
 * Validation error codes for specific failure cases.
 */
export type ValidationErrorCode =
  | 'INVALID_TYPE'
  | 'MISSING_FIELD'
  | 'INVALID_FIELD_TYPE'
  | 'INVALID_VERSION'
  | 'INVALID_RHO_RANGE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_AETHER_STATE'
  | 'INVALID_PEER_RHO'
  | 'INVALID_PEER_LAST_SEEN'
  | 'CHECKSUM_MISMATCH';

/**
 * Validation result with detailed error information.
 */
export interface ValidationResult {
  valid: boolean;
  error?: {
    code: ValidationErrorCode;
    message: string;
    field?: string;
  };
}

/**
 * Checks if a value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks if a value is a valid number (not NaN, not Infinity).
 */
function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks if a value is a valid string.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Validates an AetherVestingEntry structure.
 */
function isValidVestingEntry(entry: unknown): entry is AetherVestingEntry {
  if (!isObject(entry)) return false;
  return (
    isValidNumber(entry.amount) &&
    entry.amount >= 0 &&
    isValidNumber(entry.unlockAt) &&
    entry.unlockAt >= 0
  );
}

/**
 * Validates an AetherState structure.
 */
function isValidAetherState(aether: unknown): aether is AetherState {
  if (!isObject(aether)) return false;

  // Check required numeric fields
  if (!isValidNumber(aether.available) || aether.available < 0) return false;
  if (!isValidNumber(aether.staked) || aether.staked < 0) return false;

  // Check vesting array
  if (!Array.isArray(aether.vesting)) return false;
  return aether.vesting.every(isValidVestingEntry);
}

/**
 * Validates a Record<string, number> structure for peer data.
 */
function isValidPeerRecord(
  record: unknown,
  validateValue?: (v: number) => boolean
): record is Record<string, number> {
  if (!isObject(record)) return false;

  for (const [key, value] of Object.entries(record)) {
    if (!isString(key)) return false;
    if (!isValidNumber(value)) return false;
    if (validateValue && !validateValue(value)) return false;
  }

  return true;
}

/**
 * Synchronously validates the structure of a payload without checksum verification.
 * Use this for quick structural validation before async checksum verification.
 *
 * @param data - Unknown data to validate
 * @returns ValidationResult with detailed error information
 */
export function validatePayloadStructure(data: unknown): ValidationResult {
  // Check if data is an object
  if (!isObject(data)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_TYPE',
        message: 'Payload must be a non-null object',
      },
    };
  }

  // Check version field
  if (!('version' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: version',
        field: 'version',
      },
    };
  }
  if (!isValidNumber(data.version) || data.version < 1 || !Number.isInteger(data.version)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_VERSION',
        message: 'Version must be a positive integer',
        field: 'version',
      },
    };
  }

  // Check userId field
  if (!('userId' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: userId',
        field: 'userId',
      },
    };
  }
  if (!isString(data.userId) || data.userId.length === 0) {
    return {
      valid: false,
      error: {
        code: 'INVALID_FIELD_TYPE',
        message: 'userId must be a non-empty string',
        field: 'userId',
      },
    };
  }

  // Check createdAt field
  if (!('createdAt' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: createdAt',
        field: 'createdAt',
      },
    };
  }
  if (!isValidNumber(data.createdAt) || data.createdAt < 0) {
    return {
      valid: false,
      error: {
        code: 'INVALID_TIMESTAMP',
        message: 'createdAt must be a non-negative number',
        field: 'createdAt',
      },
    };
  }

  // Check rho field
  if (!('rho' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: rho',
        field: 'rho',
      },
    };
  }
  if (!isValidNumber(data.rho) || data.rho < 0 || data.rho > 1) {
    return {
      valid: false,
      error: {
        code: 'INVALID_RHO_RANGE',
        message: 'rho must be a number between 0 and 1',
        field: 'rho',
      },
    };
  }

  // Check lastMessageAt field (nullable)
  if (!('lastMessageAt' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: lastMessageAt',
        field: 'lastMessageAt',
      },
    };
  }
  if (data.lastMessageAt !== null && (!isValidNumber(data.lastMessageAt) || data.lastMessageAt < 0)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_TIMESTAMP',
        message: 'lastMessageAt must be null or a non-negative number',
        field: 'lastMessageAt',
      },
    };
  }

  // Check lockedUntil field (nullable)
  if (!('lockedUntil' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: lockedUntil',
        field: 'lockedUntil',
      },
    };
  }
  if (data.lockedUntil !== null && (!isValidNumber(data.lockedUntil) || data.lockedUntil < 0)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_TIMESTAMP',
        message: 'lockedUntil must be null or a non-negative number',
        field: 'lockedUntil',
      },
    };
  }

  // Check aether field
  if (!('aether' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: aether',
        field: 'aether',
      },
    };
  }
  if (!isValidAetherState(data.aether)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_AETHER_STATE',
        message: 'aether must have valid available, staked, and vesting fields',
        field: 'aether',
      },
    };
  }

  // Check peerRho field
  if (!('peerRho' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: peerRho',
        field: 'peerRho',
      },
    };
  }
  if (!isValidPeerRecord(data.peerRho, (v) => v >= 0 && v <= 1)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_PEER_RHO',
        message: 'peerRho must be a Record<string, number> with values between 0 and 1',
        field: 'peerRho',
      },
    };
  }

  // Check peerLastSeenAt field
  if (!('peerLastSeenAt' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: peerLastSeenAt',
        field: 'peerLastSeenAt',
      },
    };
  }
  if (!isValidPeerRecord(data.peerLastSeenAt, (v) => v >= 0)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_PEER_LAST_SEEN',
        message: 'peerLastSeenAt must be a Record<string, number> with non-negative values',
        field: 'peerLastSeenAt',
      },
    };
  }

  // Check checksum field
  if (!('checksum' in data)) {
    return {
      valid: false,
      error: {
        code: 'MISSING_FIELD',
        message: 'Missing required field: checksum',
        field: 'checksum',
      },
    };
  }
  if (!isString(data.checksum) || data.checksum.length === 0) {
    return {
      valid: false,
      error: {
        code: 'INVALID_FIELD_TYPE',
        message: 'checksum must be a non-empty string',
        field: 'checksum',
      },
    };
  }

  return { valid: true };
}

/**
 * Validates a payload including checksum verification.
 * This is an async function because checksum computation uses Web Crypto API.
 *
 * @param data - Unknown data to validate
 * @returns Promise resolving to ValidationResult with detailed error information
 * @requirements 1.6
 */
export async function validatePayloadWithChecksum(data: unknown): Promise<ValidationResult> {
  // First validate structure
  const structureResult = validatePayloadStructure(data);
  if (!structureResult.valid) {
    return structureResult;
  }

  // At this point we know the structure is valid, cast to UserStatePayload
  const payload = data as UserStatePayload;

  // Verify checksum
  const { checksum, ...payloadWithoutChecksum } = payload;
  const computedChecksum = await computeChecksum(payloadWithoutChecksum);

  if (computedChecksum !== checksum) {
    return {
      valid: false,
      error: {
        code: 'CHECKSUM_MISMATCH',
        message: 'Payload checksum does not match computed checksum',
        field: 'checksum',
      },
    };
  }

  return { valid: true };
}

/**
 * Type guard that validates a payload is a valid UserStatePayload.
 * This is a synchronous structural check only - use validatePayloadWithChecksum
 * for full validation including checksum verification.
 *
 * @param data - Unknown data to validate
 * @returns True if data is a valid UserStatePayload structure
 * @requirements 1.6
 */
export function isValidPayloadStructure(data: unknown): data is UserStatePayload {
  return validatePayloadStructure(data).valid;
}

/**
 * Async type guard that validates a payload including checksum verification.
 * Use this as the primary validation function before restoring state.
 *
 * @param data - Unknown data to validate
 * @returns Promise resolving to true if data is a valid UserStatePayload with correct checksum
 * @requirements 1.6
 */
export async function validatePayload(data: unknown): Promise<boolean> {
  const result = await validatePayloadWithChecksum(data);
  return result.valid;
}
