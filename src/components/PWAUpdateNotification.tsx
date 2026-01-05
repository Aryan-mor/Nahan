import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { usePWA } from '../hooks/usePWA';

export function PWAUpdateNotification() {
  const { needRefresh, updateServiceWorker } = usePWA();
  const { t } = useTranslation();

  useEffect(() => {
    // We strictly avoid fetch() to maintain 100% offline compliance and avoid security scanner flags.
    // Detailed version info (changelog) is skipped in favor of a generic update message.
  }, [needRefresh]);

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
        >
          <div className="bg-industrial-800 border border-green-500/50 rounded-lg shadow-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between bg-industrial-800/90 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="bg-green-500/10 p-2 rounded-full">
                  <ShieldAlert className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-industrial-100">{t('pwa.update.title')}</h3>
                  <p className="text-xs text-industrial-400">{t('pwa.update.available_generic')}</p>
                </div>
              </div>
              <button
                onClick={() => updateServiceWorker(true)}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                {t('pwa.update.button')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
