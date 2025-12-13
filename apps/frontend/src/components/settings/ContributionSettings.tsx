import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ContributionSettings() {
    const { t } = useTranslation();
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

    // Crypto addresses (remplacez par vos vraies adresses)
    type CryptoAddress = {
        name: string;
        symbol: string;
        address: string;
        icon: string;
        color: string;
        note?: string;
        tag?: string;
    };

    const cryptoAddresses: Record<string, CryptoAddress> = {
        btc: {
            name: "Bitcoin",
            symbol: "BTC",
            address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
            icon: "/crypto-logos/Bitcoin.svg.webp",
            color: "from-orange-500 to-yellow-600",
        },
        eth: {
            name: "Ethereum (EVM)",
            symbol: "ETH",
            address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
            icon: "/crypto-logos/ethereum.jpg",
            color: "from-blue-500 to-purple-600",
            note: t('settings.contribution_settings.info_eth_network'),
        },
        pi: {
            name: "Pi",
            symbol: "PI",
            address: "[YOUR_PI_ADDRESS]",
            icon: "/crypto-logos/pi-network.jpg",
            color: "from-purple-600 to-yellow-500",
        },
        sol: {
            name: "Solana",
            symbol: "SOL",
            address: "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
            icon: "/crypto-logos/solana.jpg",
            color: "from-purple-500 to-pink-600",
        },
        xrp: {
            name: "Ripple",
            symbol: "XRP",
            address: "rN7n7otQDd6FczFgLdlqtyMVrn3NnrcVcV",
            icon: "/crypto-logos/xrp-xrp-logo.png",
            color: "from-gray-600 to-slate-700",
            tag: "123456789", // Destination Tag si nécessaire
        },
    };

    const copyToClipboard = (address: string, symbol: string) => {
        navigator.clipboard.writeText(address);
        setCopiedAddress(symbol);
        setTimeout(() => setCopiedAddress(null), 2000);
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
                                        className={`w-14 h-14 flex items-center justify-center rounded-full bg-white p-2`}
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
                                        className="px-4 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
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
                                            className="px-4 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
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
