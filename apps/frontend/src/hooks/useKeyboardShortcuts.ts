/**
 * Keyboard Shortcuts Hook - Project Chimera
 * 
 * Gestion des raccourcis clavier globaux de l'application
 */

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  handler: () => void;
}

/**
 * Hook pour enregistrer des raccourcis clavier globaux
 * 
 * @example
 * useKeyboardShortcuts([
 *   {
 *     key: 'k',
 *     metaKey: true,
 *     description: 'Rechercher',
 *     handler: () => openSearch()
 *   }
 * ]);
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    for (const shortcut of shortcuts) {
      const keyMatches = e.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatches = shortcut.ctrlKey ? e.ctrlKey : true;
      const metaMatches = shortcut.metaKey ? e.metaKey : true;
      const shiftMatches = shortcut.shiftKey ? e.shiftKey : true;
      const altMatches = shortcut.altKey ? e.altKey : true;

      // Vérifier si on doit ignorer le modifier
      const ignoreCtrl = shortcut.ctrlKey === undefined ? true : ctrlMatches;
      const ignoreMeta = shortcut.metaKey === undefined ? true : metaMatches;
      const ignoreShift = shortcut.shiftKey === undefined ? true : shiftMatches;
      const ignoreAlt = shortcut.altKey === undefined ? true : altMatches;

      if (keyMatches && ignoreCtrl && ignoreMeta && ignoreShift && ignoreAlt) {
        // Vérifier que le modifier requis est pressé
        const hasRequiredModifier = 
          (shortcut.ctrlKey && e.ctrlKey) ||
          (shortcut.metaKey && e.metaKey) ||
          (!shortcut.ctrlKey && !shortcut.metaKey);

        if (hasRequiredModifier) {
          e.preventDefault();
          shortcut.handler();
          break;
        }
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    // Écouter uniquement si pas dans un input/textarea
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = 
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Autoriser Escape même dans inputs
      if (e.key === 'Escape' || !isInput) {
        handleKeyDown(e);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKeyDown]);
}

/**
 * Raccourcis clavier par défaut de l'application
 */
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: 'k',
    metaKey: true,
    description: 'Rechercher un utilisateur',
    handler: () => {
      document.getElementById('user-search')?.focus();
    },
  },
  {
    key: '/',
    metaKey: true,
    description: 'Afficher les raccourcis',
    handler: () => {
      // Sera implémenté dans ShortcutsModal
      window.dispatchEvent(new CustomEvent('open-shortcuts-modal'));
    },
  },
  {
    key: 'Escape',
    description: 'Fermer les fenêtres/annuler',
    handler: () => {
      // Géré par les composants Dialog (Radix UI)
      // Fermer drawers mobiles
      window.dispatchEvent(new CustomEvent('close-all-modals'));
    },
  },
];

/**
 * Formater une combinaison de touches pour affichage
 * 
 * @example
 * formatShortcut({ key: 'k', metaKey: true }) // "⌘K" ou "Ctrl+K"
 */
export function formatShortcut(shortcut: Partial<KeyboardShortcut>): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const parts: string[] = [];

  if (shortcut.metaKey) {parts.push(isMac ? '⌘' : 'Ctrl');}
  if (shortcut.ctrlKey) {parts.push('Ctrl');}
  if (shortcut.altKey) {parts.push(isMac ? '⌥' : 'Alt');}
  if (shortcut.shiftKey) {parts.push(isMac ? '⇧' : 'Shift');}
  if (shortcut.key) {parts.push(shortcut.key.toUpperCase());}

  return parts.join(isMac ? '' : '+');
}
