/**
 * Shortcuts Modal - Project Chimera
 * 
 * Modal affichant tous les raccourcis clavier disponibles
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/Dialog';
import { formatShortcut } from '../hooks/useKeyboardShortcuts';
import { useTranslation } from 'react-i18next';

export function ShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { i18n } = useTranslation();

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-shortcuts-modal', handleOpen);
    return () => window.removeEventListener('open-shortcuts-modal', handleOpen);
  }, []);

  const shortcuts = [
    {
      category: 'Navigation',
      items: [
        { key: 'k', metaKey: true, description: i18n.language === 'fr' ? 'Rechercher un utilisateur' : 'Search user' },
        { key: '/', metaKey: true, description: i18n.language === 'fr' ? 'Afficher les raccourcis' : 'Show shortcuts' },
        { key: 'Escape', description: i18n.language === 'fr' ? 'Fermer les fenêtres' : 'Close windows' },
        { key: '↑ / ↓', description: i18n.language === 'fr' ? 'Naviguer dans les conversations' : 'Navigate conversations' },
      ],
    },
    {
      category: i18n.language === 'fr' ? 'Messages' : 'Messages',
      items: [
        { key: 'Enter', metaKey: true, description: i18n.language === 'fr' ? 'Envoyer le message' : 'Send message' },
        { key: 'Shift + Enter', description: i18n.language === 'fr' ? 'Nouvelle ligne' : 'New line' },
      ],
    },
    {
      category: i18n.language === 'fr' ? 'Fonctionnalités' : 'Features',
      items: [
        { key: 'T', metaKey: true, description: 'Time-Lock' },
        { key: 'B', metaKey: true, description: 'Burn After Reading' },
      ],
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{i18n.language === 'fr' ? 'Raccourcis Clavier' : 'Keyboard Shortcuts'}</DialogTitle>
          <DialogDescription>
            {i18n.language === 'fr'
              ? 'Utilisez ces raccourcis pour naviguer plus rapidement dans l\'application.'
              : 'Use these shortcuts to navigate faster through the application.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between py-2 hover:bg-slate-800/50 px-2 rounded-lg transition-colors"
                  >
                    <span className="text-sm text-slate-200">{item.description}</span>
                    <kbd className="px-3 py-1.5 text-xs font-mono bg-slate-800 text-slate-100 rounded-lg border border-slate-700 shadow-sm">
                      {formatShortcut(item)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-400 text-center">
            {i18n.language === 'fr'
              ? 'Appuyez sur Échap pour fermer cette fenêtre'
              : 'Press Escape to close this window'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
