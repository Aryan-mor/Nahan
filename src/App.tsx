/* eslint-disable max-lines, no-console */
/* eslint-disable max-lines-per-function */
import { Avatar, Button, HeroUIProvider, useDisclosure } from '@heroui/react';
import { AnimatePresence } from 'framer-motion';
import {
  Download,
  FileUser,
  Lock,
  MessageSquare,
  QrCode,
  Settings as SettingsIcon,
  Users
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast, Toaster } from 'sonner';

import { BiometricPromptModal } from './components/BiometricPromptModal';
import { ChatList } from './components/ChatList';
import { ChatView } from './components/ChatView';
import { ClipboardPermissionPrompt } from './components/ClipboardPermissionPrompt';
import { DetectionModal } from './components/DetectionModal';
import { KeyExchange } from './components/KeyExchange';
import { LanguageSelector } from './components/LanguageSelector';
import { LockScreen } from './components/LockScreen';
import { ManualPasteModal } from './components/ManualPasteModal';
import { MyQRModal } from './components/MyQRModal';
import { NewMessageModal } from './components/NewMessageModal';
import { Onboarding } from './components/Onboarding';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { PWAUpdateNotification } from './components/PWAUpdateNotification';
import { Settings } from './components/Settings';
import { UnifiedStealthDrawer } from './components/stealth/UnifiedStealthDrawer';
import { WelcomeScreen } from './components/WelcomeScreen';
import {
  DetectionResult,
  useClipboardDetection,
  useClipboardPermission,
} from './hooks/useClipboardDetection';
import { useOfflineSync } from './hooks/useOfflineSync';
import { usePWA } from './hooks/usePWA';
import { formatNahanIdentity } from './services/stealthId';
import { useAppStore } from './stores/appStore';
import { useUIStore } from './stores/uiStore';
import * as logger from './utils/logger';

const PerfHUD = lazy(() => import('./components/dev/PerfHUD').then(module => ({ default: module.PerfHUD })));

type TabType = 'chats' | 'keys' | 'settings';

