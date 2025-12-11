/**
 * Button Component - Project Chimera
 * 
 * Composant bouton universel avec variants, tailles, et états
 * Accessible WCAG 2.1 AA par défaut
 */

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../../lib/utils';

const buttonVariants = cva(
  // Classes de base (toujours appliquées)
  'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] hover:scale-[1.02]',
  {
    variants: {
      variant: {
        primary: 'bg-brand-500 text-white hover:bg-brand-400 shadow-elevated hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0',
        secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700',
        ghost: 'hover:bg-slate-800 text-slate-300 hover:text-slate-100',
        destructive: 'bg-rose-500 text-white hover:bg-rose-400 shadow-elevated',
        outline: 'border-2 border-slate-700 hover:bg-slate-800 text-slate-200 hover:border-slate-600',
        link: 'text-brand-400 underline-offset-4 hover:underline px-0',
        success: 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-elevated',
      },
      size: {
        sm: 'h-9 px-3 text-sm min-h-[36px]',
        md: 'h-11 px-4 text-base min-h-[44px]',
        lg: 'h-14 px-6 text-lg min-h-[56px]',
        icon: 'h-11 w-11 min-h-[44px] min-w-[44px]',
        'icon-sm': 'h-9 w-9 min-h-[36px] min-w-[36px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** État de chargement */
  isLoading?: boolean;
  /** Icône à gauche du texte */
  leftIcon?: React.ReactNode;
  /** Icône à droite du texte */
  rightIcon?: React.ReactNode;
  /** Classe CSS supplémentaire */
  className?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { 
      className, 
      variant, 
      size, 
      isLoading, 
      leftIcon, 
      rightIcon, 
      children,
      disabled,
      ...props 
    }, 
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading && (
          <Spinner className="mr-2" />
        )}
        {leftIcon && !isLoading && (
          <span className="mr-2 flex items-center">{leftIcon}</span>
        )}
        {children}
        {rightIcon && !isLoading && (
          <span className="ml-2 flex items-center">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

/**
 * Spinner pour état de chargement
 */
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin h-4 w-4 transition-all', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
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
  );
}
