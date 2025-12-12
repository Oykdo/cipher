import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { authFetchV2WithRefresh } from "../../services/api-interceptor";
import { LanguageSelector } from "../LanguageSelector";

export function GeneralSettings() {
    const { t, i18n } = useTranslation();
    const session = useAuthStore((state) => state.session);
    const [userDetails, setUserDetails] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState({ conversationsCount: 0, messagesSent: 0 });

    const hasAccessToken = !!session?.accessToken;

    useEffect(() => {
        if (!hasAccessToken) {
            return;
        }

        const loadUserDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await authFetchV2WithRefresh('/users/me');
                setUserDetails(data);
                
                // Load stats from API
                try {
                    // Fetch conversations to count them
                    const conversationsData = await authFetchV2WithRefresh('/conversations');
                    const conversationsCount = conversationsData?.conversations?.length || 0;
                    
                    // Count messages across all conversations
                    let totalMessagesSent = 0;
                    if (conversationsData?.conversations) {
                        for (const conv of conversationsData.conversations) {
                            try {
                                const messagesData = await authFetchV2WithRefresh(`/conversations/${conv.id}/messages`);
                                if (messagesData?.messages) {
                                    // Count only messages sent by current user
                                    const sentByUser = messagesData.messages.filter(
                                        (m: any) => m.senderId === session?.user?.id
                                    );
                                    totalMessagesSent += sentByUser.length;
                                }
                            } catch (msgErr) {
                                // Skip if conversation messages can't be loaded
                                console.warn(`Failed to load messages for conversation ${conv.id}:`, msgErr);
                            }
                        }
                    }
                    
                    setStats({
                        conversationsCount,
                        messagesSent: totalMessagesSent
                    });
                } catch (statsErr) {
                    console.error('Failed to load stats:', statsErr);
                }
            } catch (err) {
                console.error('Failed to load user details:', err);
                setError(err instanceof Error ? err.message : t('errors.unknown_error'));
            } finally {
                setLoading(false);
            }
        };

        void loadUserDetails();
    }, [hasAccessToken, session?.user?.id]);

    const formatDate = (timestamp: string | number) => {
        return new Date(timestamp).toLocaleString(i18n.language, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="space-y-6">
            {/* États globaux */}
            {!hasAccessToken && (
                <div className="p-3 rounded bg-amber-500/10 border border-amber-500/40 text-sm text-amber-300">
                    {t('settings.general_settings.invalid_session')}
                </div>
            )}

            {loading && hasAccessToken && (
                <div className="p-3 rounded bg-slate-900/60 border border-slate-700 text-sm text-slate-300">
                    {t('settings.general_settings.loading_account_info')}
                </div>
            )}

            {error && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/40 text-sm text-red-300">
                    {t('settings.general_settings.error_loading_info')} {error}
                </div>
            )}

            <div>
                <h2 className="text-xl font-semibold text-white mb-4">{t('settings.general_settings.account_info_title')}</h2>
                <div className="space-y-3">
                    <div className="flex justify-between items-center py-3 border-b border-slate-800">
                        <span className="text-slate-400">{t('settings.general_settings.username')}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-white font-medium">@{session?.user?.username}</span>
                            <button
                                onClick={() => copyToClipboard(session?.user?.username || '')}
                                className="text-slate-500 hover:text-brand-400 transition-colors"
                                title={t('settings.general_settings.copy')}
                            >
                                📋
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-slate-800">
                        <span className="text-slate-400">{t('settings.general_settings.security_level')}</span>
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${session?.user?.securityTier === 'dice-key'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-blue-500/20 text-blue-400'
                                }`}>
                                {session?.user?.securityTier === 'dice-key'
                                    ? t('settings.general_settings.security_level_dicekey')
                                    : t('settings.general_settings.security_level_standard', { bits: userDetails?.keyBits || 256 })}
                            </span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-slate-800">
                        <span className="text-slate-400">{t('settings.general_settings.user_id')}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-white font-mono text-sm">{session?.user?.id?.substring(0, 12)}...</span>
                            <button
                                onClick={() => copyToClipboard(session?.user?.id || '')}
                                className="text-slate-500 hover:text-brand-400 transition-colors"
                                title={t('settings.general_settings.copy_full_id')}
                            >
                                📋
                            </button>
                        </div>
                    </div>
                    {userDetails?.createdAt && (
                        <div className="flex justify-between items-center py-3">
                            <span className="text-slate-400">{t('settings.general_settings.account_created_at')}</span>
                            <span className="text-white font-medium">{formatDate(userDetails.createdAt)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Language Selection */}
            <div>
                <h2 className="text-xl font-semibold text-white mb-4">{t('settings.general_settings.language')}</h2>
                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                    <p className="text-slate-400 text-sm mb-4">{t('settings.general_settings.select_language')}</p>
                    <LanguageSelector />
                </div>
            </div>

            {/* Account Stats */}
            {userDetails && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                        <div className="text-slate-400 text-sm mb-1">{t('settings.general_settings.stats_conversations')}</div>
                        <div className="text-white text-2xl font-bold">
                            {stats.conversationsCount}
                        </div>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                        <div className="text-slate-400 text-sm mb-1">{t('settings.general_settings.stats_messages_sent')}</div>
                        <div className="text-white text-2xl font-bold">
                            {stats.messagesSent}
                        </div>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                        <div className="text-slate-400 text-sm mb-1">{t('settings.general_settings.stats_active_days')}</div>
                        <div className="text-white text-2xl font-bold">
                            {userDetails.createdAt ? Math.floor((Date.now() - new Date(userDetails.createdAt).getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
