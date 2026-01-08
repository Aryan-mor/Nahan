import { Card, CardBody } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useUIStore } from '../stores/uiStore';

 
export function LanguageSelector() {
  const { setLanguage } = useUIStore();
  const { t } = useTranslation();

  const languages = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷' },
  ];

  return (
    <div className="min-h-screen bg-industrial-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-industrial-100 mb-2">{t('language_selector.title')}</h1>
          <p className="text-industrial-400">{t('language_selector.subtitle')}</p>
          <p className="text-industrial-400 font-persian mt-1">{t('language_selector.persian_prompt')}</p>
        </div>

        <div className="grid gap-4">
          {languages.map((lang) => (
            <Card
              key={lang.code}
              isPressable
              onPress={() => setLanguage(lang.code)}
              data-testid={`lang-${lang.code}-btn`}
              className="bg-industrial-900 border-industrial-800 hover:border-industrial-600 transition-colors"
            >
              <CardBody className="p-4">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <span className="text-4xl" role="img" aria-label={lang.name}>{lang.flag}</span>
                    <div className="text-start">
                      <h3 className="text-lg font-bold text-industrial-100">{lang.nativeName}</h3>
                      <p className="text-sm text-industrial-400">{lang.name}</p>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
