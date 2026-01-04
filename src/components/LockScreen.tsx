import { Avatar, Select, SelectItem } from '@heroui/react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cryptoService } from '../services/crypto';
import { Identity } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';
import { PinPad } from './PinPad';

export function LockScreen() {
  const {
    identity,
    wipeData,
  } = useAppStore();

  const {
    isLocked,
    setLocked,
    failedAttempts,
    incrementFailedAttempts,
    resetFailedAttempts,
  } = useUIStore();
  const { t } = useTranslation();
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>('');
  const [passphrase, setPassphrase] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState('');

  // Set initial selected identity
  useEffect(() => {
    if (identity) {
      setSelectedIdentityId(identity.id);
    }
  }, [identity]);

  const handleUnlock = async (pin: string) => {
    if (!identity) {
      toast.error(t('lock.error.select'));
      return;
    }

    setIsUnlocking(true);
    setError('');

    try {
      // Small delay to make UI feel responsive and preventing spam
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Use unlockApp action to verify and set session state
      const isValid = await useAppStore.getState().unlockApp(pin);

      if (isValid) {
        toast.success(t('lock.welcome'));
        resetFailedAttempts();

        // Show install prompt if not installed (even if dismissed previously)
        const { isStandalone, setInstallPromptVisible } = useUIStore.getState();
        if (!isStandalone) {
           setInstallPromptVisible(true);
        }
      } else {
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
    } catch (error) {
      console.error(error);
      setError(t('lock.error.verify'));
      toast.error(t('lock.error.verify_toast'));
    } finally {
      setIsUnlocking(false);
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
          isLoading={isUnlocking}
        />
      </motion.div>
    </div>
  );
}
