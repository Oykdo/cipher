import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { EIDOLON_CONNECT_ENABLED } from "../../config";
import {
    claimSpheres,
    depositSphereMailbox,
    exportSphereFile,
    importSphereFile,
    isSphereClientAvailable,
    isValidVaultId,
    listSpheres,
    syncSpheres,
    transferSphere,
    type SphereState,
    type SphereStatus,
} from "../../lib/spheres";

/**
 * The vault's spheres: what the custody ledger says this vault holds, each
 * one "finale" (the anchor has ordered its head) or "en attente". Every
 * action goes through the Eidolon runtime (lib/spheres.ts): the renderer
 * never sees a key, a path, or the .psnx. `list` is offline and instant;
 * `sync`, `claim`, `mailbox`, `transfer`, `import` talk to the anchor.
 */

type Notice = { type: "success" | "error" | "info"; text: string };

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

function shortId(value: string | null | undefined, keep = 12): string {
    const s = String(value ?? "");
    return s.length > keep ? `${s.slice(0, keep)}…` : s;
}

export function SphereSettings() {
    const { t } = useTranslation();
    const linkedVault = useAuthStore((state) => state.session?.user?.linkedVault);
    const vaultId = linkedVault?.vaultId ?? null;
    const available = EIDOLON_CONNECT_ENABLED && isSphereClientAvailable();

    const [spheres, setSpheres] = useState<SphereStatus[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [trustedIssuer, setTrustedIssuer] = useState<boolean | null>(null);
    const [transferTarget, setTransferTarget] = useState<SphereStatus | null>(null);
    const [recipient, setRecipient] = useState("");
    const [recipientError, setRecipientError] = useState<string | null>(null);

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

    const refresh = useCallback(async () => {
        if (!vaultId || !available) return;
        const result = await listSpheres(vaultId);
        if (result.ok) {
            setSpheres(result.spheres);
            setTrustedIssuer(result.trustedIssuer);
        } else if (result.error !== "unavailable") {
            setNotice({ type: "error", text: t("spheres.errors.list", { detail: result.error }) });
        }
        setLoaded(true);
    }, [vaultId, available, t]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const run = async (label: string, action: () => Promise<Notice | null>) => {
        if (!vaultId || busy) return;
        setBusy(label);
        setNotice(null);
        try {
            const outcome = await action();
            if (outcome) setNotice(outcome);
        } finally {
            setBusy(null);
            await refresh();
        }
    };

    const onSync = () =>
        run("sync", async () => {
            const r = await syncSpheres(vaultId!);
            if (!r.ok) return { type: "error", text: t("spheres.errors.sync", { detail: r.error }) };
            setSpheres(r.spheres);
            const issues = [...r.mismatches, ...Object.values(r.errors)];
            if (issues.length) {
                return { type: "error", text: t("spheres.sync.issues", { count: issues.length, detail: issues[0] }) };
            }
            return {
                type: "success",
                text: t("spheres.sync.done", {
                    final: r.final,
                    waiting: r.waiting,
                    received: r.received.length,
                    away: r.transferredAway.length,
                }),
            };
        });

    const onClaim = () =>
        run("claim", async () => {
            const r = await claimSpheres(vaultId!);
            if (!r.ok) return { type: "error", text: t("spheres.errors.claim", { detail: r.error }) };
            const failed = Object.keys(r.errors).length;
            if (r.claimed.length === 0 && r.deferred.length === 0) {
                return { type: "info", text: t("spheres.claim.nothing", { already: r.already.length }) };
            }
            return {
                type: failed ? "error" : "success",
                text: t("spheres.claim.done", { claimed: r.claimed.length, deferred: r.deferred.length, failed }),
            };
        });

    const onMailbox = () =>
        run("mailbox", async () => {
            const r = await depositSphereMailbox(vaultId!, 8);
            if (!r.ok) return { type: "error", text: t("spheres.errors.mailbox", { detail: r.error }) };
            return { type: "success", text: t("spheres.mailbox.done", { deposited: r.deposited, pending: r.pending ?? "?" }) };
        });

    const onImport = () =>
        run("import", async () => {
            const r = await importSphereFile(vaultId!);
            if (!r.ok) {
                if (r.errorCode === "canceled") return null;
                return { type: "error", text: t("spheres.errors.import", { detail: r.error }) };
            }
            return {
                type: "success",
                text: t("spheres.import.done", { id: r.sphereId, state: stateLabel(r.state), submitted: r.submitted.length }),
            };
        });

    const onExport = (sphere: SphereStatus) =>
        run(`export:${sphere.sphere_id}`, async () => {
            const r = await exportSphereFile(vaultId!, sphere.sphere_id);
            if (!r.ok) {
                if (r.errorCode === "canceled") return null;
                return { type: "error", text: t("spheres.errors.export", { detail: r.error }) };
            }
            return { type: "success", text: t("spheres.export.done", { filename: r.filename }) };
        });

    const openTransfer = (sphere: SphereStatus) => {
        setTransferTarget(sphere);
        setRecipient("");
        setRecipientError(null);
    };

    const onTransfer = async () => {
        const target = transferTarget;
        if (!target) return;
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
        await run(`transfer:${target.sphere_id}`, async () => {
            const r = await transferSphere(vaultId!, target.sphere_id, to);
            if (!r.ok) return { type: "error", text: t("spheres.errors.transfer", { detail: r.error }) };
            return {
                type: "success",
                text: t("spheres.transfer.done", { id: r.sphereId, to: shortId(r.to), state: stateLabel(r.state) }),
            };
        });
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

    const finalCount = spheres.filter((s) => s.state === "finale").length;
    const waitingCount = spheres.filter((s) => s.state === "en attente").length;

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

            <section>
                <h2 className="mb-1 text-xl font-semibold text-white">{t("spheres.title")}</h2>
                <p className="mb-4 text-sm leading-6 text-slate-300">{t("spheres.description")}</p>
                <div className="cosmic-glass-card cosmic-glow-border rounded-3xl p-6">
                    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                            {t("spheres.summary.final", { count: finalCount })}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-200">
                            {t("spheres.summary.waiting", { count: waitingCount })}
                        </span>
                        {trustedIssuer === false && (
                            <span className="text-xs text-amber-300/80">{t("spheres.summary.untrusted_issuer")}</span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={onSync} disabled={busy !== null} className="cosmic-cta inline-flex items-center gap-2 disabled:opacity-50">
                            {busy === "sync" ? t("spheres.actions.syncing") : t("spheres.actions.sync")}
                        </button>
                        <button type="button" onClick={onClaim} disabled={busy !== null} className="cosmic-btn-ghost disabled:opacity-50">
                            {busy === "claim" ? t("spheres.actions.claiming") : t("spheres.actions.claim")}
                        </button>
                        <button type="button" onClick={onMailbox} disabled={busy !== null} className="cosmic-btn-ghost disabled:opacity-50">
                            {t("spheres.actions.mailbox")}
                        </button>
                        <button type="button" onClick={onImport} disabled={busy !== null} className="cosmic-btn-ghost disabled:opacity-50">
                            {t("spheres.actions.import")}
                        </button>
                    </div>
                    {notice && (
                        <p
                            className={`mt-4 text-sm ${
                                notice.type === "error" ? "text-rose-200" : notice.type === "success" ? "text-emerald-200" : "text-slate-300"
                            }`}
                        >
                            {notice.text}
                        </p>
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
                            const busyHere = busy === `export:${sphere.sphere_id}` || busy === `transfer:${sphere.sphere_id}`;
                            const canTransfer = sphere.ok && !sphere.burned && sphere.controllable && !sphere.pending;
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
                                                onClick={() => onExport(sphere)}
                                                disabled={busy !== null}
                                                className="cosmic-btn-ghost px-3 py-1 text-xs disabled:opacity-50"
                                            >
                                                {t("spheres.actions.export")}
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
