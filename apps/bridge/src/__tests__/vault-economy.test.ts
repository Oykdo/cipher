/**
 * Vault economy proxy — authorization and payload handling.
 *
 * The route proxies a secret-gated Eidolon read, so the two things that must
 * not regress are (a) it only ever reads the vault linked to the caller, and
 * (b) an unusable upstream answer is reported as a failure rather than
 * flattened into a vault sitting at its default values — that flattening is
 * exactly what made Cipher show 51 "Steady" against Eidolon's 46.70.
 */

import { describe, it, expect } from 'vitest';

import {
  resolveRequestedVaultId,
  statusForFailure,
} from '../routes/vaultEconomy.js';
import {
  failureForStatus,
  parseVaultEconomy,
} from '../services/eidolonVaultEconomy.js';

const VAULT_A = '444d0a1dd4e9bf68ec769938db47df1e7fc7ad6beec505af42696e19dfb0e7ab';
const VAULT_B = 'b'.repeat(64);

describe('resolveRequestedVaultId', () => {
  it('falls back to the account vault when no id is requested', () => {
    expect(resolveRequestedVaultId(undefined, [VAULT_A])).toEqual({
      ok: true,
      vaultId: VAULT_A,
    });
    expect(resolveRequestedVaultId('', [VAULT_A])).toEqual({
      ok: true,
      vaultId: VAULT_A,
    });
  });

  it('accepts the linked vault, case-insensitively and untrimmed', () => {
    expect(resolveRequestedVaultId(`  ${VAULT_A.toUpperCase()} `, [VAULT_A])).toEqual({
      ok: true,
      vaultId: VAULT_A,
    });
  });

  it('refuses a vault the caller has not linked', () => {
    expect(resolveRequestedVaultId(VAULT_B, [VAULT_A])).toEqual({
      ok: false,
      code: 'not_linked',
    });
  });

  it('reports an unlinked account separately from a rejected id', () => {
    expect(resolveRequestedVaultId(VAULT_A, [null, undefined])).toEqual({
      ok: false,
      code: 'no_link',
    });
  });

  it('rejects ids the upstream economy route could never serve', () => {
    // Shorter than 16 chars, or not hex.
    expect(resolveRequestedVaultId('deadbeef', [VAULT_A])).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(resolveRequestedVaultId(`${'z'.repeat(64)}`, [VAULT_A])).toEqual({
      ok: false,
      code: 'invalid',
    });
  });

  it('ignores a malformed stored link rather than serving it', () => {
    expect(resolveRequestedVaultId(undefined, ['not-a-vault', VAULT_A])).toEqual({
      ok: true,
      vaultId: VAULT_A,
    });
  });
});

describe('parseVaultEconomy', () => {
  it('keeps upstream precision instead of rounding', () => {
    const state = parseVaultEconomy(
      {
        vault_id: VAULT_A,
        vault_number: 1,
        vault_name: 'zgo',
        pioneer_tier: 'supreme',
        eidolon_balance: 725.4625,
        resonance_score: 46.7,
        operational_entropy: 0,
        holographic_depth_level: 0,
        lifetime_eidolon_earned: 725.4625,
        lifetime_eidolon_spent: 0,
        last_maintenance_at: null,
      },
      VAULT_A,
    );
    expect(state?.resonance_score).toBe(46.7);
    expect(state?.pioneer_tier).toBe('supreme');
    expect(state?.eidolon_balance).toBe(725.4625);
  });

  it('rejects a payload without resonance rather than reading it as 0', () => {
    expect(parseVaultEconomy({ vault_id: VAULT_A }, VAULT_A)).toBeNull();
    expect(
      parseVaultEconomy({ resonance_score: '46.7', operational_entropy: 0 }, VAULT_A),
    ).toBeNull();
    expect(parseVaultEconomy(null, VAULT_A)).toBeNull();
  });

  it('accepts a genuine zero', () => {
    const state = parseVaultEconomy(
      { resonance_score: 0, operational_entropy: 100 },
      VAULT_A,
    );
    expect(state?.resonance_score).toBe(0);
    expect(state?.operational_entropy).toBe(100);
    expect(state?.vault_id).toBe(VAULT_A);
  });
});

describe('failure mapping', () => {
  it('treats a rejected shared secret as a bridge fault, not a client one', () => {
    expect(failureForStatus(401)).toBe('unauthorized');
    expect(failureForStatus(403)).toBe('unauthorized');
    expect(statusForFailure('unauthorized')).toBe(502);
  });

  it('distinguishes an unknown vault from an unreachable Eidolon', () => {
    expect(failureForStatus(404)).toBe('not_found');
    expect(statusForFailure('not_found')).toBe(404);
    expect(statusForFailure('unreachable')).toBe(504);
    expect(statusForFailure('not_configured')).toBe(503);
  });
});
