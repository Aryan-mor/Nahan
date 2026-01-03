import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en/translation.json';
import faTranslation from './locales/fa/translation.json';

// Get language from localStorage if available (nahan-storage is the key used by zustand persist)
const getSavedLanguage = () => {
  try {
    const storage = localStorage.getItem('nahan-storage');
    if (storage) {
      const parsed = JSON.parse(storage);
      if (parsed.state && parsed.state.language) {
        return parsed.state.language;
      }
    }
  } catch (e) {
    console.error('Failed to parse language from storage', e);
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslation,
      },
      fa: {
        translation: faTranslation,
      },
    },
    lng: getSavedLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;
