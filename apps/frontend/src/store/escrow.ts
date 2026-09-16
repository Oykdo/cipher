/**
 * Zustand store for the Escrow tab: owns every `cipher-runtime escrow …`
 * call so that the component (which remounts on each tab visit, and twice
 * under StrictMode) can only *look* at what is going on. Same discipline as
 * store/spheres.ts, without the anchor: everything here is local and
 * offline, the only cost is the runtime's ~30 s cold start per call.
 *
 * - One operation at a time per vault: `busy` is set synchronously before
 *   the first await, so a remount or a double click never spawns a second
 *   runtime on the vault's files.
 * - The inventory lives for the session: a tab revisit renders it at once
 *   and the runtime is spawned again only on "Refresh" or after an action
 *   that changed it (deposit, delete). Nothing is persisted: the list is
 *   the runtime's word, and it is cheap to ask again.
 * - Notices are stored as i18n keys and translated by the component.
 */

import { create } from 'zustand';
import type { EscrowEntry, EscrowFailure, EscrowUnreadable } from '../lib/escrow';
import { deleteEscrow, depositEscrow, listEscrows, retrieveEscrow, verifyEscrows } from '../lib/escrow';

export type EscrowStep = 'list' | 'deposit' | 'retrieve' | 'verify' | 'delete';

export interface EscrowNotice {
  tone: 'success' | 'error' | 'info';
  key: string;
  params?: Record<string, string | number>;
}

export interface EscrowVaultView {
  entries: EscrowEntry[];
  unreadable: EscrowUnreadable[];
  /** When the inventory was last read from the runtime; null until the first list. */
  loadedAt: number | null;
  /** Label of the running operation, null when idle. */
  busy: string | null;
  step: EscrowStep | null;
  startedAt: number | null;
  notice: EscrowNotice | null;
  /** The last `list` failure, raw (translated at render). */
  listError: string | null;
  /** Integrity verdicts of the last "Verify all", by escrow id. */
  verified: Record<string, { ok: boolean; reason: string }>;
}

interface EscrowStoreState {
  vaults: Record<string, EscrowVaultView>;
  open: (vaultId: string) => Promise<void>;
  refresh: (vaultId: string) => Promise<void>;
  deposit: (vaultId: string, options: { label?: string; releaseAfter?: string; ownerOnly?: boolean }) => Promise<void>;
  retrieve: (vaultId: string, escrowId: string, suggestedName?: string) => Promise<void>;
  verify: (vaultId: string) => Promise<void>;
  remove: (vaultId: string, escrowId: string) => Promise<void>;
  dismissNotice: (vaultId: string) => void;
}

function emptyView(): EscrowVaultView {
  return {
    entries: [],
    unreadable: [],
    loadedAt: null,
    busy: null,
    step: null,
    startedAt: null,
    notice: null,
    listError: null,
    verified: {},
  };
}

/** A failure the user can act on is named by its code; the rest shows the runtime's words. */
function failureNotice(failure: EscrowFailure, fallbackKey: string): EscrowNotice {
  switch (failure.errorCode) {
    case 'canceled':
      return { tone: 'info', key: 'escrow.errors.canceled' };
    case 'locked':
      return { tone: 'info', key: 'escrow.errors.locked', params: { until: failure.releaseAfter ?? '' } };
    case 'integrity':
      return { tone: 'error', key: 'escrow.errors.integrity' };
    case 'not_found':
      return { tone: 'error', key: 'escrow.errors.not_found' };
    case 'unreadable':
      return { tone: 'error', key: 'escrow.errors.unreadable' };
    case 'unavailable':
    case 'runtime_unavailable':
    case 'runtime_failed':
      return { tone: 'error', key: 'escrow.errors.runtime', params: { detail: failure.error } };
    case 'psnx_not_found':
      return { tone: 'error', key: 'escrow.errors.no_psnx' };
    default:
      return { tone: 'error', key: fallbackKey, params: { detail: failure.error } };
  }
}

