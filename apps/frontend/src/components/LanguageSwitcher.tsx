import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => i18n.changeLanguage('fr')}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all shadow-lg ${
          i18n.language === 'fr'
            ? 'bg-brand-600 text-white ring-2 ring-brand-400'
            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white'
        }`}
        title="Français"
        aria-label="Français"
      >
        <span className="text-2xl leading-none">🇫🇷</span>
      </button>
      <button
        onClick={() => i18n.changeLanguage('en')}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all shadow-lg ${
          i18n.language === 'en'
            ? 'bg-brand-600 text-white ring-2 ring-brand-400'
            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white'
        }`}
        title="English"
        aria-label="English"
      >
        <span className="text-2xl leading-none">🇬🇧</span>
      </button>
    </div>
  );
}
