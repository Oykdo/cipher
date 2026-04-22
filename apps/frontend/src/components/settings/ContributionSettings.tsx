import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type CryptoAddress = {
    name: string;
    symbol: string;
    address: string;
    icon: string;
    color: string;
    note?: string;
    tag?: string;
};

type ContributionTargetsResponse = {
    targets: Record<string, { symbol: string; address: string; tag?: string }>;
    fingerprint: string;
};

async function sha256Hex(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export function ContributionSettings() {
    const { t } = useTranslation();
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const [integrityOk, setIntegrityOk] = useState(true);
    const [stripeAmount, setStripeAmount] = useState("5");
    const [stripeRedirecting, setStripeRedirecting] = useState(false);
    const [stripeError, setStripeError] = useState<string | null>(null);

    const cryptoAddresses: Record<string, CryptoAddress> = useMemo(
        () => ({
            btc: {
                name: "Bitcoin",
                symbol: "BTC",
                address: "bc1pqu5zya672tma8q36ww9c6mzk7uryq6cuavqn04jqka43qjm6nxtqs8am6t",
                icon: "/crypto-logos/Bitcoin.svg.webp",
                color: "from-orange-500/30 to-yellow-500/20",
            },
            eth: {
                name: "Ethereum (EVM)",
                symbol: "ETH",
                address: "0x979a6093d3a1662054b89667e6dbfac001fa2617",
                icon: "/crypto-logos/ethereum.jpg",
                color: "from-cyan-500/30 to-violet-500/20",
                note: t("settings.contribution_settings.info_eth_network"),
            },
            sol: {
                name: "Solana",
                symbol: "SOL",
                address: "HshrizaXzs6i6yse3YjkpDsQ4S7WjRoDALeVr6tN1yM8",
                icon: "/crypto-logos/solana.jpg",
                color: "from-fuchsia-500/30 to-cyan-500/20",
            },
            xrp: {
                name: "XRP",
                symbol: "XRP",
                address: "rspbrWJkPr8jSyz9wVVLwpxuSfosBM8ocM",
                icon: "/crypto-logos/xrp-xrp-logo.png",
                color: "from-slate-400/20 to-slate-200/10",
            },
            pi: {
                name: "Pi Network",
                symbol: "PI",
                address: "GCUGVJDK4TY6KTVWFYXTDH2OXRSTTFQUYPLU2CH523AHCZOPWUVEVDC6",
                icon: "/crypto-logos/pi-network.png",
                color: "from-violet-500/30 to-amber-400/20",
            },
        }),
        [t]
    );

    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch("/api/public/contribution-targets", {
                    method: "GET",
                    headers: { Accept: "application/json" },
                    cache: "no-store",
                });
                if (!res.ok) {
                    return;
                }

                const data = (await res.json()) as ContributionTargetsResponse;
                if (!data?.targets || typeof data.fingerprint !== "string") {
                    return;
                }

                const localTargets = Object.fromEntries(
                    Object.entries(cryptoAddresses).map(([key, c]) => [
                        key,
                        { symbol: c.symbol, address: c.address, tag: c.tag },
                    ])
                );
                const localFingerprint = await sha256Hex(JSON.stringify(localTargets));
                setIntegrityOk(localFingerprint === data.fingerprint);
            } catch {
                setIntegrityOk(true);
            }
        };

        void run();
    }, [cryptoAddresses]);

    const copyToClipboard = (address: string, symbol: string) => {
        if (!integrityOk) {
            return;
        }
        navigator.clipboard.writeText(address);
        setCopiedAddress(symbol);
        setTimeout(() => setCopiedAddress(null), 2000);
    };

    const startStripeCheckout = async () => {
        try {
            setStripeError(null);
            setStripeRedirecting(true);

            const amountNumber = Number(stripeAmount);
            if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
                setStripeError(t("settings.contribution_settings.card_invalid_amount"));
                setStripeRedirecting(false);
                return;
            }

            const amountCents = Math.round(amountNumber * 100);
            const res = await fetch("/api/public/stripe/create-checkout-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ amountCents, currency: "eur" }),
                credentials: "include",
            });

            const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
            if (!res.ok || !data?.url) {
                setStripeError(data?.error || t("settings.contribution_settings.card_generic_error"));
                setStripeRedirecting(false);
                return;
            }

            window.location.assign(data.url);
        } catch {
            setStripeError(t("settings.contribution_settings.card_generic_error"));
            setStripeRedirecting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header — one title, one supporting line. No decorative pill. */}
            <div>
                <h2 className="text-2xl font-bold text-white">
                    {t("settings.contribution_settings.support_title")}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                    {t("settings.contribution_settings.support_desc")}
                </p>
            </div>

            {/* Stripe — card payment */}
            <div className="cosmic-glass-card relative rounded-3xl p-6">
                <div className="cosmic-glow-border rounded-3xl" aria-hidden="true" />
                <div className="relative">
                    <h3 className="text-lg font-semibold text-white">
                        {t("settings.contribution_settings.card_title")}
                    </h3>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <label className="text-xs uppercase tracking-[0.24em] text-slate-400">
                                {t("settings.contribution_settings.card_amount_label")}
                            </label>
                            <div className="mt-2 flex items-center gap-2">
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    inputMode="numeric"
                                    value={stripeAmount}
                                    onChange={(e) => setStripeAmount(e.target.value)}
                                    className="cosmic-input w-full"
                                    placeholder={t("settings.contribution_settings.card_amount_placeholder")}
                                    disabled={stripeRedirecting}
                                />
                                <span className="text-slate-200">EUR</span>
                            </div>
                        </div>

                        <button
                            onClick={() => void startStripeCheckout()}
                            disabled={stripeRedirecting}
                            className={stripeRedirecting ? "cosmic-cta opacity-70" : "cosmic-cta"}
                        >
                            {stripeRedirecting
                                ? t("settings.contribution_settings.card_redirecting")
                                : t("settings.contribution_settings.card_pay_button")}
                        </button>
                    </div>

                    {stripeError && <p className="mt-3 text-sm text-red-200">{stripeError}</p>}
                </div>
            </div>

            {/* Crypto — grid of 5 accepted chains. Name only (symbol lives in the logo). */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Object.entries(cryptoAddresses).map(([key, crypto]) => (
                    <div
                        key={key}
                        className="cosmic-glass-card relative overflow-hidden rounded-3xl p-6"
                    >
                        <div className="cosmic-glow-border rounded-3xl" aria-hidden="true" />
                        <div className={`absolute inset-0 bg-gradient-to-br ${crypto.color}`} />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_50%)]" />

                        <div className="relative space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white p-1.5 shadow-[0_0_20px_rgba(255,255,255,0.06)]">
                                    <img
                                        src={crypto.icon}
                                        alt={`${crypto.name} logo`}
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <h3 className="flex-1 text-lg font-semibold text-white">{crypto.name}</h3>
                            </div>

                            {crypto.note && <p className="text-xs text-slate-400">{crypto.note}</p>}

                            <div className="space-y-2">
                                <label className="text-xs uppercase tracking-[0.24em] text-slate-400">
                                    {t("settings.contribution_settings.address")}
                                </label>
                                <div className="flex gap-2">
                                    <div className="flex-1 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                                        <p className="break-all font-mono text-xs text-white">{crypto.address}</p>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(crypto.address, crypto.symbol)}
                                        disabled={!integrityOk}
                                        className={
                                            integrityOk
                                                ? "cosmic-btn-ghost min-w-[76px] text-xs"
                                                : "rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 opacity-60"
                                        }
                                        title={t("settings.contribution_settings.copy_address")}
                                    >
                                        {copiedAddress === crypto.symbol
                                            ? t("settings.contribution_settings.copied")
                                            : t("settings.contribution_settings.copy_button")}
                                    </button>
                                </div>
                            </div>

                            {crypto.tag && (
                                <div className="space-y-2">
                                    <label className="text-xs uppercase tracking-[0.24em] text-slate-400">
                                        {t("settings.contribution_settings.destination_tag")}
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                                            <p className="font-mono text-xs text-white">{crypto.tag}</p>
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard(crypto.tag!, "TAG")}
                                            disabled={!integrityOk}
                                            className={
                                                integrityOk
                                                    ? "cosmic-btn-ghost min-w-[76px] text-xs"
                                                    : "rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 opacity-60"
                                            }
                                            title={t("settings.contribution_settings.copy_tag")}
                                        >
                                            {copiedAddress === "TAG"
                                                ? t("settings.contribution_settings.copied")
                                                : t("settings.contribution_settings.copy_button")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {!integrityOk && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
                    <p className="text-sm text-red-200">
                        {t(
                            "settings.contribution_settings.integrity_warning",
                            "Integrity check failed: contribution addresses could not be verified. Copy is disabled."
                        )}
                    </p>
                </div>
            )}

            {/* Info — trimmed to the two rules that matter universally. */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <ul className="space-y-2 text-xs text-slate-400">
                    <li>• {t("settings.contribution_settings.info_check_address")}</li>
                    <li>• {t("settings.contribution_settings.info_irreversible")}</li>
                </ul>
            </div>
        </div>
    );
}
