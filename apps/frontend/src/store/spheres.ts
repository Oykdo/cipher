/**
 * Zustand store for the Spheres tab: owns every `cipher-runtime sphere …`
 * call so that the component (which remounts on each tab visit, and twice
 * under StrictMode) can only *look* at what is going on.
 *
 * - One operation at a time per vault: `busy` is set synchronously before
 *   the first await, so a remount, a second effect run or a double click
 *   never spawns a second runtime. A reply lands in the memory even when
 *   nothing is mounted (a killed transfer could lose a signed record, so a
 *   running call is never cancelled).
 * - Volatile: busy / step / notice live here for the session; what the
 *   anchor said is persisted per vault by lib/spheresMemory.ts.
 * - `open()` decides whether the tab needs the runtime at all — usually not:
 *   a same-day revisit renders the remembered inventory with zero spawns.
 *   The first contact of a vault from a device is sync → claim → publish
 *   receiving keys, once; later automatic syncs are daily, back off while
 *   the anchor is unreachable, and pause when it refuses the vault.
 * - Manual actions keep their notices; automatic runs stay quiet unless
 *   something changed. Notices are stored as i18n keys and translated by
 *   the component.
 */

import { create } from 'zustand';
import type { SphereFailure, SphereState, SphereStatus } from '../lib/spheres';
import {
  claimSpheres,
  depositSphereMailbox,
  burnSphere,
  exportSphereFile,
  importSphereFile,
  listSpheres,
  syncSpheres,
  reissueSphereKey,
  transferSphere,
} from '../lib/spheres';
import {
  MAILBOX_DEPOSIT,
  type SphereMemory,
  anchorHost,
  applyClaim,
  applyClaimFailure,
  applyImport,
  applyList,
  applyMailbox,
  applyMailboxFailure,
  applySync,
  applySyncFailure,
  applyCustodyOk,
  applyTransferOk,
  isFullSync,
  loadSphereMemory,
  nextAfterSync,
  planOnOpen,
  resetAnchor,
  runtimeIsBroken,
  runtimeMayHaveRun,
  saveSphereMemory,
} from '../lib/spheresMemory';

export type SphereStep = 'list' | 'sync' | 'claim' | 'mailbox' | 'import' | 'export' | 'transfer' | 'burn' | 'reissue';

export interface SphereNotice {
  tone: 'success' | 'error' | 'info';
  key: string;
  params?: Record<string, string | number>;
  /** Translated by the component (the runtime's verdict words are i18n keys). */
  state?: SphereState;
}

export interface SphereVaultView {
  memory: SphereMemory;
  /** Label of the running operation (the button that started it, or "open"), null when idle. */
  busy: string | null;
  step: SphereStep | null;
  startedAt: number | null;
  /** The chain that runs once per vault and device. */
  firstContact: boolean;
  notice: SphereNotice | null;
  /** The last offline `list` failure, raw (translated at render). */
  listError: string | null;
}

interface SphereStoreState {
  vaults: Record<string, SphereVaultView>;
  open: (vaultId: string) => Promise<void>;
  sync: (vaultId: string) => Promise<void>;
  claim: (vaultId: string) => Promise<void>;
  mailbox: (vaultId: string) => Promise<void>;
  importFile: (vaultId: string) => Promise<void>;
  exportFile: (vaultId: string, sphereId: string) => Promise<void>;
  transfer: (vaultId: string, sphereId: string, to: string) => Promise<void>;
  /** Irreversible; `confirm` is the user's word from the modal, never implied. */
  burn: (vaultId: string, sphereId: string, confirm: boolean) => Promise<void>;
  /** `force` revokes a signed, unsubmitted transfer of that sphere (asked in the modal). */
  reissueKey: (vaultId: string, sphereId: string, force: boolean) => Promise<void>;
  dismissNotice: (vaultId: string) => void;
}

/** The runtime itself failed this session (binary missing, .psnx gone…): no automatic call until restart. */
let runtimeBroken = false;

function emptyView(vaultId: string): SphereVaultView {
  return {
    memory: loadSphereMemory(vaultId),
    busy: null,
    step: null,
    startedAt: null,
    firstContact: false,
    notice: null,
    listError: null,
  };
}

