import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

interface GasPreviewProps {
    cost: number;
    available: number;
    isFree?: boolean;
}

export function GasPreview({ cost, available, isFree = false }: GasPreviewProps) {
    const { t } = useTranslation();

    if (isFree && cost === 0) return null;

    const canAfford = available >= cost;

    return (
        <AnimatePresence>
            {(cost > 0 || !isFree) && (
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className={`
            text-xs px-3 py-1.5 rounded-md flex items-center justify-between gap-3 mb-2
            border
            ${canAfford
                            ? 'bg-quantum-cyan/5 border-quantum-cyan/20 text-quantum-cyan'
                            : 'bg-error-glow/10 border-error-glow/30 text-error-glow'
                        }
          `}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-lg">⛽</span>
                        <span>
                            {t('messages.gas_cost_label', 'Coût Privacy Gas :')}
                            <span className="font-bold ml-1">{cost.toFixed(2)} Aether</span>
                        </span>
                    </div>

                    {!canAfford && (
                        <span className="font-semibold text-[10px] uppercase tracking-wider">
                            {t('messages.insufficient_funds', 'Fonds insuffisants')}
                        </span>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
