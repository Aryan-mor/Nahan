import { Button, Card, CardBody, Checkbox, Input } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cryptoService } from '../services/crypto';
import { storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { PinPad } from './PinPad';

type Step = 'create-pin' | 'confirm-pin' | 'warning' | 'identity';

export function Onboarding() {
  const { addIdentity, setCurrentIdentity, setLocked, setSessionPassphrase } = useAppStore();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('create-pin');
  const [pin, setPin] = useState('');
  const [confirmedPin, setConfirmedPin] = useState('');
  const [name, setName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const handleCreatePin = (value: string) => {
    setPin(value);
    // Small delay for better UX
    setTimeout(() => {
      setStep('confirm-pin');
    }, 300);
  };

  const handleConfirmPin = (value: string) => {
    setConfirmedPin(value);
    if (value === pin) {
      setTimeout(() => {
        setStep('warning');
      }, 300);
    } else {
      toast.error(t('auth.error.pin_mismatch'));
      setConfirmedPin('');
      setPin('');
      setTimeout(() => {
        setStep('create-pin');
      }, 1000);
    }
  };

  const handleWarningAccept = () => {
    if (agreed) {
      setStep('identity');
    } else {
      toast.error(t('auth.error.warning_required'));
    }
  };

  const handleGenerateIdentity = async () => {
    if (!name.trim()) {
      toast.error(t('auth.error.name_required'));
      return;
    }

    setIsGenerating(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `${sanitizedName || 'user'}@nahan.local`;

      const keyPair = await cryptoService.generateKeyPair(
        name,
        email,
        pin, // Use PIN as passphrase
      );

      const identity = await storageService.storeIdentity({
        name: name,
        email: email,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        fingerprint: keyPair.fingerprint,
      });

      addIdentity(identity);
      setCurrentIdentity(identity);
      setSessionPassphrase(pin); // Set session passphrase for immediate use
      setLocked(false); // Unlock immediately after creation

      toast.success(t('auth.welcome'));
    } catch (error) {
      console.error(error);
      toast.error(t('auth.error.generate'));
    } finally {
      setIsGenerating(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'create-pin':
        return (
          <motion.div
            key="create-pin"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full"
          >
            <PinPad
              value={pin}
              onChange={setPin}
              onComplete={handleCreatePin}
              label={t('auth.create_pin.label')}
              subLabel={t('auth.create_pin.sublabel')}
            />
          </motion.div>
        );

      case 'confirm-pin':
        return (
          <motion.div
            key="confirm-pin"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full"
          >
            <PinPad
              value={confirmedPin}
              onChange={setConfirmedPin}
              onComplete={handleConfirmPin}
              label={t('auth.confirm_pin.label')}
              subLabel={t('auth.confirm_pin.sublabel')}
            />
            <div className="flex justify-center mt-4">
              <button
                onClick={() => {
                  setPin('');
                  setConfirmedPin('');
                  setStep('create-pin');
                }}
                className="text-industrial-400 hover:text-industrial-200 text-sm flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> {t('auth.back')}
              </button>
            </div>
          </motion.div>
        );

      case 'warning':
        return (
          <motion.div
            key="warning"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md mx-auto"
          >
            <Card className="bg-industrial-900 border-industrial-800 shadow-xl">
              <CardBody className="p-8 flex flex-col items-center text-center space-y-6">
                <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mb-2">
                  <AlertTriangle className="w-8 h-8 text-yellow-500" />
                </div>

                <h2 className="text-2xl font-bold text-industrial-100">{t('auth.warning.title')}</h2>

                <div className="bg-industrial-950 p-4 rounded-lg border border-industrial-800 text-start">
                  <p className="text-industrial-300 text-sm leading-relaxed">
                    {t('auth.warning.desc1')}
                  </p>
                  <p className="text-red-400 font-bold text-sm mt-3">
                    {t('auth.warning.desc2')}
                  </p>
                </div>

                <Checkbox
                  isSelected={agreed}
                  onValueChange={setAgreed}
                  color="warning"
                  classNames={{
                    label: 'text-industrial-300 text-sm',
                  }}
                >
                  {t('auth.warning.checkbox')}
                </Checkbox>

                <Button
                  color="primary"
                  size="lg"
                  className="w-full font-semibold"
                  onPress={handleWarningAccept}
                  isDisabled={!agreed}
                >
                  {t('auth.warning.continue')}
                </Button>
              </CardBody>
            </Card>
          </motion.div>
        );

      case 'identity':
        return (
          <motion.div
            key="identity"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md mx-auto"
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-industrial-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border border-industrial-700">
                <ShieldCheck className="w-8 h-8 text-industrial-100" />
              </div>
              <h1 className="text-2xl font-bold text-industrial-100">{t('auth.identity.title')}</h1>
              <p className="text-industrial-400">{t('auth.identity.subtitle')}</p>
            </div>

            <Card className="bg-industrial-900 border-industrial-800 shadow-xl">
              <CardBody className="p-6 space-y-6">
                <Input
                  label={t('auth.identity.display_name')}
                  placeholder={t('auth.identity.placeholder')}
                  value={name}
                  onValueChange={setName}
                  startContent={
                    <User className="w-4 h-4 text-industrial-400 pointer-events-none flex-shrink-0" />
                  }
                  variant="bordered"
                  size="lg"
                  classNames={{
                    inputWrapper: 'bg-industrial-950 border-industrial-700',
                    label: 'text-industrial-300',
                  }}
                />

                <Button
                  color="primary"
                  size="lg"
                  className="w-full font-bold text-lg"
                  endContent={!isGenerating && <ArrowRight className="w-5 h-5" />}
                  isLoading={isGenerating}
                  onPress={handleGenerateIdentity}
                >
                  {isGenerating ? t('auth.identity.generating') : t('auth.identity.submit')}
                </Button>
              </CardBody>
            </Card>
          </motion.div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-industrial-950 flex flex-col items-center justify-center p-4">
      <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
    </div>
  );
}
