/**
 * The Spheres tab's memory — the pure rules behind "do not re-sync when
 * nothing calls for it" (lib/spheresMemory.ts). No runtime, no IPC: memory
 * in, memory out.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { SphereStatus } from '../spheres';
import {
  BACKOFF_REFUSED_MS,
  BACKOFF_UNREACHABLE_MS,
  CLAIM_NOT_ENROLLED_RETRY_MS,
  CLAIM_RETRY_MS,
  MAILBOX_MIN_INTERVAL_MS,
  PENDING_RESYNC_MS,
  SYNC_STALE_MS,
  applyClaim,
  applyClaimFailure,
  applyCustodyOk,
  applyFailure,
  applyImport,
  applyList,
  applyMailbox,
  applyMailboxFailure,
  applySync,
  applySyncFailure,
  applyTransferOk,
  classifyFailure,
  classifyText,
  clearSphereMemory,
  defaultMemory,
  isFullSync,
  loadSphereMemory,
  nextAfterSync,
  planOnOpen,
  resetAnchor,
  runtimeIsBroken,
  runtimeMayHaveRun,
  saveSphereMemory,
  upsertSpheres,
} from '../spheresMemory';

const VAULT = 'a'.repeat(64);
const HOST = 'api.eidolon.logos-project.xyz';
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function sphere(id: string, extra: Partial<SphereStatus> = {}): SphereStatus {
  return {
    sphere_id: id,
    rarity: 'common',
    seq: 1,
    head_hash: 'h'.repeat(64),
    ok: true,
    final: true,
    final_by: 'receipt',
    revealed: true,
    burned: false,
    pending: false,
    controllable: true,
    errors: [],
    state: 'finale',
    ...extra,
  };
}

function syncReply(over: Partial<Parameters<typeof applySync>[1]> = {}) {
  return {
    ok: true as const,
    spheres: [sphere('A')],
    resubmitted: [],
    updated: [],
    received: [],
    transferredAway: [],
    burned: [],
    mismatches: [],
    queued: [],
    final: 1,
    waiting: 0,
    errors: {},
    ...over,
  };
}

function fullSynced(over: Partial<ReturnType<typeof defaultMemory>> = {}) {
  return { ...applySync(defaultMemory(VAULT), syncReply(), NOW - HOUR, HOST), ...over };
}

describe('planOnOpen — when the tab needs the runtime', () => {
  it('first: never fully synced from this device', () => {
    expect(planOnOpen(defaultMemory(VAULT), NOW, true, false)).toBe('first');
  });

  it('nothing: synced an hour ago, no pending transfer', () => {
    expect(planOnOpen(fullSynced(), NOW, true, false)).toBeNull();
  });

  it('stale: last full sync older than a day', () => {
    expect(planOnOpen(fullSynced({ syncOkAt: NOW - SYNC_STALE_MS - 1 }), NOW, true, false)).toBe('stale');
  });

  it('pending: a signed transfer waits and the last attempt is old enough', () => {
    const m = fullSynced({ inventory: [sphere('A', { pending: true })], syncAttemptAt: NOW - PENDING_RESYNC_MS - 1 });
    expect(planOnOpen(m, NOW, true, false)).toBe('pending');
    expect(planOnOpen({ ...m, syncAttemptAt: NOW - 10 * 60_000 }, NOW, true, false)).toBeNull();
  });

  it('never during a back-off, offline, or with a broken runtime', () => {
    expect(planOnOpen({ ...defaultMemory(VAULT), backoffUntil: NOW + 1 }, NOW, true, false)).toBeNull();
    expect(planOnOpen(defaultMemory(VAULT), NOW, false, false)).toBeNull();
    expect(planOnOpen(defaultMemory(VAULT), NOW, true, true)).toBeNull();
  });
});

describe('classifyFailure — the status number decides, words never', () => {
  it('reads the HTTP status out of the runtime message', () => {
    expect(classifyText('réclamation : ancre injoignable (0) : connection refused')).toBe('unreachable');
    expect(classifyText('réclamation refusée (0) : …')).toBe('unreachable');
    expect(classifyText('boîte aux lettres : dépôt refusé (0) : …')).toBe('unreachable');
    expect(classifyText('ancre injoignable (503) : ancre indisponible')).toBe('unreachable');
    expect(classifyText('ancre injoignable (429) : too many')).toBe('unreachable');
    expect(classifyText('no status at all')).toBe('unreachable');
    expect(classifyText("réclamation : ancre injoignable (404) : voûte sans numéro d'enrôlement")).toBe('refused');
    expect(classifyText('ancre injoignable (400) : Vault not enrolled for ZKP')).toBe('refused');
    expect(classifyText('transfert refusé (409) : fourche')).toBe('refused');
  });

  it('local codes are neither', () => {
    for (const errorCode of ['unavailable', 'psnx_not_found', 'runtime_unavailable', 'canceled', 'invalid_input', 'uncaught']) {
      expect(classifyFailure({ ok: false, error: 'x (404)', errorCode })).toBe('local');
    }
    expect(classifyFailure({ ok: false, error: 'ancre injoignable (0)', errorCode: 'wallet_refused' })).toBe('unreachable');
  });

  it('honours distinct codes from a future runtime first', () => {
    expect(classifyFailure({ ok: false, error: '', errorCode: 'anchor_unreachable' })).toBe('unreachable');
    expect(classifyFailure({ ok: false, error: '', errorCode: 'not_enrolled' })).toBe('refused');
  });

  it('tells apart "did not run" from "may have written"', () => {
    expect(runtimeMayHaveRun({ ok: false, error: '', errorCode: 'psnx_not_found' })).toBe(false);
    expect(runtimeMayHaveRun({ ok: false, error: '', errorCode: 'runtime_failed' })).toBe(true);
    expect(runtimeMayHaveRun({ ok: false, error: '', errorCode: 'wallet_refused' })).toBe(true);
    expect(runtimeIsBroken({ ok: false, error: '', errorCode: 'runtime_unavailable' })).toBe(true);
    expect(runtimeIsBroken({ ok: false, error: '', errorCode: 'invalid_input' })).toBe(false);
    expect(runtimeIsBroken({ ok: false, error: '', errorCode: 'wallet_refused' })).toBe(false);
  });
});

describe('applyFailure — back-off', () => {
  it('unreachable: 5 min, 30 min, 2 h, 6 h, 24 h, then stays at 24 h', () => {
    let m = defaultMemory(VAULT);
    const expected = [...BACKOFF_UNREACHABLE_MS, BACKOFF_UNREACHABLE_MS[4]];
    expected.forEach((wait, i) => {
      m = applyFailure(m, 'unreachable', NOW);
      expect(m.failures).toBe(i + 1);
      expect(m.backoffUntil).toBe(NOW + wait);
      expect(m.failKind).toBe('unreachable');
    });
  });

  it('refused: a week, failures untouched', () => {
    const m = applyFailure(defaultMemory(VAULT), 'refused', NOW);
    expect(m.backoffUntil).toBe(NOW + BACKOFF_REFUSED_MS);
    expect(m.failures).toBe(0);
    expect(m.failKind).toBe('refused');
  });

  it('a full sync clears it all', () => {
    const broken = applyFailure(applyFailure(defaultMemory(VAULT), 'unreachable', NOW), 'unreachable', NOW);
    const m = applySync(broken, syncReply(), NOW, HOST);
    expect(m.failures).toBe(0);
    expect(m.backoffUntil).toBe(0);
    expect(m.failKind).toBeNull();
    expect(m.syncOkAt).toBe(NOW);
    expect(m.anchorHost).toBe(HOST);
  });
});

describe('applySync', () => {
  it('a reply with errors.owned is partial: inventory kept, anchor NOT marked reached, back-off set', () => {
    const r = syncReply({ spheres: [], errors: { owned: 'liste des sphères détenues indisponible (0)' } });
    expect(isFullSync(r)).toBe(false);
    const m = applySync(defaultMemory(VAULT), r, NOW, HOST);
    expect(m.inventory).toEqual([]);
    expect(m.dirty).toBe(false);
    expect(m.syncOkAt).toBeNull();
    expect(m.anchorHost).toBeNull();
    expect(m.failKind).toBe('unreachable');
    expect(m.backoffUntil).toBeGreaterThan(NOW);
  });

  it('errors.queue alone is partial too (no claim transition)', () => {
    const start = { ...defaultMemory(VAULT), claim: { state: 'queued' as const, at: NOW - DAY, count: 0, queued: ['X'], claimable: null } };
    const m = applySync(start, syncReply({ errors: { queue: 'file des réclamations : ancre injoignable (0)' } }), NOW, HOST);
    expect(m.claim.state).toBe('queued');
    expect(m.syncOkAt).toBeNull();
  });

  it('full: queued empties a queued claim, fills a never one', () => {
    const queued = { ...defaultMemory(VAULT), claim: { state: 'queued' as const, at: NOW - DAY, count: 0, queued: ['X'], claimable: null } };
    expect(applySync(queued, syncReply({ queued: [] }), NOW, HOST).claim.state).toBe('done');
    expect(applySync(defaultMemory(VAULT), syncReply({ queued: ['Y'] }), NOW, HOST).claim).toMatchObject({ state: 'queued', queued: ['Y'] });
  });

  it('the mailbox estimate goes down by what was received, never below 0, stays null when unknown', () => {
    const m8 = applyMailbox(defaultMemory(VAULT), 8, NOW);
    expect(applySync(m8, syncReply({ received: ['A', 'B'] }), NOW, HOST).mailbox.pending).toBe(6);
    const m1 = applyMailbox(defaultMemory(VAULT), 1, NOW);
    expect(applySync(m1, syncReply({ received: ['A', 'B'] }), NOW, HOST).mailbox.pending).toBe(0);
    expect(applySync(defaultMemory(VAULT), syncReply({ received: ['A'] }), NOW, HOST).mailbox.pending).toBeNull();
  });

  it('claimable: stored when the runtime names it, kept when the reply lacks it', () => {
    const named = applySync(defaultMemory(VAULT), syncReply({ spheres: [], final: 0, claimable: ['G1', 'G2'] }), NOW, HOST);
    expect(named.claim.claimable).toEqual(['G1', 'G2']);
    expect(applySync(named, syncReply({ spheres: [] }), NOW + HOUR, HOST).claim.claimable).toEqual(['G1', 'G2']);
    expect(applySync(named, syncReply({ claimable: [] }), NOW + HOUR, HOST).claim.claimable).toEqual([]);
    expect(applySync(defaultMemory(VAULT), syncReply(), NOW, HOST).claim.claimable).toBeNull();
    // A partial sync keeps whatever was known too.
    expect(applySync(named, syncReply({ errors: { owned: '(0)' } }), NOW + HOUR, HOST).claim.claimable).toEqual(['G1', 'G2']);
  });

  it('keeps trustedIssuer unless the reply carries it', () => {
    const known = { ...defaultMemory(VAULT), trustedIssuer: false };
    expect(applySync(known, syncReply(), NOW, HOST).trustedIssuer).toBe(false);
    expect(applySync(known, syncReply({ trustedIssuer: true }), NOW, HOST).trustedIssuer).toBe(true);
  });

  it('a failed sync: local failures change nothing but dirty; anchor failures back off', () => {
    const dirty = { ...defaultMemory(VAULT), dirty: true };
    expect(applySyncFailure(dirty, { ok: false, error: '', errorCode: 'psnx_not_found' }, NOW)).toMatchObject({ dirty: false, backoffUntil: 0 });
    expect(applySyncFailure(dirty, { ok: false, error: 'boom', errorCode: 'runtime_failed' }, NOW)).toMatchObject({ dirty: true, backoffUntil: 0 });
    const m = applySyncFailure(dirty, { ok: false, error: 'ancre injoignable (0) : …', errorCode: 'wallet_refused' }, NOW);
    expect(m.failKind).toBe('unreachable');
    expect(m.dirty).toBe(true);
  });
});

describe('applyClaim', () => {
  it('upserts claimed ∪ already by sphere id, no duplicates', () => {
    const start = { ...defaultMemory(VAULT), inventory: [sphere('A', { seq: 1 }), sphere('B')] };
    const m = applyClaim(start, { ok: true, vaultNumber: 3, claimed: [sphere('C')], already: [sphere('A', { seq: 2 })], deferred: [], errors: {} }, NOW);
    expect(m.inventory?.map((s) => s.sphere_id).sort()).toEqual(['A', 'B', 'C']);
    expect(m.inventory?.find((s) => s.sphere_id === 'A')?.seq).toBe(2);
    expect(m.claim).toEqual({ state: 'done', at: NOW, count: 2, queued: [], claimable: null });
    expect(m.dirty).toBe(false);
  });

  it('takes what it wrote or deferred out of claimable, and leaves null alone', () => {
    const start = { ...defaultMemory(VAULT), claim: { ...defaultMemory(VAULT).claim, claimable: ['A', 'B', 'C'] } };
    const m = applyClaim(start, { ok: true, vaultNumber: 1, claimed: [sphere('A')], already: [], deferred: ['B'], errors: { C: 'refusée' } }, NOW);
    expect(m.claim).toMatchObject({ state: 'queued', queued: ['B'], claimable: ['C'] });
    expect(applyClaim(defaultMemory(VAULT), { ok: true, vaultNumber: 1, claimed: [sphere('A')], already: [], deferred: [], errors: {} }, NOW).claim.claimable).toBeNull();
  });

  it('deferred → queued with the ids; nothing at all → done with count 0', () => {
    expect(applyClaim(defaultMemory(VAULT), { ok: true, vaultNumber: null, claimed: [], already: [], deferred: ['X'], errors: {} }, NOW).claim).toMatchObject({ state: 'queued', queued: ['X'] });
    expect(applyClaim(defaultMemory(VAULT), { ok: true, vaultNumber: null, claimed: [], already: [], deferred: [], errors: {} }, NOW).claim).toMatchObject({ state: 'done', count: 0 });
  });

  it('not enrolled is remembered as such, and only for an anchor answer', () => {
    const m = applyClaimFailure(defaultMemory(VAULT), { ok: false, error: "réclamation : ancre injoignable (404) : voûte sans numéro d'enrôlement", errorCode: 'wallet_refused' }, NOW);
    expect(m.claim).toMatchObject({ state: 'not_enrolled', at: NOW });
    expect(m.backoffUntil).toBe(0);
    const local = applyClaimFailure(defaultMemory(VAULT), { ok: false, error: 'Vault not enrolled', errorCode: 'runtime_failed' }, NOW);
    expect(local.claim.state).toBe('never');
  });

  it('nextAfterSync: claim once, re-ask a queued one daily, an unenrolled one weekly', () => {
    expect(nextAfterSync(defaultMemory(VAULT), NOW).claim).toBe(true);
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { state: 'done', at: NOW, count: 2, queued: [], claimable: null } }, NOW).claim).toBe(false);
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { state: 'queued', at: NOW - CLAIM_RETRY_MS - 1, count: 0, queued: ['X'], claimable: null } }, NOW).claim).toBe(true);
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { state: 'queued', at: NOW - HOUR, count: 0, queued: ['X'], claimable: null } }, NOW).claim).toBe(false);
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { state: 'not_enrolled', at: NOW - 2 * DAY, count: 0, queued: [], claimable: null } }, NOW).claim).toBe(false);
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { state: 'not_enrolled', at: NOW - CLAIM_NOT_ENROLLED_RETRY_MS - 1, count: 0, queued: [], claimable: null } }, NOW).claim).toBe(true);
  });

  it('nextAfterSync: what the anchor still holds beats a "done" memory (a claim from an earlier genesis, or done elsewhere)', () => {
    const done = { state: 'done' as const, at: NOW, count: 2, queued: [] };
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { ...done, claimable: ['G1'] } }, NOW).claim).toBe(true);
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { ...done, claimable: [] } }, NOW).claim).toBe(false);
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { ...done, claimable: null } }, NOW).claim).toBe(false);
    // Deferred claims are in the queue, not in claimable: the daily rule still governs them.
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { state: 'queued', at: NOW - HOUR, count: 0, queued: ['X'], claimable: [] } }, NOW).claim).toBe(false);
    // An unenrolled vault is never asked again early, whatever the list says.
    expect(nextAfterSync({ ...defaultMemory(VAULT), claim: { state: 'not_enrolled', at: NOW - HOUR, count: 0, queued: [], claimable: ['G1'] } }, NOW).claim).toBe(false);
  });
});

describe('mailbox', () => {
  it('nextAfterSync: first deposit once, then only when low and a day apart, never after a failed deposit of unknown count', () => {
    expect(nextAfterSync(defaultMemory(VAULT), NOW).mailbox).toBe(true);
    expect(nextAfterSync(applyMailbox(defaultMemory(VAULT), 8, NOW - HOUR), NOW).mailbox).toBe(false);
    expect(nextAfterSync(applyMailbox(defaultMemory(VAULT), 3, NOW - MAILBOX_MIN_INTERVAL_MS - 1), NOW).mailbox).toBe(true);
    expect(nextAfterSync(applyMailbox(defaultMemory(VAULT), 3, NOW - HOUR), NOW).mailbox).toBe(false);
    const failed = applyMailboxFailure(defaultMemory(VAULT), { ok: false, error: 'dépôt refusé (0)', errorCode: 'wallet_refused' }, NOW - 2 * DAY);
    expect(failed.mailbox).toEqual({ pending: null, at: NOW - 2 * DAY });
    expect(nextAfterSync(failed, NOW).mailbox).toBe(false);
  });

  it('a deposit the runtime never started does not count as an attempt', () => {
    const m = applyMailboxFailure(defaultMemory(VAULT), { ok: false, error: '', errorCode: 'psnx_not_found' }, NOW);
    expect(m.mailbox.at).toBeNull();
  });
});

describe('list, import, transfer, reset', () => {
  it('a list with genesis gone while a full sync is remembered = the spheres dir was wiped', () => {
    const synced = fullSynced();
    const m = applyList(synced, { ok: true, spheres: [], trustedIssuer: false, genesisCached: false }, NOW);
    expect(m.syncOkAt).toBeNull();
    expect(m.claim.state).toBe('never');
    expect(m.inventory).toEqual([]);
    expect(m.trustedIssuer).toBe(false);
    const fresh = applyList(defaultMemory(VAULT), { ok: true, spheres: [sphere('A')], trustedIssuer: true, genesisCached: false }, NOW);
    expect(fresh.inventory).toHaveLength(1);
  });

  it('resetAnchor keeps only the mirror of the disk', () => {
    const m = resetAnchor({ ...fullSynced(), mailbox: { pending: 5, at: NOW }, dirty: true });
    expect(m.inventory).toHaveLength(1);
    expect(m.dirty).toBe(true);
    expect(m.mailbox.pending).toBeNull();
    expect(m.anchorHost).toBeNull();
  });

  it('import upserts the returned row; without a row the memory stays dirty', () => {
    expect(applyImport(defaultMemory(VAULT), sphere('Z'), NOW).inventory?.map((s) => s.sphere_id)).toEqual(['Z']);
    expect(applyImport(defaultMemory(VAULT), null, NOW).dirty).toBe(true);
  });

  it('a custody step the runtime signed patches its row: burn leaves a tombstone, reissue keeps the sphere', () => {
    const start = { ...defaultMemory(VAULT), inventory: [sphere('A', { seq: 1, pending: true }), sphere('B')], dirty: true };
    const burnt = applyCustodyOk(start, { sphereId: 'A', seq: 2, headHash: 'x'.repeat(64), final: true, state: 'brûlée' }, NOW);
    expect(burnt.inventory?.find((s) => s.sphere_id === 'A')).toMatchObject({
      seq: 2,
      head_hash: 'x'.repeat(64),
      burned: true,
      state: 'brûlée',
      final: true,
      pending: false,
      controllable: false,
    });
    expect(burnt.inventory?.map((s) => s.sphere_id)).toEqual(['A', 'B']);
    expect(burnt.dirty).toBe(false);
    expect(burnt.inventoryAt).toBe(NOW);
    const reissued = applyCustodyOk(start, { sphereId: 'B', seq: 2, headHash: 'y'.repeat(64), final: false, state: 'en attente' }, NOW);
    expect(reissued.inventory?.find((s) => s.sphere_id === 'B')).toMatchObject({
      seq: 2,
      state: 'en attente',
      final: false,
      final_by: null,
      burned: false,
      controllable: true,
      pending: false,
    });
    // A step on a sphere this device never listed: nothing to patch, re-list.
    const unknown = applyCustodyOk({ ...start, dirty: false }, { sphereId: 'Z', seq: 1, headHash: 'z'.repeat(64), final: true, state: 'finale' }, NOW);
    expect(unknown.dirty).toBe(true);
    expect(unknown.inventory?.length).toBe(2);
  });

  it('a transferred sphere leaves the inventory', () => {
    const m = applyTransferOk({ ...defaultMemory(VAULT), inventory: [sphere('A'), sphere('B')] }, 'A', NOW);
    expect(m.inventory?.map((s) => s.sphere_id)).toEqual(['B']);
    expect(m.dirty).toBe(false);
  });

  it('upsertSpheres replaces by id and appends the rest', () => {
    expect(upsertSpheres([sphere('A', { seq: 1 })], [sphere('A', { seq: 2 }), sphere('B')]).map((s) => `${s.sphere_id}${s.seq}`)).toEqual(['A2', 'B1']);
    expect(upsertSpheres(null, [sphere('A')])).toHaveLength(1);
  });
});

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips per vault and ignores a foreign or unknown record', () => {
    const saved = saveSphereMemory(fullSynced());
    expect(saved.updatedAt).toBeGreaterThan(0);
    expect(loadSphereMemory(VAULT)).toEqual(saved);
    expect(loadSphereMemory('b'.repeat(64))).toEqual(defaultMemory('b'.repeat(64)));
    localStorage.setItem(`cipher.spheres.v1:${VAULT}`, JSON.stringify({ version: 3, vaultId: VAULT }));
    expect(loadSphereMemory(VAULT)).toEqual(defaultMemory(VAULT));
    localStorage.setItem(`cipher.spheres.v1:${VAULT}`, 'not json');
    expect(loadSphereMemory(VAULT)).toEqual(defaultMemory(VAULT));
  });

  it('upgrades a v1 record: rows without `visual` (runtime < 1.3.2) make it dirty, once', () => {
    const v1 = { ...fullSynced(), version: 1, inventory: [sphere('A'), sphere('B')] };
    localStorage.setItem(`cipher.spheres.v1:${VAULT}`, JSON.stringify(v1));
    const m = loadSphereMemory(VAULT);
    expect(m.version).toBe(2);
    expect(m.dirty).toBe(true);
    expect(m.syncOkAt).toBe(v1.syncOkAt); // what the anchor said still holds
    // Listed again (by whatever runtime): saved as v2, no second upgrade.
    saveSphereMemory(applyList(m, { ok: true, spheres: [sphere('A'), sphere('B')], trustedIssuer: true, genesisCached: true }, NOW));
    expect(loadSphereMemory(VAULT).dirty).toBe(false);
  });

  it('upgrades a v1 record without a list when every row already says what it looks like, or there is none', () => {
    const rows = [sphere('A', { visual: null }), sphere('B', { visual: { theme: 'quantum', manifestation: null, essence: null, signature: {} } })];
    localStorage.setItem(`cipher.spheres.v1:${VAULT}`, JSON.stringify({ ...fullSynced(), version: 1, inventory: rows }));
    expect(loadSphereMemory(VAULT)).toMatchObject({ version: 2, dirty: false });
    localStorage.setItem(`cipher.spheres.v1:${VAULT}`, JSON.stringify({ ...defaultMemory(VAULT), version: 1 }));
    expect(loadSphereMemory(VAULT)).toMatchObject({ version: 2, dirty: false, inventory: null });
  });

  it('fills missing nested fields from the defaults', () => {
    localStorage.setItem(`cipher.spheres.v1:${VAULT}`, JSON.stringify({ version: 1, vaultId: VAULT, syncOkAt: 5 }));
    const m = loadSphereMemory(VAULT);
    expect(m.claim).toEqual(defaultMemory(VAULT).claim);
    expect(m.mailbox).toEqual(defaultMemory(VAULT).mailbox);
    expect(m.inventory).toBeNull();
    expect(m.syncOkAt).toBe(5);
  });

  it('clearSphereMemory forgets the vault', () => {
    saveSphereMemory(fullSynced());
    clearSphereMemory(VAULT);
    expect(loadSphereMemory(VAULT)).toEqual(defaultMemory(VAULT));
  });

  it('holds no error text and no path', () => {
    const m = applySyncFailure(fullSynced(), { ok: false, error: 'C:\\Users\\x\\vault.psnx : ancre injoignable (0)', errorCode: 'wallet_refused' }, NOW);
    const raw = JSON.stringify(saveSphereMemory(m));
    expect(raw).not.toContain('psnx');
    expect(raw).not.toContain('injoignable');
  });
});
