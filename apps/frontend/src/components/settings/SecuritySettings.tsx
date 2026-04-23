import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { useAuthStore } from "../../store/auth";
import { AppLockSection } from "./AppLockSection";
import { formatVaultHandle } from "../../lib/vaultHandle";
import { EIDOLON_CONNECT_ENABLED } from "../../config";

export function SecuritySettings() {
    const { t } = useTranslation();
    const clearSession = useAuthStore((state) => state.clearSession);
    const user = useAuthStore((state) => state.session?.user);
    const { settings, updateSettings, isUpdating } = useSettings();
    const [showAdvanced, setShowAdvanced] = useState(false);

    const linkedVault = user?.linkedVault;
    const discoverable = settings?.privacy?.discoverable ?? true;

    const identityBadge = linkedVault
        ? {
              label: t("settings.security_settings.tier_eidolon", { defaultValue: "Eidolon" }),
              className: "border-cyan-400/30 bg-cyan-400/12 text-cyan-200",
              description: t("settings.security_settings.identity_plain_eidolon"),
          }
        : user?.securityTier === "dice-key"
          ? {
                label: t("settings.security_settings.tier_dicekey"),
                className: "border-fuchsia-400/30 bg-fuchsia-400/12 text-fuchsia-200",
                description: t("settings.security_settings.identity_plain_dicekey"),
            }
          : {
                label: t("settings.security_settings.tier_standard"),
                className: "border-blue-400/30 bg-blue-400/12 text-blue-200",
                description: t("settings.security_settings.identity_plain_standard"),
            };

    const handleToggleDiscoverable = (checked: boolean) => {
        updateSettings({
            privacy: {
                ...settings?.privacy,
                discoverable: checked,
            },
        });
    };

    const handleLogout = () => {
        if (confirm(t("settings.security_settings.logout_confirm_default"))) {
            clearSession();
            window.location.href = "/";
        }
    };

    const handle = formatVaultHandle(linkedVault?.vaultName, linkedVault?.vaultNumber);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="mb-1 text-2xl font-bold text-white">
                    {t("settings.security_settings.title")}
                </h2>
                <p className="text-sm text-slate-400">
                    {t("settings.security_settings.description_plain")}
                </p>
            </div>

            {/* Identity — one card, one line, no jargon. */}
            <div className="cosmic-glass-card rounded-3xl border border-cyan-400/15 p-6 shadow-[0_12px_40px_rgba(8,47,73,0.16)]">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <p className="text-sm text-slate-300">
                            {identityBadge.description}
                        </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${identityBadge.className}`}>
                        {identityBadge.label}
                    </span>
                </div>
            </div>

            {EIDOLON_CONNECT_ENABLED && <AppLockSection />}

            {/* Privacy — one actionable toggle. */}
            <div className="cosmic-glass-card rounded-3xl border border-violet-400/12 p-6 shadow-[0_12px_40px_rgba(88,28,135,0.14)]">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white">{t("settings.security_settings.privacy_title")}</h3>
                    <p className="text-sm text-slate-400">{t("settings.security_settings.privacy_desc")}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                            <label htmlFor="discoverable-toggle" className="cursor-pointer text-white font-medium">
                                {t("settings.security_settings.discoverable_label")}
                            </label>
                            <p className="mt-2 text-xs text-slate-400">
                                {discoverable
                                    ? t("settings.security_settings.discoverable_on_desc")
                                    : t("settings.security_settings.discoverable_off_desc")}
                            </p>
                        </div>

                        {isUpdating ? (
                            <div className="h-6 w-12 rounded-full bg-slate-700 animate-pulse" />
                        ) : (
                            <label className="relative inline-flex cursor-pointer items-center">
                                <input
                                    id="discoverable-toggle"
                                    type="checkbox"
                                    checked={discoverable}
                                    onChange={(e) => handleToggleDiscoverable(e.target.checked)}
                                    disabled={isUpdating}
                                    className="peer sr-only"
                                />
                                <div className="h-6 w-12 rounded-full bg-slate-700 transition peer-checked:bg-brand-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-400 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-6" />
                            </label>
                        )}
                    </div>
                </div>
            </div>

            {/* Technical details — collapsed by default. For curious users. */}
            <div className="cosmic-glass-card rounded-3xl border border-white/10 overflow-hidden">
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex w-full items-center justify-between p-5 transition-colors hover:bg-white/[0.02]"
                >
                    <div className="text-left">
                        <h3 className="text-base font-semibold text-white">
                            {t("settings.security_settings.details_title")}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            {t("settings.security_settings.details_desc")}
                        </p>
                    </div>
                    <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition-transform duration-200 ${
                            showAdvanced ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-slate-400">
                            <path
                                fillRule="evenodd"
                                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.513a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </span>
                </button>

                {showAdvanced && (
                    <div className="border-t border-white/5 p-5 space-y-2 text-sm">
                        <KeyValue
                            label={t("settings.security_settings.kv_username")}
                            value={`@${user?.username || "—"}`}
                        />
                        <KeyValue
                            label={t("settings.security_settings.kv_user_id")}
                            value={user?.id || "—"}
                            mono
                        />
                        {linkedVault && (
                            <>
                                <KeyValue
                                    label={t("settings.security_settings.kv_vault")}
                                    value={handle}
                                />
                                <KeyValue
                                    label={t("settings.security_settings.kv_vault_id")}
                                    value={linkedVault.vaultId || "—"}
                                    mono
                                />
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Danger zone. */}
            <div className="rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-950/35 to-red-900/20 p-6 shadow-[0_16px_44px_rgba(127,29,29,0.18)]">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold text-red-400">{t("settings.security_settings.danger_zone")}</h3>
                    <p className="text-sm text-red-300/70">
                        {t("settings.security_settings.danger_zone_desc_plain")}
                    </p>
                </div>

                <button
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                    <span>{t("settings.security_settings.logout")}</span>
                </button>
            </div>
        </div>
    );
}

function KeyValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-950/40 px-4 py-3">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
            <span className={`text-right break-all ${mono ? "font-mono text-xs text-slate-300" : "text-slate-200"}`}>
                {value}
            </span>
        </div>
    );
}
