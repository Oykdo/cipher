/**
 * Konami Code Hook - Project Chimera
 * 
 * Easter egg pour power users
 * ↑↑↓↓←→←→BA
 */

import { useEffect } from 'react';
const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/**
 * Hook pour détecter le Konami Code
 * 
 * @example
 * useKonamiCode(() => {
 *   debugLogger.debug('Easter egg activated!');
 * });
 */
export function useKonamiCode(callback: () => void) {
  useEffect(() => {
    let index = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const expectedKey = KONAMI_CODE[index];
      const actualKey = e.key;

      if (actualKey === expectedKey) {
        index++;
        
        if (index === KONAMI_CODE.length) {
          callback();
          index = 0; // Reset pour permettre re-trigger
        }
      } else {
        // Reset si mauvaise touche
        index = 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callback]);
}
