/**
 * Breakpoints System - Project Chimera
 * 
 * Gestion responsive mobile-first avec hooks React
 */

import { useEffect, useState } from 'react';

export const breakpoints = {
  sm: 640,    // Mobile landscape
  md: 768,    // Tablet portrait
  lg: 1024,   // Tablet landscape / Small desktop
  xl: 1280,   // Desktop
  '2xl': 1536, // Large desktop
} as const;

export type Breakpoint = keyof typeof breakpoints;

/**
 * Hook pour détecter le breakpoint actuel
 * 
 * @example
 * const breakpoint = useBreakpoint();
 * const isMobile = breakpoint === 'sm' || breakpoint === 'md';
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    if (typeof window === 'undefined') {return 'lg';}
    return getCurrentBreakpoint();
  });

  useEffect(() => {
    const handleResize = () => {
      setBreakpoint(getCurrentBreakpoint());
    };

    // Utiliser ResizeObserver pour de meilleures performances
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(document.body);

    // Initial check
    handleResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return breakpoint;
}

/**
 * Hook pour vérifier si on est au-dessus d'un breakpoint
 * 
 * @example
 * const isDesktop = useMediaQuery('lg'); // true si >= 1024px
 */
export function useMediaQuery(breakpoint: Breakpoint): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') {return false;}
    return window.innerWidth >= breakpoints[breakpoint];
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${breakpoints[breakpoint]}px)`);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback pour anciens navigateurs
      mediaQuery.addListener(handleChange);
    }

    // Initial check
    setMatches(mediaQuery.matches);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [breakpoint]);

  return matches;
}

/**
 * Hook simplifié pour détecter mobile
 * 
 * @example
 * const isMobile = useIsMobile(); // true si < 1024px
 */
export function useIsMobile(): boolean {
  return !useMediaQuery('lg');
}

/**
 * Obtenir le breakpoint actuel basé sur la largeur de la fenêtre
 */
function getCurrentBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') {return 'lg';}
  
  const width = window.innerWidth;
  
  if (width >= breakpoints['2xl']) {return '2xl';}
  if (width >= breakpoints.xl) {return 'xl';}
  if (width >= breakpoints.lg) {return 'lg';}
  if (width >= breakpoints.md) {return 'md';}
  return 'sm';
}

/**
 * Utilitaire pour créer des styles conditionnels basés sur breakpoint
 * 
 * @example
 * const styles = responsiveValue({
 *   sm: 'text-sm',
 *   md: 'text-base',
 *   lg: 'text-lg'
 * }, breakpoint);
 */
export function responsiveValue<T>(
  values: Partial<Record<Breakpoint, T>>,
  currentBreakpoint: Breakpoint
): T | undefined {
  // Ordre de priorité décroissant
  const order: Breakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm'];
  const currentIndex = order.indexOf(currentBreakpoint);
  
  // Chercher la valeur la plus proche (mobile-first)
  for (let i = currentIndex; i < order.length; i++) {
    const bp = order[i];
    if (values[bp] !== undefined) {
      return values[bp];
    }
  }
  
  return undefined;
}
