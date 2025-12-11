/**
 * Input Component - Project Chimera
 * 
 * Composant input accessible avec label, erreur, helper text
 * Conforme WCAG 2.1 AA
 */

import { forwardRef, InputHTMLAttributes, useId } from 'react';
import { cn } from '../../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label du champ */
  label?: string;
  /** Message d'erreur */
  error?: string;
  /** Texte d'aide */
  helperText?: string;
  /** Addon à gauche (icône, texte) */
  leftAddon?: React.ReactNode;
  /** Addon à droite (icône, bouton) */
  rightAddon?: React.ReactNode;
  /** Classe wrapper */
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { 
      label,
      error,
      helperText,
      leftAddon,
      rightAddon,
      className,
      wrapperClassName,
      id: providedId,
      disabled,
      ...props 
    }, 
    ref
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;
    const hasError = Boolean(error);
    
    return (
      <div className={cn('w-full', wrapperClassName)}>
        {/* Label */}
        {label && (
          <label 
            htmlFor={id}
            className={cn(
              'block text-sm font-medium mb-1.5',
              hasError ? 'text-rose-400' : 'text-slate-300'
            )}
          >
            {label}
          </label>
        )}
        
        {/* Input wrapper */}
        <div className="relative">
          {/* Left addon */}
          {leftAddon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-slate-400">
              {leftAddon}
            </div>
          )}
          
          {/* Input */}
          <input
            ref={ref}
            id={id}
            className={cn(
              'w-full rounded-lg bg-slate-900 border px-3 py-2 text-sm text-slate-100',
              'placeholder:text-slate-400 min-h-[44px]',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-brand-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              hasError 
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' 
                : 'border-slate-700 focus:border-brand-500',
              leftAddon && 'pl-10',
              rightAddon && 'pr-10',
              className
            )}
            aria-invalid={hasError}
            aria-describedby={cn(
              hasError && errorId,
              helperText && helperId
            )}
            disabled={disabled}
            {...props}
          />
          
          {/* Right addon */}
          {rightAddon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-slate-400">
              {rightAddon}
            </div>
          )}
        </div>
        
        {/* Error message */}
        {hasError && (
          <p 
            id={errorId} 
            className="mt-1.5 text-sm text-rose-400 flex items-center gap-1.5" 
            role="alert"
          >
            <ErrorIcon className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </p>
        )}
        
        {/* Helper text */}
        {helperText && !hasError && (
          <p 
            id={helperId} 
            className="mt-1.5 text-sm text-slate-400"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

/**
 * Icon pour les erreurs
 */
function ErrorIcon({ className }: { className?: string }) {
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
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
      />
    </svg>
  );
}
