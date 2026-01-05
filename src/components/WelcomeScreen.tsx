import { Button } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Shield, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../stores/uiStore';

export function WelcomeScreen({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const { installPWA, deferredPrompt, isStandalone } = useUIStore();

  const handleStartNow = () => {
    onDismiss();
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      await installPWA();
      // Wait for install interaction or just dismiss?
      // Typically if they install, we might want to let them continue or wait.
      // But for now, let's dismiss the welcome screen so they proceed to PIN creation.
      onDismiss();
    } else {
      // Open the existing install modal
      useUIStore.getState().setInstallPromptVisible(true);
      onDismiss();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-industrial-950/95 backdrop-blur-md p-4"
      >
        <div className="max-w-md w-full flex flex-col items-center text-center space-y-8">
          {/* Logo / Branding */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="w-24 h-24 bg-industrial-800 rounded-2xl p-4 shadow-2xl border border-industrial-700"
          >
            <img
              src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
              alt="Nahan Logo"
              className="w-full h-full object-contain"
            />
          </motion.div>

          {/* Welcome Text */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="space-y-3"
          >
            <h1 className="text-3xl font-bold text-industrial-100">Welcome to Nahan</h1>
            <p className="text-industrial-400 text-lg">Secure. Private. Offline-first.</p>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="grid grid-cols-1 gap-4 w-full"
          >
            <div className="flex items-center gap-4 bg-industrial-900/50 p-4 rounded-xl border border-industrial-800">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-industrial-200">End-to-End Encrypted</h3>
                <p className="text-xs text-industrial-400">
                  Your messages never leave your device unencrypted.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-industrial-900/50 p-4 rounded-xl border border-industrial-800">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Zap className="w-6 h-6 text-green-400" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-industrial-200">Completely Offline</h3>
                <p className="text-xs text-industrial-400">
                  No data is ever sent to any server. Your privacy is absolute.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Actions */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="w-full space-y-4 pt-4"
          >
            {!isStandalone ? (
              <>
                <Button
                  size="lg"
                  className="w-full font-bold text-lg h-auto py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] transition-all duration-300 transform hover:scale-105 active:scale-95 tracking-wide border-none"
                  onPress={handleInstall}
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

                <button
                  onClick={handleStartNow}
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
                onPress={handleStartNow}
              >
                Start Now
              </Button>
            )}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
