/* eslint-disable max-lines-per-function */
import { } from '@heroui/react';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
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
  } = useAppStore();

  const {
    failedAttempts,
    incrementFailedAttempts,
    resetFailedAttempts,
  } = useUIStore();
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const isVerifyingRef = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

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

    try {
      // Use unlockApp action to verify and set session state
      const isValid = await useAppStore.getState().unlockApp(pin);

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
        if (isMounted.current) {
          isVerifyingRef.current = false;
          setIsVerifying(false);
          incrementFailedAttempts();
          const currentFailed = failedAttempts + 1;

          if (currentFailed >= 5) {
            toast.error(t('lock.error.max_attempts'));
            await wipeData();
            return;
          }

          const remaining = 5 - currentFailed;
          const msg = t('lock.error.incorrect_pin', { count: remaining });
          setError(msg);
          setPassphrase('');
          toast.warning(msg);
        }
      }
    } catch (error) {
      logger.error('Unlock failed:', error);
      if (isMounted.current) {
        isVerifyingRef.current = false;
        setIsVerifying(false);
        setError(t('lock.error.verify'));
        toast.error(t('lock.error.verify_toast'));
        setPassphrase('');
      }
    }
  };

  return (
    <div className="min-h-screen bg-industrial-950 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >

        <PinPad
          value={passphrase}
          onChange={setPassphrase}
          onComplete={handleUnlock}
          label={t('lock.enter_pin')}
          subLabel={t('lock.sublabel')}
          error={error}
          isLoading={isVerifying}
        />
      </motion.div>
    </div>
  );
}
