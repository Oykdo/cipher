/**
 * Single access point for the sphere custody client (`sphere:*` IPC,
 * Eidolon I4). Same shape as lib/vaultFiles.ts and lib/vaultE2EE.ts.
 *
 * A vault's spheres live in a custody ledger anchored on the Eidolon REST
 * API (`EIDOLON_API_BASE_URL`, `/api/v1/sphere/*` — not the Connect host,
 * which knows nothing of it); the client is the Eidolon runtime
 * (`cipher-runtime sphere …`), spawned by the main process. The renderer names a vault id and a sphere id, never a
 * path: import/export destinations come from native dialogs. A sphere file
 * carries no secret; the vault's one-time keys are re-derived from the vault
 * file by the runtime and never cross IPC. Outside Electron every call
 * resolves to `{ ok: false, error: 'unavailable' }`.
 *
 * Verdicts (`state`): "finale" — a receipt or a signed checkpoint of the
 * anchor includes the head; "en attente" — accepted locally, not yet
 * finalised (or the anchor was unreachable); "brûlée"; "invalide".
 */

import { EIDOLON_API_BASE_URL } from '../config';

export type SphereState = 'finale' | 'en attente' | 'brûlée' | 'invalide';

export interface SphereStatus {
  sphere_id: string;
  rarity: string;
  name?: string | null;
  owner?: string | null;
  seq: number;
  head_hash: string;
  ok: boolean;
  final: boolean;
  final_by?: 'receipt' | 'checkpoint' | null;
  revealed: boolean;
  burned: boolean;
  pending: boolean;
  controllable: boolean;
  errors: string[];
  state: SphereState;
}

export type SphereFailure = { ok: false; error: string; errorCode?: string; sphereId?: string };

export type SphereListResult =
  | { ok: true; spheres: SphereStatus[]; trustedIssuer: boolean; genesisCached: boolean }
  | SphereFailure;

export type SphereSyncResult =
  | {
      ok: true;
      spheres: SphereStatus[];
      resubmitted: string[];
      updated: string[];
      received: string[];
      transferredAway: string[];
      burned: string[];
      mismatches: string[];
      /** Claims the anchor still holds in its queue for this vault (key window not released). */
      queued: string[];
      final: number;
      waiting: number;
      /** `owned` / `queue` here mean the anchor was NOT reached for that step (ok is still true). */
      errors: Record<string, string>;
      /** Only runtimes ≥ 1.2.1 report it on sync; undefined otherwise. */
      trustedIssuer?: boolean;
      /**
       * Genesis spheres the treasury still holds for this vault (runtime ≥ 1.3.1):
       * a right, not a head, so they are in neither `final` nor `waiting` until
       * claimed. Undefined when the runtime is older or the anchor could not say
       * (then `errors.claimable`).
       */
      claimable?: string[];
    }
  | SphereFailure;

export type SphereClaimResult =
  | {
      ok: true;
      vaultNumber: number | null;
      claimed: SphereStatus[];
      already: SphereStatus[];
      deferred: string[];
      errors: Record<string, string>;
    }
  | SphereFailure;

export type SphereMailboxResult =
  | { ok: true; deposited: number; pending: number | null }
  | SphereFailure;

export type SphereTransferResult =
  | { ok: true; sphereId: string; to: string; seq: number; final: boolean; state: SphereState }
  | SphereFailure;

export type SphereImportResult =
  | {
      ok: true;
      sphereId: string;
      state: SphereState;
      final: boolean;
      submitted: number[];
      filename: string;
      /** The imported sphere's full row, as `list` would show it. */
      status: SphereStatus | null;
    }
  | SphereFailure;

export type SphereExportResult =
  | { ok: true; sphereId: string; state: SphereState; filename: string; size: number }
  | SphereFailure;

export type SphereQueueResult =
  | { ok: true; queued: { sphereId: string; vaultNumber: number; requestedAt: string }[] }
  | SphereFailure;

/** A custody step signed by this vault — burn or reissue-key — as the runtime reports it. */
export type SphereCustodyResult =
  | { ok: true; sphereId: string; seq: number; headHash: string; final: boolean; state: SphereState }
  | SphereFailure;

/** Error code returned when the IPC surface is not exposed (browser dev). */
export const SPHERES_UNAVAILABLE = 'unavailable';

const VAULT_ID_REGEX = /^[0-9a-f]{64}$/;

