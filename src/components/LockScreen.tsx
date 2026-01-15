/* eslint-disable max-lines-per-function */
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

import { PinPad } from './PinPad';

export function LockScreen() {
  const {
    identity,
    wipeData,
    unlockWithBiometrics,
    isBiometricsEnabled,
    isBiometricsSupported
  } = useAppStore();

  const { failedAttempts, incrementFailedAttempts, resetFailedAttempts } = useUIStore();
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [, startTransition] = useTransition();
  const isVerifyingRef = useRef(false);
  const isMounted = useRef(true);
  const instanceId = useRef(Math.random().toString(36).substring(7));
  const autoPromptRef = useRef(false);

  useEffect(() => {
    const id = instanceId.current;
    logger.debug(`[LockScreen:${id}] Mounted`);
    return () => {
      logger.debug(`[LockScreen:${id}] Unmounting`);
      isMounted.current = false;
    };
  }, []);

  const handleBiometricAuth = useCallback(async (signal?: AbortSignal) => {
    logger.debug(`[LockScreen:${instanceId.current}] handleBiometricAuth called. IsVerifying:${isVerifyingRef.current}`);
    if (isVerifyingRef.current) {
        logger.warn(`[LockScreen] Biometric auth blocked by verification lock`);
        return;
    }

    // No full loading state to keep UI responsive/cancelable, but we track verification
    setIsVerifying(true);
    isVerifyingRef.current = true;

    try {
      const success = await unlockWithBiometrics({ signal });
      if (success) {
        toast.success(t('lock.welcome'));
        resetFailedAttempts();

        if (!import.meta.env.DEV) {
          const { isStandalone, setInstallPromptVisible } = useUIStore.getState();
          if (!isStandalone) {
            setInstallPromptVisible(true);
          }
        }
      }
    } catch (error) {
       if (error instanceof Error && (error.name === 'AbortError' || error.message?.includes('aborted'))) {
           logger.debug('[LockScreen] Biometric auth aborted by user/cleanup');
       } else {
           logger.error('Biometric auth failed', error);
           // Silent fail or toast? Usually silent if user cancels.
       }
    } finally {
       setIsVerifying(false); // Ensure UI unlocks
       isVerifyingRef.current = false;
    }
  }, [unlockWithBiometrics, t, resetFailedAttempts]);

  // Auto-trigger biometrics logic (lifted from PinPad to ensure stability)
  useEffect(() => {
      let timer: NodeJS.Timeout;
      const controller = new AbortController();

      const conditions = {
          enabled: isBiometricsEnabled,
          supported: isBiometricsSupported,
          attempts: failedAttempts === 0,
          empty: passphrase.length === 0,
          notPrompted: !autoPromptRef.current
      };

      logger.debug(`[LockScreen:${instanceId.current}] Auto-Auth Check:`, conditions);

      if (
          isBiometricsEnabled &&
          isBiometricsSupported &&
          failedAttempts === 0 &&
          passphrase.length === 0 &&
          !autoPromptRef.current
      ) {
          logger.debug(`[LockScreen:${instanceId.current}] Initiating auto-biometric prompt`);
          autoPromptRef.current = true;
          // Small delay to ensure UI is ready/mounted before browser prompt steals focus
          timer = setTimeout(() => {
              handleBiometricAuth(controller.signal);
          }, 50);
      }
      return () => {
          clearTimeout(timer);
          controller.abort(); // Kill the WebAuthn request if unmounted
          autoPromptRef.current = false; // Allow retry on remount (Strict Mode fix)
      };
  }, [isBiometricsEnabled, isBiometricsSupported, failedAttempts, passphrase.length, handleBiometricAuth]);

  // Set initial selected identity
  useEffect(() => {
    // Identity check is handled by store
  }, [identity]);

  const handleUnlock = async (pin: string) => {
    if (isVerifyingRef.current) return;

    if (!identity) {
      toast.error(t('lock.error.select'));
      return;
    }

    // No loading state to keep UI responsive
    isVerifyingRef.current = true;
    setIsVerifying(true);
    setError('');
    logger.debug(`[LockScreen:${instanceId.current}] Starting unlock attempt`);

    try {
      // Use unlockApp action to verify and set session state
      // Add timeout to prevent infinite loading state
      const unlockPromise = useAppStore.getState().unlockApp(pin);
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          logger.warn(`[LockScreen:${instanceId.current}] Unlock timed out`);
          resolve(false);
        }, 45000); // 45 seconds timeout (PBKDF2 can be slow on mobile)
      });

      const isValid = await Promise.race([unlockPromise, timeoutPromise]);
      logger.debug(`[LockScreen:${instanceId.current}] Unlock result: ${isValid}`);

      if (isValid) {
        toast.success(t('lock.welcome'));
        resetFailedAttempts();

        // Show install prompt if not installed (even if dismissed previously)
        // Don't show in dev mode
        if (!import.meta.env.DEV) {
          const { isStandalone, setInstallPromptVisible } = useUIStore.getState();
          if (!isStandalone) {
            setInstallPromptVisible(true);
          }
        }
      } else {
        // ALWAYS update store regardless of mount status to ensure sync
        incrementFailedAttempts();

        logger.debug(`[LockScreen:${instanceId.current}] Unlock failed - resetting state`);

        // Attempt to update local state even if unmounted (catch errors)
        // This fixes "zombie" component issues where isMounted might be false but UI is visible
        try {
          setPassphrase('');

          const currentFailed = failedAttempts + 1;
          if (currentFailed >= 5) {
            toast.error(t('lock.error.max_attempts'));
            await wipeData();
            return;
          }

          const remaining = 5 - currentFailed;
          const msg = t('lock.error.incorrect_pin', { count: remaining });
          setError(msg);
          toast.warning(msg);
        } catch (e) {
          logger.warn(
            `[LockScreen:${instanceId.current}] Failed to update local state (likely unmounted):`,
            e,
          );
        }
      }
    } catch (error) {
      logger.error('Unlock failed:', error);
      logger.debug(`[LockScreen:${instanceId.current}] Unlock exception, resetting state`);

      try {
        setPassphrase('');
        setError(t('lock.error.verify'));
        toast.error(t('lock.error.verify_toast'));
      } catch (_) {
        // ignore state update error
      }
    } finally {
      // ALWAYS reset verifying state
      logger.debug(`[LockScreen:${instanceId.current}] Finally block - resetting state`);

      isVerifyingRef.current = false;
      try {
        setIsVerifying(false);
      } catch (_) {
        // ignore
      }

      // Safety net: Force reset in next tick to ensure UI updates
      setTimeout(() => {
        logger.debug(`[LockScreen:${instanceId.current}] Safety reset executed`);
        try {
           startTransition(() => {
             setIsVerifying(false);
           });
           isVerifyingRef.current = false;
        } catch (_) {
          // ignore
        }
      }, 50);
    }
  };

  return (
    <div className="min-h-screen bg-industrial-950 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
        data-testid="lock-screen-wrapper"
      >
        <PinPad
          key={failedAttempts} // Force remount on failure to clear any stuck state
          value={passphrase}
          onChange={setPassphrase}
          onComplete={handleUnlock}
          label={t('lock.enter_pin')}
          subLabel={t('lock.sublabel')}
          error={error}
          isLoading={isVerifying}
          data-testid="lock-screen-pinpad"
          showBiometrics={isBiometricsEnabled && isBiometricsSupported}
          onBiometricAuth={handleBiometricAuth}
        />
      </motion.div>
    </div>
  );
}
