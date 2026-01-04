import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en/translation.json';
import faTranslation from './locales/fa/translation.json';

// Get language from localStorage if available
// Note: Storage is now encrypted (nahan-secure-data) or in UI store (nahan-ui-storage)
// We can't read encrypted storage here without the passphrase
// Return default - the store will load the correct language after unlock
const getSavedLanguage = () => {
  // Since storage is now encrypted, we can't read it without the passphrase
  // Return default - the store will load the correct language after unlock
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
