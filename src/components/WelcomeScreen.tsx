import { AnimatePresence, motion } from 'framer-motion';

import { useUIStore } from '../stores/uiStore';

import { WelcomeActions } from './welcome/WelcomeActions';
import { WelcomeFeatures } from './welcome/WelcomeFeatures';
import { WelcomeHeader } from './welcome/WelcomeHeader';

export function WelcomeScreen({ onDismiss }: { onDismiss: () => void }) {
  const { installPWA, deferredPrompt } = useUIStore();

  const handleStartNow = () => {
    onDismiss();
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      await installPWA();
      onDismiss();
    } else {
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
          <WelcomeHeader />
          <WelcomeFeatures />
          <WelcomeActions onStart={handleStartNow} onInstall={handleInstall} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
