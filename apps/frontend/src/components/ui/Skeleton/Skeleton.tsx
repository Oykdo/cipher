/**
 * Skeleton Component - Project Chimera
 * 
 * Composants de chargement skeleton avec effet shimmer
 * Pour indiquer le chargement de contenu
 */

import { HTMLAttributes } from 'react';
import { cn } from '../../../lib/utils';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Classe CSS supplémentaire */
  className?: string;
}

/**
 * Skeleton de base
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-slate-800/50',
        'relative overflow-hidden',
        'before:absolute before:inset-0',
        'before:-translate-x-full',
        'before:animate-shimmer',
        'before:bg-gradient-to-r',
        'before:from-transparent before:via-slate-700/50 before:to-transparent',
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

/**
 * Skeleton texte avec plusieurs lignes
 */
export interface SkeletonTextProps {
  /** Nombre de lignes */
  lines?: number;
  /** Classe CSS du wrapper */
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => {
        const isLast = i === lines - 1;
        const width = isLast ? `${70 + Math.random() * 30}%` : `${85 + Math.random() * 15}%`;
        
        return (
          <Skeleton 
            key={i} 
            className="h-4"
            style={{ width }}
          />
        );
      })}
    </div>
  );
}

/**
 * Skeleton avatar circulaire
 */
export interface SkeletonAvatarProps {
  /** Taille en pixels */
  size?: number;
  /** Classe CSS supplémentaire */
  className?: string;
}

export function SkeletonAvatar({ size = 40, className }: SkeletonAvatarProps) {
  return (
    <Skeleton 
      className={cn('rounded-full flex-shrink-0', className)}
      style={{ width: size, height: size }} 
    />
  );
}

/**
 * Skeleton card - Combinaison avatar + texte
 */
export interface SkeletonCardProps {
  /** Afficher l'avatar */
  showAvatar?: boolean;
  /** Nombre de lignes de texte */
  lines?: number;
  /** Classe CSS du wrapper */
  className?: string;
}

export function SkeletonCard({ 
  showAvatar = true, 
  lines = 2, 
  className 
}: SkeletonCardProps) {
  return (
    <div className={cn('flex items-start gap-3 p-4', className)}>
      {showAvatar && <SkeletonAvatar />}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

/**
 * Skeleton conversation item (pour sidebar)
 */
export function SkeletonConversation({ className }: { className?: string }) {
  return (
    <div className={cn('px-4 py-3 border-b border-slate-800', className)}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={40} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-3 w-full max-w-[200px]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton message bubble
 */
export interface SkeletonMessageProps {
  /** Message de soi ou reçu */
  isSelf?: boolean;
  /** Classe CSS supplémentaire */
  className?: string;
}

export function SkeletonMessage({ isSelf = false, className }: SkeletonMessageProps) {
  return (
    <div className={cn(
      'flex',
      isSelf ? 'justify-end' : 'justify-start',
      className
    )}>
      <div className={cn(
        'max-w-xl rounded-2xl px-4 py-2',
        isSelf ? 'bg-brand-500/20' : 'bg-slate-900/60'
      )}>
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

/**
 * Skeleton input field
 */
export function SkeletonInput({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/**
 * Skeleton button
 */
export interface SkeletonButtonProps {
  /** Taille */
  size?: 'sm' | 'md' | 'lg';
  /** Classe CSS supplémentaire */
  className?: string;
}

export function SkeletonButton({ size = 'md', className }: SkeletonButtonProps) {
  const sizeClasses = {
    sm: 'h-9 w-20',
    md: 'h-11 w-24',
    lg: 'h-14 w-32',
  };
  
  return (
    <Skeleton className={cn('rounded-xl', sizeClasses[size], className)} />
  );
}