function sphereApi() {
  return window.electron?.sphere;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function failure(result: { error?: string; errorCode?: string; sphereId?: string } | null | undefined, fallback: string): SphereFailure {
  return { ok: false, error: result?.error || fallback, errorCode: result?.errorCode, sphereId: result?.sphereId };
}

function statuses(value: unknown): SphereStatus[] {
  return Array.isArray(value) ? (value as SphereStatus[]) : [];
}

export function isSphereClientAvailable(): boolean {
  return Boolean(sphereApi());
}

export function isValidVaultId(value: string): boolean {
  return VAULT_ID_REGEX.test(value.trim().toLowerCase());
}

/** Local inventory — offline, instant. */
export async function listSpheres(vaultId: string): Promise<SphereListResult> {
  const api = sphereApi();
  if (!api) return { ok: false, error: SPHERES_UNAVAILABLE };
  try {
    const result = await api.list(vaultId);
    if (!result?.ok) return failure(result, 'list_failed');
    return {
      ok: true,
      spheres: statuses(result.spheres),
      trustedIssuer: Boolean(result.trusted_issuer),
      genesisCached: Boolean(result.genesis_cached),
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'list_failed') };
  }
}

/** « Local heads = anchor heads »: resubmit, refresh finality, fetch what the anchor holds for this vault. */
export async function syncSpheres(vaultId: string): Promise<SphereSyncResult> {
  const api = sphereApi();
  if (!api) return { ok: false, error: SPHERES_UNAVAILABLE };
  try {
    const result = await api.sync(vaultId, EIDOLON_API_BASE_URL);
    if (!result?.ok) return failure(result, 'sync_failed');
    return {
      ok: true,
      spheres: statuses(result.spheres),
      resubmitted: result.resubmitted ?? [],
      updated: result.updated ?? [],
      received: result.received ?? [],
      transferredAway: result.transferred_away ?? [],
      burned: result.burned ?? [],
      mismatches: result.mismatches ?? [],
      queued: result.queued ?? [],
      final: Number(result.final ?? 0),
      waiting: Number(result.waiting ?? 0),
      errors: result.errors ?? {},
      ...(typeof result.trusted_issuer === 'boolean' ? { trustedIssuer: result.trusted_issuer } : {}),
      ...(Array.isArray(result.claimable) ? { claimable: result.claimable.map(String) } : {}),
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'sync_failed') };
  }
}

/** Claim the vault's genesis spheres (one WOTS+ root per sphere, derived by the runtime). */
export async function claimSpheres(vaultId: string): Promise<SphereClaimResult> {
  const api = sphereApi();
  if (!api) return { ok: false, error: SPHERES_UNAVAILABLE };
  try {
    const result = await api.claim(vaultId, EIDOLON_API_BASE_URL);
    if (!result?.ok) return failure(result, 'claim_failed');
    return {
      ok: true,
      vaultNumber: typeof result.vault_number === 'number' ? result.vault_number : null,
      claimed: statuses(result.claimed),
      already: statuses(result.already),
      deferred: result.deferred ?? [],
      errors: result.errors ?? {},
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'claim_failed') };
  }
}

/** Deposit fresh one-time roots so that others can transfer to this vault without a prior exchange. */
export async function depositSphereMailbox(vaultId: string, count = 8): Promise<SphereMailboxResult> {
  const api = sphereApi();
  if (!api) return { ok: false, error: SPHERES_UNAVAILABLE };
  try {
    const result = await api.mailbox(vaultId, count, EIDOLON_API_BASE_URL);
    if (!result?.ok) return failure(result, 'mailbox_failed');
    return {
      ok: true,
      deposited: Number(result.deposited ?? 0),
      pending: typeof result.pending === 'number' ? result.pending : null,
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'mailbox_failed') };
  }
}

/**
 * Transfer a sphere to another vault. The runtime reads the anchor's head,
 * signs once, writes before submitting, submits; a second signature for the
 * same head is never produced (a retry towards the same recipient resends
 * the same record).
 */
