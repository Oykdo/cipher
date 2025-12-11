/**
 * ConversationRequests Component - Enhanced Version
 * Displays and manages pending conversation requests with improved UX
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { apiv2 } from '../services/api-v2';

interface ConversationRequest {
    id: string;
    from_user_id: string;
    from_username?: string;
    from_security_tier?: string;
    to_user_id: string;
    to_username?: string;
    message?: string;
    created_at: number;
    status: 'pending' | 'accepted' | 'rejected';
}

interface ConversationRequestsProps {
    onRequestAccepted: () => void;
    onNewRequest?: (request: ConversationRequest) => void;
}

type Tab = 'received' | 'sent';

export default function ConversationRequests({
    onRequestAccepted,
    onNewRequest
}: ConversationRequestsProps) {
    const { t } = useTranslation();
    const session = useAuthStore((state) => state.session);
    const [activeTab, setActiveTab] = useState<Tab>('received');
    const [receivedRequests, setReceivedRequests] = useState<ConversationRequest[]>([]);
    const [sentRequests, setSentRequests] = useState<ConversationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [error, setError] = useState<string>('');
    const [successMessage, setSuccessMessage] = useState<string>('');

    useEffect(() => {
        if (session?.accessToken) {
            loadRequests();
        }
    }, [session?.accessToken, activeTab]);

    useEffect(() => {
        if (onNewRequest) {
            // This will be called when a WebSocket event is received
        }
    }, [onNewRequest]);

    const loadRequests = async () => {
        if (!session?.accessToken) return;

        try {
            setLoading(true);
            setError('');
            if (activeTab === 'received') {
                const data = await apiv2.getReceivedRequests();
                setReceivedRequests(data.requests || []);
            } else {
                const data = await apiv2.getSentRequests();
                setSentRequests(data.requests || []);
            }
        } catch (error: any) {
            console.error('Failed to load requests:', error);
            setError(error.message || t('conversations.error_loading_requests'));
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async (requestId: string) => {
        if (!session?.accessToken) return;

        try {
            setProcessing(requestId);
            setError('');
            await apiv2.acceptConversationRequest(requestId);

            // Remove from list with animation
            setReceivedRequests(prev => prev.filter(r => r.id !== requestId));

            // Show success message
            setSuccessMessage(t('conversations.request_accepted_success'));
            setTimeout(() => setSuccessMessage(''), 3000);

            // Notify parent to reload conversations
            onRequestAccepted();
        } catch (error: any) {
            console.error('Failed to accept request:', error);
            setError(error.message || t('conversations.error_accepting_request'));
        } finally {
            setProcessing(null);
        }
    };

    const handleReject = async (requestId: string) => {
        if (!session?.accessToken) return;

        try {
            setProcessing(requestId);
            setError('');
            await apiv2.rejectConversationRequest(requestId);

            // Remove from list with animation
            setReceivedRequests(prev => prev.filter(r => r.id !== requestId));

            // Show success message
            setSuccessMessage(t('conversations.request_rejected_success'));
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error: any) {
            console.error('Failed to reject request:', error);
            setError(error.message || t('conversations.error_rejecting_request'));
        } finally {
            setProcessing(null);
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return t('common.just_now');
        if (diffMins < 60) return t('common.minutes_ago', { count: diffMins });
        if (diffHours < 24) return t('common.hours_ago', { count: diffHours });
        if (diffDays < 7) return t('common.days_ago', { count: diffDays });

        return date.toLocaleDateString();
    };

    const getSecurityIcon = (tier?: string) => {
        if (tier === 'dice-key') {
            return '🎲';
        }
        return '🔐';
    };

    const requests = activeTab === 'received' ? receivedRequests : sentRequests;

    return (
        <div className="mb-4">
            {/* Success/Error Messages */}
            <AnimatePresence>
                {successMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg"
                    >
                        <p className="text-sm text-green-400 flex items-center gap-2">
                            <span>✓</span>
                            {successMessage}
                        </p>
                    </motion.div>
                )}
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                    >
                        <p className="text-sm text-red-400 flex items-center gap-2">
                            <span>⚠️</span>
                            {error}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="bg-dark-matter-lighter rounded-lg border border-quantum-cyan/20 overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-quantum-cyan/20 bg-dark-matter">
                    <button
                        onClick={() => setActiveTab('received')}
                        className={`flex-1 py-3 px-4 text-sm font-bold transition-all relative ${activeTab === 'received'
                            ? 'text-quantum-cyan'
                            : 'text-muted-grey hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <span>📥</span>
                            <span>{t('conversations.pending_requests')}</span>
                            {receivedRequests.length > 0 && (
                                <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="px-2 py-0.5 text-xs bg-quantum-cyan text-black rounded-full font-bold"
                                >
                                    {receivedRequests.length}
                                </motion.span>
                            )}
                        </div>
                        {activeTab === 'received' && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-quantum-cyan"
                            />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('sent')}
                        className={`flex-1 py-3 px-4 text-sm font-bold transition-all relative ${activeTab === 'sent'
                            ? 'text-quantum-cyan'
                            : 'text-muted-grey hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <span>📤</span>
                            <span>{t('conversations.sent_requests')}</span>
                            {sentRequests.length > 0 && (
                                <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="px-2 py-0.5 text-xs bg-muted-grey/30 text-soft-grey rounded-full font-bold"
                                >
                                    {sentRequests.length}
                                </motion.span>
                            )}
                        </div>
                        {activeTab === 'sent' && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-quantum-cyan"
                            />
                        )}
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-quantum-cyan"></div>
                            <p className="text-muted-grey text-sm mt-2">{t('common.loading')}</p>
                        </div>
                    ) : requests.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-8"
                        >
                            <div className="text-6xl mb-3">
                                {activeTab === 'received' ? '📭' : '📪'}
                            </div>
                            <p className="text-soft-grey font-medium">
                                {activeTab === 'received'
                                    ? t('conversations.no_pending_requests')
                                    : t('conversations.no_sent_requests')}
                            </p>
                            <p className="text-muted-grey text-sm mt-1">
                                {activeTab === 'received'
                                    ? t('conversations.no_pending_requests_hint')
                                    : t('conversations.no_sent_requests_hint')}
                            </p>
                        </motion.div>
                    ) : (
                        <AnimatePresence mode="popLayout">
                            {requests.map((request) => (
                                <motion.div
                                    key={request.id}
                                    layout
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="mb-3 last:mb-0 p-3 md:p-4 bg-dark-matter rounded-lg border border-quantum-cyan/30 hover:border-quantum-cyan/50 transition-all"
                                >
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                        {/* User Info */}
                                        <div className="flex-1 min-w-0">
                                            {/* Username */}
                                            <p className="text-white font-bold text-sm md:text-base truncate">
                                                @{activeTab === 'received'
                                                    ? request.from_username
                                                    : request.to_username
                                                }
                                            </p>

                                            {/* Badges Row */}
                                            <div className="flex items-center gap-2 flex-wrap mt-1">
                                                {/* Security Badge */}
                                                {activeTab === 'received' && request.from_security_tier && (
                                                    <span className={`
                                                                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
                                                                ${request.from_security_tier === 'dice-key'
                                                            ? 'bg-magenta-trust/20 text-magenta-trust border border-magenta-trust/30'
                                                            : 'bg-quantum-cyan/20 text-quantum-cyan border border-quantum-cyan/30'
                                                        }
                                                            `}>
                                                        {getSecurityIcon(request.from_security_tier)}
                                                        {request.from_security_tier === 'dice-key'
                                                            ? t('auth.security_dicekey')
                                                            : t('auth.security_standard')
                                                        }
                                                    </span>
                                                )}
                                                {activeTab === 'sent' && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
                                                        {t('common.status_pending')}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Timestamp */}
                                            <p className="text-xs text-muted-grey flex items-center gap-1 mt-1">
                                                <span>🕐</span>
                                                {formatTime(request.created_at)}
                                            </p>

                                            {/* Message */}
                                            {request.message && (
                                                <div className="mt-2">
                                                    <p className="text-sm text-soft-grey italic bg-dark-matter-lighter p-2 md:p-3 rounded-lg border-l-2 border-quantum-cyan/50">
                                                        "{request.message}"
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons (Only for received) */}
                                        {activeTab === 'received' && (
                                            <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto md:flex-shrink-0">
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleAccept(request.id)}
                                                    disabled={processing === request.id}
                                                    className="flex-1 md:flex-none px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm whitespace-nowrap border border-green-500/30 hover:border-green-500/50 shadow-lg"
                                                >
                                                    {processing === request.id ? (
                                                        <span className="flex items-center gap-2">
                                                            <span className="inline-block w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></span>
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1">
                                                            <span>✓</span>
                                                            {t('conversations.accept')}
                                                        </span>
                                                    )}
                                                </motion.button>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleReject(request.id)}
                                                    disabled={processing === request.id}
                                                    className="flex-1 md:flex-none px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm whitespace-nowrap border border-red-500/30 hover:border-red-500/50 shadow-lg"
                                                >
                                                    {processing === request.id ? (
                                                        <span className="flex items-center gap-2">
                                                            <span className="inline-block w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></span>
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1">
                                                            <span>✗</span>
                                                            {t('conversations.reject')}
                                                        </span>
                                                    )}
                                                </motion.button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </div>
        </div>
    );
}
