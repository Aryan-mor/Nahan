import { HeroUIProvider } from '@heroui/react';
import { AnimatePresence } from 'framer-motion';
import { Lock, MessageSquare, Settings as SettingsIcon, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast, Toaster } from 'sonner';
import { ChatList } from './components/ChatList';
import { ClipboardPermissionPrompt } from './components/ClipboardPermissionPrompt';
import { DetectionModal } from './components/DetectionModal';
import { ChatView } from './components/ChatView';
import { KeyExchange } from './components/KeyExchange';
import { LanguageSelector } from './components/LanguageSelector';
import { LockScreen } from './components/LockScreen';
import { Onboarding } from './components/Onboarding';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { PWAUpdateNotification } from './components/PWAUpdateNotification';
import { Settings } from './components/Settings';
import { StealthModal } from './components/StealthModal';
import { useClipboardDetection, useClipboardPermission, DetectionResult } from './hooks/useClipboardDetection';
import { useOfflineSync } from './hooks/useOfflineSync';
import { usePWA } from './hooks/usePWA';
import { useAppStore } from './stores/appStore';
import { useUIStore } from './stores/uiStore';

type TabType = 'chats' | 'keys' | 'settings';

export default function App() {
  useOfflineSync();
  usePWA();

  const {
    initializeApp,
    isLoading,
    error,
    identity,
    activeChat,
    showStealthModal,
    setShowStealthModal,
    pendingStealthBinary,
    confirmStealthSend,
    sessionPassphrase,
    processIncomingMessage,
  } = useAppStore();

  const { language, isLocked, setLocked, activeTab, setActiveTab } = useUIStore();
  const { t, i18n } = useTranslation();

  // Clipboard permission management
  const clipboardPermission = useClipboardPermission();
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [clipboardDetectionEnabled, setClipboardDetectionEnabled] = useState(false);

  // Detection modal state
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [showDetectionModal, setShowDetectionModal] = useState(false);

  // Check if clipboard detection should be enabled
  useEffect(() => {
    // Only enable if:
    // 1. Permission is granted
    // 2. User is authenticated (has identity and passphrase)
    // 3. App is not locked
    const shouldEnable =
      clipboardPermission.state === 'granted' &&
      !isLocked &&
      !!identity &&
      !!sessionPassphrase;

    setClipboardDetectionEnabled(shouldEnable);

    // Show permission prompt if:
    // 1. Permission is not granted and not unsupported
    // 2. User is authenticated
    // 3. App is not locked
    // 4. We haven't shown it before (check localStorage)
    if (
      clipboardPermission.state !== 'granted' &&
      clipboardPermission.state !== 'unsupported' &&
      !isLocked &&
      !!identity &&
      !!sessionPassphrase &&
      !localStorage.getItem('clipboard-permission-prompt-shown')
    ) {
      // Show prompt after a short delay to avoid showing immediately on load
      const timer = setTimeout(() => {
        setShowPermissionPrompt(true);
        localStorage.setItem('clipboard-permission-prompt-shown', 'true');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [
    clipboardPermission.state,
    isLocked,
    identity,
    sessionPassphrase,
  ]);

  // Handle clipboard detection results
  const handleDetection = async (result: DetectionResult) => {
    // Safety check: Prevent showing modal for user's own identity
    if (result.type === 'id' && result.contactPublicKey && identity) {
      try {
        const { CryptoService } = await import('./services/crypto');
        const cryptoService = CryptoService.getInstance();
        const detectedFingerprint = await cryptoService.getFingerprint(result.contactPublicKey);

        // Compare with user's own fingerprint
        if (detectedFingerprint === identity.fingerprint) {
          // This is the user's own identity - silently ignore
          console.debug('App: Ignoring own identity detection');
          return;
        }
      } catch (error) {
        // If fingerprint generation fails, proceed with detection (fail-safe)
        console.debug('Failed to verify identity in handleDetection:', error);
      }
    }

    // Auto-import messages immediately in the background (silent import, no navigation)
    if (result.type === 'message' && result.encryptedData && result.contactFingerprint) {
      try {
        // Check for duplicate before processing
        const { storageService } = await import('./services/storage');
        const { sessionPassphrase } = useAppStore.getState();

        if (sessionPassphrase) {
          const isDuplicate = await storageService.messageExists(result.encryptedData, sessionPassphrase);
          if (isDuplicate) {
            // Message is a duplicate - silently ignore (no modal, no toast)
            console.debug('App: Ignoring duplicate message detection');
            return;
          }
        }

        // Auto-import the message silently (skipNavigation = true)
        await processIncomingMessage(result.encryptedData, result.contactFingerprint, true);

        // Show modal for user to decide when to navigate
        setDetectionResult(result);
        setShowDetectionModal(true);
      } catch (error) {
        // Check if it's a duplicate message error
        if (error instanceof Error && error.name === 'DuplicateMessageError') {
          // Duplicate message - silently ignore (no modal, no toast)
          console.debug('App: Ignoring duplicate message (caught in processIncomingMessage)');
          return;
        }

        console.error('Failed to auto-import message:', error);
        // Show error toast but still show modal for manual retry
        toast.error('Failed to import message. Please try again.');
        setDetectionResult(result);
        setShowDetectionModal(true);
      }
    } else {
      // For ID packets, just show modal
      setDetectionResult(result);
      setShowDetectionModal(true);
    }
  };

  // Enable clipboard detection when conditions are met
  useClipboardDetection(clipboardDetectionEnabled, handleDetection);

  useEffect(() => {
    if (language) {
      i18n.changeLanguage(language);
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    }
  }, [language, i18n]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  // !!! LOG APP: Check StealthModal presence
  useEffect(() => {
    const checkModal = () => {
      const modal = document.querySelector('[data-slot="base"]') || document.querySelector('.stealth-modal');
      console.log("!!! LOG APP: App rendered. StealthModal presence:", !!modal, "showStealthModal state:", showStealthModal);
    };
    checkModal();
    // Check again after a short delay to catch async renders
    const timer = setTimeout(checkModal, 100);
    return () => clearTimeout(timer);
  }, [showStealthModal]);

  const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const startLockTimer = () => {
      if (lockTimeoutRef.current) return;

      lockTimeoutRef.current = setTimeout(() => {
        if (identity) {
          setLocked(true);
        }
        lockTimeoutRef.current = null;
      }, 60000); // 1 minute
    };

    const cancelLockTimer = () => {
      if (lockTimeoutRef.current) {
        clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        startLockTimer();
      } else {
        cancelLockTimer();
      }
    };

    window.addEventListener('blur', startLockTimer);
    window.addEventListener('focus', cancelLockTimer);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', startLockTimer);
      window.removeEventListener('focus', cancelLockTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelLockTimer();
    };
  }, [identity, setLocked]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-industrial-950 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-industrial-400 mx-auto mb-4"></div>
            <p className="text-industrial-300">{t('app.initializing')}</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen bg-industrial-950 flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-400 mb-4">
              <Lock className="h-16 w-16 mx-auto" />
            </div>
            <h1 className="text-2xl font-bold text-industrial-100 mb-2">{t('app.error.title')}</h1>
            <p className="text-industrial-300">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-industrial-700 hover:bg-industrial-600 text-white rounded-lg transition-colors"
            >
              {t('app.error.retry')}
            </button>
          </div>
        </div>
      );
    }

    // Show Language Selector if no language is set
    if (!language) {
      return <LanguageSelector />;
    }

    // Show Onboarding if no identity exists
    if (!identity) {
      return <Onboarding />;
    }

    // Show Lock Screen if locked and identity exists
    if (isLocked) {
      return <LockScreen />;
    }

    const tabs = [
      { id: 'chats' as TabType, label: t('app.nav.chats'), icon: MessageSquare },
      { id: 'keys' as TabType, label: t('app.nav.keys'), icon: Users },
      { id: 'settings' as TabType, label: t('app.nav.settings'), icon: SettingsIcon },
    ];

    return (
      <div className="min-h-screen bg-industrial-950 text-industrial-100 flex flex-col relative overflow-hidden">
        <PWAInstallPrompt />
        <PWAUpdateNotification />

        {/* Global Stealth Modal */}
        {showStealthModal && (
          <StealthModal
            isOpen={showStealthModal}
            onOpenChange={() => setShowStealthModal(!showStealthModal)}
            pendingBinary={pendingStealthBinary}
            onConfirm={confirmStealthSend}
          />
        )}

        {/* Clipboard Permission Prompt */}
        <ClipboardPermissionPrompt
          isOpen={showPermissionPrompt}
          onClose={() => setShowPermissionPrompt(false)}
          onPermissionGranted={() => {
            setClipboardDetectionEnabled(true);
            setShowPermissionPrompt(false);
          }}
        />

        {/* Detection Modal */}
        {detectionResult && (
          <DetectionModal
            isOpen={showDetectionModal}
            onClose={() => {
              setShowDetectionModal(false);
              setDetectionResult(null);
            }}
            type={detectionResult.type}
            contactName={detectionResult.contactName}
            contactPublicKey={detectionResult.contactPublicKey}
            contactFingerprint={detectionResult.contactFingerprint}
            encryptedData={detectionResult.encryptedData}
          />
        )}

        {/* Full Screen Chat View Overlay */}
        <AnimatePresence>{activeChat && <ChatView />}</AnimatePresence>

        {/* Header (Hidden if ChatView is active - though ChatView covers it anyway) */}
        <header className="bg-industrial-900 border-b border-industrial-800 px-4 py-3 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-industrial-800 rounded-lg flex items-center justify-center overflow-hidden border border-industrial-700">
                <img
                  src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
                  alt="Nahan"
                  className="w-full h-full object-cover"
                />
              </div>
              <h1 className="text-xl font-bold text-industrial-100">{t('app.title')}</h1>
              <span className="text-xs text-industrial-400 bg-industrial-800 px-2 py-1 rounded hidden sm:inline-block">
                {t('app.subtitle')}
              </span>
            </div>
            <div className="text-xs sm:text-sm text-industrial-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="hidden sm:inline">{t('app.encrypted_locally')}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row max-w-6xl mx-auto w-full overflow-hidden">
          {/* Desktop Sidebar Navigation */}
          <nav className="hidden md:block w-64 shrink-0 bg-industrial-900 border-e border-industrial-800 min-h-[calc(100vh-64px)] p-4 sticky top-[64px] h-[calc(100vh-64px)] overflow-y-auto">
            <div className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-start transition-colors ${
                      activeTab === tab.id
                        ? 'bg-industrial-700 text-industrial-100'
                        : 'text-industrial-400 hover:bg-industrial-800 hover:text-industrial-200'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Security Notice */}
            <div className="mt-8 p-3 bg-industrial-800 border border-industrial-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">
                  {t('app.security.secure')}
                </span>
              </div>
              <p className="text-xs text-industrial-400">{t('app.security.notice')}</p>
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1 flex flex-col h-[calc(100vh-64px-64px)] md:h-[calc(100vh-64px)] w-full relative">
            {activeTab === 'chats' && <ChatList onNewChat={() => setActiveTab('keys')} />}
            {activeTab === 'keys' && (
              <div className="p-4 md:p-6 overflow-y-auto h-full">
                <KeyExchange defaultTab="contacts" />
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="p-4 md:p-6 overflow-y-auto h-full">
                <Settings />
              </div>
            )}
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-industrial-900 border-t border-industrial-800 z-40 safe-area-pb">
          <div className="flex justify-around items-center h-16 px-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center w-full h-full gap-1 ${
                    isActive
                      ? 'text-industrial-100'
                      : 'text-industrial-500 hover:text-industrial-300'
                  }`}
                >
                  <div className={`p-1.5 rounded-full ${isActive ? 'bg-industrial-700' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    );
  };

  return (
    <HeroUIProvider>
      {renderContent()}
      <Toaster
        position="top-center"
        theme="dark"
        richColors
        style={{
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #334155',
        }}
      />
    </HeroUIProvider>
  );
}
