/**
 * Single access point for the vault → E2EE root (`vault-e2ee:derive-seed`
 * IPC, contract v1: cipher-e2ee/SPEC_VAULT_E2EE_SEED_V1.md). Same shape as
 * lib/vaultFiles.ts.
 *
 * A vault-native Cipher account has no mnemonic: its masterKeyHex is the seed
 * the Eidolon runtime derives from the .psnx. The renderer names a vault id,
 * never a path; the main process resolves the file from the bridge context /
 * Eidolon registry and spawns the runtime. The seed crosses IPC once and is
 * handed straight to the same four steps LoginMnemonic runs after SRP — it is
 * never logged and never stored by this module. Outside Electron every call
 * resolves to `{ ok: false, error: 'unavailable' }`.
 */

import { getE2EEVault } from './keyVault';
import { setSessionMasterKey } from './masterKeyResolver';
import { setTemporaryMasterKey } from './secureKeyAccess';
import { initializeE2EE, publishKeyBundleToServer } from './e2ee/e2eeService';

export type DeriveVaultMasterKeyResult =
  | { ok: true; keyId: string; vaultId: string; masterKeyHex: string }
  | { ok: false; error: string; errorCode?: string };

export interface OpenVaultE2EEResult {
  /** True when the E2EE service is initialized for the user. */
  ok: boolean;
  /** One entry per failed step, without any key material. */
  warnings: string[];
}

/** Error code returned when the IPC surface is not exposed (browser dev). */
export const VAULT_E2EE_UNAVAILABLE = 'unavailable';

const MASTER_KEY_HEX_REGEX = /^[0-9a-f]{64}$/;

function vaultE2EEApi() {
  return window.electron?.deriveVaultE2EESeed;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function isVaultE2EEAvailable(): boolean {
  return typeof vaultE2EEApi() === 'function';
}

/**
 * Derive the account masterKeyHex from the vault file of `vaultId`. The file
 * is resolved main-side (bridge context, then Eidolon registry) — a QR / code
 * login never carries it, so this fails with `psnx_not_found` on a device
 * that has never seen the vault.
 */
export async function deriveVaultMasterKey(vaultId: string): Promise<DeriveVaultMasterKeyResult> {
  const api = vaultE2EEApi();
  if (!api) return { ok: false, error: VAULT_E2EE_UNAVAILABLE };
  const id = String(vaultId ?? '').trim();
  if (!id) return { ok: false, error: 'invalid_vault_id', errorCode: 'invalid_vault_id' };
  try {
    const result = await api(id);
    if (!result?.ok) {
      return { ok: false, error: result?.error || 'derive_failed', errorCode: result?.errorCode };
    }
    const masterKeyHex = String(result.masterKeyHex ?? '').toLowerCase();
    if (!MASTER_KEY_HEX_REGEX.test(masterKeyHex)) {
      return { ok: false, error: 'malformed_seed', errorCode: 'malformed_seed' };
    }
    return {
      ok: true,
      keyId: String(result.keyId ?? ''),
      vaultId: String(result.vaultId ?? id),
      masterKeyHex,
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'derive_failed') };
  }
}

/**
 * Open the E2EE layer for a vault-native session — the four post-login
 * steps of LoginMnemonic, in the same order, each best-effort: session
 * masterKey cache → persisted masterKey → E2EE key vault → E2EE service.
 * The explicit key-bundle publish that LoginMnemonic adds afterwards is
 * kept too (the one inside initializeE2EE is fire-and-forget).
 */
export async function openVaultE2EE(username: string, masterKeyHex: string): Promise<OpenVaultE2EEResult> {
  const warnings: string[] = [];
  const step = async (label: string, run: () => Promise<unknown>): Promise<boolean> => {
    try {
      await run();
      return true;
    } catch (err) {
      console.warn(`[vault-e2ee] ${label} failed`, err);
      warnings.push(`${label}: ${errorText(err, 'failed')}`);
      return false;
    }
  };

  await step('session masterKey cache', () => setSessionMasterKey(masterKeyHex));
  await step('persist masterKey', () => setTemporaryMasterKey(masterKeyHex));
  await step('E2EE vault init', () => getE2EEVault(masterKeyHex));
  const initialized = await step('E2EE init', () => initializeE2EE(username));
  if (initialized) {
    await step('key bundle publish', () => publishKeyBundleToServer());
  }

  return { ok: initialized, warnings };
}
