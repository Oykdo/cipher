/**
 * Eidolon vault token (QR / manual code login) — pure verification helpers.
 *
 * The Eidolon launcher (`[C]` key, `src/crypto/vault_token.py` in the private
 * core) emits a base64 JSON token:
 *
 *   { vault_id, vault_number, vault_name, issued_at, psnx_proof, hmac }
 *
 * Two independent signatures, both over the canonical JSON (`stableJson`:
 * keys sorted recursively, no whitespace, JSON.stringify escaping):
 *
 *   hmac       = HMAC-SHA256(shared secret, canonical(payload without hmac))
 *                — proves the token was minted by a launcher that holds the
 *                deployment secret. It covers psnx_proof.
 *   psnx_proof = HMAC-SHA256(SHA-256(.psnx bytes), canonical(payload without
 *                hmac and psnx_proof))
 *                — proves possession of the vault FILE: only its holder knows
 *                its hash, and the bridge only ever stored that hash
 *                (settings.eidolonBridge.psnxHash) after a file upload on
 *                /auth/eidolon-bridge/session or /auth/vault-link.
 *
 * A shared secret embedded in every launcher is not a proof of ownership of a
 * given vault; the file-hash proof is what binds the token to the vault. Both
 * are required on /api/v2/auth/vault-token/redeem.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export const VAULT_TOKEN_HMAC_FIELD = 'hmac';
export const VAULT_TOKEN_PROOF_FIELD = 'psnx_proof';

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key])}`)
    .join(',')}}`;
}

function withoutFields(tokenData: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tokenData)) {
    if (!fields.includes(key)) copy[key] = value;
  }
  return copy;
}

/** Accepts lowercase/uppercase hex or (url-safe) base64; returns raw bytes or null. */
function decodeSignature(provided: unknown, expectedLength: number): Buffer | null {
  if (typeof provided !== 'string') return null;
  const trimmed = provided.trim();
  if (!trimmed) return null;
  const buffer = /^[a-f0-9]+$/i.test(trimmed)
    ? Buffer.from(trimmed.toLowerCase(), 'hex')
    : Buffer.from(trimmed.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buffer.length === expectedLength ? buffer : null;
}

function safeEqual(expectedHex: string, provided: unknown): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = decodeSignature(provided, expected.length);
  return actual !== null && timingSafeEqual(actual, expected);
}

export function computeVaultTokenHmac(tokenData: Record<string, unknown>, secret: string): string {
  return createHmac('sha256', secret)
    .update(stableJson(withoutFields(tokenData, [VAULT_TOKEN_HMAC_FIELD])))
    .digest('hex');
}

export function verifyVaultTokenHmac(tokenData: Record<string, unknown>, secret: string): boolean {
  if (!secret) return false;
  return safeEqual(computeVaultTokenHmac(tokenData, secret), tokenData[VAULT_TOKEN_HMAC_FIELD]);
}

/** `psnxHashHex` is the stored SHA-256 of the vault file (64 hex chars). */
export function computeVaultTokenPsnxProof(
  tokenData: Record<string, unknown>,
  psnxHashHex: string,
): string {
  const key = Buffer.from(psnxHashHex.trim().toLowerCase(), 'hex');
  return createHmac('sha256', key)
    .update(stableJson(withoutFields(tokenData, [VAULT_TOKEN_HMAC_FIELD, VAULT_TOKEN_PROOF_FIELD])))
    .digest('hex');
}

export function verifyVaultTokenPsnxProof(
  tokenData: Record<string, unknown>,
  psnxHashHex: string | undefined | null,
): boolean {
  if (typeof psnxHashHex !== 'string' || !/^[a-f0-9]{64}$/i.test(psnxHashHex.trim())) {
    return false;
  }
  return safeEqual(
    computeVaultTokenPsnxProof(tokenData, psnxHashHex),
    tokenData[VAULT_TOKEN_PROOF_FIELD],
  );
}
