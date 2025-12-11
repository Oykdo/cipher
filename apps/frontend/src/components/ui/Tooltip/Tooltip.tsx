/**
 * Tooltip Component - Project Chimera
 * 
 * Tooltip accessible basé sur Radix UI
 * Conforme WCAG 2.1 AAA
 */

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../../lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  /** Élément déclencheur */
  children: React.ReactNode;
  /** Contenu du tooltip */
  content: React.ReactNode;
  /** Position */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Délai avant apparition (ms) */
  delayDuration?: number;
  /** Classe CSS du contenu */
  contentClassName?: string;
}

export function Tooltip({ 
  children, 
  content, 
  side = 'top',
  delayDuration = 300,
  contentClassName,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={5}
          className={cn(
            'z-50 px-3 py-2 text-sm text-white',
            'bg-slate-900 rounded-lg shadow-xl',
            'border border-slate-700',
            'animate-fadeIn',
            'max-w-xs',
            contentClassName
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-slate-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/**
 * Tooltip simple avec texte
 */
export function TooltipSimple({ 
  children, 
  text, 
  side = 'top' 
}: { 
  children: React.ReactNode; 
  text: string; 
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Tooltip content={text} side={side}>
      {children}
    </Tooltip>
  );
}

/**
 * Tooltip avec shortcut
 */
export function TooltipWithShortcut({
  children,
  text,
  shortcut,
  side = 'top',
}: {
  children: React.ReactNode;
  text: string;
  shortcut: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Tooltip
      content={
        <div className="flex items-center gap-2">
          <span>{text}</span>
          <kbd className="px-1.5 py-0.5 text-xs bg-slate-800 rounded border border-slate-700">
            {shortcut}
          </kbd>
        </div>
      }
      side={side}
    >
      {children}
    </Tooltip>
  );
}
