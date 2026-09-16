/**
 * What the Spheres tab remembers, per vault and per device, so that it does
 * not talk to the anchor again when nothing calls for it.
 *
 * Every `cipher-runtime sphere …` call costs ~30 s of runtime start-up
 * (PyInstaller onefile: 66 MB extracted on each spawn) before the ~2 s of
 * real work, so the policy is: spawn the runtime only when something can
 * have changed, and remember every reply so that the next visit needs
 * nothing. Same storage pattern as lib/appLock.ts — one namespaced,
 * versioned localStorage key — holding only ledger-public data (sphere
 * statuses, ids), timestamps and counters: never a path, never a secret,
 * never an error text.
 *
 * The functions here are pure (memory in → memory out); the store
 * (store/spheres.ts) owns the runtime calls and applies the replies through
 * them. The rules they encode come from the Eidolon client
 * (src/holo/sphere_wallet.py, docs/HANDOVER_SPHERE_CLIENT_2026-09-14.md):
 *
 * - `sync`, `claim` and `mailbox` sign nothing and can be repeated; only
 *   `transfer`, `burn` and `reissue-key` sign a custody record, and none of
 *   them is ever automatic. All three write the signed record to pending/
 *   before submitting it, so a failure that reached the runtime leaves the
 *   memory dirty (the next open re-lists).
 * - `sync` returns the full up-to-date inventory; `claim` returns the full
 *   status of every sphere it wrote (claimed ∪ already); `mailbox` touches no
 *   sphere file; `transfer` archives the sphere on success. So no action
 *   needs a trailing `list` — except a failed transfer, whose signed record
 *   may already sit in pending/ (written before submission).
 * - On a device with no local sphere file an unreachable (or unenrolled)
 *   anchor does NOT fail `sync`: the wallet swallows the transport error and
 *   reports it under errors.owned / errors.queue with ok:true. A sync is
 *   "full" — the anchor was really reached — only without those two keys,
 *   and nothing is chained after a partial one (a claim would fail after
 *   30 s; a mailbox deposit would burn 8 local key indexes for nothing).
 * - `sync` does not report the mailbox count (only a deposit does); the
 *   count kept here is an estimate, decremented by what a sync received.
 * - A genesis sphere not yet claimed has no head: it is in neither `final`
 *   nor `waiting`. Runtimes ≥ 1.3.1 name them on `sync` (`claimable`, from
 *   the anchor's /claim/instances) and that word beats this memory: a full
 *   sync that names any chains a claim, whatever `claim.state` says (the
 *   memory may be about an earlier genesis, or a claim done elsewhere).
 * - The runtime folds every anchor refusal into `wallet_refused` and only
 *   the message carries the HTTP status, as "(0)", "(404)"…: status 0 /
 *   408 / 429 / 5xx and no status at all are "unreachable" (retry with
 *   back-off), any other status is "refused" (pause, the user's Sync retries).
 *   The number is read before any word: « dépôt refusé (0) » is a network
 *   failure.
 */

import { EIDOLON_API_BASE_URL } from '../config';
import type {
  SphereClaimResult,
  SphereFailure,
  SphereListResult,
  SphereState,
  SphereStatus,
  SphereSyncResult,
} from './spheres';

const STORAGE_PREFIX = 'cipher.spheres.v1:';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** An automatic sync when the last full one is older than this. */
export const SYNC_STALE_MS = DAY;
/** A signed transfer waiting for the anchor is resubmitted at most this often. */
export const PENDING_RESYNC_MS = HOUR;
/** Consecutive "unreachable" failures wait this long before the next automatic attempt. */
export const BACKOFF_UNREACHABLE_MS = [5 * MINUTE, 30 * MINUTE, 2 * HOUR, 6 * HOUR, DAY];
/** A refusal (not enrolled, no enrolment number, fork…) pauses automatic sync for this long. */
export const BACKOFF_REFUSED_MS = 7 * DAY;
/** A claim the anchor queued (key window not released) is re-asked at most this often. */
export const CLAIM_RETRY_MS = DAY;
/** A vault the anchor did not know is re-tried this often (it may be enrolled later). */
export const CLAIM_NOT_ENROLLED_RETRY_MS = 7 * DAY;
/** Publish receiving keys again when fewer than this many are left unused at the anchor. */
export const MAILBOX_LOW = 4;
/** Roots published per deposit (the anchor keeps 16 unused at most). */
export const MAILBOX_DEPOSIT = 8;
/**
 * Two automatic deposits are at least this far apart: the runtime advances
 * its local key index before the anchor answers, and blind recovery of the
 * receiving keys stops at index 64 — indexes are not to be burnt in a loop.
 */
export const MAILBOX_MIN_INTERVAL_MS = DAY;

