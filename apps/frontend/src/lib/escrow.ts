/**
 * Single access point for Escrow Nexus (`escrow:*` IPC, Eidolon
 * escrow_7d). Same shape as lib/spheres.ts.
 *
 * A vault's escrows are sealed, time-locked documents bound to the vault
 * key, kept on this device (the same store the Eidolon launcher's own escrow
 * menu uses). The client is the Eidolon runtime (`cipher-runtime escrow …`,
 * runtime ≥ 1.3.0), spawned by the main process. The renderer names a vault
 * id and an escrow id, never a path: the document enters through a native
 * open dialog and leaves through a native save dialog, both in main. The
 * renderer only ever sees metadata — what the protocol itself stores in
 * cleartext (label, conditions, deposit time, size) — and the runtime's
 * verdicts. Outside Electron every call resolves to
 * `{ ok: false, error: 'unavailable' }`.
 *
 * Phase 1 of the protocol, stated plainly: the time lock is enforced by the
 * clock of the machine that holds the key, not by a third party; whoever
 * holds the vault holds the documents.
 */

export type EscrowVerdict = 'ready' | 'locked' | 'tampered' | 'invalid';

export interface EscrowCondition {
  type: string;
  release_after?: string;
  expected_vault_id?: string;
  children?: EscrowCondition[];
}

export interface EscrowEntry {
  escrow_id: string;
  label: string;
  deposited_at: string;
  payload_size: number;
  conditions: EscrowCondition[];
  release_after: string | null;
  releasable: boolean;
  reason: string;
}

export interface EscrowUnreadable {
  escrow_id: string;
  error: string;
}

export type EscrowFailure = { ok: false; error: string; errorCode?: string; releaseAfter?: string };

export type EscrowListResult =
  | { ok: true; escrows: EscrowEntry[]; unreadable: EscrowUnreadable[] }
  | EscrowFailure;

export type EscrowDepositResult = { ok: true; entry: EscrowEntry; filename: string } | EscrowFailure;

export type EscrowRetrieveResult = { ok: true; escrowId: string; filename: string; size: number } | EscrowFailure;

export type EscrowVerifyResult =
  | { ok: true; checked: number; failed: number; results: { escrow_id: string; integrity_ok: boolean; reason: string }[] }
  | EscrowFailure;

export type EscrowDeleteResult = { ok: true; escrowId: string; deleted: boolean } | EscrowFailure;

/** Error code returned when the IPC surface is not exposed (browser dev). */
export const ESCROW_UNAVAILABLE = 'unavailable';

function escrowApi() {
  return window.electron?.escrow;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function failure(result: { error?: string; errorCode?: string; releaseAfter?: string } | null | undefined, fallback: string): EscrowFailure {
  return { ok: false, error: result?.error || fallback, errorCode: result?.errorCode, releaseAfter: result?.releaseAfter };
}

function entry(value: Record<string, unknown>): EscrowEntry {
  const conditions = Array.isArray(value.conditions) ? (value.conditions as EscrowCondition[]) : [];
  return {
    escrow_id: String(value.escrow_id ?? ''),
    label: String(value.label ?? ''),
    deposited_at: String(value.deposited_at ?? ''),
    payload_size: Number(value.payload_size ?? 0),
    conditions,
    release_after: typeof value.release_after === 'string' ? value.release_after : null,
    releasable: value.releasable === true,
    reason: String(value.reason ?? ''),
  };
}

export function isEscrowClientAvailable(): boolean {
  return Boolean(escrowApi());
}

/**
 * The user-facing verdict of an escrow, from what `check_release` said:
 * ready (retrievable now), locked (a release condition holds), tampered
 * (the integrity MAC does not verify — wrong key or altered file), invalid
 * (a condition this build cannot read).
 */
export function escrowVerdict(e: EscrowEntry): EscrowVerdict {
  if (e.releasable) return 'ready';
  const reason = e.reason.toLowerCase();
  if (reason.includes('not satisfied')) return 'locked';
  if (reason.includes('integrity')) return 'tampered';
  return 'invalid';
}

/** Local inventory — offline; each call starts the runtime (~30 s cold). */
export async function listEscrows(vaultId: string): Promise<EscrowListResult> {
  const api = escrowApi();
  if (!api) return { ok: false, error: ESCROW_UNAVAILABLE, errorCode: ESCROW_UNAVAILABLE };
  try {
    const result = await api.list(vaultId);
    if (!result?.ok) return failure(result, 'list_failed');
    return {
      ok: true,
      escrows: Array.isArray(result.escrows) ? result.escrows.map((e) => entry(e as unknown as Record<string, unknown>)) : [],
      unreadable: Array.isArray(result.unreadable) ? result.unreadable : [],
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'list_failed') };
  }
}

/** Seal a document the user picks (native dialog in main). */
export async function depositEscrow(
  vaultId: string,
  options: { label?: string; releaseAfter?: string; ownerOnly?: boolean } = {},
): Promise<EscrowDepositResult> {
  const api = escrowApi();
  if (!api) return { ok: false, error: ESCROW_UNAVAILABLE, errorCode: ESCROW_UNAVAILABLE };
  try {
    const result = await api.deposit(vaultId, options);
    if (!result?.ok) return failure(result, 'deposit_failed');
    return { ok: true, entry: entry(result as unknown as Record<string, unknown>), filename: String(result.filename ?? '') };
  } catch (err) {
    return { ok: false, error: errorText(err, 'deposit_failed') };
  }
}

/** Verify, evaluate the conditions, write the document where the user chooses. */
export async function retrieveEscrow(vaultId: string, escrowId: string, suggestedName?: string): Promise<EscrowRetrieveResult> {
  const api = escrowApi();
  if (!api) return { ok: false, error: ESCROW_UNAVAILABLE, errorCode: ESCROW_UNAVAILABLE };
  try {
    const result = await api.retrieve(vaultId, escrowId, suggestedName);
    if (!result?.ok) return failure(result, 'retrieve_failed');
    return { ok: true, escrowId: String(result.escrowId ?? escrowId), filename: String(result.filename ?? ''), size: Number(result.size ?? 0) };
  } catch (err) {
    return { ok: false, error: errorText(err, 'retrieve_failed') };
  }
}

/** Recompute every integrity MAC without decrypting (unreadable files count as failed). */
export async function verifyEscrows(vaultId: string, escrowId?: string): Promise<EscrowVerifyResult> {
  const api = escrowApi();
  if (!api) return { ok: false, error: ESCROW_UNAVAILABLE, errorCode: ESCROW_UNAVAILABLE };
  try {
    const result = await api.verify(vaultId, escrowId);
    if (!result?.ok) return failure(result, 'verify_failed');
    return {
      ok: true,
      checked: Number(result.checked ?? 0),
      failed: Number(result.failed ?? 0),
      results: Array.isArray(result.results) ? result.results : [],
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'verify_failed') };
  }
}

/** Irreversible; the caller has confirmed with the user. */
export async function deleteEscrow(vaultId: string, escrowId: string): Promise<EscrowDeleteResult> {
  const api = escrowApi();
  if (!api) return { ok: false, error: ESCROW_UNAVAILABLE, errorCode: ESCROW_UNAVAILABLE };
  try {
    const result = await api.remove(vaultId, escrowId);
    if (!result?.ok) return failure(result, 'delete_failed');
    return { ok: true, escrowId: String(result.escrow_id ?? escrowId), deleted: result.deleted === true };
  } catch (err) {
    return { ok: false, error: errorText(err, 'delete_failed') };
  }
}
