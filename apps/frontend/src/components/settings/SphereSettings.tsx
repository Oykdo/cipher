import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { EIDOLON_CONNECT_ENABLED } from "../../config";
import { isSphereClientAvailable, isValidVaultId, type SphereState, type SphereStatus } from "../../lib/spheres";
import { MAILBOX_LOW, anchorHost } from "../../lib/spheresMemory";
import { useSphereStore, type SphereNotice, type SphereStep } from "../../store/spheres";
import {
    ActionButton,
    Chip,
    CustodyDialog,
    CustodyHero,
    EmptyPanel,
    Icon,
    IconButton,
    NoticeBanner,
    Pill,
    RuntimeBar,
    SectionHeading,
    SphereOrb,
    SpheresEmblem,
    StatTile,
    StatusSegments,
    type PillTone,
    type StatusSeg,
} from "./custodyUi";

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
 *
 * Layout: a hero band (emblem, stat tiles), the anchor status and actions,
 * then the inventory as a grid of rarity-tinted cards, rarest first.
 */

const STATE_TONE: Record<SphereState, PillTone> = {
    "finale": "emerald",
    "en attente": "amber",
    "brûlée": "slate",
    "invalide": "rose",
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

    if (!available || !vaultId) {
        return (
            <CustodyHero emblem={<SpheresEmblem />} kicker={t("spheres.kicker")} title={t("spheres.title")} lead={t(available ? "spheres.no_vault" : "spheres.desktop_only")} />
        );
    }

    const memory = view?.memory ?? null;
    const spheres = [...(memory?.inventory ?? [])].sort(byRarityThenId);
    const loaded = memory?.inventory !== null && memory !== null;
    const finalCount = spheres.filter((s) => s.state === "finale").length;
    const waitingCount = spheres.filter((s) => s.state === "en attente").length;
    // Genesis spheres the treasury still holds for this vault: not heads yet, so counted in neither tile above.
    const claimableCount = memory?.claim.claimable?.length ?? 0;
    const pendingCount = spheres.filter((s) => s.pending).length;
    const now = Date.now();
    const seconds = view?.startedAt ? Math.max(0, Math.round((now - view.startedAt) / 1000)) : 0;

    // What the memory says, one segment each; the runtime bar replaces them while it works.
    const status: StatusSeg[] = [];
    if (memory && !(busy && step)) {
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
        if (memory.trustedIssuer === false) status.push({ text: t("spheres.summary.untrusted_issuer"), tone: "warn" });
    }

    const workingText = busy && step ? (view?.firstContact ? t("spheres.status.first_contact", { step: stepLabel(step) }) : stepLabel(step)) : null;

    return (
        <div className="space-y-6">
            <CustodyDialog
                open={transferTarget !== null}
                onOpenChange={(o) => {
                    if (!o) setTransferTarget(null);
                }}
                emblem={<Icon.transfer className="text-cyan-300" />}
                title={t("spheres.transfer.title")}
                description={t("spheres.transfer.description", { id: transferTarget?.name || transferTarget?.sphere_id || "" })}
                footer={
                    <>
                        <button type="button" onClick={() => setTransferTarget(null)} className="cosmic-btn-ghost flex-1">
                            {t("common.cancel")}
                        </button>
                        <button type="button" onClick={onTransfer} className="cosmic-cta flex-1">
                            {t("spheres.transfer.confirm")}
                        </button>
                    </>
                }
            >
                <div className="custody-field">
                    <label htmlFor="sphere-recipient">{t("spheres.transfer.recipient_placeholder")}</label>
                    <input
                        id="sphere-recipient"
                        type="text"
                        value={recipient}
                        onChange={(e) => {
                            setRecipient(e.target.value);
                            setRecipientError(null);
                        }}
                        placeholder="0123abcd…"
                        className="cosmic-input w-full font-mono text-xs"
                        autoFocus
                        spellCheck={false}
                    />
                    <p className="hint">{t("spheres.transfer.hint")}</p>
                </div>
                {recipientError && <p className="text-sm text-rose-200">{recipientError}</p>}
            </CustodyDialog>

            <CustodyDialog
                open={custodyPrompt !== null}
                onOpenChange={(o) => {
                    if (!o) setCustodyPrompt(null);
                }}
                emblem={custodyPrompt?.kind === "burn" ? <Icon.burn className="text-rose-300" /> : <Icon.reissue className="text-cyan-300" />}
                danger={custodyPrompt?.kind === "burn"}
                title={t(custodyPrompt?.kind === "burn" ? "spheres.burn.title" : "spheres.reissue.title")}
                description={t(custodyPrompt?.kind === "burn" ? "spheres.burn.description" : "spheres.reissue.description", {
                    id: custodyPrompt?.sphere.name || custodyPrompt?.sphere.sphere_id || "",
                })}
                footer={
                    <>
                        <button type="button" onClick={() => setCustodyPrompt(null)} className="cosmic-btn-ghost flex-1">
                            {t("common.cancel")}
                        </button>
                        <button
                            type="button"
                            onClick={onCustodyConfirm}
                            className={
                                custodyPrompt?.kind === "burn"
                                    ? "flex-1 rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/30"
                                    : "cosmic-cta flex-1"
                            }
                        >
                            {t(custodyPrompt?.kind === "burn" ? "spheres.burn.confirm" : "spheres.reissue.confirm")}
                        </button>
                    </>
                }
            >
                {custodyPrompt?.kind === "reissue" && custodyPrompt.sphere.pending && (
                    <p className="text-sm text-amber-200">{t("spheres.reissue.revokes_pending")}</p>
                )}
            </CustodyDialog>

            <CustodyHero emblem={<SpheresEmblem />} kicker={t("spheres.kicker")} title={t("spheres.title")} lead={t("spheres.description")}>
                <div className="custody-stats">
                    <StatTile value={finalCount} label={t("spheres.state.final")} tone="emerald" />
                    <StatTile value={waitingCount} label={t("spheres.state.waiting")} tone="amber" />
                    <StatTile value={claimableCount} label={t("spheres.tiles.claimable")} tone="sky" live={claimableCount > 0} />
                    <StatTile value={spheres.length} label={t("spheres.inventory.title")} tone="violet" />
                </div>
            </CustodyHero>

            <section className="cosmic-glass-card rounded-3xl p-5 space-y-4">
                {workingText ? (
                    <RuntimeBar text={workingText} seconds={seconds} hint={t("spheres.status.runtime_hint")} />
                ) : (
                    <StatusSegments segments={status} />
                )}

                <div className="custody-actions">
                    <ActionButton
                        variant="primary"
                        icon={<Icon.sync />}
                        label={step === "sync" ? t("spheres.actions.syncing") : t("spheres.actions.sync")}
                        onClick={() => actions.sync(vaultId)}
                        disabled={busy !== null}
                        busy={step === "sync"}
                    />
                    <ActionButton
                        icon={<Icon.claim />}
                        label={step === "claim" ? t("spheres.actions.claiming") : t("spheres.actions.claim")}
                        onClick={() => actions.claim(vaultId)}
                        disabled={busy !== null}
                        busy={step === "claim"}
                    />
                    <ActionButton
                        icon={<Icon.mailbox />}
                        label={t("spheres.actions.mailbox")}
                        onClick={() => actions.mailbox(vaultId)}
                        disabled={busy !== null}
                        busy={step === "mailbox"}
                    />
                    <ActionButton
                        icon={<Icon.importFile />}
                        label={t("spheres.actions.import")}
                        onClick={() => actions.importFile(vaultId)}
                        disabled={busy !== null}
                        busy={step === "import"}
                    />
                </div>

                {view?.notice && (
                    <NoticeBanner tone={view.notice.tone} text={noticeText(view.notice)} onClose={() => actions.dismissNotice(vaultId)} closeLabel={t("common.close")} />
                )}
                {view?.listError && <NoticeBanner tone="error" text={t("spheres.errors.list", { detail: view.listError })} closeLabel={t("common.close")} />}
            </section>

            <section>
                <SectionHeading title={t("spheres.inventory.title")} aside={loaded ? t("spheres.inventory.rarest_first") : undefined} />
                {!loaded ? (
                    <RuntimeBar text={t("common.loading")} seconds={seconds} />
                ) : spheres.length === 0 ? (
                    <EmptyPanel emblem={<SpheresEmblem />} text={t("spheres.inventory.empty")} />
                ) : (
                    <ul className="custody-grid">
                        {spheres.map((sphere) => {
                            const canTransfer = sphere.ok && !sphere.burned && sphere.controllable && !sphere.pending;
                            // Reissuing is allowed over a pending transfer (it revokes it, the modal says so); burning is not.
                            const canReissue = sphere.ok && !sphere.burned && sphere.controllable;
                            const canBurn = canTransfer;
                            const known = RARITY_RANK[sphere.rarity] !== undefined ? sphere.rarity : "common";
                            return (
                                <li key={sphere.sphere_id} className={`custody-card custody-card--${known} ${sphere.burned ? "custody-card--muted" : ""}`}>
                                    <SphereOrb rarity={known} burned={sphere.burned} />
                                    <div className="min-w-0">
                                        <div className="custody-rarity">{rarityLabel(sphere.rarity)}</div>
                                        <div className="custody-card__title" title={sphere.name || sphere.sphere_id}>
                                            {sphere.name || sphere.sphere_id}
                                        </div>
                                        <div className="custody-chips">
                                            <Pill tone={STATE_TONE[sphere.state]}>
                                                {stateLabel(sphere.state)}
                                                {sphere.final_by === "checkpoint" ? ` · ${t("spheres.state.by_checkpoint")}` : ""}
                                            </Pill>
                                            {sphere.name && <Chip title={sphere.sphere_id}>{sphere.sphere_id}</Chip>}
                                            <Chip>{t("spheres.inventory.seq", { seq: sphere.seq })}</Chip>
                                            <Chip title={sphere.head_hash}>{shortId(sphere.head_hash)}</Chip>
                                        </div>
                                        {sphere.pending && <p className="custody-card__flag custody-card__flag--warn">{t("spheres.inventory.pending")}</p>}
                                        {!sphere.controllable && sphere.ok && (
                                            <p className="custody-card__flag custody-card__flag--warn">{t("spheres.inventory.uncontrolled")}</p>
                                        )}
                                        {sphere.errors.length > 0 && <p className="custody-card__flag custody-card__flag--error">{sphere.errors[0]}</p>}
                                    </div>
                                    <div className="custody-card__foot">
                                        <div className="custody-card__actions">
                                            <IconButton
                                                icon={<Icon.exportFile />}
                                                label={t("spheres.actions.export")}
                                                onClick={() => actions.exportFile(vaultId, sphere.sphere_id)}
                                                disabled={busy !== null}
                                                busy={busy === `export:${sphere.sphere_id}`}
                                            />
                                            <IconButton
                                                icon={<Icon.reissue />}
                                                label={`${t("spheres.actions.reissue")} — ${t("spheres.actions.reissue_hint")}`}
                                                onClick={() => setCustodyPrompt({ kind: "reissue", sphere })}
                                                disabled={busy !== null || !canReissue}
                                                busy={busy === `reissue:${sphere.sphere_id}`}
                                            />
                                            <IconButton
                                                danger
                                                icon={<Icon.burn />}
                                                label={`${t("spheres.actions.burn")} — ${t("spheres.actions.burn_hint")}`}
                                                onClick={() => setCustodyPrompt({ kind: "burn", sphere })}
                                                disabled={busy !== null || !canBurn}
                                                busy={busy === `burn:${sphere.sphere_id}`}
                                            />
                                        </div>
                                        <ActionButton
                                            size="sm"
                                            variant="primary"
                                            icon={<Icon.transfer />}
                                            label={busy === `transfer:${sphere.sphere_id}` ? t("spheres.actions.working") : t("spheres.actions.transfer")}
                                            onClick={() => openTransfer(sphere)}
                                            disabled={busy !== null || !canTransfer}
                                            busy={busy === `transfer:${sphere.sphere_id}`}
                                        />
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