export type FailureKind = 'unreachable' | 'refused' | 'local';
export type ClaimState = 'never' | 'done' | 'queued' | 'not_enrolled';
export type SyncReason = 'first' | 'stale' | 'pending';

export interface SphereMemory {
  version: 1;
  vaultId: string;
  /** Host of the REST API the anchor fields below are about (null until a full sync). */
  anchorHost: string | null;
  /** Last inventory: replaced by list/sync, patched by claim/import/transfer; null = never read on this device. */
  inventory: SphereStatus[] | null;
  inventoryAt: number;
  /** From the last list (the runtime's trust root); null until known. */
  trustedIssuer: boolean | null;
  /** A disk-changing call was started and its reply never applied (reload mid-call). */
  dirty: boolean;
  /** Last sync that really reached the anchor (ok, no errors.owned / errors.queue). */
  syncOkAt: number | null;
  /** Last sync attempt of any outcome. */
  syncAttemptAt: number | null;
  failKind: Exclude<FailureKind, 'local'> | null;
  /** Consecutive "unreachable" failures — indexes BACKOFF_UNREACHABLE_MS. */
  failures: number;
  /** No automatic online call before this time (0 = none). */
  backoffUntil: number;
  claim: {
    state: ClaimState;
    at: number | null;
    count: number;
    queued: string[];
    /** Ids the treasury still holds for this vault per the last full sync; null = the runtime never said. */
    claimable: string[] | null;
  };
  /** `pending` = unused receiving keys at the anchor per the last deposit, minus what syncs received since. */
  mailbox: { pending: number | null; at: number | null };
  updatedAt: number;
}

export function defaultMemory(vaultId: string): SphereMemory {
  return {
    version: 1,
    vaultId,
    anchorHost: null,
    inventory: null,
    inventoryAt: 0,
    trustedIssuer: null,
    dirty: false,
    syncOkAt: null,
    syncAttemptAt: null,
    failKind: null,
    failures: 0,
    backoffUntil: 0,
    claim: { state: 'never', at: null, count: 0, queued: [], claimable: null },
    mailbox: { pending: null, at: null },
    updatedAt: 0,
  };
}

function storageKey(vaultId: string): string {
  return `${STORAGE_PREFIX}${vaultId}`;
}

