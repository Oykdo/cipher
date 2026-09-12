/**
 * Vault link (decision D1) — pure decision helpers + DB-layer tests.
 *
 * Two layers, same gating pattern as vault-economy.test.ts / groups.test.ts:
 *
 *   1. Pure unit tests on utils/vaultLink.ts (no DB): vault id
 *      normalisation, the deterministic eidolon_<hash> identity, the PSNX
 *      upload proof shared by /auth/eidolon-bridge/session and
 *      /auth/vault-link, the e2eeRoot decision and the link conflict rules.
 *
 *   2. DB-gated tests behind DATABASE_URL_TEST exercising the database.js
 *      helpers the routes rely on (getUserByLinkedVaultId, linkVaultToUser
 *      with a release of the deterministic account, removeUserSettingKey)
 *      and the partial unique index from scripts/migrations/012 when it is applied.
 *
 * Privacy: fixtures use random bytes as a stand-in for a .psnx; nothing here
 * writes a vault file to disk or logs its bytes.
 */

import { describe, it, expect } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'crypto';

import {
  buildEidolonBridgeIdentity,
  decideVaultLinkConflict,
  hasSrpCredentials,
  normalizeVaultId,
  PSNX_UPLOAD_MAX_BYTES,
  resolveE2eeRoot,
  verifyPsnxUpload,
  VAULT_ID_REGEX,
} from '../utils/vaultLink.js';
import { getDatabase } from '../db/database.js';

const describeDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;

const VAULT_A = '444d0a1dd4e9bf68ec769938db47df1e7fc7ad6beec505af42696e19dfb0e7ab';
const VAULT_B = 'b'.repeat(64);

const sha256Hex = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// ============================================================================
// Layer 1 — pure helpers
// ============================================================================

describe('normalizeVaultId', () => {
  it('trims and lowercases a 64-hex id', () => {
    expect(normalizeVaultId(`  ${VAULT_A.toUpperCase()} `)).toBe(VAULT_A);
    expect(VAULT_ID_REGEX.test(VAULT_A)).toBe(true);
  });

  it('rejects anything that is not exactly 64 hex characters', () => {
    expect(normalizeVaultId('deadbeef')).toBeNull();
    expect(normalizeVaultId('z'.repeat(64))).toBeNull();
    expect(normalizeVaultId(`${VAULT_A}0`)).toBeNull();
    expect(normalizeVaultId('')).toBeNull();
    expect(normalizeVaultId(undefined)).toBeNull();
    expect(normalizeVaultId(42)).toBeNull();
  });
});

describe('buildEidolonBridgeIdentity', () => {
  it('derives eidolon_<sha256[0:24]> / eidolon_<sha256[0:12]> from the normalised id', () => {
    const hash = sha256Hex(Buffer.from(VAULT_A, 'utf8'));
    const identity = buildEidolonBridgeIdentity(VAULT_A);
    expect(identity).toEqual({
      normalizedVaultId: VAULT_A,
      userId: `eidolon_${hash.slice(0, 24)}`,
      username: `eidolon_${hash.slice(0, 12)}`,
    });
  });

  it('is stable across case and whitespace, and distinct per vault', () => {
    expect(buildEidolonBridgeIdentity(`  ${VAULT_A.toUpperCase()}`)).toEqual(
      buildEidolonBridgeIdentity(VAULT_A),
    );
    expect(buildEidolonBridgeIdentity(VAULT_B).userId).not.toBe(
      buildEidolonBridgeIdentity(VAULT_A).userId,
    );
  });
});

