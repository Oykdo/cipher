import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { EIDOLON_CONNECT_ENABLED } from "../../config";
import { escrowVerdict, isEscrowClientAvailable, type EscrowEntry, type EscrowVerdict } from "../../lib/escrow";
import { useEscrowStore, type EscrowNotice, type EscrowStep } from "../../store/escrow";
import {
    ActionButton,
    Chip,
    CustodyDialog,
    CustodyHero,
    EmptyPanel,
    EscrowEmblem,
    EscrowSeal,
    FinePrint,
    Icon,
    IconButton,
    NoticeBanner,
    Pill,
    RuntimeBar,
    SectionHeading,
    StatTile,
    type PillTone,
} from "./custodyUi";

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
 *
 * Layout: a hero band (emblem, stat tiles), the actions, then the sealed
 * documents as a grid of verdict-tinted cards, a locked one carrying its
 * countdown and the fraction of the lock already elapsed.
 */

const VERDICT_TONE: Record<EscrowVerdict, PillTone> = {
    ready: "emerald",
    locked: "amber",
    tampered: "rose",
    invalid: "slate",
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

/** How much of a time lock has elapsed, 0..1, from deposit to release; null when either date is unreadable. */
function lockProgress(entry: EscrowEntry, now: number): number | null {
    if (!entry.release_after) return null;
    const from = new Date(entry.deposited_at).getTime();
    const to = new Date(entry.release_after).getTime();
    if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null;
    return Math.min(1, Math.max(0, (now - from) / (to - from)));
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

    /** "in 3 days" / "in 2 hours" / "in 5 minutes", from the existing common keys. */
    const relativeFuture = (iso: string): string => {
        const diffMs = new Date(iso).getTime() - Date.now();
        if (Number.isNaN(diffMs) || diffMs <= 0) return "";
        const mins = Math.ceil(diffMs / 60000);
        const hours = Math.round(diffMs / 3600000);
        const days = Math.round(diffMs / 86400000);
        if (mins < 60) return t("common.in_minutes", { count: mins });
        if (hours < 48) return t("common.in_hours", { count: hours });
        return t("common.in_days", { count: days });
    };

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

    if (!available || !vaultId) {
        return (
            <CustodyHero emblem={<EscrowEmblem />} kicker={t("escrow.kicker")} title={t("escrow.title")} lead={t(available ? "escrow.no_vault" : "escrow.desktop_only")} />
        );
    }

    const entries = view?.entries ?? [];
    const unreadable = view?.unreadable ?? [];
    const loaded = view?.loadedAt !== null && view?.loadedAt !== undefined;
    const readyCount = entries.filter((e) => escrowVerdict(e) === "ready").length;
    const lockedCount = entries.filter((e) => escrowVerdict(e) === "locked").length;
    const badCount = entries.filter((e) => ["tampered", "invalid"].includes(escrowVerdict(e))).length + unreadable.length;
    const now = Date.now();
    const seconds = view?.startedAt ? Math.max(0, Math.round((now - view.startedAt) / 1000)) : 0;
    const totalBytes = entries.reduce((sum, e) => sum + e.payload_size, 0);

    return (
        <div className="space-y-6">
            <CustodyDialog
                open={depositOpen}
                onOpenChange={setDepositOpen}
                emblem={<Icon.seal className="text-cyan-300" />}
                title={t("escrow.deposit.title")}
                description={t("escrow.deposit.description")}
                footer={
                    <>
                        <button type="button" onClick={() => setDepositOpen(false)} className="cosmic-btn-ghost flex-1">
                            {t("common.cancel")}
                        </button>
                        <button type="button" onClick={onDeposit} className="cosmic-cta flex-1">
                            {t("escrow.deposit.choose_file")}
                        </button>
                    </>
                }
            >
                <div className="custody-field">
                    <label htmlFor="escrow-label">{t("escrow.deposit.label")}</label>
                    <input
                        id="escrow-label"
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder={t("escrow.deposit.label_placeholder")}
                        className="cosmic-input w-full text-sm"
                        maxLength={200}
                        autoFocus
                    />
                </div>
                <div className="custody-field">
                    <label htmlFor="escrow-release">{t("escrow.deposit.release_after")}</label>
                    <input
                        id="escrow-release"
                        type="datetime-local"
                        value={releaseAfter}
                        onChange={(e) => {
                            setReleaseAfter(e.target.value);
                            setDepositError(null);
                        }}
                        className="cosmic-input w-full text-sm"
                    />
                    <p className="hint">{t("escrow.deposit.release_after_hint")}</p>
                </div>
                <label className="custody-check">
                    <input type="checkbox" checked={ownerOnly} onChange={(e) => setOwnerOnly(e.target.checked)} />
                    <span>{t("escrow.deposit.owner_only")}</span>
                </label>
                {depositError && <p className="mt-3 text-sm text-rose-200">{depositError}</p>}
            </CustodyDialog>

            <CustodyDialog
                open={deleteTarget !== null}
                onOpenChange={(o) => {
                    if (!o) setDeleteTarget(null);
                }}
                emblem={<Icon.trash className="text-rose-300" />}
                danger
                title={t("escrow.delete.title")}
                description={t("escrow.delete.description", { label: deleteTarget?.label ?? "" })}
                footer={
                    <>
                        <button type="button" onClick={() => setDeleteTarget(null)} className="cosmic-btn-ghost flex-1">
                            {t("common.cancel")}
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            className="flex-1 rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/30"
                        >
                            {t("escrow.delete.confirm")}
                        </button>
                    </>
                }
            />

            <CustodyHero emblem={<EscrowEmblem />} kicker={t("escrow.kicker")} title={t("escrow.title")} lead={t("escrow.description")}>
                <div className="custody-stats">
                    <StatTile value={readyCount} label={t("escrow.state.ready")} tone="emerald" />
                    <StatTile value={lockedCount} label={t("escrow.tiles.locked")} tone="amber" />
                    <StatTile value={badCount} label={t("escrow.tiles.damaged")} tone="rose" />
                    <StatTile value={entries.length} label={t("escrow.inventory.title")} tone="violet" />
                </div>
            </CustodyHero>

            <section className="cosmic-glass-card rounded-3xl p-5 space-y-4">
                {busy && step ? (
                    <RuntimeBar text={stepLabel(step)} seconds={seconds} hint={t("escrow.status.runtime_hint")} />
                ) : (
                    <p className="text-xs text-slate-500">
                        {loaded ? t("escrow.status.summary", { count: entries.length, size: formatBytes(totalBytes) }) : t("common.loading")}
                    </p>
                )}

                <div className="custody-actions">
                    <ActionButton variant="primary" icon={<Icon.seal />} label={t("escrow.actions.deposit")} onClick={openDeposit} disabled={busy !== null} busy={step === "deposit"} />
                    <ActionButton icon={<Icon.verify />} label={t("escrow.actions.verify")} onClick={() => actions.verify(vaultId)} disabled={busy !== null} busy={step === "verify"} />
                    <ActionButton icon={<Icon.refresh />} label={t("escrow.actions.refresh")} onClick={() => actions.refresh(vaultId)} disabled={busy !== null} busy={step === "list"} />
                </div>

                {view?.notice && (
                    <NoticeBanner tone={view.notice.tone} text={noticeText(view.notice)} onClose={() => actions.dismissNotice(vaultId)} closeLabel={t("common.close")} />
                )}
                {view?.listError && <NoticeBanner tone="error" text={t("escrow.errors.list", { detail: view.listError })} closeLabel={t("common.close")} />}

                <FinePrint text={t("escrow.plain")} />
            </section>

            <section>
                <SectionHeading title={t("escrow.inventory.title")} aside={loaded && entries.length ? t("escrow.inventory.newest_first") : undefined} />
                {!loaded ? (
                    <RuntimeBar text={t("common.loading")} seconds={seconds} />
                ) : entries.length === 0 && unreadable.length === 0 ? (
                    <EmptyPanel emblem={<EscrowEmblem />} text={t("escrow.inventory.empty")} />
                ) : (
                    <ul className="custody-grid">
                        {entries.map((entry) => {
                            const verdict = escrowVerdict(entry);
                            const checked = view?.verified?.[entry.escrow_id];
                            const title = entry.label || entry.escrow_id;
                            const ownerOnlyCondition = entry.conditions.some(
                                (c) => c.type === "owner_signature" || (c.children ?? []).some((k) => k.type === "owner_signature"),
                            );
                            const progress = verdict === "locked" ? lockProgress(entry, now) : null;
                            const countdown = verdict === "locked" && entry.release_after ? relativeFuture(entry.release_after) : "";
                            return (
                                <li key={entry.escrow_id} className={`custody-card custody-card--${verdict}`}>
                                    <EscrowSeal verdict={verdict} />
                                    <div className="min-w-0">
                                        <div className="custody-card__title" title={title}>
                                            {title}
                                        </div>
                                        <div className="custody-chips">
                                            <Pill tone={VERDICT_TONE[verdict]}>{verdict === "locked" ? t("escrow.state.locked_short") : verdictLabel(entry)}</Pill>
                                            <Chip>{formatBytes(entry.payload_size)}</Chip>
                                            <Chip>{t("escrow.inventory.deposited", { when: formatWhen(entry.deposited_at) })}</Chip>
                                            <Chip title={entry.escrow_id}>{entry.escrow_id}</Chip>
                                        </div>
                                        {verdict === "locked" && (
                                            <>
                                                <p className="custody-card__flag custody-card__flag--warn">
                                                    {t("escrow.state.locked", { until: formatWhen(entry.release_after) })}
                                                    {countdown ? ` · ${t("escrow.inventory.unlocks", { when: countdown })}` : ""}
                                                </p>
                                                {progress !== null && (
                                                    <div className="custody-lockbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t("escrow.inventory.lock_progress")}>
                                                        <div className="custody-lockbar__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {ownerOnlyCondition && <p className="custody-card__flag custody-card__flag--muted">{t("escrow.inventory.owner_only")}</p>}
                                        {verdict !== "ready" && verdict !== "locked" && <p className="custody-card__flag custody-card__flag--error">{entry.reason}</p>}
                                        {checked && (
                                            <p className={`custody-card__flag ${checked.ok ? "custody-card__flag--ok" : "custody-card__flag--error"}`}>
                                                {checked.ok ? t("escrow.inventory.integrity_ok") : t("escrow.inventory.integrity_failed", { reason: checked.reason })}
                                            </p>
                                        )}
                                    </div>
                                    <div className="custody-card__foot">
                                        <IconButton
                                            danger
                                            icon={<Icon.trash />}
                                            label={t("escrow.actions.delete")}
                                            onClick={() => setDeleteTarget({ id: entry.escrow_id, label: title })}
                                            disabled={busy !== null}
                                            busy={busy === `delete:${entry.escrow_id}`}
                                        />
                                        <ActionButton
                                            size="sm"
                                            variant="primary"
                                            icon={verdict === "locked" ? <Icon.lock /> : <Icon.retrieve />}
                                            label={t("escrow.actions.retrieve")}
                                            onClick={() => actions.retrieve(vaultId, entry.escrow_id, entry.label || undefined)}
                                            disabled={busy !== null || verdict !== "ready"}
                                            busy={busy === `retrieve:${entry.escrow_id}`}
                                            title={verdict === "locked" ? t("escrow.state.locked", { until: formatWhen(entry.release_after) }) : undefined}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                        {unreadable.map((bad) => (
                            <li key={`bad:${bad.escrow_id}`} className="custody-card custody-card--invalid custody-card--muted">
                                <EscrowSeal verdict="invalid" />
                                <div className="min-w-0">
                                    <div className="custody-card__title font-mono text-sm" title={bad.escrow_id}>
                                        {bad.escrow_id}
                                    </div>
                                    <div className="custody-chips">
                                        <Pill tone="slate">{t("escrow.state.unreadable")}</Pill>
                                    </div>
                                    <p className="custody-card__flag custody-card__flag--error">{t("escrow.inventory.unreadable", { detail: bad.error })}</p>
                                </div>
                                <div className="custody-card__foot">
                                    <IconButton
                                        danger
                                        icon={<Icon.trash />}
                                        label={t("escrow.actions.delete")}
                                        onClick={() => setDeleteTarget({ id: bad.escrow_id, label: bad.escrow_id })}
                                        disabled={busy !== null}
                                        busy={busy === `delete:${bad.escrow_id}`}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
