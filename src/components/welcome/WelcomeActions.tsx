import { Button } from '@heroui/react';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useUIStore } from '../../stores/uiStore';

interface WelcomeActionsProps {
  onStart: () => void;
  onInstall: () => void;
}

// Sub-components to reduce main function size
const InstallButton = ({ onInstall, t }: { onInstall: () => void; t: (key: string) => string }) => (
  <Button
    size="lg"
    className="w-full font-bold text-lg h-auto py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] transition-all duration-300 transform hover:scale-105 active:scale-95 tracking-wide border-none"
    onPress={onInstall}
    data-testid="welcome-install-button"
  >
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        <Download className="w-5 h-5" />
        <span>{t('pwa.install.add_to_home')}</span>
      </div>
      <span className="text-xs font-normal text-indigo-100/80">
        {t('pwa.install.instant_install')}
      </span>
    </div>
  </Button>
);

export function WelcomeActions({ onStart, onInstall }: WelcomeActionsProps) {
  const { t } = useTranslation();
  const { isStandalone } = useUIStore();

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="w-full space-y-4 pt-4"
    >
      {!isStandalone ? (
        <>
          <InstallButton onInstall={onInstall} t={t} />
          <button
            onClick={onStart}
            data-testid="welcome-start-button"
            className="text-industrial-400 hover:text-industrial-200 transition-colors text-sm w-full py-2 hover:underline"
          >
            {t('pwa.install.continue_browser')}
          </button>
        </>
      ) : (
        <Button
          size="lg"
          color="primary"
          className="w-full font-bold text-lg h-14 shadow-lg shadow-blue-900/20"
          onPress={onStart}
          data-testid="welcome-start-button"
        >
          {t('welcome.start')}
        </Button>
      )}
    </motion.div>
  );
}
