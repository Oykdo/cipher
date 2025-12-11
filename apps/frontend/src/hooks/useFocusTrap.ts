/**
 * Focus Trap Hook - Project Chimera
 * 
 * Piège le focus clavier dans un container (pour modales, drawers)
 * Conforme WCAG 2.1 AA - Gestion du focus accessible
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface UseFocusTrapOptions {
  /** Activer/désactiver le trap */
  active: boolean;
  /** Restaurer le focus à l'élément précédent après désactivation */
  restoreFocus?: boolean;
  /** Focus initial sur le premier élément */
  initialFocus?: boolean;
}

/**
 * Hook pour piéger le focus clavier dans un container
 * 
 * @example
 * function Modal({ isOpen, onClose }) {
 *   const containerRef = useFocusTrap({ active: isOpen });
 *   
 *   return (
 *     <div ref={containerRef}>
 *       <button onClick={onClose}>Fermer</button>
 *     </div>
 *   );
 * }
 */
export function useFocusTrap(options: UseFocusTrapOptions) {
  const { active, restoreFocus = true, initialFocus = true } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) {return;}

    const container = containerRef.current;

    // Sauvegarder l'élément focusé avant le trap
    if (restoreFocus) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    // Obtenir tous les éléments focusables
    const getFocusableElements = () => {
      return Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => {
        // Filtrer les éléments cachés
        return !el.hasAttribute('disabled') && 
               el.offsetParent !== null &&
               window.getComputedStyle(el).visibility !== 'hidden';
      });
    };

    const focusableElements = getFocusableElements();
    const firstElement = focusableElements[0];

    // Focus initial sur le premier élément
    if (initialFocus && firstElement) {
      // Petit délai pour laisser le temps au DOM de s'initialiser
      requestAnimationFrame(() => {
        firstElement.focus();
      });
    }

    // Handler Tab et Shift+Tab
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {return;}

      const focusable = getFocusableElements();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first) {return;}

      if (e.shiftKey) {
        // Shift+Tab sur premier élément → dernier
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        // Tab sur dernier élément → premier
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTab);

    // Cleanup
    return () => {
      container.removeEventListener('keydown', handleTab);

      // Restaurer le focus précédent
      if (restoreFocus && previousFocusRef.current) {
        requestAnimationFrame(() => {
          previousFocusRef.current?.focus();
        });
      }
    };
  }, [active, restoreFocus, initialFocus]);

  return containerRef;
}
