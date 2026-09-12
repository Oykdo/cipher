/**
 * Eidolon vault token — canonical JSON, shared-secret HMAC and the PSNX
 * possession proof. Pure helpers, no DB.
 *
 * The vectors below are shared with the Eidolon side
 * (`src/crypto/vault_token.py`, `tests/test_vault_token.py` in the private
 * core): the two implementations must agree byte for byte.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

import {
  computeVaultTokenHmac,
  computeVaultTokenPsnxProof,
  stableJson,
  verifyVaultTokenHmac,
  verifyVaultTokenPsnxProof,
} from '../utils/vaultToken.js';

const PAYLOAD = {
  vault_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  vault_number: 7,
  vault_name: 'Coffre Ünï',
  issued_at: '2026-09-12T00:00:00Z',
};
const CANONICAL =
  '{"issued_at":"2026-09-12T00:00:00Z","vault_id":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","vault_name":"Coffre Ünï","vault_number":7}';
const SECRET = 'test-secret';
const HMAC_VECTOR = 'd3f0ec91d34c374a6f5c71faf0a12ba9ff92d7844f91197864c05cbd1ff54d29';
const PSNX_BYTES = Buffer.from('PSNX7D_COMPLETE_V2 fake vector bytes for proof test', 'utf8');
const PSNX_HASH = 'e8f6ea0299489866ce3990d8d32ab8f26fe307987b5bec0cae96ef63c64273f3';
const PROOF_VECTOR = '66292a0271ed7dca187152ae985656d3d45581d46ac60cd508f6944122e8abc0';

describe('vault token — canonical JSON', () => {
  it('sorts keys recursively without whitespace and keeps unicode', () => {
    expect(stableJson(PAYLOAD)).toBe(CANONICAL);
    expect(stableJson({ b: [{ z: 1, a: null }], a: 'x' })).toBe('{"a":"x","b":[{"a":null,"z":1}]}');
  });
});

describe('vault token — shared-secret hmac', () => {
  it('matches the cross-implementation vector', () => {
    expect(computeVaultTokenHmac(PAYLOAD, SECRET)).toBe(HMAC_VECTOR);
    expect(verifyVaultTokenHmac({ ...PAYLOAD, hmac: HMAC_VECTOR }, SECRET)).toBe(true);
    expect(verifyVaultTokenHmac({ ...PAYLOAD, hmac: HMAC_VECTOR.toUpperCase() }, SECRET)).toBe(true);
  });

  it('covers psnx_proof and rejects tampering, wrong secret, missing field', () => {
    const proof = computeVaultTokenPsnxProof(PAYLOAD, PSNX_HASH);
    const signed = { ...PAYLOAD, psnx_proof: proof };
    const hmac = computeVaultTokenHmac(signed, SECRET);
    expect(hmac).not.toBe(HMAC_VECTOR);
    expect(verifyVaultTokenHmac({ ...signed, hmac }, SECRET)).toBe(true);
    expect(verifyVaultTokenHmac({ ...signed, psnx_proof: proof.replace(/^./, 'f'), hmac }, SECRET)).toBe(false);
    expect(verifyVaultTokenHmac({ ...signed, hmac }, 'other')).toBe(false);
    expect(verifyVaultTokenHmac({ ...signed }, SECRET)).toBe(false);
    expect(verifyVaultTokenHmac({ ...signed, hmac }, '')).toBe(false);
  });
});

describe('vault token — psnx possession proof', () => {
  it('is keyed by the raw SHA-256 of the vault file and matches the vector', () => {
    expect(createHash('sha256').update(PSNX_BYTES).digest('hex')).toBe(PSNX_HASH);
    expect(computeVaultTokenPsnxProof(PAYLOAD, PSNX_HASH)).toBe(PROOF_VECTOR);
    // The proof is over the payload without hmac and without itself.
    expect(computeVaultTokenPsnxProof({ ...PAYLOAD, psnx_proof: 'x', hmac: 'y' }, PSNX_HASH)).toBe(PROOF_VECTOR);
    expect(verifyVaultTokenPsnxProof({ ...PAYLOAD, psnx_proof: PROOF_VECTOR }, PSNX_HASH)).toBe(true);
  });

  it('rejects a different file, a tampered payload, a missing proof or an unusable stored hash', () => {
    const other = createHash('sha256').update(Buffer.from('other file')).digest('hex');
    expect(verifyVaultTokenPsnxProof({ ...PAYLOAD, psnx_proof: PROOF_VECTOR }, other)).toBe(false);
    expect(verifyVaultTokenPsnxProof({ ...PAYLOAD, vault_number: 8, psnx_proof: PROOF_VECTOR }, PSNX_HASH)).toBe(false);
    expect(verifyVaultTokenPsnxProof({ ...PAYLOAD }, PSNX_HASH)).toBe(false);
    expect(verifyVaultTokenPsnxProof({ ...PAYLOAD, psnx_proof: PROOF_VECTOR }, undefined)).toBe(false);
    expect(verifyVaultTokenPsnxProof({ ...PAYLOAD, psnx_proof: PROOF_VECTOR }, 'not-hex')).toBe(false);
  });
});
