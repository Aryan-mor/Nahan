import { useState, useEffect } from 'react';
import { X, Download, Share, PlusSquare } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';
import { motion, AnimatePresence } from 'framer-motion';

export function PWAInstallPrompt() {
  const { isStandalone, deferredPrompt, installPWA, isInstallPromptVisible, dismissInstallPrompt } = usePWA();
  const [isIOS, setIsIOS] = useState(false);
  const [showRibbon, setShowRibbon] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);
    
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed && !isStandalone) {
      setShowRibbon(true);
    }
  }, [isStandalone]);

  if (isStandalone) return null;

  // Initial Welcome Modal
  const showModal = (isInstallPromptVisible || (isIOS && !localStorage.getItem('pwa-install-dismissed')));

  const handleDismiss = () => {
    dismissInstallPrompt();
    localStorage.setItem('pwa-install-dismissed', 'true');
    setShowRibbon(true);
  };

  return (
    <>
      <AnimatePresence>
        {showModal && !showRibbon && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-industrial-900 border border-industrial-700 rounded-xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-industrial-800 rounded-lg p-2">
                    <img src="/pwa-192x192.png" alt="Nahan Logo" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-industrial-100">Install Nahan</h2>
                    <p className="text-xs text-industrial-400">Secure Messenger</p>
                  </div>
                </div>
                <button onClick={handleDismiss} className="text-industrial-400 hover:text-industrial-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <p className="text-sm text-industrial-300">
                  Install Nahan for the best experience:
                </p>
                <ul className="space-y-2 text-sm text-industrial-400">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    Offline access
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    Faster load times
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    Full screen experience
                  </li>
                </ul>
              </div>

              {deferredPrompt && (
                <button
                  onClick={installPWA}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Install App
                </button>
              )}

              {isIOS && (
                <div className="space-y-3 bg-industrial-800/50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-industrial-200">To install on iOS:</p>
                  <div className="flex items-center gap-3 text-xs text-industrial-400">
                    <Share className="w-4 h-4 text-blue-400" />
                    <span>1. Tap the Share button</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-industrial-400">
                    <PlusSquare className="w-4 h-4 text-blue-400" />
                    <span>2. Select "Add to Home Screen"</span>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent Ribbon */}
      <AnimatePresence>
        {showRibbon && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-20 right-4 z-40 md:bottom-4"
          >
            <button
              onClick={() => {
                setShowRibbon(false);
                dismissInstallPrompt(); // Reset state
                localStorage.removeItem('pwa-install-dismissed'); // Show modal again
                // Or just install directly if possible
                if (deferredPrompt) installPWA();
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Install Nahan
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
