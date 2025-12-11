/**
 * Spinner Component - Project Chimera
 * 
 * Loading spinner réutilisable avec variants
 */

import { cn } from '../../../lib/utils';

export interface SpinnerProps {
  /** Taille du spinner */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Classe CSS supplémentaire */
  className?: string;
  /** Texte de chargement (optionnel) */
  label?: string;
}

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  const sizeClasses = {
    xs: 'w-3 h-3 border',
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
    xl: 'w-12 h-12 border-4',
  };

  return (
    <div className="inline-flex items-center gap-2">
      <svg
        className={cn(
          'animate-spin text-current',
          sizeClasses[size],
          className
        )}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        role="status"
        aria-label={label || 'Chargement'}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label && (
        <span className="text-sm text-slate-400">{label}</span>
      )}
    </div>
  );
}

/**
 * Spinner contextuels pré-configurés
 */
export function ButtonSpinner({ className }: { className?: string }) {
  return <Spinner size="sm" className={className} />;
}

export function PageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="lg" label={label} />
    </div>
  );
}

export function InlineSpinner() {
  return <Spinner size="xs" className="inline-block" />;
}
