/**
 * i18n Configuration - react-i18next
 * 
 * Supports 6 languages:
 * - French (fr) - Default
 * - English (en)
 * - German (de)
 * - Spanish (es)
 * - Chinese Simplified (zh-CN)
 * - Italian (it)
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import fr from './locales/fr.json';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import zhCN from './locales/zh-CN.json';
import it from './locales/it.json';

// Language resources
const resources = {
  fr: { translation: fr },
  en: { translation: en },
  de: { translation: de },
  es: { translation: es },
  'zh-CN': { translation: zhCN },
  it: { translation: it },
};

// Initialize i18next
i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources,
    fallbackLng: 'fr', // Default language
    lng: localStorage.getItem('dd-lang') || 'fr', // Get saved language or default to French
    
    // Supported languages
    supportedLngs: ['fr', 'en', 'de', 'es', 'zh-CN', 'it'],
    
    // Namespace
    ns: ['translation'],
    defaultNS: 'translation',
    
    // Key separator (use dot notation: common.save)
    keySeparator: '.',
    
    // Interpolation
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    
    // Detection options
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'dd-lang',
    },
    
    // React options
    react: {
      useSuspense: false, // Disable suspense for now
    },
  });

// Save language to localStorage when it changes
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('dd-lang', lng);
});

export default i18n;

