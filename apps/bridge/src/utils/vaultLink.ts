/**
 * Vault link helpers — pure functions shared by the Eidolon vault auth routes
 * (routes/auth.ts: eidolon-bridge/session, vault-token/redeem, vault-link).
 *
 * Nothing in this module touches the database or the network, so the
 * decision logic (identity derivation, PSNX upload proof, E2EE root, link
 * conflict rules) can be unit-tested without DATABASE_URL_TEST.
 *
 * Privacy (CIPHER_PRIVACY_GUARANTEES.md): the .psnx bytes received through
 * `psnxFileBase64` exist only for the duration of `verifyPsnxUpload`; the
 * function returns the SHA-256 and zeroes the buffer. Callers must never log
 * or persist the bytes, and must never log the hash next to an IP address.
 */

import { createHash } from 'crypto';

// ============================================================================
// Vault id
// ============================================================================

/** Eidolon vault ids are 64 lowercase hex characters (sha256 of the vault). */
export const VAULT_ID_REGEX = /^[0-9a-f]{64}$/;

/**
 * Trim + lowercase a client-supplied vault id. Returns null when the result
 * is not a 64-hex-character id — callers answer 400 in that case.
 */
export function normalizeVaultId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return VAULT_ID_REGEX.test(normalized) ? normalized : null;
}

/**
 * Deterministic Cipher identity for a vault, used when no account has
 * explicitly linked the vault (decision D1 keeps this as the fallback only).
 *
 * Moved unchanged from routes/auth.ts — the userId/username shape is part of
 * the contract with existing vault-native accounts and must not change.
 */
export function buildEidolonBridgeIdentity(vaultId: string) {
  const normalizedVaultId = vaultId.trim().toLowerCase();
  const hash = createHash('sha256').update(normalizedVaultId).digest('hex');
  return {
    normalizedVaultId,
    userId: `eidolon_${hash.slice(0, 24)}`,
    username: `eidolon_${hash.slice(0, 12)}`,
  };
}

// ============================================================================
// PSNX upload proof of possession
// ============================================================================

export const PSNX_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export type PsnxUploadResult =
  | { ok: true; psnxHash: string }
  | { ok: false; status: 400 | 401; error: string };

/**
 * Proof of possession by upload: the client sends the .psnx bytes, the server
 * recomputes SHA-256 itself (no TOFU on a client-announced hash). When the
 * client also announces `psnxHash`, it must match the recomputed value.
 *
 * This is the exact validation the eidolon-bridge/session route (path B,
 * first registration) performs; POST /auth/vault-link reuses it so the two
 * proofs cannot drift apart.
 */
export function verifyPsnxUpload(psnxFileBase64: string, clientPsnxHash: string): PsnxUploadResult {
  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(psnxFileBase64, 'base64');
  } catch {
    return { ok: false, status: 400, error: 'Invalid PSNX file upload: base64 decode failed' };
  }

  if (fileBuffer.length === 0 || fileBuffer.length > PSNX_UPLOAD_MAX_BYTES) {
    return { ok: false, status: 400, error: 'Invalid PSNX file upload (empty or exceeds 2 MB)' };
  }

  const serverPsnxHash = createHash('sha256').update(fileBuffer).digest('hex');
  // The vault file is a secret: drop the bytes as soon as the hash exists.
  fileBuffer.fill(0);

  const announced = clientPsnxHash.trim().toLowerCase();
  if (announced && serverPsnxHash !== announced) {
    return { ok: false, status: 401, error: 'PSNX file hash does not match uploaded content' };
  }

  return { ok: true, psnxHash: serverPsnxHash };
}

// ============================================================================
// E2EE root
// ============================================================================

export type E2eeRoot = 'mnemonic' | 'vault';

export interface SrpCredentialColumns {
  srp_verifier?: string | null;
  srp_seed_verifier?: string | null;
}

/**
 * An account "has SRP credentials" when it can log in with a mnemonic.
 *
 * Standard / DiceKey signups store the mnemonic-derived verifier in
 * `srp_seed_verifier`; `srp_verifier` is only filled once the user picks a
 * device password (/auth/srp/setup). Vault-native accounts created by the
 * bridge routes have neither. Checking `srp_verifier` alone would therefore
 * misclassify every mnemonic account without a device password as
 * vault-rooted — both columns are consulted.
 */
export function hasSrpCredentials(user: SrpCredentialColumns | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.srp_verifier) || Boolean(user.srp_seed_verifier);
}

/**
 * Which secret the client must derive the E2EE master key from.
 *   - 'mnemonic': the account owns a BIP-39 mnemonic (SRP credentials exist);
 *     the vault is only an authentication factor (decision D1).
 *   - 'vault': deterministic vault-native account, no mnemonic anywhere.
 */
export function resolveE2eeRoot(user: SrpCredentialColumns | null | undefined): E2eeRoot {
  return hasSrpCredentials(user) ? 'mnemonic' : 'vault';
}

// ============================================================================
// Link conflict rules (POST /auth/vault-link)
// ============================================================================

export type VaultLinkConflict =
  | { kind: 'ok' }
  /** The vault's deterministic account holds the link: move it to the caller. */
  | { kind: 'move'; fromUserId: string }
  /** Another real account holds the link → 409. */
  | { kind: 'other_account' }
  /** The caller is linked to a different vault and did not pass replace → 409. */
  | { kind: 'already_linked'; currentVaultId: string };

export function decideVaultLinkConflict(input: {
  /** Authenticated caller. */
  meUserId: string;
  /** Vault id the caller wants to link (normalized). */
  vaultId: string;
  /** users.linked_vault_id currently on the caller's row. */
  myCurrentVaultId: string | null | undefined;
  /** Id of the user whose linked_vault_id already equals vaultId, if any. */
  holderUserId: string | null | undefined;
  /** Caller sent `replace: true`. */
  replace: boolean;
}): VaultLinkConflict {
  const { meUserId, vaultId, myCurrentVaultId, holderUserId, replace } = input;

  if (myCurrentVaultId && myCurrentVaultId !== vaultId && !replace) {
    return { kind: 'already_linked', currentVaultId: myCurrentVaultId };
  }

  if (holderUserId && holderUserId !== meUserId) {
    const deterministicUserId = buildEidolonBridgeIdentity(vaultId).userId;
    if (holderUserId === deterministicUserId) {
      return { kind: 'move', fromUserId: holderUserId };
    }
    return { kind: 'other_account' };
  }

  return { kind: 'ok' };
}
