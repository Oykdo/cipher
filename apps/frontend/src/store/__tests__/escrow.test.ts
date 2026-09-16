/**
 * The Escrow tab's store and lib against a fake `window.electron.escrow`:
 * no runtime, no IPC. What is checked is the contract the tab relies on —
 * verdicts from the runtime's words, one operation at a time per vault,
 * the inventory kept for the session, notices as i18n keys with the
 * runtime's data.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { escrowVerdict, type EscrowEntry } from '../../lib/escrow';
import { useEscrowStore } from '../escrow';

const VAULT = 'a'.repeat(64);

function entry(overrides: Partial<EscrowEntry> = {}): EscrowEntry {
  return {
    escrow_id: 'esc_0123456789abcdef0123456789abcdef',
    label: 'contrat.pdf',
    deposited_at: '2026-09-16T05:00:00+00:00',
    payload_size: 1234,
    conditions: [],
    release_after: null,
    releasable: true,
    reason: 'releasable',
    ...overrides,
  };
}

type EscrowBridge = NonNullable<NonNullable<Window['electron']>['escrow']>;
type Mocked = { [K in keyof EscrowBridge]: ReturnType<typeof vi.fn> };

/** A fake `window.electron.escrow`: every method is a vi.fn returning the runtime's JSON shape. */
function bridge(impl: Partial<Mocked> = {}): Mocked {
  const api: Mocked = {
    list: vi.fn(async () => ({ ok: true, vault_id: VAULT, count: 0, escrows: [], unreadable: [] })),
    deposit: vi.fn(async () => ({ ok: false, error: 'canceled', errorCode: 'canceled' })),
    retrieve: vi.fn(async () => ({ ok: false, error: 'canceled', errorCode: 'canceled' })),
    verify: vi.fn(async () => ({ ok: true, checked: 0, failed: 0, results: [] })),
    remove: vi.fn(async () => ({ ok: true, escrow_id: '', deleted: true })),
    ...impl,
  };
  (window as unknown as { electron: unknown }).electron = { escrow: api };
  return api;
}

beforeEach(() => {
  useEscrowStore.setState({ vaults: {} });
});

describe('escrowVerdict', () => {
  it('reads the runtime words, not a status code', () => {
    expect(escrowVerdict(entry())).toBe('ready');
    expect(escrowVerdict(entry({ releasable: false, reason: "release condition 'time_lock' not satisfied: locked for 1 day more", release_after: '2099-01-01T00:00:00+00:00' }))).toBe('locked');
    expect(escrowVerdict(entry({ releasable: false, reason: 'integrity verification failed: integrity MAC mismatch (wrong key or tampered envelope)' }))).toBe('tampered');
    expect(escrowVerdict(entry({ releasable: false, reason: 'invalid release condition: unknown type nope' }))).toBe('invalid');
  });
});

