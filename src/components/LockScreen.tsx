import { Avatar, Select, SelectItem } from '@heroui/react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cryptoService } from '../services/crypto';
import { Identity } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { PinPad } from './PinPad';

export function LockScreen() {
  const {
    identities,
    setLocked,
    setCurrentIdentity,
    currentIdentity,
    failedAttempts,
    incrementFailedAttempts,
    resetFailedAttempts,
    wipeData,
  } = useAppStore();
  const { t } = useTranslation();
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>('');
  const [passphrase, setPassphrase] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState('');

  // Set initial selected identity
  useEffect(() => {
    if (identities.length > 0) {
      // Prefer currentIdentity if set, otherwise first one
      if (currentIdentity) {
        setSelectedIdentityId(currentIdentity.id);
      } else {
        setSelectedIdentityId(identities[0].id);
      }
    }
  }, [identities, currentIdentity]);

  const handleUnlock = async (pin: string) => {
    const identity = identities.find((i) => i.id === selectedIdentityId);
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
      // First ensure current identity matches selected
      if (currentIdentity?.id !== identity.id) {
        setCurrentIdentity(identity);
      }

      const isValid = await cryptoService.verifyPrivateKeyPassphrase(identity.privateKey, pin);

      if (isValid) {
        toast.success(t('lock.welcome'));
        setCurrentIdentity(identity);
        resetFailedAttempts();
        // Set session passphrase explicitly
        useAppStore.getState().setSessionPassphrase(pin);
        setLocked(false);
        
        // Show install prompt if not installed (even if dismissed previously)
        const { isStandalone, setInstallPromptVisible } = useAppStore.getState();
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
        {identities.length > 1 && (
          <div className="mb-6 px-6">
            <Select
              label={t('lock.select_identity')}
              selectedKeys={selectedIdentityId ? [selectedIdentityId] : []}
              onSelectionChange={(keys) => {
                setSelectedIdentityId(Array.from(keys)[0] as string);
                setPassphrase('');
                setError('');
              }}
              classNames={{
                trigger: 'bg-industrial-900 border-industrial-700',
                popoverContent: 'bg-industrial-900 border-industrial-800',
              }}
              renderValue={(items) => {
                return items.map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <Avatar
                      alt={(item.data as Identity)?.name}
                      className="w-6 h-6 text-xs"
                      name={(item.data as Identity)?.name}
                    />
                    <span className="text-industrial-100">{(item.data as Identity)?.name}</span>
                  </div>
                ));
              }}
            >
              {identities.map((identity) => (
                <SelectItem key={identity.id} textValue={identity.name}>
                  <div className="flex items-center gap-2">
                    <Avatar alt={identity.name} className="w-6 h-6 text-xs" name={identity.name} />
                    <div className="flex flex-col text-start">
                      <span className="text-industrial-100">{identity.name}</span>
                      <span className="text-tiny text-industrial-500 font-mono">
                        #{identity.fingerprint.slice(-4)}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>
        )}

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
