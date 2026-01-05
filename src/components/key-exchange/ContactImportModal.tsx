/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DetectionResult } from '../../hooks/useClipboardDetection';
import { cryptoService } from '../../services/crypto';
import { storageService } from '../../services/storage';
import { useAppStore } from '../../stores/appStore';
import * as logger from '../../utils/logger';

interface ContactImportModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialValues?: {
    name?: string;
    publicKey?: string;
  };
  onDetection?: (result: DetectionResult) => void;
  onNewMessage?: (result: {
    type: 'message' | 'contact';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  }) => void;
}

export function ContactImportModal({
  isOpen,
  onOpenChange,
  initialValues,
  onDetection,
  onNewMessage,
}: ContactImportModalProps) {
  const { t } = useTranslation();
  const { contacts, addContact, sessionPassphrase, handleUniversalInput, identity } = useAppStore();

  const [entryStep, setEntryStep] = useState<'key' | 'details'>('key');
  const [capturedKey, setCapturedKey] = useState('');
  const [contactForm, setContactForm] = useState({
    name: '',
    publicKey: '',
  });
  const [isImporting, setIsImporting] = useState(false);

  // Reset or initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialValues?.publicKey) {
        setCapturedKey(initialValues.publicKey);
        setContactForm({
          name: initialValues.name || '',
          publicKey: '', // Clear input as we have captured it
        });
        setEntryStep('details');
      } else {
        setEntryStep('key');
        setCapturedKey('');
        setContactForm({ name: '', publicKey: '' });
      }
    }
  }, [isOpen, initialValues]);

  const handlePublicKeyChange = async (value: string) => {
    setContactForm((prev) => ({ ...prev, publicKey: value }));

    // Check for valid PGP key format (or with prefix)
    const { username: parsedName, key: parsedKey, isValid } = cryptoService.parseKeyInput(value);

    if (isValid) {
      try {
        let name = parsedName;

        // If no name from prefix, try to get from key
        if (!name) {
          name = await cryptoService.getNameFromKey();
        }

        // Transition to details step
        setCapturedKey(parsedKey);
        setContactForm((prev) => ({
          ...prev,
          name: name || '',
          publicKey: '', // Clear input field as requested
        }));
        setEntryStep('details');

        if (name) {
          toast.success(t('contact_import.toast.found_identity', { name }));
        } else {
          toast.success(t('contact_import.toast.valid_key'));
        }
      } catch {
        // Invalid key, stay on input step
      }
    }
  };

  const handleImportDecode = async () => {
    if (!contactForm.publicKey.trim()) {
      toast.error(t('contact_import.toast.enter_decode'));
      return;
    }

    setIsImporting(true);
    try {
      const result = await handleUniversalInput(contactForm.publicKey.trim(), undefined, true);

      // If a message was detected, show the new message modal
      if (result && result.type === 'message') {
        if (onNewMessage) {
          onNewMessage(result);
        }
        // Clear the textarea after successful import
        setContactForm({ ...contactForm, publicKey: '' });
        onOpenChange(false);
      }
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
      };
      if (err.message === 'CONTACT_INTRO_DETECTED') {
        // UNIFICATION: Handle contact ID detection the same way as auto-detector
        if (onDetection && err.keyData) {
          const contactName = err.keyData.name || err.keyData.username || 'Unknown';
          const contactPublicKey = err.keyData.publicKey || err.keyData.key;
          if (contactPublicKey) {
            onDetection({
              type: 'id',
              contactName: contactName,
              contactPublicKey: contactPublicKey,
            });
            // Clear the textarea after successful import
            setContactForm({ ...contactForm, publicKey: '' });
            onOpenChange(false);
          } else {
            toast.error(t('contact_import.toast.invalid_contact_key'));
          }
        } else {
          toast.error(t('contact_import.toast.handler_missing'));
        }
      } else if (err.message === 'SENDER_UNKNOWN') {
        toast.error(t('contact_import.toast.unknown_sender'));
      } else {
        toast.error(t('contact_import.toast.decode_fail'));
        logger.error('[KeyExchange] Import decode error:', error);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddContact = async () => {
    // Determine the key to use based on the current step
    const keyToUse = entryStep === 'details' ? capturedKey : contactForm.publicKey;

    // 1. Basic Field Validation
    if (!contactForm.name.trim()) {
      toast.error(t('contact_import.toast.enter_name'));
      return;
    }

    if (!keyToUse.trim()) {
      toast.error(t('contact_import.toast.key_missing'));
      return;
    }

    try {
      // 2. Validate the key format and get fingerprint
      const fingerprint = await cryptoService.getFingerprint(keyToUse);

      // 3. Self-Contact Validation
      if (identity && fingerprint === identity.fingerprint) {
        toast.error(t('contact_import.toast.cannot_add_self'));
        return;
      }

      // 4. Duplicate Contact Validation
      const existingContact = contacts.find((c) => c.fingerprint === fingerprint);
      if (existingContact) {
        toast.error(t('contact_import.toast.contact_exists', { name: existingContact.name }));
        return;
      }

      // 5. Remove name from key content before storage (as requested)
      const cleanPublicKey = await cryptoService.removeNameFromKey(keyToUse);

      // 6. Store the contact
      if (!sessionPassphrase) {
        toast.error(t('settings.errors.missing_key'));
        return;
      }

      const contact = await storageService.storeContact(
        {
          name: contactForm.name.trim(),
          publicKey: cleanPublicKey,
          fingerprint,
        },
        sessionPassphrase,
      );

      addContact(contact);
      toast.success(t('contact_import.toast.success'));
      onOpenChange(false);

      // Reset State handled by useEffect on next open, but good to reset here too?
      // Not strictly necessary as useEffect handles it.
    } catch (error) {
      logger.error('Add contact error:', error);
      toast.error(t('contact_import.toast.invalid_key_format'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      classNames={{
        base: 'bg-industrial-900 border border-industrial-800',
        header: 'border-b border-industrial-800',
        footer: 'border-t border-industrial-800',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{t('contact_import.add_contact')}</ModalHeader>
            <ModalBody className="gap-4 py-6">
              {entryStep === 'key' ? (
                <div className="space-y-4">
                  <Textarea
                    autoFocus
                    label={t('contact_import.public_key_label')}
                    placeholder={t('contact_import.public_key_placeholder')}
                    value={contactForm.publicKey}
                    onChange={(e) => handlePublicKeyChange(e.target.value)}
                    variant="bordered"
                    minRows={8}
                    classNames={{
                      inputWrapper: 'bg-industrial-950 border-industrial-700 font-mono text-xs',
                    }}
                  />
                  <p className="text-xs text-industrial-400">
                    {t('contact_import.instruction')}
                  </p>
                  <Button
                    color="primary"
                    variant="bordered"
                    onPress={handleImportDecode}
                    isLoading={isImporting}
                    isDisabled={!contactForm.publicKey.trim() || isImporting}
                    className="w-full"
                  >
                    {t('contact_import.import_button')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Textarea
                    label={t('contact_import.public_key_label')}
                    value={capturedKey}
                    isReadOnly
                    variant="bordered"
                    minRows={6}
                    classNames={{
                      inputWrapper:
                        'bg-industrial-950 border-industrial-700 font-mono text-xs opacity-70',
                    }}
                  />

                  <Input
                    autoFocus
                    label={t('contact_import.name_label')}
                    placeholder={t('contact_import.name_placeholder')}
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    variant="bordered"
                    classNames={{
                      inputWrapper: 'bg-industrial-950 border-industrial-700',
                    }}
                  />

                  <Button
                    size="sm"
                    variant="light"
                    color="primary"
                    onPress={() => {
                      setEntryStep('key');
                      setContactForm((prev) => ({ ...prev, publicKey: capturedKey }));
                    }}
                    className="w-full"
                  >
                    {t('contact_import.change_key')}
                  </Button>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                {t('contact_import.cancel')}
              </Button>
              <Button color="primary" onPress={handleAddContact}>
                {t('contact_import.add_contact')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
