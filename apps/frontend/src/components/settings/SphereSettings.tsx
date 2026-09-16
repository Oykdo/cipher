import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { EIDOLON_CONNECT_ENABLED } from "../../config";
import { isSphereClientAvailable, isValidVaultId, type SphereState, type SphereStatus } from "../../lib/spheres";
import { MAILBOX_LOW, anchorHost } from "../../lib/spheresMemory";
import { useSphereStore, type SphereNotice, type SphereStep } from "../../store/spheres";

/**
 * The vault's spheres: what the custody ledger says this vault holds, each
 * one "finale" (the anchor has ordered its head) or "en attente". This is a
 * view of store/spheres.ts, which owns every call to the Eidolon runtime
 * (lib/spheres.ts): the renderer never sees a key, a path, or the .psnx.
 *
 * Opening the tab costs nothing when the memory is fresh: the remembered
 * inventory is shown and the status line says when the anchor was last
 * reached. The store spawns the runtime only for a reason (first contact,
 * daily refresh, a signed transfer waiting) or on a button. Each spawn is
 * ~30 s of runtime start-up, so the running step is named and timed.
 */

const STATE_STYLE: Record<SphereState, string> = {
    "finale": "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    "en attente": "border-amber-400/30 bg-amber-500/10 text-amber-200",
    "brûlée": "border-slate-500/30 bg-slate-500/10 text-slate-300",
    "invalide": "border-rose-400/30 bg-rose-500/10 text-rose-200",
};

const RARITY_STYLE: Record<string, string> = {
    primordial: "text-fuchsia-200",
    genesis: "text-violet-200",
    mythic: "text-indigo-200",
    legendary: "text-amber-200",
    epic: "text-purple-200",
    rare: "text-sky-200",
    uncommon: "text-emerald-200",
    common: "text-slate-300",
};

const NOTICE_STYLE: Record<SphereNotice["tone"], string> = {
    error: "text-rose-200",
    success: "text-emerald-200",
    info: "text-slate-300",
};

/** Rarest first — the order of the genesis caps (Eidolon RARITY_ORDER); unknown rarities last. */
const RARITY_RANK: Record<string, number> = {
    primordial: 0,
    genesis: 1,
    mythic: 2,
    legendary: 3,
    epic: 4,
    rare: 5,
    uncommon: 6,
    common: 7,
};

function byRarityThenId(a: SphereStatus, b: SphereStatus): number {
    const ra = RARITY_RANK[a.rarity] ?? 99;
    const rb = RARITY_RANK[b.rarity] ?? 99;
    return ra - rb || a.sphere_id.localeCompare(b.sphere_id);
}

/** A custody step that signs with the vault key: asked for, never implied. */
type CustodyPrompt = { kind: "burn" | "reissue"; sphere: SphereStatus };

function shortId(value: string | null | undefined, keep = 12): string {
    const s = String(value ?? "");
    return s.length > keep ? `${s.slice(0, keep)}…` : s;
}