describe('verifyPsnxUpload (proof of possession shared by session + vault-link)', () => {
  const psnx = randomBytes(17 * 1024); // a real .psnx is ~17 KB
  const psnxB64 = psnx.toString('base64');
  const psnxHash = sha256Hex(psnx);

  it('computes the SHA-256 server-side when no hash is announced', () => {
    expect(verifyPsnxUpload(psnxB64, '')).toEqual({ ok: true, psnxHash });
    expect(psnxHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts an announced hash that matches (case-insensitively)', () => {
    expect(verifyPsnxUpload(psnxB64, psnxHash.toUpperCase())).toEqual({ ok: true, psnxHash });
    expect(verifyPsnxUpload(psnxB64, `  ${psnxHash} `)).toEqual({ ok: true, psnxHash });
  });

  it('answers 401 when the announced hash does not match the bytes', () => {
    const result = verifyPsnxUpload(psnxB64, sha256Hex(randomBytes(8)));
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: 'PSNX file hash does not match uploaded content',
    });
  });

  it('answers 400 for an empty upload', () => {
    expect(verifyPsnxUpload('', '')).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid PSNX file upload (empty or exceeds 2 MB)',
    });
  });

  it('answers 400 above the 2 MB cap and accepts exactly 2 MB', () => {
    const tooBig = Buffer.alloc(PSNX_UPLOAD_MAX_BYTES + 1, 1).toString('base64');
    expect(verifyPsnxUpload(tooBig, '')).toMatchObject({ ok: false, status: 400 });

    const atCap = Buffer.alloc(PSNX_UPLOAD_MAX_BYTES, 1);
    expect(verifyPsnxUpload(atCap.toString('base64'), '')).toEqual({
      ok: true,
      psnxHash: sha256Hex(atCap),
    });
  });

  it('returns only the hash, never the bytes', () => {
    const result = verifyPsnxUpload(psnxB64, '');
    expect(Object.keys(result).sort()).toEqual(['ok', 'psnxHash']);
  });
});

describe('e2eeRoot decision', () => {
  it('is "mnemonic" for any account holding SRP credentials', () => {
    // Standard / DiceKey signups store the mnemonic verifier in srp_seed_*;
    // srp_* is only filled once a device password is set. Both count.
    expect(resolveE2eeRoot({ srp_seed_verifier: 'v', srp_verifier: null })).toBe('mnemonic');
    expect(resolveE2eeRoot({ srp_seed_verifier: null, srp_verifier: 'v' })).toBe('mnemonic');
    expect(hasSrpCredentials({ srp_seed_verifier: 'v' })).toBe(true);
  });

  it('is "vault" for deterministic vault-native accounts (no SRP anywhere)', () => {
    expect(resolveE2eeRoot({ srp_seed_verifier: null, srp_verifier: null })).toBe('vault');
    expect(resolveE2eeRoot({})).toBe('vault');
    expect(resolveE2eeRoot(null)).toBe('vault');
    expect(hasSrpCredentials(undefined)).toBe(false);
  });
});

describe('decideVaultLinkConflict (POST /auth/vault-link rules)', () => {
  const me = randomUUID();
  const deterministic = buildEidolonBridgeIdentity(VAULT_A).userId;
  const base = { meUserId: me, vaultId: VAULT_A, myCurrentVaultId: null, holderUserId: null, replace: false };

  it('links freely when nobody holds the vault and I am unlinked', () => {
    expect(decideVaultLinkConflict(base)).toEqual({ kind: 'ok' });
  });

  it('is idempotent when I already hold this vault', () => {
    expect(
      decideVaultLinkConflict({ ...base, myCurrentVaultId: VAULT_A, holderUserId: me }),
    ).toEqual({ kind: 'ok' });
  });

  it('moves the link away from the vault\'s deterministic account', () => {
    expect(decideVaultLinkConflict({ ...base, holderUserId: deterministic })).toEqual({
      kind: 'move',
      fromUserId: deterministic,
    });
  });

  it('refuses a vault held by any other real account', () => {
    expect(decideVaultLinkConflict({ ...base, holderUserId: randomUUID() })).toEqual({
      kind: 'other_account',
    });
    // The deterministic id of a DIFFERENT vault is just another account.
    expect(
      decideVaultLinkConflict({ ...base, holderUserId: buildEidolonBridgeIdentity(VAULT_B).userId }),
    ).toEqual({ kind: 'other_account' });
  });

  it('refuses to silently swap my vault unless replace is set', () => {
    expect(decideVaultLinkConflict({ ...base, myCurrentVaultId: VAULT_B })).toEqual({
      kind: 'already_linked',
      currentVaultId: VAULT_B,
    });
    expect(decideVaultLinkConflict({ ...base, myCurrentVaultId: VAULT_B, replace: true })).toEqual({
      kind: 'ok',
    });
    expect(
      decideVaultLinkConflict({
        ...base,
        myCurrentVaultId: VAULT_B,
        holderUserId: deterministic,
        replace: true,
      }),
    ).toEqual({ kind: 'move', fromUserId: deterministic });
  });

  it('reports my own stale link before the holder conflict', () => {
    expect(
      decideVaultLinkConflict({ ...base, myCurrentVaultId: VAULT_B, holderUserId: randomUUID() }),
    ).toEqual({ kind: 'already_linked', currentVaultId: VAULT_B });
  });
});