export default function App() {
  // [PERF] Re-render counter for telemetry
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  console.log(`[PERF][RENDER] App - Render Count: ${renderCountRef.current} - Time: ${performance.now().toFixed(2)}ms`);

  useOfflineSync();
  usePWA();

  // GLOBAL CLEANUP: Handle tab close events
  useEffect(() => {
    const handleUnload = () => {
       import('./services/workerService').then(({ workerService }) => {
           workerService.terminate();
       }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      // CRITICAL FIX: Do NOT call handleUnload() here.
      // React StrictMode or HMR will unmount App causing the global singleton
      // workerService to be terminated while the app is still running.
      // We only want to terminate when the *window* unloads.
    };
  }, []);

  // ATOMIC SELECTORS: Each selector only re-renders when its specific state changes
  const initializeApp = useAppStore(state => state.initializeApp);
  const isLoading = useAppStore(state => state.isLoading);
  const error = useAppStore(state => state.error);
  const identity = useAppStore(state => state.identity);
  const activeChat = useAppStore(state => state.activeChat);
  const showStealthModal = useAppStore(state => state.showStealthModal);
  const setShowStealthModal = useAppStore(state => state.setShowStealthModal);
  const sessionPassphrase = useAppStore(state => state.sessionPassphrase);
  const setActiveChat = useAppStore(state => state.setActiveChat);
  const handleUniversalInput = useAppStore(state => state.handleUniversalInput);

  // ATOMIC SELECTORS for UI Store
  const language = useUIStore(state => state.language);
  const isLocked = useUIStore(state => state.isLocked);
  const setLocked = useUIStore(state => state.setLocked);
  const activeTab = useUIStore(state => state.activeTab);
  const setActiveTab = useUIStore(state => state.setActiveTab);
  const camouflageLanguage = useUIStore(state => state.camouflageLanguage);
  const isStandalone = useUIStore(state => state.isStandalone);
  const deferredPrompt = useUIStore(state => state.deferredPrompt);
  const setInstallPromptVisible = useUIStore(state => state.setInstallPromptVisible);

  // [PERF] Selector stability telemetry - track which selectors are changing
  console.log(`[PERF][RENDER] App - Selectors: { identity: ${!!identity}, activeChat: ${activeChat?.fingerprint || 'null'}, isLocked: ${isLocked}, isLoading: ${isLoading} }`);

  const { t, i18n } = useTranslation();

  // Update document direction based on language
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === 'fa' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  // Welcome Screen State
  const [welcomeDismissed, setWelcomeDismissed] = useState(
    () => localStorage.getItem('welcome-screen-dismissed') === 'true',
  );

  // Back Button Control
  const isPopState = useRef(false);
  const isProgrammaticBack = useRef(false);
  const prevActiveChat = useRef(activeChat);
  const prevShowStealthModal = useRef(showStealthModal);

  // Handle popstate (Browser Back Button)
  useEffect(() => {
    const handlePopState = () => {
      // Ignore if we triggered the back action programmatically
      if (isProgrammaticBack.current) {
        isProgrammaticBack.current = false;
        return;
      }

      // Priority: Stealth Modal > Active Chat
      if (showStealthModal) {
        isPopState.current = true;
        setShowStealthModal(false);
        return;
      }
      if (activeChat) {
        isPopState.current = true;
        setActiveChat(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeChat, showStealthModal, setActiveChat, setShowStealthModal]);

  // Handle state changes (Push/Pop history)
  useEffect(() => {
    const isChatOpening = !prevActiveChat.current && activeChat;
    const isModalOpening = !prevShowStealthModal.current && showStealthModal;

    const isChatClosing = prevActiveChat.current && !activeChat;
    const isModalClosing = prevShowStealthModal.current && !showStealthModal;

    if (isChatOpening || isModalOpening) {
      window.history.pushState({ modalOpen: true }, '');
    }

    if ((isChatClosing || isModalClosing) && !isPopState.current) {
      // If closed manually (UI button), sync history
      if (window.history.state?.modalOpen) {
        isProgrammaticBack.current = true;
        window.history.back();
      }
    }

    // Reset and update refs
    isPopState.current = false;
    prevActiveChat.current = activeChat;
    prevShowStealthModal.current = showStealthModal;
  }, [activeChat, showStealthModal]);

  // QR Modal
  const qrModal = useDisclosure();
  // Manual Paste Modal
  const manualPasteModal = useDisclosure();

  // Clipboard permission management
  const clipboardPermission = useClipboardPermission();
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [clipboardDetectionEnabled, setClipboardDetectionEnabled] = useState(false);

  // Detection modal state
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [showDetectionModal, setShowDetectionModal] = useState(false);

  // New message modal state
  const [newMessageResult, setNewMessageResult] = useState<{
    type: 'message';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  } | null>(null);

  const [showNewMessageModal, setShowNewMessageModal] = useState(false);

  // Biometric Prompt State
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const isBiometricsEnabled = useAppStore(state => state.isBiometricsEnabled);
  const isBiometricsSupported = useAppStore(state => state.isBiometricsSupported);
  const enableBiometrics = useAppStore(state => state.enableBiometrics);

  // Show biometric prompt after unlock if supported but not enabled
  useEffect(() => {
    logger.debug('[Biometrics] Checking prompt conditions:', {
        isLocked,
        hasIdentity: !!identity,
        hasPassphrase: !!sessionPassphrase,
        isSupported: isBiometricsSupported,
        isEnabled: isBiometricsEnabled,
        dismissed: localStorage.getItem('biometric_onboarding_dismissed') === 'true',
        checkResult: (!isLocked && identity && sessionPassphrase && isBiometricsSupported && !isBiometricsEnabled && localStorage.getItem('biometric_onboarding_dismissed') !== 'true')
    });

    if (
        !isLocked &&
        identity &&
        sessionPassphrase &&
        isBiometricsSupported &&
        !isBiometricsEnabled &&
        localStorage.getItem('biometric_onboarding_dismissed') !== 'true'
    ) {
      logger.debug('[Biometrics] Scheduling prompt...');
      const timer = setTimeout(() => {
        logger.debug('[Biometrics] Showing ONBOARDING prompt now');
        setShowBiometricPrompt(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLocked, identity, sessionPassphrase, isBiometricsSupported, isBiometricsEnabled]);

  const handleEnableBiometrics = async () => {
    try {
       const success = await enableBiometrics();
       if (success) {
          toast.success(t('biometric.enabled', 'Biometric unlock enabled'));
          setShowBiometricPrompt(false);
       } else {
          toast.error(t('biometric.enable_failed', 'Failed to enable biometrics'));
       }
    } catch (e) {
       console.error('Biometric enable error:', e);
       toast.error(t('biometric.enable_failed', 'Failed to enable biometrics'));
    }
  };

  const handleDeclineBiometrics = () => {
    localStorage.setItem('biometric_onboarding_dismissed', 'true');
    setShowBiometricPrompt(false);
    toast.info(t('biometric.decline_tip', 'You can always enable biometrics in Settings'));
  };

  // Check if clipboard detection should be enabled
  useEffect(() => {
    // Only enable if:
    // 1. Permission is granted
    // 2. User is authenticated (has identity and passphrase)
    // 3. App is not locked
    const shouldEnable =
      clipboardPermission.state === 'granted' && !isLocked && !!identity && !!sessionPassphrase;

    setClipboardDetectionEnabled(shouldEnable);

    // Show permission prompt if:
    // 1. Permission is not granted and not unsupported
    // 2. User is authenticated
    // 3. App is not locked
    // 4. We haven't shown it before (check localStorage)
    // 5. Browser is likely to support it (Chromium-based, not Firefox)
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    const isChromium = 'chrome' in window;

    if (
      clipboardPermission.state !== 'granted' &&
      clipboardPermission.state !== 'unsupported' &&
      !isLocked &&
      !!identity &&
      !!sessionPassphrase &&
      !localStorage.getItem('clipboard-permission-prompt-shown') &&
      !isFirefox &&
      isChromium
    ) {
      // Show prompt after a short delay to avoid showing immediately on load
      const timer = setTimeout(() => {
        setShowPermissionPrompt(true);
        localStorage.setItem('clipboard-permission-prompt-shown', 'true');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [clipboardPermission.state, isLocked, identity, sessionPassphrase]);

  // STABLE REFS for Handlers (Prevent Hook Thrashing)
  const identityRef = useRef(identity);
  const showDetectionModalRef = useRef(showDetectionModal);
  const detectionResultRef = useRef(detectionResult);
  const showNewMessageModalRef = useRef(showNewMessageModal);
  const newMessageResultRef = useRef(newMessageResult);

  useEffect(() => {
    identityRef.current = identity;
    showDetectionModalRef.current = showDetectionModal;
    detectionResultRef.current = detectionResult;
    showNewMessageModalRef.current = showNewMessageModal;
    newMessageResultRef.current = newMessageResult;
  }, [identity, showDetectionModal, detectionResult, showNewMessageModal, newMessageResult]);

  // Handle clipboard detection results - STABILIZED (No dependencies)
  const handleDetection = useCallback(async (result: DetectionResult) => {
    console.log(`[PERF][TRACE] 6. App.tsx received detection result: ${result.contactFingerprint}`);

    // Access state via Refs or Store getter to keep handler stable
    const _identity = identityRef.current;
    const _showDetectionModal = showDetectionModalRef.current;
    const _detectionResult = detectionResultRef.current;

    // DUPLICATE PREVENTION: If modal is already open for same fingerprint, ignore
    if (_showDetectionModal && _detectionResult?.contactFingerprint === result.contactFingerprint) {
      logger.debug('App: Ignoring duplicate detection - modal already open');
      return;
    }

    // Safety check: Prevent showing modal for user's own identity
    // CRITICAL: Only block if fingerprint matches exactly - don't accidentally block valid new contacts
    if (result.type === 'id' && result.contactPublicKey && _identity) {
      try {
        const { CryptoService } = await import('./services/crypto');
        const cryptoService = CryptoService.getInstance();
        const detectedFingerprint = await cryptoService.getFingerprint(result.contactPublicKey);

        // Compare with user's own fingerprint - only block if exact match
        if (detectedFingerprint === _identity.fingerprint) {
          // This is the user's own identity - silently ignore
          logger.debug('App: Ignoring own identity detection');
          return;
        }
        // If fingerprints don't match, proceed with detection (valid new contact)
      } catch (error) {
        // If fingerprint generation fails, proceed with detection (fail-safe)
        // This ensures valid contacts aren't accidentally blocked
        logger.debug(
          'Failed to verify identity in handleDetection, proceeding with detection:',
          error,
        );
      }
    }

    // Auto-import messages immediately in the background (silent import, no navigation)
    if (result.type === 'message' && result.encryptedData && result.contactFingerprint) {
      try {
        // Check for duplicate before processing
        const { storageService } = await import('./services/storage');
        const { sessionPassphrase } = useAppStore.getState();

        if (sessionPassphrase) {
          const duplicate = await storageService.findDuplicateMessage(
            result.encryptedData,
            sessionPassphrase,
          );
          if (duplicate) {
            // SILENT SKIP: Duplicate messages from background clipboard checks should NOT show modals
            // This prevents annoying "Duplicate message" popups when user switches tabs
            logger.debug('App: Duplicate message detected - silently ignoring (background check)');
            return;
          }
        }

        // Message is already imported by the detection service (via handleUniversalInput)
        // We just need to show the modal

        // Show modal for user to decide when to navigate
        setDetectionResult(result);
        console.log(`[PERF][TRACE] 7. Setting modal state: DetectionModal to true`);
        setShowDetectionModal(true);
      } catch (error) {
        // Check if it's a duplicate message error
        if (error instanceof Error && error.name === 'DuplicateMessageError') {
          // Duplicate message - silently ignore (no modal, no toast)
          logger.debug('App: Ignoring duplicate message (caught in processIncomingMessage)');
          return;
        }

        logger.error('Failed to auto-import message:', error);
        // Show error toast but still show modal for manual retry
        toast.error('Failed to import message. Please try again.');
        setDetectionResult(result);
        console.log(`[PERF][TRACE] 7. Setting modal state: DetectionModal to true`);
        setShowDetectionModal(true);
      }
    } else {
      // For ID packets, just show modal
      setDetectionResult(result);
      console.log(`[PERF][TRACE] 7. Setting modal state: DetectionModal to true`);
      setShowDetectionModal(true);
    }
  }, []); // STABLE: Empty dependency array guarantees hook never re-inits

  /**
   * Handle manual paste from the top header
   */
  const handleManualPaste = async () => {
    // MANUAL PASTE: When user manually clicks paste code
    // This uses navigator.clipboard.readText() which requires prompt if not granted
    // Then it calls handleUniversalInput
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        toast.error('Clipboard is empty');
        return;
      }

      try {
         // handleUniversalInput handles everything: parsing, decrypting, storing
         const result = await handleUniversalInput(text, undefined, true);
         if (result && result.type === 'message') {
            // Success - show manual paste modal populated?
            // Or just navigate?
            // Current flow usually shows ManualPasteModal or toast
            // For now, let's toast success or show detection logic if appropriate
            toast.success('Message imported successfully');
         }
      } catch (err) {
         logger.error('Manual paste failed:', err);
         toast.error('Invalid code or message');
         manualPasteModal.onOpen(); // Fallback to manual entry
      }

    } catch (err) {
      if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
         toast.error('Clipboard permission denied');
      } else {
         manualPasteModal.onOpen();
      }
    }
  };



  // Handle new message from clipboard detection - STABILIZED
  const handleNewMessage = useCallback((result: {
    type: 'message';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  }) => {
    console.log(`[PERF][TRACE] 6. App.tsx received detection result: ${result.fingerprint}`);
    const _showNewMessageModal = showNewMessageModalRef.current;
    const _newMessageResult = newMessageResultRef.current;

    // DUPLICATE PREVENTION: If modal is already open for same fingerprint, ignore
    if (_showNewMessageModal && _newMessageResult?.fingerprint === result.fingerprint) {
      logger.debug('App: Ignoring duplicate new message - modal already open');
      return;
    }

    // UNIFICATION: Use NewMessageModal for messages to ensure consistent UI and testability
    setNewMessageResult({
      type: 'message',
      fingerprint: result.fingerprint,
      isBroadcast: result.isBroadcast,
      senderName: result.senderName,
    });
    console.log(`[PERF][TRACE] 7. Setting modal state: NewMessageModal to true`);
    setShowNewMessageModal(true);
  }, []); // STABLE: Empty dependency array guarantees hook never re-inits

  const handleCopyIdentity = async () => {
    if (!identity) return;
    try {
      const data = formatNahanIdentity(identity, camouflageLanguage || 'fa');
      await navigator.clipboard.writeText(data);
      toast.success('Identity copied to clipboard');
    } catch {
      toast.error('Failed to copy identity');
    }
  };

  // Enable clipboard detection when conditions are met
  useClipboardDetection(clipboardDetectionEnabled, handleDetection, handleNewMessage);

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
      const modal =
        document.querySelector('[data-slot="base"]') || document.querySelector('.stealth-modal');
      logger.debug(
        '!!! LOG APP: App rendered. StealthModal presence:',
        !!modal,
        'showStealthModal state:',
        showStealthModal,
      );
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

      console.log(`[PERF][Security] startLockTimer triggered at ${performance.now().toFixed(2)}ms`);
      // Lock timeout: 5 minutes in dev mode, 1 minute in production
      const lockTimeout = import.meta.env.DEV ? 300000 : 60000; // 5 minutes : 1 minute

      lockTimeoutRef.current = setTimeout(() => {
        if (identity) {
          console.log(`[PERF][Security] Lock timeout exceeded at ${performance.now().toFixed(2)}ms, locking app`);
          setLocked(true);
        }
        lockTimeoutRef.current = null;
      }, lockTimeout);
    };

    const cancelLockTimer = () => {
      if (lockTimeoutRef.current) {
        console.log(`[PERF][Security] cancelLockTimer triggered at ${performance.now().toFixed(2)}ms`);
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

    // Show Welcome Screen if not dismissed and user hasn't created an identity yet
    // This comes AFTER language selection but BEFORE Onboarding (PIN creation)
    if (!identity && !welcomeDismissed && !isStandalone) {
      return (
        <WelcomeScreen
          onDismiss={() => {
            localStorage.setItem('welcome-screen-dismissed', 'true');
            setWelcomeDismissed(true);
          }}
        />
      );
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
        {(import.meta.env.DEV || localStorage.getItem('nahan_force_perf_hud') === 'true') && (
          <Suspense fallback={null}>
             <PerfHUD />
          </Suspense>
        )}
        <PWAInstallPrompt />
        <PWAUpdateNotification />

        {/* Global Stealth Drawer */}
        <UnifiedStealthDrawer />

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

        {/* New Message Modal */}
        {newMessageResult && (
          <NewMessageModal
            isOpen={showNewMessageModal}
            onClose={() => {
              setShowNewMessageModal(false);
              setNewMessageResult(null);
            }}
            senderName={newMessageResult.senderName}
            senderFingerprint={newMessageResult.fingerprint}
            isBroadcast={newMessageResult.isBroadcast}
          />
        )}

        {/* My QR Modal */}
        <MyQRModal isOpen={qrModal.isOpen} onOpenChange={qrModal.onOpenChange} />

        {/* Biometric Prompt Modal */}
        {showBiometricPrompt && (
          <BiometricPromptModal
            onClose={() => setShowBiometricPrompt(false)}
            onEnable={handleEnableBiometrics}
            onDecline={handleDeclineBiometrics}
          />
        )}

        {/* Manual Paste Modal */}
        {/* Manual Paste Modal */}
        {/* Manual Paste Modal */}
        {manualPasteModal.isOpen && (
          <ManualPasteModal
            isOpen={manualPasteModal.isOpen}
            onClose={manualPasteModal.onClose}
            onSubmit={handleManualPaste}
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

            <div className="flex items-center gap-4">
              {!isStandalone && deferredPrompt && (
                <Button
                  isIconOnly
                  variant="flat"
                  size="sm"
                  className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 animate-pulse"
                  onPress={() => setInstallPromptVisible(true)}
                  title="Install App"
                >
                  <Download className="w-4 h-4" />
                </Button>
              )}

              {identity && (
                <div className="flex items-center gap-2">

                  <Button
                    isIconOnly
                    variant="flat"
                    size="sm"
                    className="bg-industrial-800 text-industrial-300"
                    onPress={handleCopyIdentity}
                    title="Copy Identity"
                    data-testid="copy-identity-home"
                  >
                    <FileUser className="w-4 h-4" />
                  </Button>
                  <Button
                    isIconOnly
                    variant="flat"
                    size="sm"
                    className="bg-industrial-800 text-industrial-300"
                    onPress={qrModal.onOpen}
                    title="Show QR Code"
                    data-testid="view-qr-header"
                  >
                    <QrCode className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="text-xs sm:text-sm text-industrial-400">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="hidden sm:inline">{t('app.encrypted_locally')}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row max-w-6xl mx-auto w-full overflow-hidden">
          {/* Desktop Sidebar Navigation */}
          <nav className="hidden md:flex flex-col w-64 shrink-0 bg-industrial-900 border-e border-industrial-800 min-h-[calc(100vh-64px)] p-4 sticky top-[64px] h-[calc(100vh-64px)] overflow-y-auto">
            <div className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    data-testid={`nav-${tab.id}-tab`}
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

            {/* User Profile (Desktop Bottom) */}
            {identity && (
              <div className="mt-auto pt-4 border-t border-industrial-800">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={identity.name}
                    classNames={{
                      base: "flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-industrial-100 truncate">{identity.name}</p>
                    <div className="flex items-center gap-1 text-xs text-industrial-500">
                      <span className="truncate" dir="ltr">{identity.fingerprint.slice(0, 8)}...{identity.fingerprint.slice(-8)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </nav>

          {/* Main Content */}
          <main className="flex-1 flex flex-col h-[calc(100vh-64px-64px)] md:h-[calc(100vh-64px)] pb-16 lg:pb-0 w-full relative">
            {activeTab === 'chats' && (
              <ChatList onNewChat={() => setActiveTab('keys')} onDetection={handleDetection} />
            )}
            {activeTab === 'keys' && (
              <div className="p-4 md:p-6 overflow-y-auto h-full">
                <KeyExchange onDetection={handleDetection} onNewMessage={handleNewMessage} />
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
                  data-testid={`nav-mobile-${tab.id}-tab`}
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
