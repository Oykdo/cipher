/**
 * Dialog Component - Project Chimera
 * 
 * Modal accessible basé sur Radix UI
 * Conforme WCAG 2.1 AAA pour l'accessibilité
 */

import * as RadixDialog from '@radix-ui/react-dialog';
import { cn } from '../../../lib/utils';
import { useFocusTrap } from '../../../hooks/useFocusTrap';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogPortal = RadixDialog.Portal;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps extends RadixDialog.DialogContentProps {
  /** Masquer le bouton de fermeture */
  hideClose?: boolean;
  /** Taille du dialog */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function DialogContent({
  children,
  className,
  hideClose = false,
  size = 'md',
  ...props
}: DialogContentProps) {
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-[calc(100vw-2rem)]',
  };
  
  // Focus trap dans le dialog (Radix UI le gère déjà)
  useFocusTrap({ 
    active: true, 
    restoreFocus: true,
    initialFocus: false // Radix gère déjà le focus initial
  });
  
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay 
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-all',
          'data-[state=open]:animate-fadeIn',
          'data-[state=closed]:animate-fadeOut'
        )}
      />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
          'w-[calc(100vw-2rem)] max-h-[90vh]',
          sizeClasses[size],
          'glass-panel rounded-2xl p-6 overflow-y-auto',
          'shadow-2xl border border-slate-700 transition-all',
          'data-[state=open]:animate-scaleIn',
          'data-[state=closed]:animate-scaleOut',
          'focus:outline-none',
          className
        )}
        {...props}
      >
        {children}
        
        {!hideClose && (
          <RadixDialog.Close 
            className={cn(
              'absolute top-4 right-4 p-2 rounded-lg',
              'hover:bg-slate-800 transition-colors',
              'text-slate-400 hover:text-slate-100',
              'min-w-[44px] min-h-[44px] flex items-center justify-center',
              'focus:outline-none focus:ring-2 focus:ring-brand-500'
            )}
            aria-label="Fermer"
          >
            <CloseIcon className="w-5 h-5" />
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export interface DialogHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export function DialogHeader({ className, children }: DialogHeaderProps) {
  return (
    <div className={cn('mb-4 pr-10', className)}>
      {children}
    </div>
  );
}

export interface DialogTitleProps extends RadixDialog.DialogTitleProps {
  className?: string;
}

export function DialogTitle({ className, children, ...props }: DialogTitleProps) {
  return (
    <RadixDialog.Title 
      className={cn(
        'text-2xl font-semibold text-slate-100',
        className
      )}
      {...props}
    >
      {children}
    </RadixDialog.Title>
  );
}

export interface DialogDescriptionProps extends RadixDialog.DialogDescriptionProps {
  className?: string;
}

export function DialogDescription({ className, children, ...props }: DialogDescriptionProps) {
  return (
    <RadixDialog.Description 
      className={cn(
        'text-sm text-slate-300 mt-2',
        className
      )}
      {...props}
    >
      {children}
    </RadixDialog.Description>
  );
}

export interface DialogFooterProps {
  className?: string;
  children: React.ReactNode;
}

export function DialogFooter({ className, children }: DialogFooterProps) {
  return (
    <div className={cn('mt-6 flex items-center justify-end gap-3', className)}>
      {children}
    </div>
  );
}

/**
 * Icône de fermeture
 */
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
      aria-hidden="true"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M6 18L18 6M6 6l12 12" 
      />
    </svg>
  );
}

/**
 * Animations pour Dialog (déjà dans tailwind.config.js)
 */
