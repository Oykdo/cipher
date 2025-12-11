/**
 * LanguageSwitch Component (Legacy - kept for compatibility)
 *
 * Use LanguageSelector or LanguageSelectorCompact for new implementations
 */

import { useTranslation } from 'react-i18next';

export function LanguageSwitch() {
  const { i18n, t } = useTranslation();

  return (
    <div className="flex items-center gap-2" aria-label={t('common.language')}>
      <button
        className={`px-2 py-1 rounded ${i18n.language === 'fr' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
        onClick={() => i18n.changeLanguage('fr')}
        aria-pressed={i18n.language === 'fr'}
      >
        FR
      </button>
      <button
        className={`px-2 py-1 rounded ${i18n.language === 'en' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
        onClick={() => i18n.changeLanguage('en')}
        aria-pressed={i18n.language === 'en'}
      >
        EN
      </button>
    </div>
  );
}