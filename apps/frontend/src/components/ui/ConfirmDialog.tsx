import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './Dialog';

export interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Red confirm button — for destructive actions. */
    destructive?: boolean;
    /** Single-button mode (no cancel). Use for blocking acknowledgments / errors. */
    hideCancel?: boolean;
    onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    destructive = false,
    hideCancel = false,
    onConfirm,
}: ConfirmDialogProps) {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);

    const resolvedConfirm = confirmLabel ?? t('common.ok', { defaultValue: 'OK' });
    const resolvedCancel = cancelLabel ?? t('common.cancel', { defaultValue: 'Cancel' });

    const handleConfirm = async () => {
        setBusy(true);
        try {
            await onConfirm();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <DialogContent
                size="sm"
                className={destructive ? 'border-red-500/30' : undefined}
            >
                <DialogHeader>
                    <DialogTitle className={destructive ? 'text-red-300' : undefined}>
                        {title}
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    {!hideCancel && (
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            disabled={busy}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-60"
                        >
                            {resolvedCancel}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => void handleConfirm()}
                        disabled={busy}
                        className={
                            destructive
                                ? 'rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60'
                                : 'rounded-xl bg-quantum-cyan/20 border border-quantum-cyan/40 px-4 py-2 text-sm font-medium text-quantum-cyan transition-colors hover:bg-quantum-cyan/30 disabled:opacity-60'
                        }
                    >
                        {resolvedConfirm}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ConfirmDialog;