// ============================================================================
// Layer 2 — database helpers (DATABASE_URL_TEST only)
// ============================================================================

describeDb('vault link — database helpers', () => {
  const mnemonicUser = async () => {
    const db = getDatabase();
    const id = `user_${randomUUID()}`.slice(0, 32);
    return db.createUser({
      id,
      username: `u_${randomUUID().slice(0, 8)}`,
      security_tier: 'standard',
      srp_seed_salt: 'salt',
      srp_seed_verifier: 'verifier',
    });
  };

  const deterministicUser = async (vaultId: string) => {
    const db = getDatabase();
    const identity = buildEidolonBridgeIdentity(vaultId);
    const user = await db.createUser({
      id: identity.userId,
      username: identity.username,
      security_tier: 'standard',
      srp_salt: null,
      srp_verifier: null,
    });
    await db.updateUserLinkedVaultId(user.id, vaultId);
    await db.updateUserSettings(user.id, {
      eidolonBridge: { vaultId, source: 'desktop_bridge', psnxHash: 'a'.repeat(64) },
      privacy: { postPickupRetentionDays: 7 },
    });
    return user;
  };

  const hasUniqueIndex = async () => {
    const db = getDatabase();
    const { rows } = await db.pool.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'users' AND indexname = 'idx_users_linked_vault_id'`,
    );
    return rows.length > 0;
  };

  it('getUserByLinkedVaultId resolves through users.linked_vault_id', async () => {
    const db = getDatabase();
    const me = await mnemonicUser();

    expect(await db.getUserByLinkedVaultId(VAULT_A)).toBeUndefined();

    await db.updateUserLinkedVaultId(me.id, VAULT_A);
    const found = await db.getUserByLinkedVaultId(VAULT_A);
    expect(found?.id).toBe(me.id);
    expect(resolveE2eeRoot(found)).toBe('mnemonic');

    await db.updateUserLinkedVaultId(me.id, null);
    expect(await db.getUserByLinkedVaultId(VAULT_A)).toBeUndefined();
  });

  it('linkVaultToUser moves the link off the deterministic account atomically', async () => {
    const db = getDatabase();
    const det = await deterministicUser(VAULT_A);
    const me = await mnemonicUser();

    await db.linkVaultToUser(me.id, VAULT_A, { releaseFromUserId: det.id });

    const detRow = await db.getUserById(det.id);
    expect(detRow.linked_vault_id).toBeNull();
    const detSettings = await db.getUserSettings(det.id);
    expect(detSettings.eidolonBridge).toBeUndefined();
    // Unrelated settings of the released account survive.
    expect(detSettings.privacy).toEqual({ postPickupRetentionDays: 7 });

    const meRow = await db.getUserById(me.id);
    expect(meRow.linked_vault_id).toBe(VAULT_A);
    expect((await db.getUserByLinkedVaultId(VAULT_A))?.id).toBe(me.id);
  });

  it('removeUserSettingKey drops only the eidolonBridge blob', async () => {
    const db = getDatabase();
    const me = await mnemonicUser();
    await db.updateUserSettings(me.id, {
      eidolonBridge: { vaultId: VAULT_A, psnxHash: 'b'.repeat(64) },
      privacy: { postPickupRetentionDays: 1 },
    });

    await db.removeUserSettingKey(me.id, 'eidolonBridge');

    const settings = await db.getUserSettings(me.id);
    expect(settings.eidolonBridge).toBeUndefined();
    expect(settings.privacy).toEqual({ postPickupRetentionDays: 1 });
  });

  it('migration 012: one account per vault (unique_violation 23505)', async () => {
    const db = getDatabase();
    if (!(await hasUniqueIndex())) {
      console.warn('[vault-link] idx_users_linked_vault_id not applied on the test DB; skipping uniqueness check');
      return;
    }
    const first = await mnemonicUser();
    const second = await mnemonicUser();
    await db.linkVaultToUser(first.id, VAULT_B);

    await expect(db.linkVaultToUser(second.id, VAULT_B)).rejects.toMatchObject({ code: '23505' });
    // The rollback left the loser untouched.
    expect((await db.getUserById(second.id)).linked_vault_id).toBeNull();
    expect((await db.getUserByLinkedVaultId(VAULT_B))?.id).toBe(first.id);
  });
});