export function SphereSettings() {
    const { t } = useTranslation();
    const linkedVault = useAuthStore((state) => state.session?.user?.linkedVault);
    const vaultId = linkedVault?.vaultId ?? null;
    const available = EIDOLON_CONNECT_ENABLED && isSphereClientAvailable();

    const view = useSphereStore((s) => (vaultId ? s.vaults[vaultId] : undefined));
    const open = useSphereStore((s) => s.open);
    // Store actions are stable: read them once, outside the render subscription.
    const actions = useSphereStore.getState();

    const [transferTarget, setTransferTarget] = useState<SphereStatus | null>(null);
    const [recipient, setRecipient] = useState("");
    const [recipientError, setRecipientError] = useState<string | null>(null);
    const [custodyPrompt, setCustodyPrompt] = useState<CustodyPrompt | null>(null);
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

    const stateLabel = (state: SphereState): string => {
        switch (state) {
            case "finale":
                return t("spheres.state.final");
            case "en attente":
                return t("spheres.state.waiting");
            case "brûlée":
                return t("spheres.state.burned");
            default:
                return t("spheres.state.invalid");
        }
    };

    const rarityLabel = (rarity: string): string => {
        const key = `spheres.rarity.${rarity}`;
        const label = t(key);
        return label === key ? rarity : label;
    };

    const relativeTime = (at: number): string => {
        const diffMs = Math.max(0, Date.now() - at);
        const mins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMs / 3600000);
        const days = Math.floor(diffMs / 86400000);
        if (mins < 1) return t("common.just_now");
        if (mins < 60) return t("common.minutes_ago", { count: mins });
        if (hours < 24) return t("common.hours_ago", { count: hours });
        if (days < 7) return t("common.days_ago", { count: days });
        return new Date(at).toLocaleDateString();
    };

    const stepLabel = (s: SphereStep): string => {
        switch (s) {
            case "sync":
                return t("spheres.status.working_sync");
            case "claim":
                return t("spheres.status.working_claim");
            case "mailbox":
                return t("spheres.status.working_mailbox");
            case "list":
                return t("common.loading");
            case "burn":
                return t("spheres.status.working_burn");
            case "reissue":
                return t("spheres.status.working_reissue");
            default:
                return t("spheres.actions.working");
        }
    };

    const noticeText = (notice: SphereNotice): string => {
        const params = notice.state ? { ...notice.params, state: stateLabel(notice.state) } : notice.params;
        return t(notice.key, params);
    };

    const openTransfer = (sphere: SphereStatus) => {
        setTransferTarget(sphere);
        setRecipient("");
        setRecipientError(null);
    };

    const onTransfer = () => {
        const target = transferTarget;
        if (!target || !vaultId) return;
        const to = recipient.trim().toLowerCase();
        if (!isValidVaultId(to)) {
            setRecipientError(t("spheres.transfer.invalid_recipient"));
            return;
        }
        if (to === vaultId) {
            setRecipientError(t("spheres.transfer.self"));
            return;
        }
        setTransferTarget(null);
        void actions.transfer(vaultId, target.sphere_id, to);
    };

    const onCustodyConfirm = () => {
        const prompt = custodyPrompt;
        if (!prompt || !vaultId) return;
        setCustodyPrompt(null);
        if (prompt.kind === "burn") void actions.burn(vaultId, prompt.sphere.sphere_id, true);
        // A pending signed transfer is revoked by the reissue (`--force`): the modal said so.
        else void actions.reissueKey(vaultId, prompt.sphere.sphere_id, prompt.sphere.pending);
    };

    if (!available) {
        return (
            <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">{t("spheres.title")}</h2>
                <p className="text-sm leading-6 text-slate-300">{t("spheres.desktop_only")}</p>
            </div>
        );
    }

    if (!vaultId) {
        return (
            <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">{t("spheres.title")}</h2>
                <p className="text-sm leading-6 text-slate-300">{t("spheres.no_vault")}</p>
            </div>
        );
    }

    const memory = view?.memory ?? null;
    const spheres = [...(memory?.inventory ?? [])].sort(byRarityThenId);
    const loaded = memory?.inventory !== null && memory !== null;
    const finalCount = spheres.filter((s) => s.state === "finale").length;
    const waitingCount = spheres.filter((s) => s.state === "en attente").length;
    // Genesis spheres the treasury still holds for this vault: not heads yet, so counted in neither badge above.
    const claimableCount = memory?.claim.claimable?.length ?? 0;
    const pendingCount = spheres.filter((s) => s.pending).length;
    const now = Date.now();

    // What the memory says, one segment each; the working line replaces them.
    const status: { text: string; tone: "muted" | "warn" | "error" }[] = [];
    if (busy && step) {
        const seconds = view?.startedAt ? Math.max(0, Math.round((now - view.startedAt) / 1000)) : 0;
        const working = view?.firstContact ? t("spheres.status.first_contact", { step: stepLabel(step) }) : stepLabel(step);
        status.push({ text: `${working} · ${t("spheres.status.elapsed", { seconds })}`, tone: "muted" });
    } else if (memory) {
        status.push(
            memory.syncOkAt === null
                ? { text: t("spheres.status.never"), tone: "muted" }
                : { text: t("spheres.status.synced", { when: relativeTime(memory.syncOkAt), host: memory.anchorHost ?? anchorHost() }), tone: "muted" },
        );
        if (memory.failKind === "unreachable" && now < memory.backoffUntil) {
            status.push({ text: t("spheres.status.unreachable", { minutes: Math.max(1, Math.ceil((memory.backoffUntil - now) / 60000)) }), tone: "warn" });
        }
        if (memory.failKind === "refused") status.push({ text: t("spheres.status.refused"), tone: "error" });
        if (memory.claim.state === "done") status.push({ text: t("spheres.status.claim_done", { count: memory.claim.count }), tone: "muted" });
        if (memory.claim.state === "queued") status.push({ text: t("spheres.status.claim_queued", { count: memory.claim.queued.length }), tone: "warn" });
        if (memory.claim.state === "not_enrolled") status.push({ text: t("spheres.status.claim_not_enrolled"), tone: "warn" });
        if (memory.mailbox.pending !== null) {
            status.push({ text: t("spheres.status.mailbox", { count: memory.mailbox.pending }), tone: memory.mailbox.pending < MAILBOX_LOW ? "warn" : "muted" });
        }
        if (pendingCount) status.push({ text: t("spheres.status.pending", { count: pendingCount }), tone: "warn" });
    }

    const statusTone = (tone: "muted" | "warn" | "error") =>
        tone === "error" ? "text-rose-300/90" : tone === "warn" ? "text-amber-300/90" : "text-slate-400";

    return (
        <div className="space-y-8">
            {transferTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="cosmic-glass-card cosmic-glow-border w-full max-w-md rounded-3xl p-6">
                        <h3 className="mb-2 text-xl font-semibold text-white">{t("spheres.transfer.title")}</h3>
                        <p className="mb-4 text-sm text-slate-300">
                            {t("spheres.transfer.description", { id: transferTarget.name || transferTarget.sphere_id })}
                        </p>
                        <input
                            type="text"
                            value={recipient}
                            onChange={(e) => {
                                setRecipient(e.target.value);
                                setRecipientError(null);
                            }}
                            placeholder={t("spheres.transfer.recipient_placeholder")}
                            className="cosmic-input mb-2 w-full font-mono text-xs"
                            autoFocus
                            spellCheck={false}
                        />
                        <p className="mb-4 text-xs text-slate-400">{t("spheres.transfer.hint")}</p>
                        {recipientError && <p className="mb-4 text-sm text-red-200">{recipientError}</p>}
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setTransferTarget(null)} className="cosmic-btn-ghost flex-1">
                                {t("common.cancel")}
                            </button>
                            <button type="button" onClick={onTransfer} className="cosmic-cta flex-1">
                                {t("spheres.transfer.confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {custodyPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="cosmic-glass-card cosmic-glow-border w-full max-w-md rounded-3xl p-6">
                        <h3 className="mb-2 text-xl font-semibold text-white">
                            {t(custodyPrompt.kind === "burn" ? "spheres.burn.title" : "spheres.reissue.title")}
                        </h3>
                        <p className="mb-4 text-sm text-slate-300">
                            {t(custodyPrompt.kind === "burn" ? "spheres.burn.description" : "spheres.reissue.description", {
                                id: custodyPrompt.sphere.name || custodyPrompt.sphere.sphere_id,
                            })}
                        </p>
                        {custodyPrompt.kind === "reissue" && custodyPrompt.sphere.pending && (
                            <p className="mb-4 text-sm text-amber-200">{t("spheres.reissue.revokes_pending")}</p>
                        )}
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setCustodyPrompt(null)} className="cosmic-btn-ghost flex-1">
                                {t("common.cancel")}
                            </button>
                            <button
                                type="button"
                                onClick={onCustodyConfirm}
                                className={
                                    custodyPrompt.kind === "burn"
                                        ? "flex-1 rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/30"
                                        : "cosmic-cta flex-1"
                                }
                            >
                                {t(custodyPrompt.kind === "burn" ? "spheres.burn.confirm" : "spheres.reissue.confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section>
                <h2 className="mb-1 text-xl font-semibold text-white">{t("spheres.title")}</h2>
                <p className="mb-4 text-sm leading-6 text-slate-300">{t("spheres.description")}</p>
                <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                            {t("spheres.summary.final", { count: finalCount })}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-200">
                            {t("spheres.summary.waiting", { count: waitingCount })}
                        </span>
                        {claimableCount > 0 && (
                            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-sky-200">
                                {t("spheres.summary.claimable", { count: claimableCount })}
                            </span>
                        )}
                        {memory?.trustedIssuer === false && (
                            <span className="text-xs text-amber-300/80">{t("spheres.summary.untrusted_issuer")}</span>
                        )}
                    </div>
                    {status.length > 0 && (
                        <p className="mb-4 text-xs leading-5">
                            {status.map((seg, i) => (
                                <span key={i} className={statusTone(seg.tone)}>
                                    {i > 0 && <span className="text-slate-600"> · </span>}
                                    {seg.text}
                                </span>
                            ))}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={() => actions.sync(vaultId)} disabled={busy !== null} className="cosmic-cta inline-flex items-center gap-2 disabled:opacity-50">
                            {step === "sync" ? t("spheres.actions.syncing") : t("spheres.actions.sync")}
                        </button>
                        <button type="button" onClick={() => actions.claim(vaultId)} disabled={busy !== null} className="cosmic-btn-ghost disabled:opacity-50">
                            {step === "claim" ? t("spheres.actions.claiming") : t("spheres.actions.claim")}
                        </button>
                        <button type="button" onClick={() => actions.mailbox(vaultId)} disabled={busy !== null} className="cosmic-btn-ghost disabled:opacity-50">
                            {step === "mailbox" ? t("spheres.actions.working") : t("spheres.actions.mailbox")}
                        </button>
                        <button type="button" onClick={() => actions.importFile(vaultId)} disabled={busy !== null} className="cosmic-btn-ghost disabled:opacity-50">
                            {step === "import" ? t("spheres.actions.working") : t("spheres.actions.import")}
                        </button>
                    </div>
                    {busy && <p className="mt-3 text-xs text-slate-500">{t("spheres.status.runtime_hint")}</p>}
                    {view?.notice && <p className={`mt-4 text-sm ${NOTICE_STYLE[view.notice.tone]}`}>{noticeText(view.notice)}</p>}
                    {view?.listError && (
                        <p className="mt-4 text-sm text-rose-200">{t("spheres.errors.list", { detail: view.listError })}</p>
                    )}
                </div>
            </section>

            <section>
                <h2 className="mb-4 text-xl font-semibold text-white">{t("spheres.inventory.title")}</h2>
                {!loaded ? (
                    <p className="text-sm text-slate-400">{t("common.loading")}</p>
                ) : spheres.length === 0 ? (
                    <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                        <p className="text-sm leading-6 text-slate-300">{t("spheres.inventory.empty")}</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {spheres.map((sphere) => {
                            const busyHere =
                                busy === `export:${sphere.sphere_id}` ||
                                busy === `transfer:${sphere.sphere_id}` ||
                                busy === `burn:${sphere.sphere_id}` ||
                                busy === `reissue:${sphere.sphere_id}`;
                            const canTransfer = sphere.ok && !sphere.burned && sphere.controllable && !sphere.pending;
                            // Reissuing is allowed over a pending transfer (it revokes it, the modal says so); burning is not.
                            const canReissue = sphere.ok && !sphere.burned && sphere.controllable;
                            const canBurn = canTransfer;
                            return (
                                <li key={sphere.sphere_id} className="cosmic-glass-card cosmic-glow-border rounded-2xl p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="truncate font-semibold text-white">{sphere.name || sphere.sphere_id}</span>
                                                <span className={`text-xs uppercase tracking-[0.2em] ${RARITY_STYLE[sphere.rarity] ?? "text-slate-300"}`}>
                                                    {rarityLabel(sphere.rarity)}
                                                </span>
                                            </div>
                                            <p className="mt-1 font-mono text-[11px] text-slate-400">
                                                {sphere.sphere_id} · {t("spheres.inventory.seq", { seq: sphere.seq })} · {shortId(sphere.head_hash)}
                                            </p>
                                            {sphere.pending && <p className="mt-1 text-xs text-amber-300/80">{t("spheres.inventory.pending")}</p>}
                                            {!sphere.controllable && sphere.ok && (
                                                <p className="mt-1 text-xs text-amber-300/80">{t("spheres.inventory.uncontrolled")}</p>
                                            )}
                                            {sphere.errors.length > 0 && (
                                                <p className="mt-1 text-xs text-rose-300/80">{sphere.errors[0]}</p>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATE_STYLE[sphere.state]}`}>
                                                {stateLabel(sphere.state)}
                                                {sphere.final_by === "checkpoint" ? ` · ${t("spheres.state.by_checkpoint")}` : ""}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => actions.exportFile(vaultId, sphere.sphere_id)}
                                                disabled={busy !== null}
                                                className="cosmic-btn-ghost px-3 py-1 text-xs disabled:opacity-50"
                                            >
                                                {t("spheres.actions.export")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCustodyPrompt({ kind: "reissue", sphere })}
                                                disabled={busy !== null || !canReissue}
                                                className="cosmic-btn-ghost px-3 py-1 text-xs disabled:opacity-50"
                                                title={t("spheres.actions.reissue_hint")}
                                            >
                                                {t("spheres.actions.reissue")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCustodyPrompt({ kind: "burn", sphere })}
                                                disabled={busy !== null || !canBurn}
                                                className="rounded-full border border-rose-400/30 px-3 py-1 text-xs text-rose-200/90 hover:bg-rose-500/10 disabled:opacity-50"
                                                title={t("spheres.actions.burn_hint")}
                                            >
                                                {t("spheres.actions.burn")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openTransfer(sphere)}
                                                disabled={busy !== null || !canTransfer}
                                                className="cosmic-cta px-3 py-1 text-xs disabled:opacity-50"
                                            >
                                                {busyHere ? t("spheres.actions.working") : t("spheres.actions.transfer")}
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
