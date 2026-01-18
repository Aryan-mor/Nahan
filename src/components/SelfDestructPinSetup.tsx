import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
} from '@heroui/react';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import * as logger from '../utils/logger';
import { PinPad } from './PinPad';

interface SelfDestructPinSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/* eslint-disable max-lines-per-function */
export function SelfDestructPinSetup({ isOpen, onClose, onSuccess }: SelfDestructPinSetupProps) {
  const { t } = useTranslation();
  const { sessionPassphrase } = useAppStore();
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = () => {
    setStep('enter');
    setPin('');
    setConfirmPin('');
    setError('');
    setIsLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handlePinComplete = async (value: string) => {
    if (step === 'enter') {
      // Validate that it's different from master PIN
      if (value === sessionPassphrase) {
        setError(t('settings.security.self_destruct.pin_same_as_master', 'Emergency PIN must be different from your unlock PIN'));
        setPin('');
        return;
      }

      setPin(value);
      setError('');
      setStep('confirm');
    } else if (step === 'confirm') {
      setConfirmPin(value);

      // Verify PINs match
      if (value !== pin) {
        setError(t('settings.security.self_destruct.pin_mismatch', 'PINs do not match'));
        setConfirmPin('');
        return;
      }

      // Save the self-destruct PIN
      setIsLoading(true);
      try {
        await storageService.setSelfDestructPin(value, sessionPassphrase || '');
        toast.success(t('settings.security.self_destruct.setup_success', 'Emergency PIN configured successfully'));
        logger.info('[SelfDestruct] Emergency PIN configured');
        handleReset();
        onSuccess();
      } catch (err) {
        logger.error('[SelfDestruct] Failed to set PIN:', err);
        toast.error(t('settings.security.self_destruct.setup_error', 'Failed to setup emergency PIN'));
        setError(t('settings.security.self_destruct.setup_error', 'Failed to setup emergency PIN'));
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="full"
      placement="center"
      classNames={{
        base: 'bg-industrial-950 m-0',
        closeButton: 'text-industrial-400 hover:text-industrial-100 z-10',
      }}
      isDismissable={!isLoading}
      hideCloseButton={isLoading}
      data-testid="self-destruct-modal"
    >
      <ModalContent>
        <ModalHeader
          className="flex flex-col gap-1 text-industrial-100 border-b border-industrial-800"
          data-testid="self-destruct-modal-header"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span>{t('settings.security.self_destruct.setup_title', 'Setup Emergency PIN')}</span>
          </div>
        </ModalHeader>
        <ModalBody className="flex-1 flex flex-col justify-center items-center py-6 px-4 overflow-y-auto">
          <div className="w-full max-w-md space-y-6 pt-48">
            {/* Warning Banner */}
            <div
              className="bg-red-900/20 border border-red-700 rounded-lg p-4"
              data-testid="self-destruct-warning-banner"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-300">
                  <p className="font-medium mb-1">
                    {t('settings.security.self_destruct.warning_title', '⚠️ Warning')}
                  </p>
                  <p>
                    {t(
                      'settings.security.self_destruct.warning',
                      'This action is irreversible. All messages, contacts, and identity will be permanently deleted.',
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* PinPad */}
            <PinPad
              value={step === 'enter' ? pin : confirmPin}
              onChange={step === 'enter' ? setPin : setConfirmPin}
              onComplete={handlePinComplete}
              label={
                step === 'enter'
                  ? t('settings.security.self_destruct.setup_label', 'Enter Emergency PIN')
                  : t('settings.security.self_destruct.confirm_label', 'Confirm Emergency PIN')
              }
              subLabel={
                step === 'enter'
                  ? t(
                      'settings.security.self_destruct.setup_sublabel',
                      'This PIN will wipe all data when entered',
                    )
                  : t(
                      'settings.security.self_destruct.confirm_sublabel',
                      'Re-enter the same PIN to confirm',
                    )
              }
              error={error}
              isLoading={isLoading}
              data-testid="self-destruct-pin-pad"
            />
          </div>
        </ModalBody>
        <ModalFooter className="border-t border-industrial-800">
          <Button
            color="default"
            variant="flat"
            onPress={handleClose}
            isDisabled={isLoading}
            className="text-industrial-300"
            data-testid="self-destruct-modal-cancel-button"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
