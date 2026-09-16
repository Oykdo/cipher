/**
 * Presentational pieces shared by the two custody tabs, Settings › Spheres
 * and Settings › Escrow: hero band, stat tiles, the runtime bar shown while
 * `cipher-runtime` starts, status segments, notices, empty states, icon
 * buttons, the sphere orb and the escrow seal, and a dialog shell on Radix.
 * No state, no IPC — every piece renders what it is given.
 * Styles: the "Custody tabs" block of styles/fluidCrypto.css.
 */

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/Dialog";

// ---------------------------------------------------------------------------
// Icons — hand-drawn 24×24 strokes, currentColor, no library.
// ---------------------------------------------------------------------------

type IconProps = { className?: string };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon = {
    sync: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9" />
            <path d="M18 3v4.5h-4.5M6 21v-4.5h4.5" />
        </svg>
    ),
    claim: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M12 3l2.4 5.2 5.6.7-4.1 3.9 1.1 5.6L12 15.6l-5 2.8 1.1-5.6L4 8.9l5.6-.7z" />
        </svg>
    ),
    mailbox: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M4 8.5A3.5 3.5 0 0 1 7.5 5h9A3.5 3.5 0 0 1 20 8.5V19H4z" />
            <path d="M4 12h16M14 5v4M9 15h3" />
        </svg>
    ),
    importFile: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
            <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
        </svg>
    ),
    exportFile: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
            <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
        </svg>
    ),
    transfer: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M4 12h15M14 7l5 5-5 5" />
        </svg>
    ),
    reissue: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <circle cx="8" cy="15" r="3.5" />
            <path d="M10.5 12.5 19 4M15 8l2 2M17 6l2 2" />
        </svg>
    ),
    burn: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.5.6-2.6 1.4-3.5.3 1.2 1 2 2.1 2.3C11.8 8.5 11 6 12 3z" />
            <path d="M7 14.5c-.6 1-1 2.1-1 3.2A6 6 0 0 0 18 17.7c0-1.1-.4-2.2-1-3.2" />
        </svg>
    ),
    seal: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
            <path d="m4.5 7 7.5 6 7.5-6" />
        </svg>
    ),
    retrieve: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M5 8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11" />
            <path d="M12 21v-9M8 16l4 4 4-4" />
        </svg>
    ),
    verify: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 8.5 4.1-.9 7-4.3 7-8.5V6z" />
            <path d="m9 12 2 2 4-4.5" />
        </svg>
    ),
    refresh: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7" />
            <path d="M18 3v4h-4M6 21v-4h4" />
        </svg>
    ),
    trash: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M5 7h14M9 7V5h6v2M8 7l.8 12h6.4L16 7" />
        </svg>
    ),
    lock: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </svg>
    ),
    check: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
    ),
    alert: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="M12 4 3.5 19h17z" />
            <path d="M12 10v4M12 16.5v.5" />
        </svg>
    ),
    info: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5M12 8v.5" />
        </svg>
    ),
    close: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
        </svg>
    ),
    spinner: ({ className }: IconProps) => (
        <svg viewBox="0 0 24 24" className={`custody-spin ${className ?? ""}`} {...stroke} aria-hidden="true">
            <path d="M12 3a9 9 0 1 1-6.4 2.6" />
        </svg>
    ),
};

// ---------------------------------------------------------------------------
// Emblems
// ---------------------------------------------------------------------------

/** The Spheres hero emblem: three orbits and a glowing core. */
export function SpheresEmblem() {
    return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
            <defs>
                <radialGradient id="cu-core" cx="40%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                    <stop offset="35%" stopColor="#7dd3fc" />
                    <stop offset="100%" stopColor="#4c1d95" />
                </radialGradient>
            </defs>
            <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="rgba(0,240,255,0.55)" strokeWidth="1.2" transform="rotate(-20 32 32)" />
            <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="rgba(192,64,255,0.5)" strokeWidth="1.2" transform="rotate(35 32 32)" />
            <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="rgba(0,240,255,0.25)" strokeWidth="1" transform="rotate(90 32 32)" />
            <circle cx="32" cy="32" r="11" fill="url(#cu-core)" />
            <circle cx="12" cy="24" r="1.6" fill="#00f0ff" />
            <circle cx="52" cy="42" r="1.6" fill="#c040ff" />
            <circle cx="46" cy="14" r="1" fill="#ffffff" />
        </svg>
    );
}

