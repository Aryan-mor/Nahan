import { AnimatePresence, motion } from 'framer-motion';
import { Download, MoreVertical, Share, Shield, WifiOff, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';

export function PWAInstallPrompt() {
  const {
    isStandalone,
    deferredPrompt,
    installPWA,
    isInstallPromptVisible,
    setInstallPromptVisible,
  } = useAppStore();

  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Safer iOS detection that handles iPadOS 13+ (which reports as MacIntel)
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    setIsIOS(isIOSDevice);
  }, []);

  if (isStandalone || !isInstallPromptVisible) return null;

  const handleDismiss = () => {
    setInstallPromptVisible(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="bg-industrial-900 border border-industrial-700 rounded-t-2xl sm:rounded-xl p-6 max-w-sm w-full shadow-2xl relative"
        >
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-industrial-400 hover:text-industrial-200"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-industrial-800 rounded-xl p-2.5 shadow-inner">
              <img
                src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
                alt="Nahan Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-industrial-100">Install Nahan</h2>
              <p className="text-sm text-industrial-400">Secure. Fast. Private.</p>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="mt-1 p-1.5 bg-blue-500/10 rounded-lg">
                <WifiOff className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-industrial-200">Offline Access</h3>
                <p className="text-xs text-industrial-400 leading-relaxed">
                  Use Nahan even without internet.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 p-1.5 bg-green-500/10 rounded-lg">
                <Shield className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-industrial-200">Privacy</h3>
                <p className="text-xs text-industrial-400 leading-relaxed">
                  No browser history or URL bars.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 p-1.5 bg-purple-500/10 rounded-lg">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-industrial-200">Speed</h3>
                <p className="text-xs text-industrial-400 leading-relaxed">
                  Instant launch from your home screen.
                </p>
              </div>
            </div>
          </div>

          {/* iOS Instructions */}
          {isIOS ? (
            <div className="bg-industrial-800/50 rounded-lg p-4 border border-industrial-700/50">
              <p className="text-sm font-medium text-industrial-200 mb-3 text-center">
                To install on iOS:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-industrial-300">
                  <Share className="w-5 h-5 text-blue-400 shrink-0" />
                  <span>
                    Tap the <span className="font-bold text-industrial-100">Share</span> button
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-industrial-300">
                  <div className="w-5 h-5 flex items-center justify-center border border-industrial-500 rounded text-[10px] font-bold">
                    +
                  </div>
                  <span>
                    Select{' '}
                    <span className="font-bold text-industrial-100">'Add to Home Screen'</span>
                  </span>
                </div>
              </div>
            </div>
          ) : deferredPrompt ? (
            /* Native Install Button */
            <button
              onClick={installPWA}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-900/20 active:scale-95"
            >
              <Download className="w-4 h-4" />
              Install Now
            </button>
          ) : (
            /* Android/Browser Menu Instructions */
            <div className="bg-industrial-800/50 rounded-lg p-4 border border-industrial-700/50">
              <p className="text-sm font-medium text-industrial-200 mb-3 text-center">
                To install on your device:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-industrial-300">
                  <MoreVertical className="w-5 h-5 text-industrial-400 shrink-0" />
                  <span>
                    Tap the <span className="font-bold text-industrial-100">Menu</span> button (3
                    dots)
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-industrial-300">
                  <Download className="w-5 h-5 text-industrial-400 shrink-0" />
                  <span>
                    Select <span className="font-bold text-industrial-100">'Install App'</span> or{' '}
                    <span className="font-bold text-industrial-100">'Add to Home Screen'</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleDismiss}
            className="w-full mt-3 py-2 text-xs font-medium text-industrial-500 hover:text-industrial-300 transition-colors"
          >
            Maybe later
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