export const useEscrowStore = create<EscrowStoreState>((set, get) => {
  const view = (v: string): EscrowVaultView => get().vaults[v] ?? emptyView();

  const patch = (v: string, changes: Partial<EscrowVaultView>) =>
    set((s) => ({ vaults: { ...s.vaults, [v]: { ...(s.vaults[v] ?? emptyView()), ...changes } } }));

  /** Run `fn` as the vault's only operation; ignored while another one runs. */
  const exclusive = async (v: string, label: string, step: EscrowStep, fn: () => Promise<void>) => {
    if (view(v).busy) return;
    patch(v, { busy: label, step, startedAt: Date.now(), notice: null });
    try {
      await fn();
    } finally {
      patch(v, { busy: null, step: null, startedAt: null });
    }
  };

  /** Read the inventory; keeps the previous one when the runtime fails. */
  const doList = async (v: string): Promise<boolean> => {
    patch(v, { step: 'list' });
    const r = await listEscrows(v);
    if (!r.ok) {
      if (r.errorCode !== 'unavailable') patch(v, { listError: r.error });
      return false;
    }
    patch(v, { entries: r.escrows, unreadable: r.unreadable, loadedAt: Date.now(), listError: null, verified: {} });
    return true;
  };

  return {
    vaults: {},

    open: async (v) => {
      if (view(v).loadedAt !== null) return;
      await exclusive(v, 'open', 'list', async () => {
        await doList(v);
      });
    },

    refresh: async (v) => {
      await exclusive(v, 'refresh', 'list', async () => {
        await doList(v);
      });
    },

    deposit: async (v, options) => {
      await exclusive(v, 'deposit', 'deposit', async () => {
        const r = await depositEscrow(v, options);
        if (!r.ok) {
          patch(v, { notice: failureNotice(r, 'escrow.errors.deposit') });
          return;
        }
        const entries = [r.entry, ...view(v).entries.filter((e) => e.escrow_id !== r.entry.escrow_id)];
        patch(v, {
          entries,
          loadedAt: Date.now(),
          notice: {
            tone: 'success',
            key: r.entry.release_after ? 'escrow.deposit.done_locked' : 'escrow.deposit.done',
            params: { label: r.entry.label || r.filename, until: r.entry.release_after ?? '' },
          },
        });
      });
    },

    retrieve: async (v, escrowId, suggestedName) => {
      await exclusive(v, `retrieve:${escrowId}`, 'retrieve', async () => {
        const r = await retrieveEscrow(v, escrowId, suggestedName);
        if (!r.ok) {
          patch(v, { notice: failureNotice(r, 'escrow.errors.retrieve') });
          return;
        }
        patch(v, { notice: { tone: 'success', key: 'escrow.retrieve.done', params: { filename: r.filename, size: r.size } } });
      });
    },

    verify: async (v) => {
      await exclusive(v, 'verify', 'verify', async () => {
        const r = await verifyEscrows(v);
        if (!r.ok) {
          patch(v, { notice: failureNotice(r, 'escrow.errors.verify') });
          return;
        }
        const verified: Record<string, { ok: boolean; reason: string }> = {};
        for (const item of r.results) verified[item.escrow_id] = { ok: item.integrity_ok, reason: item.reason };
        patch(v, {
          verified,
          notice: {
            tone: r.failed ? 'error' : 'success',
            key: r.failed ? 'escrow.verify.failed' : 'escrow.verify.done',
            params: { checked: r.checked, failed: r.failed },
          },
        });
      });
    },

    remove: async (v, escrowId) => {
      await exclusive(v, `delete:${escrowId}`, 'delete', async () => {
        const r = await deleteEscrow(v, escrowId);
        if (!r.ok) {
          patch(v, { notice: failureNotice(r, 'escrow.errors.delete') });
          return;
        }
        const current = view(v);
        patch(v, {
          entries: current.entries.filter((e) => e.escrow_id !== escrowId),
          unreadable: current.unreadable.filter((u) => u.escrow_id !== escrowId),
          notice: { tone: 'success', key: r.deleted ? 'escrow.delete.done' : 'escrow.delete.nothing' },
        });
      });
    },

    dismissNotice: (v) => patch(v, { notice: null }),
  };
});