export function loadSphereMemory(vaultId: string): SphereMemory {
  const fallback = defaultMemory(vaultId);
  try {
    const raw = localStorage.getItem(storageKey(vaultId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || parsed?.vaultId !== vaultId) return fallback;
    return {
      ...fallback,
      ...parsed,
      inventory: Array.isArray(parsed.inventory) ? parsed.inventory : null,
      claim: { ...fallback.claim, ...(parsed.claim ?? {}) },
      mailbox: { ...fallback.mailbox, ...(parsed.mailbox ?? {}) },
    };
  } catch {
    return fallback;
  }
}

/** Persist best-effort (a private window or cleared site data must not break the tab). */
export function saveSphereMemory(memory: SphereMemory): SphereMemory {
  const next = { ...memory, updatedAt: Date.now() };
  try {
    localStorage.setItem(storageKey(memory.vaultId), JSON.stringify(next));
  } catch {
    // in-memory copy only
  }
  return next;
}

export function clearSphereMemory(vaultId: string): void {
  try {
    localStorage.removeItem(storageKey(vaultId));
  } catch {
    // nothing to clear
  }
}

/** The host the anchor fields are about — memory about another host is not trusted. */
export function anchorHost(): string {
  try {
    return new URL(EIDOLON_API_BASE_URL).host;
  } catch {
    return EIDOLON_API_BASE_URL;
  }
}

// -- failures ----------------------------------------------------------------

/** Error codes produced before the runtime ran or by the runtime itself, never by the anchor. */
const LOCAL_ERROR_CODES = new Set([
  'unavailable',
  'invalid_vault_id',
  'resolve_failed',
  'psnx_not_found',
  'runtime_unavailable',
  'runtime_failed',
  'vault_mismatch',
  'invalid_input',
  'canceled',
  'uncaught',
]);

/** Local error codes after which the runtime did run, and may have written to disk. */
const RUNTIME_RAN_CODES = new Set(['runtime_failed', 'vault_mismatch', 'invalid_input', 'uncaught']);

/** Local error codes that mean the runtime itself is unusable this session, not one bad call. */
const RUNTIME_BROKEN_CODES = new Set([
  'unavailable',
  'invalid_vault_id',
  'resolve_failed',
  'psnx_not_found',
  'runtime_unavailable',
  'runtime_failed',
  'vault_mismatch',
  'uncaught',
]);

export function runtimeMayHaveRun(failure: SphereFailure): boolean {
  return !failure.errorCode || !LOCAL_ERROR_CODES.has(failure.errorCode) || RUNTIME_RAN_CODES.has(failure.errorCode);
}

export function runtimeIsBroken(failure: SphereFailure): boolean {
  return Boolean(failure.errorCode && RUNTIME_BROKEN_CODES.has(failure.errorCode));
}

/**
 * Where a failure comes from. The HTTP status is read out of the runtime's
 * message ("ancre injoignable (404) : …") because the runtime folds every
 * anchor answer into `wallet_refused`; a future runtime that sends distinct
 * codes is honoured first.
 */
export function classifyFailure(failure: SphereFailure): FailureKind {
  const code = failure.errorCode ?? '';
  if (code === 'anchor_unreachable') return 'unreachable';
  if (code === 'anchor_refused' || code === 'not_enrolled') return 'refused';
  if (LOCAL_ERROR_CODES.has(code)) return 'local';
  return classifyText(failure.error);
}

export function classifyText(message: string): Exclude<FailureKind, 'local'> {
  const m = /\((\d{1,3})\)/.exec(message ?? '');
  if (!m) return 'unreachable';
  const status = Number(m[1]);
  if (status === 0 || status === 408 || status === 429 || status >= 500) return 'unreachable';
  return 'refused';
}

/** "Vault not enrolled for ZKP", « voûte sans numéro d'enrôlement »… */
export function isNotEnrolled(message: string): boolean {
  return /not enrolled|enr[oô]l/i.test(message ?? '');
}

export function applyFailure(m: SphereMemory, kind: Exclude<FailureKind, 'local'>, now: number): SphereMemory {
  if (kind === 'refused') {
    return { ...m, syncAttemptAt: now, failKind: 'refused', backoffUntil: now + BACKOFF_REFUSED_MS };
  }
  const failures = m.failures + 1;
  const wait = BACKOFF_UNREACHABLE_MS[Math.min(failures, BACKOFF_UNREACHABLE_MS.length) - 1];
  return { ...m, syncAttemptAt: now, failKind: 'unreachable', failures, backoffUntil: now + wait };
}

// -- what the anchor said ------------------------------------------------------

/** Forget everything about the anchor, keep the mirror of the disk. */
export function resetAnchor(m: SphereMemory): SphereMemory {
  const d = defaultMemory(m.vaultId);
  return { ...d, inventory: m.inventory, inventoryAt: m.inventoryAt, trustedIssuer: m.trustedIssuer, dirty: m.dirty };
}

export function applyList(m: SphereMemory, r: Extract<SphereListResult, { ok: true }>, now: number): SphereMemory {
  // genesis_root.json is written by every sync/claim/import that fetched the
  // root: gone while a full sync is remembered = the spheres dir was wiped.
  const base = !r.genesisCached && m.syncOkAt !== null ? resetAnchor(m) : m;
  return { ...base, inventory: r.spheres, inventoryAt: now, trustedIssuer: r.trustedIssuer, dirty: false };
}

export function isFullSync(r: Extract<SphereSyncResult, { ok: true }>): boolean {
  return !('owned' in r.errors) && !('queue' in r.errors);
}

export function applySync(m: SphereMemory, r: Extract<SphereSyncResult, { ok: true }>, now: number, host: string): SphereMemory {
  let next: SphereMemory = {
    ...m,
    inventory: r.spheres,
    inventoryAt: now,
    trustedIssuer: r.trustedIssuer ?? m.trustedIssuer,
    dirty: false,
    syncAttemptAt: now,
  };
  if (!isFullSync(r)) {
    return applyFailure(next, classifyText(r.errors.owned ?? r.errors.queue ?? ''), now);
  }
  next = { ...next, syncOkAt: now, failKind: null, failures: 0, backoffUntil: 0, anchorHost: host };
  // `claimable` is kept when the reply lacks it (older runtime, or the anchor could not say this time).
  const claim = { ...next.claim, queued: r.queued, claimable: r.claimable ?? next.claim.claimable };
  if (claim.state === 'queued' && r.queued.length === 0) claim.state = 'done';
  else if (claim.state === 'never' && r.queued.length > 0) claim.state = 'queued';
  const pending = next.mailbox.pending === null ? null : Math.max(0, next.mailbox.pending - r.received.length);
  return { ...next, claim, mailbox: { ...next.mailbox, pending } };
}

export function upsertSpheres(inventory: SphereStatus[] | null, rows: SphereStatus[]): SphereStatus[] {
  const byId = new Map((inventory ?? []).map((s) => [s.sphere_id, s] as const));
  for (const row of rows) byId.set(row.sphere_id, row);
  return Array.from(byId.values());
}

export function applyClaim(m: SphereMemory, r: Extract<SphereClaimResult, { ok: true }>, now: number): SphereMemory {
  const rows = [...r.claimed, ...r.already];
  const queued = r.deferred;
  // What the treasury still holds: the last word of `sync`, minus what this claim wrote or deferred.
  const settled = new Set([...rows.map((s) => s.sphere_id), ...queued]);
  const claimable = m.claim.claimable === null ? null : m.claim.claimable.filter((id) => !settled.has(id));
  return {
    ...m,
    inventory: upsertSpheres(m.inventory, rows),
    inventoryAt: rows.length ? now : m.inventoryAt,
    dirty: false,
    claim: { state: queued.length ? 'queued' : 'done', at: now, count: rows.length, queued, claimable },
  };
}

/** A failed sync: the anchor's answer (or its absence) decides the back-off; a local failure changes nothing. */
export function applySyncFailure(m: SphereMemory, failure: SphereFailure, now: number): SphereMemory {
  const dirty = runtimeMayHaveRun(failure) ? m.dirty : false;
  const kind = classifyFailure(failure);
  return kind === 'local' ? { ...m, dirty } : applyFailure({ ...m, dirty }, kind, now);
}

export function applyClaimFailure(m: SphereMemory, failure: SphereFailure, now: number): SphereMemory {
  const dirty = runtimeMayHaveRun(failure) ? m.dirty : false;
  if (classifyFailure(failure) !== 'local' && isNotEnrolled(failure.error)) {
    return { ...m, dirty, claim: { ...m.claim, state: 'not_enrolled', at: now } };
  }
  return applySyncFailure(m, failure, now);
}

export function applyMailbox(m: SphereMemory, pending: number | null, now: number): SphereMemory {
  return { ...m, mailbox: { pending, at: now } };
}

/** Once the runtime ran, its local key indexes are advanced: the attempt counts, the estimate stays. */
export function applyMailboxFailure(m: SphereMemory, failure: SphereFailure, now: number): SphereMemory {
  return runtimeMayHaveRun(failure) ? { ...m, mailbox: { ...m.mailbox, at: now } } : m;
}

export function applyImport(m: SphereMemory, status: SphereStatus | null, now: number): SphereMemory {
  if (!status) return { ...m, dirty: true };
  return { ...m, inventory: upsertSpheres(m.inventory, [status]), inventoryAt: now, dirty: false };
}

/** The runtime's word on a custody step it signed (burn, reissue-key): patch the row, the sphere stays. */
export function applyCustodyOk(
  m: SphereMemory,
  step: { sphereId: string; seq: number; headHash: string; final: boolean; state: SphereState },
  now: number,
): SphereMemory {
  const rows = m.inventory ?? [];
  const row = rows.find((s) => s.sphere_id === step.sphereId);
  if (!row) return { ...m, dirty: true }; // a step on a sphere this device never listed: re-list
  const burned = step.state === 'brûlée' || row.burned;
  const patched: SphereStatus = {
    ...row,
    seq: step.seq,
    head_hash: step.headHash,
    final: step.final,
    final_by: step.final ? 'receipt' : null,
    state: step.state,
    burned,
    pending: false,
    controllable: burned ? false : row.controllable,
  };
  return { ...m, inventory: upsertSpheres(rows, [patched]), inventoryAt: now, dirty: false };
}

export function applyTransferOk(m: SphereMemory, sphereId: string, now: number): SphereMemory {
  return {
    ...m,
    inventory: (m.inventory ?? []).filter((s) => s.sphere_id !== sphereId),
    inventoryAt: now,
    dirty: false,
  };
}

// -- decisions ---------------------------------------------------------------

/** Why an automatic sync should run when the tab opens — or null for zero spawns. */
export function planOnOpen(m: SphereMemory, now: number, online: boolean, runtimeBroken: boolean): SyncReason | null {
  if (!online || runtimeBroken || now < m.backoffUntil) return null;
  if (m.syncOkAt === null) return 'first';
  if (now - m.syncOkAt >= SYNC_STALE_MS) return 'stale';
  const hasPending = (m.inventory ?? []).some((s) => s.pending);
  if (hasPending && now - (m.syncAttemptAt ?? 0) >= PENDING_RESYNC_MS) return 'pending';
  return null;
}

/** What to chain after a FULL sync. */
export function nextAfterSync(m: SphereMemory, now: number): { claim: boolean; mailbox: boolean } {
  const c = m.claim;
  const claim =
    ((c.claimable ?? []).length > 0 && c.state !== 'not_enrolled') ||
    c.state === 'never' ||
    (c.state === 'queued' && (c.at === null || now - c.at >= CLAIM_RETRY_MS)) ||
    (c.state === 'not_enrolled' && c.at !== null && now - c.at >= CLAIM_NOT_ENROLLED_RETRY_MS);
  const b = m.mailbox;
  const mailbox =
    b.at === null || (b.pending !== null && b.pending < MAILBOX_LOW && now - b.at >= MAILBOX_MIN_INTERVAL_MS);
  return { claim, mailbox };
}
