import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { authFetchV2WithRefresh } from "../../services/api-interceptor";
import { LanguageSelector } from "../LanguageSelector";
import { AtomLoader } from "../ui";
import { HolographicAvatar } from "../HolographicAvatar";
import { useVaultFingerprint } from "../../hooks/useVaultFingerprint";
import { formatVaultHandle } from "../../lib/vaultHandle";

export function GeneralSettings() {
    const { t, i18n } = useTranslation();
    const session = useAuthStore((state) => state.session);
    const [userDetails, setUserDetails] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState({ conversationsCount: 0, messagesSent: 0 });

    const hasAccessToken = !!session?.accessToken;
    const linkedVault = session?.user?.linkedVault;
    const fingerprint = useVaultFingerprint();

    useEffect(() => {
        if (!hasAccessToken) {
            return;
        }

        const loadUserDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await authFetchV2WithRefresh("/users/me");
                setUserDetails(data);

                try {
                    const conversationsData = await authFetchV2WithRefresh("/conversations");
                    const conversationsCount = conversationsData?.conversations?.length || 0;

                    let totalMessagesSent = 0;
                    if (conversationsData?.conversations) {
                        for (const conv of conversationsData.conversations) {
                            try {
                                const messagesData = await authFetchV2WithRefresh(`/conversations/${conv.id}/messages`);
                                if (messagesData?.messages) {
                                    const sentByUser = messagesData.messages.filter(
                                        (m: any) => m.senderId === session?.user?.id
                                    );
                                    totalMessagesSent += sentByUser.length;
                                }
                            } catch (msgErr) {
                                console.warn(`Failed to load messages for conversation ${conv.id}:`, msgErr);
                            }
                        }
                    }

                    setStats({
                        conversationsCount,
                        messagesSent: totalMessagesSent,
                    });
                } catch (statsErr) {
                    console.error("Failed to load stats:", statsErr);
                }
            } catch (err) {
                console.error("Failed to load user details:", err);
                setError(err instanceof Error ? err.message : t("errors.unknown_error"));
            } finally {
                setLoading(false);
            }
        };

        void loadUserDetails();
    }, [hasAccessToken, session?.user?.id, t]);

    const formatDate = (timestamp: string | number) => {
        return new Date(timestamp).toLocaleString(i18n.language, {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const securityBadge = session?.user?.securityTier === "dice-key"
        ? {
            className: "border-fuchsia-400/30 bg-fuchsia-400/12 text-fuchsia-200",
            label: t("settings.general_settings.security_level_dicekey"),
        }
        : linkedVault?.vaultId
            ? {
                className: "border-cyan-400/30 bg-cyan-400/12 text-cyan-200",
                label: t("settings.general_settings.security_level_eidolon_approx", { bits: "8,000" }),
            }
            : {
                className: "border-cyan-400/30 bg-cyan-400/12 text-cyan-200",
                label: t("settings.general_settings.security_level_standard", { bits: userDetails?.keyBits || 256 }),
            };

    const handle = formatVaultHandle(linkedVault?.vaultName, linkedVault?.vaultNumber);

    return (
        <div className="space-y-6">
            {!hasAccessToken && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 shadow-[0_0_24px_rgba(245,158,11,0.12)]">
                    {t("settings.general_settings.invalid_session")}
                </div>
            )}

            {loading && hasAccessToken && (
                <div className="cosmic-glass-card rounded-2xl px-4 py-6">
                    <div className="flex items-center justify-center">
                        <AtomLoader size="lg" />
                    </div>
                </div>
            )}

            {error && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 shadow-[0_0_24px_rgba(248,113,113,0.12)]">
                    {t("settings.general_settings.error_loading_info")} {error}
                </div>
            )}

            {/* Identity card — single source of truth for "who I am". */}
            {linkedVault && (
                <div className="cosmic-glass-card cosmic-glow-border overflow-hidden rounded-3xl border border-cyan-400/15 p-6 shadow-[0_18px_60px_rgba(8,47,73,0.22)]">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <HolographicAvatar
                            seed={linkedVault.vaultId}
                            size={120}
                            tier={fingerprint?.pioneerTier}
                            spinorSignature={fingerprint?.spinorSignature}
                            bellMax={fingerprint?.bellMax}
                            bellIsQuantum={fingerprint?.bellIsQuantum}
                            prismHueOffset={fingerprint?.prismHueOffset}
                            depthLevel={fingerprint?.depthLevel}
                            createdAt={fingerprint?.createdAt}
                            forceMaxDetail
                        />
                        <div className="flex flex-col items-center gap-2">
                            <div className="font-mono text-2xl font-semibold tracking-tight text-white">
                                {handle}
                            </div>
                            <span
                                className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${securityBadge.className}`}
                            >
                                {securityBadge.label}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Compact account details — no vault-id noise, just the human-readable bits. */}
            <div>
                <h2 className="mb-4 text-xl font-semibold text-white">
                    {t("settings.general_settings.account_info_title")}
                </h2>
                <div className="cosmic-glass-card rounded-3xl border border-white/10 p-5 shadow-[0_12px_40px_rgba(2,6,23,0.18)]">
                    <div className="flex items-center justify-between border-b border-white/10 py-3">
                        <span className="text-slate-400">{t("settings.general_settings.username")}</span>
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-white">@{linkedVault?.vaultName || session?.user?.username}</span>
                            <button
                                onClick={() => copyToClipboard(linkedVault?.vaultName || session?.user?.username || "")}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200"
                                title={t("settings.general_settings.copy")}
                            >
                                COPY
                            </button>
                        </div>
                    </div>
                    {userDetails?.createdAt && (
                        <div className="flex items-center justify-between py-3">
                            <span className="text-slate-400">
                                {t("settings.general_settings.account_created_at")}
                            </span>
                            <span className="font-medium text-white">{formatDate(userDetails.createdAt)}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="relative z-20">
                <h2 className="mb-4 text-xl font-semibold text-white">
                    {t("settings.general_settings.language")}
                </h2>
                <div className="cosmic-glass-card relative z-20 overflow-visible rounded-3xl border border-white/10 p-5 shadow-[0_12px_40px_rgba(2,6,23,0.18)]">
                    <p className="mb-4 text-sm text-slate-300">
                        {t("settings.general_settings.select_language")}
                    </p>
                    <LanguageSelector />
                </div>
            </div>

            {userDetails && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="cosmic-glass-card rounded-3xl border border-cyan-400/10 p-5 shadow-[0_12px_40px_rgba(8,47,73,0.16)]">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200/80">
                            {t("settings.general_settings.stats_conversations")}
                        </div>
                        <div className="text-2xl font-bold text-white">{stats.conversationsCount}</div>
                    </div>
                    <div className="cosmic-glass-card rounded-3xl border border-emerald-400/10 p-5 shadow-[0_12px_40px_rgba(6,78,59,0.16)]">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200/80">
                            {t("settings.general_settings.stats_messages_sent")}
                        </div>
                        <div className="text-2xl font-bold text-white">{stats.messagesSent}</div>
                    </div>
                    <div className="cosmic-glass-card rounded-3xl border border-blue-400/10 p-5 shadow-[0_12px_40px_rgba(30,64,175,0.14)]">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200/80">
                            {t("settings.general_settings.stats_active_days")}
                        </div>
                        <div className="text-2xl font-bold text-white">
                            {userDetails.createdAt
                                ? Math.floor(
                                      (Date.now() - new Date(userDetails.createdAt).getTime()) /
                                          (1000 * 60 * 60 * 24)
                                  ) + 1
                                : 0}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
