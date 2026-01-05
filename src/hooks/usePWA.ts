/* eslint-disable max-lines-per-function */
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

export function usePWA() {
  const {
    setDeferredPrompt,
    setStandalone,
    setInstallPromptVisible,
    isStandalone: _isStandalone
  } = useUIStore();

  const {
    needRefresh: [needRefresh, _setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      logger.info(`Service Worker at: ${swUrl}`);
      // Check for updates every hour
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    // Check if standalone
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone ||
        document.referrer.includes('android-app://');

      setStandalone(!!isStandaloneMode);
    };

    checkStandalone();
    window.addEventListener('resize', checkStandalone);

    // Don't show install prompt in dev mode
    if (!import.meta.env.DEV) {
    // Check iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    if (isIOS) {
       const dismissed = localStorage.getItem('pwa-install-dismissed');
       const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone ||
        document.referrer.includes('android-app://');

       if (!isStandaloneMode && !dismissed) {
         setInstallPromptVisible(true);
       }
    }

    // Check Android - Ensure modal shows up even if beforeinstallprompt doesn't fire immediately
    const isAndroid = /Android/.test(navigator.userAgent);
    if (isAndroid) {
       const dismissed = localStorage.getItem('pwa-install-dismissed');
       const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone ||
        document.referrer.includes('android-app://');

       if (!isStandaloneMode && !dismissed) {
         // Small delay to prioritize the native event if it fires
         setTimeout(() => {
           if (!useUIStore.getState().isInstallPromptVisible) {
             setInstallPromptVisible(true);
           }
         }, 2000);
        }
       }
    }

    // Handle beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDeferredPrompt(e as any);
      // Don't show install prompt in dev mode
      if (!import.meta.env.DEV) {
      // Only show if not already standalone and not dismissed
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      // We need to check current state of isStandalone, but we have it in dependency or use getState
      if (!useUIStore.getState().isStandalone && !dismissed) {
        setInstallPromptVisible(true);
        }
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('resize', checkStandalone);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setStandalone, setDeferredPrompt, setInstallPromptVisible]);

  return {
    needRefresh,
    updateServiceWorker,
  };
}
