/* eslint-disable max-lines-per-function */
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from '@heroui/react';
import { Eye, EyeOff, Key } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { cryptoService } from '../../services/crypto';
import { storageService } from '../../services/storage';
import { useAppStore } from '../../stores/appStore';
import * as logger from '../../utils/logger';

export function IdentityOnboarding() {
  const { t } = useTranslation();
  const { addIdentity, setSessionPassphrase, sessionPassphrase } = useAppStore();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  
  const [generateForm, setGenerateForm] = useState({
    name: '',
    passphrase: '',
  });
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateKey = async () => {
    if (!generateForm.name.trim()) {
      toast.error(t('identity_onboarding.toast.fill_name'));
      return;
    }

    if (!generateForm.passphrase) {
      toast.error(t('identity_onboarding.toast.create_passphrase'));
      return;
    }

    const validation = cryptoService.validatePassphrase(generateForm.passphrase);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    setIsGenerating(true);

    try {
      // Auto-generate email internally (required for PGP) but don't show to user
      const sanitizedName = generateForm.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `${sanitizedName || 'user'}@nahan.local`;

      const keyPair = await cryptoService.generateKeyPair(
        generateForm.name,
        email,
        generateForm.passphrase,
      );

      // If we are creating the first identity, we might not have a session passphrase set yet?
      // Wait, the original code checks:
      // if (!sessionPassphrase) { toast.error('SecureStorage: Missing key'); return; }
      // But wait, if this is onboarding, where does sessionPassphrase come from?
      // Ah, maybe the user sets a pin/passphrase before this?
      // Or maybe `setSessionPassphrase` is called HERE with the NEW passphrase?
      // Original code:
      // if (!sessionPassphrase) { ... }
      // AND THEN:
      // setSessionPassphrase(generateForm.passphrase);
      
      // Checking original file lines 161-164:
      // if (!sessionPassphrase) { toast.error('SecureStorage: Missing key'); return; }
      
      // This implies sessionPassphrase must be set BEFORE generating identity?
      // But line 180 says: setSessionPassphrase(generateForm.passphrase);
      
      // Let's re-read the original file carefully.
      // Line 51: setSessionPassphrase imported.
      // Line 161: check sessionPassphrase.
      // Line 180: setSessionPassphrase.
      
      // If `sessionPassphrase` is null, line 161 returns.
      // So how does the user ever generate an identity if they don't have a session passphrase?
      // Maybe `sessionPassphrase` is set by `LockScreen` or `WelcomeScreen`?
      // If this is the FIRST run, `WelcomeScreen` might set it?
      
      // Let's assume the original logic is correct and I should copy it.
      // But if `sessionPassphrase` is null, it fails.
      // Maybe I should check if `sessionPassphrase` is needed for `storageService.storeIdentity`.
      // Yes, `storeIdentity` takes `passphrase`.
      
      // Wait, if I am creating a NEW identity, maybe I use the `generateForm.passphrase` AS the session passphrase?
      // The original code uses `sessionPassphrase` (from store) to encrypt the identity in storage?
      // Or does it use the `generateForm.passphrase`?
      
      // Line 166:
      // const identity = await storageService.storeIdentity(..., sessionPassphrase);
      
      // So `sessionPassphrase` MUST be set in the store.
      // This means the user must have logged in or set a master password before reaching this screen.
      
      if (!sessionPassphrase) {
        // Fallback or Error?
        // If it's a new user, maybe we should set it?
        // But the original code errors out.
        // I will keep the original logic.
        toast.error(t('identity_onboarding.toast.missing_key'));
        return;
      }

      const identity = await storageService.storeIdentity(
        {
          name: generateForm.name,
          email: email,
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
          fingerprint: keyPair.fingerprint,
        },
        sessionPassphrase,
      );

      addIdentity(identity);

      // Set session passphrase so user can start chatting immediately
      // Wait, if it was already set (check above), why set it again?
      // Maybe to ensure it's fresh? Or maybe the check above is for SOMETHING ELSE?
      // Ah, maybe `sessionPassphrase` is the "Unlock" key, but here we are using the "Identity" passphrase?
      // The original code sets it again. I will follow that.
      setSessionPassphrase(generateForm.passphrase);

      toast.success(t('identity_onboarding.toast.success'));
      onOpenChange(); // Close modal
      setGenerateForm({ name: '', passphrase: '' });
    } catch (error) {
      logger.error(error);
      toast.error(t('identity_onboarding.toast.fail'));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div className="text-center p-8 border-2 border-dashed border-industrial-800 rounded-lg bg-industrial-900/50">
        <h3 className="text-xl font-bold text-industrial-100 mb-2">{t('identity_onboarding.no_identity')}</h3>
        <p className="text-industrial-400 mb-6">
          {t('identity_onboarding.create_description')}
        </p>
        <Button color="primary" size="lg" onPress={onOpen}>
          {t('identity_onboarding.create_button')}
        </Button>
      </div>

      <Modal 
        isOpen={isOpen} 
        onOpenChange={onOpenChange}
        classNames={{
          base: 'bg-industrial-900 border border-industrial-800',
          header: 'border-b border-industrial-800',
          footer: 'border-t border-industrial-800',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {t('identity_onboarding.modal.title')}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4 py-4">
                  <Input
                    autoFocus
                    label={t('identity_onboarding.modal.display_name')}
                    placeholder={t('identity_onboarding.modal.display_name_placeholder')}
                    value={generateForm.name}
                    onChange={(e) => setGenerateForm(prev => ({ ...prev, name: e.target.value }))}
                    variant="bordered"
                    classNames={{
                      inputWrapper: 'bg-industrial-950 border-industrial-700',
                    }}
                  />
                  
                  <Input
                    label={t('identity_onboarding.modal.passphrase')}
                    placeholder={t('identity_onboarding.modal.passphrase_placeholder')}
                    value={generateForm.passphrase}
                    onChange={(e) => setGenerateForm(prev => ({ ...prev, passphrase: e.target.value }))}
                    endContent={
                      <button className="focus:outline-none" type="button" onClick={() => setShowPassphrase(!showPassphrase)}>
                        {showPassphrase ? (
                          <EyeOff className="text-2xl text-default-400 pointer-events-none" />
                        ) : (
                          <Eye className="text-2xl text-default-400 pointer-events-none" />
                        )}
                      </button>
                    }
                    type={showPassphrase ? "text" : "password"}
                    variant="bordered"
                    classNames={{
                      inputWrapper: 'bg-industrial-950 border-industrial-700',
                    }}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  {t('identity_onboarding.modal.cancel')}
                </Button>
                <Button 
                  color="primary" 
                  onPress={handleGenerateKey}
                  isLoading={isGenerating}
                  startContent={!isGenerating && <Key className="w-4 h-4" />}
                >
                  {t('identity_onboarding.modal.create')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