/** The Escrow hero emblem: an envelope closed by a wax seal. */
export function EscrowEmblem() {
    return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
            <defs>
                <linearGradient id="cu-env" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="rgba(0,240,255,0.35)" />
                    <stop offset="100%" stopColor="rgba(123,47,255,0.45)" />
                </linearGradient>
                <radialGradient id="cu-wax" cx="40%" cy="35%" r="70%">
                    <stop offset="0%" stopColor="#fbcfe8" />
                    <stop offset="55%" stopColor="#c040ff" />
                    <stop offset="100%" stopColor="#4c1d95" />
                </radialGradient>
            </defs>
            <rect x="8" y="16" width="48" height="34" rx="6" fill="url(#cu-env)" stroke="rgba(0,240,255,0.6)" strokeWidth="1.3" />
            <path d="M9 19l23 17 23-17" fill="none" stroke="rgba(232,237,245,0.85)" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="32" cy="38" r="8.5" fill="url(#cu-wax)" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
            <path d="M28.5 38.2l2.4 2.4 4.8-5" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

const RAREST = new Set(["primordial", "genesis", "mythic"]);

/** A sphere's orb, tinted by rarity; burnt spheres are dimmed and still. */
export function SphereOrb({ rarity, burned }: { rarity: string; burned?: boolean }) {
    const tint = `custody-orb--${rarity}`;
    return (
        <div className={`custody-orb ${tint} ${!burned && RAREST.has(rarity) ? "custody-orb--rarest" : ""} ${burned ? "custody-orb--burned" : ""}`} aria-hidden="true" />
    );
}

/** An escrow's seal, stamped with its verdict. */
export function EscrowSeal({ verdict }: { verdict: "ready" | "locked" | "tampered" | "invalid" }) {
    const color = verdict === "ready" ? "#34d399" : verdict === "locked" ? "#fbbf24" : verdict === "tampered" ? "#fb7185" : "#94a3b8";
    return (
        <div className="custody-seal" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color }}>
                <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" opacity="0.7" />
                <path d="m4.5 7 7.5 6 7.5-6" opacity="0.7" />
                <circle cx="17" cy="16" r="4.2" fill="rgba(6,11,24,0.9)" />
                {verdict === "ready" && <path d="m15 16 1.4 1.4L19 15" />}
                {verdict === "locked" && (
                    <>
                        <rect x="15.2" y="15.6" width="3.6" height="2.9" rx="0.7" />
                        <path d="M16 15.6v-.9a1 1 0 0 1 2 0v.9" />
                    </>
                )}
                {verdict === "tampered" && <path d="m15.5 14.5 3 3M18.5 14.5l-3 3" />}
                {verdict === "invalid" && <path d="M15.5 16h3" />}
            </svg>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

export function CustodyHero({ emblem, kicker, title, lead, children }: { emblem: ReactNode; kicker: string; title: string; lead: string; children?: ReactNode }) {
    return (
        <header className="custody-hero">
            <div className="custody-hero__emblem">{emblem}</div>
            <div className="min-w-0">
                <div className="custody-kicker">{kicker}</div>
                <h2 className="custody-title">{title}</h2>
                <p className="custody-lead">{lead}</p>
            </div>
            {children && <div className="col-span-full">{children}</div>}
        </header>
    );
}

export type StatTone = "emerald" | "amber" | "sky" | "rose" | "violet";

export function StatTile({ value, label, tone, live }: { value: number; label: string; tone: StatTone; live?: boolean }) {
    return (
        <div className={`custody-stat custody-stat--${tone} ${live ? "custody-stat--live" : ""}`}>
            <div className="custody-stat__value">{value}</div>
            <div className="custody-stat__label">{label}</div>
        </div>
    );
}

/** The frozen runtime is starting or working: an indeterminate sweep with the step and the seconds. */
export function RuntimeBar({ text, seconds, hint }: { text: string; seconds: number; hint?: string }) {
    return (
        <div className="space-y-2">
            <div className="custody-runtime" role="status" aria-live="polite">
                <Icon.spinner className="h-4 w-4 flex-none text-cyan-300" />
                <span className="custody-runtime__text">{text}</span>
                <div className="custody-runtime__bar" />
                <span className="custody-runtime__text custody-runtime__elapsed">{seconds} s</span>
            </div>
            {hint && <p className="text-[11px] leading-4 text-slate-500">{hint}</p>}
        </div>
    );
}

export type StatusSeg = { text: string; tone: "muted" | "warn" | "error" };

export function StatusSegments({ segments }: { segments: StatusSeg[] }) {
    if (!segments.length) return null;
    return (
        <div className="custody-status">
            {segments.map((seg, i) => (
                <span key={i} className={`custody-status__seg ${seg.tone !== "muted" ? `custody-status__seg--${seg.tone}` : ""}`}>
                    {seg.text}
                </span>
            ))}
        </div>
    );
}

export function NoticeBanner({ tone, text, onClose, closeLabel }: { tone: "success" | "error" | "info"; text: string; onClose?: () => void; closeLabel: string }) {
    const icon = tone === "success" ? <Icon.check /> : tone === "error" ? <Icon.alert /> : <Icon.info />;
    return (
        <div className={`custody-notice custody-notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
            {icon}
            <span className="min-w-0 flex-1">{text}</span>
            {onClose && (
                <button type="button" className="custody-notice__close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
                    <Icon.close className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}

export function EmptyPanel({ emblem, text }: { emblem: ReactNode; text: string }) {
    return (
        <div className="custody-empty">
            {emblem}
            <p>{text}</p>
        </div>
    );
}

export function SectionHeading({ title, aside }: { title: string; aside?: string }) {
    return (
        <div className="custody-section">
            <h3>{title}</h3>
            {aside && <span>{aside}</span>}
        </div>
    );
}

export type PillTone = "emerald" | "amber" | "rose" | "slate" | "sky";

export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
    return <span className={`custody-pill custody-pill--${tone}`}>{children}</span>;
}

export function ActionButton({
    icon,
    label,
    onClick,
    disabled,
    variant = "ghost",
    size = "md",
    busy,
    title,
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "ghost" | "primary" | "danger";
    size?: "md" | "sm";
    busy?: boolean;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`custody-btn ${variant !== "ghost" ? `custody-btn--${variant}` : ""} ${size === "sm" ? "custody-btn--sm" : ""}`}
        >
            {busy ? <Icon.spinner /> : icon}
            <span>{label}</span>
        </button>
    );
}

export function Chip({ children, title }: { children: ReactNode; title?: string }) {
    return (
        <span className="custody-chip" title={title}>
            {children}
        </span>
    );
}

/** Icon-only secondary action; `label` is the accessible name and the tooltip. */
export function IconButton({
    icon,
    label,
    onClick,
    disabled,
    danger,
    busy,
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    busy?: boolean;
}) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`custody-iconbtn ${danger ? "custody-iconbtn--danger" : ""}`}>
            {busy ? <Icon.spinner /> : icon}
        </button>
    );
}

export function FinePrint({ text }: { text: string }) {
    return (
        <p className="custody-plain">
            <Icon.info />
            <span>{text}</span>
        </p>
    );
}

// ---------------------------------------------------------------------------
// Dialog shell (Radix): emblem, title, description, body, footer.
// ---------------------------------------------------------------------------

export function CustodyDialog({
    open,
    onOpenChange,
    emblem,
    danger,
    title,
    description,
    children,
    footer,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    emblem: ReactNode;
    danger?: boolean;
    title: string;
    description: ReactNode;
    children?: ReactNode;
    footer: ReactNode;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md" className="border-cyan-400/20 shadow-[0_0_80px_-20px_rgba(0,240,255,0.25)]">
                <div className={`custody-dialog-emblem ${danger ? "custody-dialog-emblem--danger" : ""}`}>{emblem}</div>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                {children && <div className="mt-4">{children}</div>}
                <div className="mt-5 flex gap-3">{footer}</div>
            </DialogContent>
        </Dialog>
    );
}
