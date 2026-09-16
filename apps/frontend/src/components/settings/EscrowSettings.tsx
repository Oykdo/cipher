import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { EIDOLON_CONNECT_ENABLED } from "../../config";
import { escrowVerdict, isEscrowClientAvailable, type EscrowEntry, type EscrowVerdict } from "../../lib/escrow";
import { useEscrowStore, type EscrowNotice, type EscrowStep } from "../../store/escrow";

/**
 * Escrow Nexus: the vault's sealed, time-locked documents, kept on this
 * device. A view of store/escrow.ts, which owns every call to the Eidolon
 * runtime (lib/escrow.ts): the renderer never sees a key, a path, the
 * .psnx, or the document itself — it enters and leaves through native
 * dialogs. What is shown is what the protocol stores in cleartext: label,
 * conditions, deposit time, size — plus the runtime's verdict (ready /
 * locked until … / tampered).
 *
 * Every call spawns the runtime (~30 s cold), so the running step is named
 * and timed, and the inventory is kept for the session.
 */

const VERDICT_STYLE: Record<EscrowVerdict, string> = {
    ready: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    locked: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    tampered: "border-rose-400/30 bg-rose-500/10 text-rose-200",
    invalid: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

const NOTICE_STYLE: Record<EscrowNotice["tone"], string> = {
    error: "text-rose-200",
    success: "text-emerald-200",
    info: "text-slate-300",
};

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatWhen(iso: string | null | undefined): string {
    if (!iso) return "";
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

/** `datetime-local` value (local wall clock) → ISO 8601 with the local offset, for the runtime. */
function localInputToIso(value: string): string | null {
    if (!value) return null;
    const at = new Date(value);
    return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function EscrowSettings() {
    const { t } = useTranslation();
    const linkedVault = useAuthStore((state) => state.session?.user?.linkedVault);
    const vaultId = linkedVault?.vaultId ?? null;
    const available = EIDOLON_CONNECT_ENABLED && isEscrowClientAvailable();

    const view = useEscrowStore((s) => (vaultId ? s.vaults[vaultId] : undefined));
    const open = useEscrowStore((s) => s.open);
    // Store actions are stable: read them once, outside the render subscription.
    const actions = useEscrowStore.getState();

    const [depositOpen, setDepositOpen] = useState(false);
    const [label, setLabel] = useState("");
    const [releaseAfter, setReleaseAfter] = useState("");
    const [ownerOnly, setOwnerOnly] = useState(false);
    const [depositError, setDepositError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
    // Re-render once a second while the runtime works, for the elapsed time.
    const [, setTick] = useState(0);

    const busy = view?.busy ?? null;
    const step = view?.step ?? null;

    useEffect(() => {
        if (available && vaultId) void open(vaultId);
    }, [available, vaultId, open]);

    useEffect(() => {
        if (!busy) return;
        const id = window.setInterval(() => setTick((n) => n + 1), 1000);
        return () => window.clearInterval(id);
    }, [busy]);

    const verdictLabel = (entry: EscrowEntry): string => {
        switch (escrowVerdict(entry)) {
            case "ready":
                return t("escrow.state.ready");
            case "locked":
                return t("escrow.state.locked", { until: formatWhen(entry.release_after) });
            case "tampered":
                return t("escrow.state.tampered");
            default:
                return t("escrow.state.invalid");
        }
    };

    const stepLabel = (s: EscrowStep): string => {
        switch (s) {
            case "deposit":
                return t("escrow.status.working_deposit");
            case "retrieve":
                return t("escrow.status.working_retrieve");
            case "verify":
                return t("escrow.status.working_verify");
            case "delete":
                return t("escrow.status.working_delete");
            default:
                return t("common.loading");
        }
    };

    const noticeText = (notice: EscrowNotice): string => {
        const params = notice.params ? { ...notice.params } : undefined;
        if (params && typeof params.until === "string" && params.until) params.until = formatWhen(params.until);
        if (params && typeof params.size === "number") params.size = formatBytes(params.size);
        return t(notice.key, params);
    };

    const openDeposit = () => {
        setLabel("");
        setReleaseAfter("");
        setOwnerOnly(false);
        setDepositError(null);
        setDepositOpen(true);
    };

    const onDeposit = () => {
        if (!vaultId) return;
        let iso: string | undefined;
        if (releaseAfter) {
            const converted = localInputToIso(releaseAfter);
            if (!converted) {
                setDepositError(t("escrow.deposit.invalid_date"));
                return;
            }
            if (new Date(converted).getTime() <= Date.now()) {
                setDepositError(t("escrow.deposit.date_in_past"));
                return;
            }
            iso = converted;
        }
        setDepositOpen(false);
        void actions.deposit(vaultId, { label: label.trim() || undefined, releaseAfter: iso, ownerOnly });
    };

    const onDelete = () => {
        const target = deleteTarget;
        if (!target || !vaultId) return;
        setDeleteTarget(null);
        void actions.remove(vaultId, target.id);
    };

    if (!available) {
        return (
            <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">{t("escrow.title")}</h2>
                <p className="text-sm leading-6 text-slate-300">{t("escrow.desktop_only")}</p>
            </div>
        );
    }

    if (!vaultId) {
        return (
            <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">{t("escrow.title")}</h2>
                <p className="text-sm leading-6 text-slate-300">{t("escrow.no_vault")}</p>
            </div>
        );
    }

    const entries = view?.entries ?? [];
    const unreadable = view?.unreadable ?? [];
    const loaded = view?.loadedAt !== null && view?.loadedAt !== undefined;
    const readyCount = entries.filter((e) => escrowVerdict(e) === "ready").length;
    const lockedCount = entries.filter((e) => escrowVerdict(e) === "locked").length;
    const badCount = entries.filter((e) => ["tampered", "invalid"].includes(escrowVerdict(e))).length + unreadable.length;
    const seconds = view?.startedAt ? Math.max(0, Math.round((Date.now() - view.startedAt) / 1000)) : 0;

    return (
        <div className="space-y-8">
            {depositOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="cosmic-glass-card cosmic-glow-border w-full max-w-md rounded-3xl p-6">
                        <h3 className="mb-2 text-xl font-semibold text-white">{t("escrow.deposit.title")}</h3>
                        <p className="mb-4 text-sm text-slate-300">{t("escrow.deposit.description")}</p>
                        <label className="mb-1 block text-xs text-slate-400">{t("escrow.deposit.label")}</label>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={t("escrow.deposit.label_placeholder")}
                            className="cosmic-input mb-3 w-full text-sm"
                            maxLength={200}
                            autoFocus
                        />
                        <label className="mb-1 block text-xs text-slate-400">{t("escrow.deposit.release_after")}</label>
                        <input
                            type="datetime-local"
                            value={releaseAfter}
                            onChange={(e) => {
                                setReleaseAfter(e.target.value);
                                setDepositError(null);
                            }}
                            className="cosmic-input mb-1 w-full text-sm"
                        />
                        <p className="mb-3 text-xs text-slate-400">{t("escrow.deposit.release_after_hint")}</p>
                        <label className="mb-4 flex items-start gap-2 text-xs text-slate-300">
                            <input type="checkbox" checked={ownerOnly} onChange={(e) => setOwnerOnly(e.target.checked)} className="mt-0.5" />
                            <span>{t("escrow.deposit.owner_only")}</span>
                        </label>
                        {depositError && <p className="mb-4 text-sm text-red-200">{depositError}</p>}
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setDepositOpen(false)} className="cosmic-btn-ghost flex-1">
                                {t("common.cancel")}
                            </button>
                            <button type="button" onClick={onDeposit} className="cosmic-cta flex-1">
                                {t("escrow.deposit.choose_file")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="cosmic-glass-card cosmic-glow-border w-full max-w-md rounded-3xl p-6">
                        <h3 className="mb-2 text-xl font-semibold text-white">{t("escrow.delete.title")}</h3>
                        <p className="mb-4 text-sm text-slate-300">{t("escrow.delete.description", { label: deleteTarget.label })}</p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setDeleteTarget(null)} className="cosmic-btn-ghost flex-1">
                                {t("common.cancel")}
                            </button>
                            <button type="button" onClick={onDelete} className="cosmic-cta flex-1">
                                {t("escrow.delete.confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section>
                <h2 className="mb-1 text-xl font-semibold text-white">{t("escrow.title")}</h2>
                <p className="mb-4 text-sm leading-6 text-slate-300">{t("escrow.description")}</p>
                <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                            {t("escrow.summary.ready", { count: readyCount })}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-200">
                            {t("escrow.summary.locked", { count: lockedCount })}
                        </span>
                        {badCount > 0 && (
                            <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1 text-rose-200">
                                {t("escrow.summary.bad", { count: badCount })}
                            </span>
                        )}
                    </div>
                    {busy && step && (
                        <p className="mb-4 text-xs leading-5 text-slate-400">
                            {stepLabel(step)} · {t("escrow.status.elapsed", { seconds })}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={openDeposit} disabled={busy !== null} className="cosmic-cta inline-flex items-center gap-2 disabled:opacity-50">
                            {step === "deposit" ? t("escrow.actions.working") : t("escrow.actions.deposit")}
                        </button>
                        <button type="button" onClick={() => actions.verify(vaultId)} disabled={busy !== null} className="cosmic-btn-ghost disabled:opacity-50">
                            {step === "verify" ? t("escrow.actions.working") : t("escrow.actions.verify")}
                        </button>
                        <button type="button" onClick={() => actions.refresh(vaultId)} disabled={busy !== null} className="cosmic-btn-ghost disabled:opacity-50">
                            {step === "list" ? t("escrow.actions.working") : t("escrow.actions.refresh")}
                        </button>
                    </div>
                    {busy && <p className="mt-3 text-xs text-slate-500">{t("escrow.status.runtime_hint")}</p>}
                    {view?.notice && <p className={`mt-4 text-sm ${NOTICE_STYLE[view.notice.tone]}`}>{noticeText(view.notice)}</p>}
                    {view?.listError && (
                        <p className="mt-4 text-sm text-rose-200">{t("escrow.errors.list", { detail: view.listError })}</p>
                    )}
                    <p className="mt-4 text-xs leading-5 text-slate-500">{t("escrow.plain")}</p>
                </div>
            </section>

            <section>
                <h2 className="mb-4 text-xl font-semibold text-white">{t("escrow.inventory.title")}</h2>
                {!loaded ? (
                    <p className="text-sm text-slate-400">{t("common.loading")}</p>
                ) : entries.length === 0 && unreadable.length === 0 ? (
                    <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                        <p className="text-sm leading-6 text-slate-300">{t("escrow.inventory.empty")}</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {entries.map((entry) => {
                            const verdict = escrowVerdict(entry);
                            const busyHere = busy === `retrieve:${entry.escrow_id}` || busy === `delete:${entry.escrow_id}`;
                            const checked = view?.verified?.[entry.escrow_id];
                            const title = entry.label || entry.escrow_id;
                            return (
                                <li key={entry.escrow_id} className="cosmic-glass-card cosmic-glow-border rounded-2xl p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <span className="block truncate font-semibold text-white">{title}</span>
                                            <p className="mt-1 font-mono text-[11px] text-slate-400">
                                                {entry.escrow_id} · {formatBytes(entry.payload_size)} · {t("escrow.inventory.deposited", { when: formatWhen(entry.deposited_at) })}
                                            </p>
                                            {entry.conditions.some((c) => c.type === "owner_signature" || (c.children ?? []).some((k) => k.type === "owner_signature")) && (
                                                <p className="mt-1 text-xs text-slate-400">{t("escrow.inventory.owner_only")}</p>
                                            )}
                                            {verdict !== "ready" && verdict !== "locked" && (
                                                <p className="mt-1 text-xs text-rose-300/80">{entry.reason}</p>
                                            )}
                                            {checked && (
                                                <p className={`mt-1 text-xs ${checked.ok ? "text-emerald-300/80" : "text-rose-300/80"}`}>
                                                    {checked.ok ? t("escrow.inventory.integrity_ok") : t("escrow.inventory.integrity_failed", { reason: checked.reason })}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${VERDICT_STYLE[verdict]}`}>
                                                {verdictLabel(entry)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => actions.retrieve(vaultId, entry.escrow_id, entry.label || undefined)}
                                                disabled={busy !== null || verdict !== "ready"}
                                                className="cosmic-cta px-3 py-1 text-xs disabled:opacity-50"
                                            >
                                                {busyHere && step === "retrieve" ? t("escrow.actions.working") : t("escrow.actions.retrieve")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteTarget({ id: entry.escrow_id, label: title })}
                                                disabled={busy !== null}
                                                className="cosmic-btn-ghost px-3 py-1 text-xs disabled:opacity-50"
                                            >
                                                {busyHere && step === "delete" ? t("escrow.actions.working") : t("escrow.actions.delete")}
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                        {unreadable.map((bad) => (
                            <li key={`bad:${bad.escrow_id}`} className="cosmic-glass-card cosmic-glow-border rounded-2xl p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <span className="block truncate font-mono text-sm text-slate-200">{bad.escrow_id}</span>
                                        <p className="mt-1 text-xs text-rose-300/80">{t("escrow.inventory.unreadable", { detail: bad.error })}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${VERDICT_STYLE.invalid}`}>
                                            {t("escrow.state.unreadable")}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget({ id: bad.escrow_id, label: bad.escrow_id })}
                                            disabled={busy !== null}
                                            className="cosmic-btn-ghost px-3 py-1 text-xs disabled:opacity-50"
                                        >
                                            {t("escrow.actions.delete")}
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
