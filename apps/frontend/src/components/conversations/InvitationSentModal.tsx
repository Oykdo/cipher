import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface InvitationSentModalProps {
    username: string;
    onClose: () => void;
}

export function InvitationSentModal({ username, onClose }: InvitationSentModalProps) {
    const { t } = useTranslation();

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invitation-sent-title"
        >
            <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card relative max-w-md w-full p-6 md:p-8 border-2 border-quantum-cyan/40 shadow-2xl overflow-hidden"
            >
                {/* Cosmic halo */}
                <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-quantum-cyan/20 blur-3xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-24 right-0 h-40 w-40 rounded-full bg-magenta-trust/15 blur-3xl" aria-hidden="true" />

                <div className="relative flex flex-col items-center text-center">
                    {/* Animated check icon */}
                    <motion.div
                        initial={{ scale: 0, rotate: -120 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.05 }}
                        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-quantum-cyan to-magenta-trust shadow-[0_0_30px_rgba(34,211,238,0.45)]"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-8 w-8 text-white"
                            aria-hidden="true"
                        >
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                    </motion.div>

                    <h3
                        id="invitation-sent-title"
                        className="text-2xl font-black text-pure-white"
                    >
                        {t('conversations.invitation_sent_title')}
                    </h3>

                    <p className="mt-3 text-sm leading-relaxed text-soft-grey">
                        {t('conversations.invitation_sent_body', { username })}
                    </p>

                    <button
                        type="button"
                        onClick={onClose}
                        className="mt-6 w-full rounded-2xl border border-quantum-cyan/40 bg-quantum-cyan/10 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-quantum-cyan transition-colors hover:bg-quantum-cyan/20"
                        autoFocus
                    >
                        {t('common.ok', { defaultValue: 'OK' })}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default InvitationSentModal;
