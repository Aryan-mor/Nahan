import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAppStore } from '../stores/appStore';

export function usePWA() {
  const {
    setDeferredPrompt,
    setStandalone,
    setInstallPromptVisible,
    isStandalone
  } = useAppStore();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log(`Service Worker at: ${swUrl}`);
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
        (window.navigator as any).standalone ||
        document.referrer.includes('android-app://');
      
      setStandalone(!!isStandaloneMode);
    };

    checkStandalone();
    window.addEventListener('resize', checkStandalone);

    // Check iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS) {
       const dismissed = localStorage.getItem('pwa-install-dismissed');
       // We need to wait for checkStandalone to update store? No, we can check logic directly
       // But checkStandalone is async? No, it's sync.
       // However, setStandalone updates the store which might not be immediate for getState? 
       // setStandalone is sync in Zustand usually but let's rely on the local check
       const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone ||
        document.referrer.includes('android-app://');
       
       if (!isStandaloneMode && !dismissed) {
         setInstallPromptVisible(true);
       }
    }

    // Handle beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show if not already standalone and not dismissed
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      // We need to check current state of isStandalone, but we have it in dependency or use getState
      if (!useAppStore.getState().isStandalone && !dismissed) {
        setInstallPromptVisible(true);
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
