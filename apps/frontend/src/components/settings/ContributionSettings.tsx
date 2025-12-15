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
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export function ContributionSettings() {
    const { t } = useTranslation();
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const [integrityOk, setIntegrityOk] = useState(true);
    const [stripeAmount, setStripeAmount] = useState('5');
    const [stripeRedirecting, setStripeRedirecting] = useState(false);
    const [stripeError, setStripeError] = useState<string | null>(null);

    // Crypto addresses
    const cryptoAddresses: Record<string, CryptoAddress> = useMemo(() => ({
        btc: {
            name: "Bitcoin",
            symbol: "BTC",
            address: "bc1pqu5zya672tma8q36ww9c6mzk7uryq6cuavqn04jqka43qjm6nxtqs8am6t",
            icon: "/crypto-logos/Bitcoin.svg.webp",
            color: "from-orange-500 to-yellow-600",
        },
        eth: {
            name: "Ethereum (EVM)",
            symbol: "ETH",
            address: "0x979a6093d3a1662054b89667e6dbfac001fa2617",
            icon: "/crypto-logos/ethereum.jpg",
            color: "from-blue-500 to-purple-600",
            note: t('settings.contribution_settings.info_eth_network'),
        },
        sol: {
            name: "Solana",
            symbol: "SOL",
            address: "HshrizaXzs6i6yse3YjkpDsQ4S7WjRoDALeVr6tN1yM8",
            icon: "/crypto-logos/solana.jpg",
            color: "from-purple-500 to-pink-600",
        },
        xrp: {
            name: "XRP",
            symbol: "XRP",
            address: "rspbrWJkPr8jSyz9wVVLwpxuSfosBM8ocM",
            icon: "/crypto-logos/xrp-xrp-logo.png",
            color: "from-gray-600 to-slate-700",
        },
        pi: {
            name: "Pi Network",
            symbol: "PI",
            address: "GCUGVJDK4TY6KTVWFYXTDH2OXRSTTFQUYPLU2CH523AHCZOPWUVEVDC6",
            // Cache-bust to ensure updated logo is picked up quickly after deploy
            icon: "/crypto-logos/pi-network.svg?v=2",
            color: "from-violet-700 to-yellow-500",
        },
    }), [t]);

    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch('/api/public/contribution-targets', {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    cache: 'no-store',
                });
                if (!res.ok) return;

                const data = (await res.json()) as ContributionTargetsResponse;
                if (!data?.targets || typeof data.fingerprint !== 'string') return;

                const localTargets = Object.fromEntries(
                    Object.entries(cryptoAddresses).map(([key, c]) => [key, { symbol: c.symbol, address: c.address, tag: c.tag }])
                );
                const localFingerprint = await sha256Hex(JSON.stringify(localTargets));
                setIntegrityOk(localFingerprint === data.fingerprint);
            } catch {
                // If we cannot verify, we keep UI functional (best effort).
                setIntegrityOk(true);
            }
        };

        void run();
    }, [cryptoAddresses]);

    const copyToClipboard = (address: string, symbol: string) => {
        if (!integrityOk) return;
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
                setStripeError(t('settings.contribution_settings.card_invalid_amount'));
                setStripeRedirecting(false);
                return;
            }

            const amountCents = Math.round(amountNumber * 100);
            const res = await fetch('/api/public/stripe/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({ amountCents, currency: 'eur' }),
                credentials: 'include',
            });

            const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
            if (!res.ok || !data?.url) {
                setStripeError(data?.error || t('settings.contribution_settings.card_generic_error'));
                setStripeRedirecting(false);
                return;
            }

            window.location.assign(data.url);
        } catch {
            setStripeError(t('settings.contribution_settings.card_generic_error'));
            setStripeRedirecting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-2">💝 {t('settings.contribution_settings.support_title')}</h2>
                <p className="text-slate-400">
                    {t('settings.contribution_settings.support_desc')}
                </p>
            </div>

            {/* Stripe / Card payment */}
            <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-800">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-white">
                            {t('settings.contribution_settings.card_title')}
                        </h3>
                        <p className="text-sm text-slate-400">
                            {t('settings.contribution_settings.card_desc')}
                        </p>
                    </div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1">
                        <label className="text-xs text-slate-500 uppercase tracking-wide">
                            {t('settings.contribution_settings.card_amount_label')}
                        </label>
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                min={1}
                                step={1}
                                inputMode="numeric"
                                value={stripeAmount}
                                onChange={(e) => setStripeAmount(e.target.value)}
                                className="w-full p-3 bg-slate-950 rounded-lg border border-slate-700 text-white"
                                placeholder={t('settings.contribution_settings.card_amount_placeholder')}
                                disabled={stripeRedirecting}
                            />
                            <span className="text-slate-300">EUR</span>
                        </div>
                    </div>

                    <button
                        onClick={() => void startStripeCheckout()}
                        disabled={stripeRedirecting}
                        className={`px-5 py-3 rounded-lg text-white font-semibold transition-colors ${
                            stripeRedirecting
                                ? 'bg-slate-700 cursor-not-allowed opacity-80'
                                : 'bg-brand-500 hover:bg-brand-600'
                        }`}
                    >
                        {stripeRedirecting
                            ? t('settings.contribution_settings.card_redirecting')
                            : t('settings.contribution_settings.card_pay_button')}
                    </button>
                </div>

                {stripeError && (
                    <p className="mt-3 text-sm text-red-300">{stripeError}</p>
                )}
            </div>

            {/* Crypto Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(cryptoAddresses).map(([key, crypto]) => (
                    <div
                        key={key}
                        className="relative p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border border-slate-700 hover:border-brand-400 transition-all duration-300 hover:shadow-lg hover:shadow-brand-400/20"
                    >
                        {/* Gradient Background */}
                        <div
                            className={`absolute inset-0 bg-gradient-to-br ${crypto.color} opacity-5 rounded-xl`}
                        />

                        {/* Content */}
                        <div className="relative space-y-4">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-14 h-14 shrink-0 aspect-square flex items-center justify-center rounded-full bg-white p-2`}
                                    >
                                        <img
                                            src={crypto.icon}
                                            alt={`${crypto.name} logo`}
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">{crypto.name}</h3>
                                        <p className="text-sm text-slate-400">{crypto.symbol}</p>
                                    </div>
                                </div>
                                {copiedAddress === crypto.symbol && (
                                    <span className="text-green-400 text-sm font-medium animate-pulse">
                                        ✓ {t('settings.contribution_settings.copied')}
                                    </span>
                                )}
                            </div>

                            {/* Note (si présente) */}
                            {crypto.note && (
                                <p className="text-xs text-slate-500 italic">{crypto.note}</p>
                            )}

                            {/* Address */}
                            <div className="space-y-2">
                                <label className="text-xs text-slate-500 uppercase tracking-wide">
                                    {t('settings.contribution_settings.address')}
                                </label>
                                <div className="flex gap-2">
                                    <div className="flex-1 p-3 bg-slate-950 rounded-lg border border-slate-700">
                                        <p className="text-sm text-white font-mono break-all">{crypto.address}</p>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(crypto.address, crypto.symbol)}
                                        disabled={!integrityOk}
                                        className={`px-4 text-white rounded-lg transition-colors ${
                                            integrityOk
                                                ? 'bg-brand-500 hover:bg-brand-600'
                                                : 'bg-slate-700 cursor-not-allowed opacity-60'
                                        }`}
                                        title={t('settings.contribution_settings.copy_address')}
                                    >
                                        📋
                                    </button>
                                </div>
                            </div>

                            {/* Destination Tag (pour XRP) */}
                            {crypto.tag && (
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 uppercase tracking-wide">
                                        {t('settings.contribution_settings.destination_tag')}
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 p-3 bg-slate-950 rounded-lg border border-slate-700">
                                            <p className="text-sm text-white font-mono">{crypto.tag}</p>
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard(crypto.tag!, "TAG")}
                                            disabled={!integrityOk}
                                            className={`px-4 text-white rounded-lg transition-colors ${
                                                integrityOk
                                                    ? 'bg-brand-500 hover:bg-brand-600'
                                                    : 'bg-slate-700 cursor-not-allowed opacity-60'
                                            }`}
                                            title={t('settings.contribution_settings.copy_tag')}
                                        >
                                            📋
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {!integrityOk && (
                <div className="mt-4 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                    <p className="text-sm text-red-200">
                        {t(
                            'settings.contribution_settings.integrity_warning',
                            "Integrity check failed: contribution addresses could not be verified. Copy is disabled."
                        )}
                    </p>
                </div>
            )}

            {/* Thank You Message */}
            <div className="mt-8 p-6 bg-gradient-to-r from-brand-500/10 to-purple-500/10 rounded-xl border border-brand-400/20">
                <div className="text-center space-y-2">
                    <p className="text-2xl">🙏</p>
                    <h3 className="text-xl font-bold text-white">{t('settings.contribution_settings.thank_you_title')}</h3>
                    <p className="text-slate-400 text-sm">
                        {t('settings.contribution_settings.thank_you_desc')}
                    </p>
                </div>
            </div>

            {/* Info Section */}
            <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                    <span>ℹ️</span>
                    <span>{t('settings.contribution_settings.important_info')}</span>
                </h4>
                <ul className="text-sm text-slate-400 space-y-2">
                    <li>• {t('settings.contribution_settings.info_check_address')}</li>
                    <li>• {t('settings.contribution_settings.info_irreversible')}</li>
                    <li>• {t('settings.contribution_settings.info_xrp_tag')}</li>
                    <li>• {t('settings.contribution_settings.info_eth_network')}</li>
                </ul>
            </div>
        </div>
    );
}
