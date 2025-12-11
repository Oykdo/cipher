import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useSettings } from "../../hooks/useSettings";
import { useState } from "react";

export function SecuritySettings() {
    const { t } = useTranslation();
    const clearSession = useAuthStore((state) => state.clearSession);
    const user = useAuthStore((state) => state.session?.user);
    const { settings, updateSettings, isUpdating } = useSettings();
    const [showAdvanced, setShowAdvanced] = useState(false);

    const discoverable = settings?.privacy?.discoverable ?? true;

    const handleToggleDiscoverable = (checked: boolean) => {
        updateSettings({
            privacy: {
                ...settings?.privacy,
                discoverable: checked
            }
        });
    };

    const handleLogout = () => {
        if (confirm(t('settings.security_settings.delete_account_confirm') || t('settings.security_settings.logout_confirm_default'))) {
            clearSession();
            window.location.href = "/";
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">🔐 {t('settings.security_settings.title')}</h2>
                <p className="text-slate-400">{t('settings.security_settings.description')}</p>
            </div>

            {/* Account Security Info */}
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <span className="text-2xl">👤</span>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">{t('settings.security_settings.security_info_title')}</h3>
                        <p className="text-sm text-slate-400">{t('settings.security_settings.security_info_desc')}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    {/* Security Tier Badge */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                        <div>
                            <p className="text-sm font-medium text-slate-300">{t('settings.security_settings.security_tier_label')}</p>
                            <p className="text-xs text-slate-500 mt-1">{t('settings.security_settings.security_tier_desc')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {user?.securityTier === 'dice-key' ? (
                                <span className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-full text-sm font-semibold text-purple-300 flex items-center gap-1">
                                    <span>🎲</span>
                                    <span>{t('settings.security_settings.tier_dicekey')}</span>
                                </span>
                            ) : (
                                <span className="px-3 py-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full text-sm font-semibold text-blue-300 flex items-center gap-1">
                                    <span>🔑</span>
                                    <span>{t('settings.security_settings.tier_standard')}</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* E2EE Status */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                        <div>
                            <p className="text-sm font-medium text-slate-300">{t('settings.security_settings.e2e_encryption')}</p>
                            <p className="text-xs text-slate-500 mt-1">{t('settings.security_settings.e2e_desc')}</p>
                        </div>
                        <span className="px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-sm font-semibold text-green-300">
                            {t('settings.security_settings.active_status')}
                        </span>
                    </div>

                    {/* Zero-Knowledge */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                        <div>
                            <p className="text-sm font-medium text-slate-300">{t('settings.security_settings.zero_knowledge')}</p>
                            <p className="text-xs text-slate-500 mt-1">{t('settings.security_settings.zero_knowledge_desc')}</p>
                        </div>
                        <span className="px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-sm font-semibold text-green-300">
                            {t('settings.security_settings.active_status')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Privacy Settings Section */}
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <span className="text-2xl">🔒</span>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">{t('settings.security_settings.privacy_title')}</h3>
                        <p className="text-sm text-slate-400">{t('settings.security_settings.privacy_desc')}</p>
                    </div>
                </div>

                {/* Discoverable Toggle */}
                <div className="space-y-3">
                    <div className="p-4 bg-slate-800/50 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex-1">
                                <label htmlFor="discoverable-toggle" className="text-white font-medium cursor-pointer flex items-center gap-2">
                                    <span className="text-lg">{discoverable ? '👁️' : '🔒'}</span>
                                    <span>{t('settings.security_settings.discoverable_label')}</span>
                                </label>
                                <p className="text-xs text-slate-400 mt-2">
                                    {discoverable
                                        ? t('settings.security_settings.discoverable_on_desc')
                                        : t('settings.security_settings.discoverable_off_desc')
                                    }
                                </p>
                            </div>

                            <div className="ml-4">
                                {isUpdating ? (
                                    <div className="w-12 h-6 bg-slate-700 rounded-full animate-pulse" />
                                ) : (
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            id="discoverable-toggle"
                                            type="checkbox"
                                            checked={discoverable}
                                            onChange={(e) => handleToggleDiscoverable(e.target.checked)}
                                            disabled={isUpdating}
                                            className="sr-only peer"
                                        />
                                        <div className="w-12 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-400 rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                                    </label>
                                )}
                            </div>
                        </div>

                        <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <p className="text-xs text-blue-300 flex items-start gap-2">
                                <span className="text-sm">ℹ️</span>
                                <span>
                                    {t('settings.security_settings.discoverable_note')}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Advanced Security Options */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full p-6 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <span className="text-2xl">⚙️</span>
                        </div>
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-white">{t('settings.security_settings.advanced_options')}</h3>
                            <p className="text-sm text-slate-400">{t('settings.security_settings.advanced_options_desc')}</p>
                        </div>
                    </div>
                    <span className="text-slate-400">
                        {showAdvanced ? '▲' : '▼'}
                    </span>
                </button>

                {showAdvanced && (
                    <div className="p-6 pt-0 space-y-3">
                        <div className="p-4 bg-slate-800/50 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-300">{t('settings.security_settings.crypto_keys_label')}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {user?.securityTier === 'dice-key'
                                            ? t('settings.security_settings.crypto_keys_dicekey')
                                            : t('settings.security_settings.crypto_keys_standard')}
                                    </p>
                                </div>
                                <span className="text-xs text-slate-400 font-mono">
                                    {user?.securityTier === 'dice-key' ? t('settings.security_settings.bits_strength', { count: 775 }) : t('settings.security_settings.bits_strength', { count: 256 })}
                                </span>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-800/50 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-300">{t('settings.security_settings.pfs_label')}</p>
                                    <p className="text-xs text-slate-500 mt-1">{t('settings.security_settings.pfs_desc')}</p>
                                </div>
                                <span className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-xs font-semibold text-green-300">
                                    {t('settings.security_settings.active_status')}
                                </span>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-800/50 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-300">{t('settings.security_settings.pcs_label')}</p>
                                    <p className="text-xs text-slate-500 mt-1">{t('settings.security_settings.pcs_desc')}</p>
                                </div>
                                <span className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-xs font-semibold text-green-300">
                                    {t('settings.security_settings.active_status')}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Danger Zone */}
            <div className="bg-gradient-to-br from-red-950/30 to-red-900/20 rounded-xl p-6 border border-red-500/30">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-red-400">{t('settings.security_settings.danger_zone')}</h3>
                        <p className="text-sm text-red-300/70">{t('settings.security_settings.danger_zone_desc')}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={handleLogout}
                        className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
                    >
                        <span>🚪</span>
                        <span>{t('settings.security_settings.logout')}</span>
                    </button>

                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-xs text-red-300 flex items-start gap-2">
                            <span className="text-sm">⚠️</span>
                            <span>
                                {t('settings.security_settings.logout_warning')}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