describe('useEscrowStore', () => {
  it('open lists once per session; refresh asks the runtime again', async () => {
    const api = bridge({
      list: vi.fn(async () => ({ ok: true, vault_id: VAULT, count: 1, escrows: [entry()], unreadable: [{ escrow_id: 'esc_bad', error: 'corrupt envelope at <path>: x' }] })),
    });
    await useEscrowStore.getState().open(VAULT);
    await useEscrowStore.getState().open(VAULT);
    expect(api.list).toHaveBeenCalledTimes(1);
    const view = useEscrowStore.getState().vaults[VAULT];
    expect(view.entries.map((e) => e.escrow_id)).toEqual(['esc_0123456789abcdef0123456789abcdef']);
    expect(view.unreadable).toEqual([{ escrow_id: 'esc_bad', error: 'corrupt envelope at <path>: x' }]);
    expect(view.loadedAt).not.toBeNull();
    expect(view.busy).toBeNull();
    await useEscrowStore.getState().refresh(VAULT);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous inventory and reports when the runtime fails', async () => {
    const api = bridge({
      list: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, vault_id: VAULT, count: 1, escrows: [entry()], unreadable: [] })
        .mockResolvedValueOnce({ ok: false, error: 'escrow list failed: exit 1', errorCode: 'runtime_failed' }),
    });
    await useEscrowStore.getState().open(VAULT);
    await useEscrowStore.getState().refresh(VAULT);
    expect(api.list).toHaveBeenCalledTimes(2);
    const view = useEscrowStore.getState().vaults[VAULT];
    expect(view.entries).toHaveLength(1);
    expect(view.listError).toBe('escrow list failed: exit 1');
  });

  it('runs one operation at a time per vault', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = bridge({
      list: vi.fn(async () => {
        await gate;
        return { ok: true, vault_id: VAULT, count: 0, escrows: [], unreadable: [] };
      }),
    });
    const first = useEscrowStore.getState().open(VAULT);
    expect(useEscrowStore.getState().vaults[VAULT].busy).toBe('open');
    await useEscrowStore.getState().verify(VAULT); // ignored: busy
    expect(api.verify).not.toHaveBeenCalled();
    release();
    await first;
    expect(useEscrowStore.getState().vaults[VAULT].busy).toBeNull();
  });

  it('deposit prepends the new escrow and names the lock date', async () => {
    const locked = entry({
      escrow_id: 'esc_ffffffffffffffffffffffffffffffff',
      label: 'testament',
      releasable: false,
      release_after: '2099-01-01T00:00:00+00:00',
      reason: "release condition 'time_lock' not satisfied: locked for 26000 days more",
    });
    const api = bridge({
      list: vi.fn(async () => ({ ok: true, vault_id: VAULT, count: 1, escrows: [entry()], unreadable: [] })),
      deposit: vi.fn(async () => ({ ok: true, filename: 'testament.pdf', ...locked })),
    });
    await useEscrowStore.getState().open(VAULT);
    await useEscrowStore.getState().deposit(VAULT, { label: 'testament', releaseAfter: '2099-01-01T00:00:00.000Z' });
    expect(api.deposit).toHaveBeenCalledWith(VAULT, { label: 'testament', releaseAfter: '2099-01-01T00:00:00.000Z' });
    const view = useEscrowStore.getState().vaults[VAULT];
    expect(view.entries.map((e) => e.escrow_id)).toEqual(['esc_ffffffffffffffffffffffffffffffff', 'esc_0123456789abcdef0123456789abcdef']);
    expect(view.notice).toEqual({ tone: 'success', key: 'escrow.deposit.done_locked', params: { label: 'testament', until: '2099-01-01T00:00:00+00:00' } });
    expect(escrowVerdict(view.entries[0])).toBe('locked');
  });

  it('retrieve of a locked escrow tells until when; a cancel is quiet', async () => {
    bridge({
      retrieve: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: "release condition 'time_lock' not satisfied: locked for 3 days more", errorCode: 'locked', releaseAfter: '2099-01-01T00:00:00+00:00' })
        .mockResolvedValueOnce({ ok: false, error: 'canceled', errorCode: 'canceled' })
        .mockResolvedValueOnce({ ok: true, escrowId: 'esc_x', filename: 'contrat.pdf', size: 1234 }),
    });
    const s = useEscrowStore.getState();
    await s.retrieve(VAULT, 'esc_x', 'contrat.pdf');
    expect(useEscrowStore.getState().vaults[VAULT].notice).toEqual({ tone: 'info', key: 'escrow.errors.locked', params: { until: '2099-01-01T00:00:00+00:00' } });
    await s.retrieve(VAULT, 'esc_x');
    expect(useEscrowStore.getState().vaults[VAULT].notice).toEqual({ tone: 'info', key: 'escrow.errors.canceled' });
    await s.retrieve(VAULT, 'esc_x');
    expect(useEscrowStore.getState().vaults[VAULT].notice).toEqual({ tone: 'success', key: 'escrow.retrieve.done', params: { filename: 'contrat.pdf', size: 1234 } });
  });

  it('verify records per-escrow integrity; delete drops the row, readable or not', async () => {
    const api = bridge({
      list: vi.fn(async () => ({ ok: true, vault_id: VAULT, count: 1, escrows: [entry()], unreadable: [{ escrow_id: 'esc_bad', error: 'corrupt' }] })),
      verify: vi.fn(async () => ({
        ok: true,
        checked: 2,
        failed: 1,
        results: [
          { escrow_id: 'esc_0123456789abcdef0123456789abcdef', integrity_ok: true, reason: 'integrity ok' },
          { escrow_id: 'esc_bad', integrity_ok: false, reason: 'unreadable: corrupt' },
        ],
      })),
      remove: vi.fn(async (_v: string, id: string) => ({ ok: true, escrow_id: id, deleted: true })),
    });
    const s = useEscrowStore.getState();
    await s.open(VAULT);
    await s.verify(VAULT);
    let view = useEscrowStore.getState().vaults[VAULT];
    expect(view.verified['esc_0123456789abcdef0123456789abcdef']).toEqual({ ok: true, reason: 'integrity ok' });
    expect(view.notice).toEqual({ tone: 'error', key: 'escrow.verify.failed', params: { checked: 2, failed: 1 } });
    await s.remove(VAULT, 'esc_bad');
    await s.remove(VAULT, 'esc_0123456789abcdef0123456789abcdef');
    expect(api.remove).toHaveBeenCalledTimes(2);
    view = useEscrowStore.getState().vaults[VAULT];
    expect(view.entries).toEqual([]);
    expect(view.unreadable).toEqual([]);
    expect(view.notice).toEqual({ tone: 'success', key: 'escrow.delete.done' });
  });

  it('outside Electron every call is unavailable and leaves no error behind', async () => {
    (window as unknown as { electron: unknown }).electron = undefined;
    await useEscrowStore.getState().open(VAULT);
    const view = useEscrowStore.getState().vaults[VAULT];
    expect(view.loadedAt).toBeNull();
    expect(view.listError).toBeNull();
  });
});