export const useSphereStore = create<SphereStoreState>((set, get) => {
  const view = (v: string): SphereVaultView => get().vaults[v] ?? emptyView(v);

  const patch = (v: string, changes: Partial<SphereVaultView>) =>
    set((s) => ({ vaults: { ...s.vaults, [v]: { ...(s.vaults[v] ?? emptyView(v)), ...changes } } }));

  const remember = (v: string, memory: SphereMemory) => patch(v, { memory: saveSphereMemory(memory) });

  const notify = (v: string, notice: SphereNotice) => patch(v, { notice });

  const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

  const noteFailure = (failure: SphereFailure) => {
    if (runtimeIsBroken(failure)) runtimeBroken = true;
  };

  /** Run `fn` as the vault's only operation; ignored while another one runs. */
  const exclusive = async (v: string, label: string, step: SphereStep, fn: () => Promise<void>) => {
    if (view(v).busy) return;
    patch(v, { busy: label, step, startedAt: Date.now(), notice: null });
    try {
      await fn();
    } finally {
      patch(v, { busy: null, step: null, startedAt: null, firstContact: false });
    }
  };

  const doList = async (v: string) => {
    patch(v, { step: 'list' });
    const r = await listSpheres(v);
    if (!r.ok) {
      noteFailure(r);
      if (r.error !== 'unavailable') patch(v, { listError: r.error });
      return;
    }
    patch(v, { listError: null });
    remember(v, applyList(view(v).memory, r, Date.now()));
  };

  /** Sync, then — only after a sync that really reached the anchor — what the memory says is due. */
  const syncChain = async (v: string, manual: boolean): Promise<boolean> => {
    patch(v, { step: 'sync' });
    remember(v, { ...view(v).memory, dirty: true });
    const r = await syncSpheres(v);
    const now = Date.now();
    if (!r.ok) {
      noteFailure(r);
      remember(v, applySyncFailure(view(v).memory, r, now));
      if (manual) notify(v, { tone: 'error', key: 'spheres.errors.sync', params: { detail: r.error } });
      return false;
    }
    runtimeBroken = false;
    const full = isFullSync(r);
    remember(v, applySync(view(v).memory, r, now, anchorHost()));
    const issues = [...r.mismatches, ...Object.values(r.errors)];
    const changed = r.received.length + r.transferredAway.length + r.burned.length > 0;
    if (issues.length) {
      notify(v, { tone: 'error', key: 'spheres.sync.issues', params: { count: issues.length, detail: issues[0] } });
    } else if (manual || changed) {
      notify(v, {
        tone: 'success',
        key: 'spheres.sync.done',
        params: { final: r.final, waiting: r.waiting, received: r.received.length, away: r.transferredAway.length },
      });
    }
    if (!full) return true;
    const next = nextAfterSync(view(v).memory, now);
    if (next.claim && !(await doClaim(v, false))) return true; // the anchor went away mid-chain: no deposit
    if (next.mailbox) await doMailbox(v, false);
    return true;
  };

  const doClaim = async (v: string, manual: boolean): Promise<boolean> => {
    patch(v, { step: 'claim' });
    remember(v, { ...view(v).memory, dirty: true });
    const r = await claimSpheres(v);
    const now = Date.now();
    if (!r.ok) {
      noteFailure(r);
      remember(v, applyClaimFailure(view(v).memory, r, now));
      if (manual) notify(v, { tone: 'error', key: 'spheres.errors.claim', params: { detail: r.error } });
      return false;
    }
    remember(v, applyClaim(view(v).memory, r, now));
    const failed = Object.keys(r.errors).length;
    if (r.claimed.length === 0 && r.deferred.length === 0) {
      if (manual) notify(v, { tone: 'info', key: 'spheres.claim.nothing', params: { already: r.already.length } });
    } else {
      notify(v, {
        tone: failed ? 'error' : 'success',
        key: 'spheres.claim.done',
        params: { claimed: r.claimed.length, deferred: r.deferred.length, failed },
      });
    }
    return true;
  };

  const doMailbox = async (v: string, manual: boolean) => {
    patch(v, { step: 'mailbox' });
    const r = await depositSphereMailbox(v, MAILBOX_DEPOSIT);
    const now = Date.now();
    if (!r.ok) {
      noteFailure(r);
      remember(v, applyMailboxFailure(view(v).memory, r, now));
      if (manual) notify(v, { tone: 'error', key: 'spheres.errors.mailbox', params: { detail: r.error } });
      return;
    }
    remember(v, applyMailbox(view(v).memory, r.pending, now));
    if (manual) notify(v, { tone: 'success', key: 'spheres.mailbox.done', params: { deposited: r.deposited, pending: r.pending ?? '?' } });
  };

  return {
    vaults: {},

    open: async (v) => {
      if (view(v).busy) return; // a remount: keep watching the running operation
      const existing = get().vaults[v];
      let m = existing?.memory ?? loadSphereMemory(v);
      // Memory about another anchor host is not trusted (the mirror of the disk is).
      const otherHost = m.anchorHost !== null && m.anchorHost !== anchorHost();
      if (otherHost) m = resetAnchor(m);
      if (!existing || otherHost) patch(v, { memory: otherHost ? saveSphereMemory(m) : m });
      const reason = planOnOpen(m, Date.now(), online(), runtimeBroken);
      const needsList = m.inventory === null || m.dirty;
      if (!reason && !needsList) return; // the common case: nothing to spawn
      await exclusive(v, 'open', reason ? 'sync' : 'list', async () => {
        patch(v, { firstContact: reason === 'first' });
        const synced = reason ? await syncChain(v, false) : false;
        const after = view(v).memory;
        if (!synced && (after.inventory === null || after.dirty) && !runtimeBroken) await doList(v);
      });
    },

    sync: (v) => exclusive(v, 'sync', 'sync', async () => { await syncChain(v, true); }),

    claim: (v) => exclusive(v, 'claim', 'claim', async () => { await doClaim(v, true); }),

    mailbox: (v) => exclusive(v, 'mailbox', 'mailbox', async () => { await doMailbox(v, true); }),

    importFile: (v) =>
      exclusive(v, 'import', 'import', async () => {
        const r = await importSphereFile(v);
        if (!r.ok) {
          if (r.errorCode === 'canceled') return; // no runtime spawned
          noteFailure(r);
          // An import the runtime refused may still have handed records to the anchor.
          remember(v, { ...view(v).memory, dirty: runtimeMayHaveRun(r) });
          notify(v, { tone: 'error', key: 'spheres.errors.import', params: { detail: r.error } });
          return;
        }
        remember(v, applyImport(view(v).memory, r.status, Date.now()));
        if (!r.status) await doList(v);
        notify(v, { tone: 'success', key: 'spheres.import.done', params: { id: r.sphereId, submitted: r.submitted.length }, state: r.state });
      }),

    exportFile: (v, sphereId) =>
      exclusive(v, `export:${sphereId}`, 'export', async () => {
        const r = await exportSphereFile(v, sphereId);
        if (!r.ok) {
          if (r.errorCode === 'canceled') return;
          noteFailure(r);
          notify(v, { tone: 'error', key: 'spheres.errors.export', params: { detail: r.error } });
          return;
        }
        notify(v, { tone: 'success', key: 'spheres.export.done', params: { filename: r.filename } });
      }),

    transfer: (v, sphereId, to) =>
      exclusive(v, `transfer:${sphereId}`, 'transfer', async () => {
        remember(v, { ...view(v).memory, dirty: true });
        const r = await transferSphere(v, sphereId, to);
        if (!r.ok) {
          noteFailure(r);
          notify(v, { tone: 'error', key: 'spheres.errors.transfer', params: { detail: r.error } });
          // The signed record may sit in pending/ (written before submission):
          // the row must say so, and Transfer must be disabled for it.
          if (runtimeMayHaveRun(r)) await doList(v);
          else remember(v, { ...view(v).memory, dirty: false });
          return;
        }
        remember(v, applyTransferOk(view(v).memory, sphereId, Date.now()));
        notify(v, { tone: 'success', key: 'spheres.transfer.done', params: { id: r.sphereId, to: r.to }, state: r.state });
      }),

    burn: (v, sphereId, confirm) =>
      exclusive(v, `burn:${sphereId}`, 'burn', async () => {
        if (confirm !== true) return; // the modal is the only caller that may pass true
        remember(v, { ...view(v).memory, dirty: true });
        const r = await burnSphere(v, sphereId, true);
        if (!r.ok) {
          noteFailure(r);
          notify(v, { tone: 'error', key: 'spheres.errors.burn', params: { detail: r.error } });
          // Signed before submission: the row must show the pending record if the anchor never answered.
          if (runtimeMayHaveRun(r)) await doList(v);
          else remember(v, { ...view(v).memory, dirty: false });
          return;
        }
        remember(v, applyCustodyOk(view(v).memory, r, Date.now()));
        notify(v, { tone: 'success', key: 'spheres.burn.done', params: { id: r.sphereId }, state: r.state });
      }),

    reissueKey: (v, sphereId, force) =>
      exclusive(v, `reissue:${sphereId}`, 'reissue', async () => {
        remember(v, { ...view(v).memory, dirty: true });
        const r = await reissueSphereKey(v, sphereId, force === true);
        if (!r.ok) {
          noteFailure(r);
          notify(v, { tone: 'error', key: 'spheres.errors.reissue', params: { detail: r.error } });
          if (runtimeMayHaveRun(r)) await doList(v);
          else remember(v, { ...view(v).memory, dirty: false });
          return;
        }
        remember(v, applyCustodyOk(view(v).memory, r, Date.now()));
        notify(v, { tone: 'success', key: 'spheres.reissue.done', params: { id: r.sphereId, seq: r.seq }, state: r.state });
      }),

    dismissNotice: (v) => patch(v, { notice: null }),
  };
});

/** Rows of the remembered inventory, for components that only read. */
export function selectSpheres(view: SphereVaultView | undefined): SphereStatus[] {
  return view?.memory.inventory ?? [];
}
