/**
 * Live Region Component - Project Chimera
 * 
 * Composant pour annoncer dynamiquement du contenu aux lecteurs d'écran
 * Conforme WCAG 2.1 - ARIA Live Regions
 */

import { useEffect, useState } from 'react';
import { cn } from '../../../lib/utils';

export interface LiveRegionProps {
  /** Message à annoncer */
  message: string;
  /** Niveau de politesse */
  politeness?: 'polite' | 'assertive' | 'off';
  /** Classe CSS supplémentaire */
  className?: string;
  /** Délai avant annonce (ms) */
  delay?: number;
}

/**
 * Live Region pour annonces dynamiques aux lecteurs d'écran
 * 
 * @example
 * <LiveRegion 
 *   message="Nouveau message de Alice" 
 *   politeness="polite" 
 * />
 */
export function LiveRegion({ 
  message, 
  politeness = 'polite',
  className,
  delay = 0,
}: LiveRegionProps) {
  const [displayedMessage, setDisplayedMessage] = useState('');

  useEffect(() => {
    if (!message) {
      setDisplayedMessage('');
      return;
    }

    if (delay > 0) {
      const timer = setTimeout(() => {
        setDisplayedMessage(message);
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setDisplayedMessage(message);
    }
  }, [message, delay]);

  if (!displayedMessage) {return null;}

  return (
    <div
      className={cn('sr-only', className)}
      role="status"
      aria-live={politeness}
      aria-atomic="true"
    >
      {displayedMessage}
    </div>
  );
}

/**
 * Live Region pour alertes (assertive)
 */
export function LiveAlert({ message }: { message: string }) {
  return (
    <LiveRegion 
      message={message} 
      politeness="assertive"
    />
  );
}

/**
 * Live Region pour status (polite)
 */
export function LiveStatus({ message }: { message: string }) {
  return (
    <LiveRegion 
      message={message} 
      politeness="polite"
    />
  );
}