export async function transferSphere(vaultId: string, sphereId: string, to: string): Promise<SphereTransferResult> {
  const api = sphereApi();
  if (!api) return { ok: false, error: SPHERES_UNAVAILABLE };
  const recipient = to.trim().toLowerCase();
  if (!VAULT_ID_REGEX.test(recipient)) return { ok: false, error: 'invalid_recipient', errorCode: 'invalid_input' };
  try {
    const result = await api.transfer(vaultId, sphereId, recipient, EIDOLON_API_BASE_URL);
    if (!result?.ok) return failure(result, 'transfer_failed');
    return { ok: true, sphereId: result.sphere_id, to: result.to, seq: result.seq, final: Boolean(result.final), state: result.state };
  } catch (err) {
    return { ok: false, error: errorText(err, 'transfer_failed') };
  }
}

/** The claims the anchor holds in its queue for this vault (key window not released). */
export async function queueSpheres(vaultId: string): Promise<SphereQueueResult> {
  const api = sphereApi();
  if (!api?.queue) return { ok: false, error: SPHERES_UNAVAILABLE };
  try {
    const result = await api.queue(vaultId, EIDOLON_API_BASE_URL);
    if (!result?.ok) return failure(result, 'queue_failed');
    const rows = Array.isArray(result.queued) ? result.queued : [];
    return {
      ok: true,
      queued: rows.map((q) => ({ sphereId: String(q.sphere_id), vaultNumber: Number(q.vault_number), requestedAt: String(q.requested_at ?? '') })),
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'queue_failed') };
  }
}

function custody(result: { sphere_id: string; seq: number; head_hash: string; final: boolean; state: SphereState }): Extract<SphereCustodyResult, { ok: true }> {
  return { ok: true, sphereId: result.sphere_id, seq: Number(result.seq), headHash: String(result.head_hash), final: Boolean(result.final), state: result.state };
}

/** Burn a sphere: irreversible, the chain ends, a tombstone stays in the inventory. `confirm` comes from the user. */
export async function burnSphere(vaultId: string, sphereId: string, confirm: boolean): Promise<SphereCustodyResult> {
  const api = sphereApi();
  if (!api?.burn) return { ok: false, error: SPHERES_UNAVAILABLE };
  if (confirm !== true) return { ok: false, error: 'confirmation_required', errorCode: 'confirmation_required', sphereId };
  try {
    const result = await api.burn(vaultId, sphereId, true, EIDOLON_API_BASE_URL);
    if (!result?.ok) return failure(result, 'burn_failed');
    return custody(result);
  } catch (err) {
    return { ok: false, error: errorText(err, 'burn_failed') };
  }
}

/** Reissue the controlling key of a sphere (it does not move). `force` revokes a signed, unsubmitted transfer. */
export async function reissueSphereKey(vaultId: string, sphereId: string, force = false): Promise<SphereCustodyResult> {
  const api = sphereApi();
  if (!api?.reissueKey) return { ok: false, error: SPHERES_UNAVAILABLE };
  try {
    const result = await api.reissueKey(vaultId, sphereId, force === true, EIDOLON_API_BASE_URL);
    if (!result?.ok) return failure(result, 'reissue_failed');
    return custody(result);
  } catch (err) {
    return { ok: false, error: errorText(err, 'reissue_failed') };
  }
}

/** Pick a *.sphere.json and import it: verified offline, then confronted with the anchor. */
export async function importSphereFile(vaultId: string): Promise<SphereImportResult> {
  const api = sphereApi();
  if (!api) return { ok: false, error: SPHERES_UNAVAILABLE };
  try {
    const result = await api.importFile(vaultId, EIDOLON_API_BASE_URL);
    if (!result?.ok) return failure(result, 'import_failed');
    return {
      ok: true,
      sphereId: result.sphere_id,
      state: result.state,
      final: Boolean(result.final),
      submitted: result.submitted ?? [],
      filename: result.filename,
      status: result.status && typeof result.status === 'object' ? result.status : null,
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'import_failed') };
  }
}

/** Write a sphere file where the user chooses (includes a pending signed transfer, if any). */
export async function exportSphereFile(vaultId: string, sphereId: string): Promise<SphereExportResult> {
  const api = sphereApi();
  if (!api) return { ok: false, error: SPHERES_UNAVAILABLE };
  try {
    const result = await api.exportFile(vaultId, sphereId);
    if (!result?.ok) return failure(result, 'export_failed');
    return { ok: true, sphereId: result.sphereId, state: result.state, filename: result.filename, size: result.size };
  } catch (err) {
    return { ok: false, error: errorText(err, 'export_failed') };
  }
}
