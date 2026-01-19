/* eslint-disable max-lines-per-function */

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DetectionResult } from '../../hooks/useClipboardDetection';
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
  const { handleUniversalInput } = useAppStore();

  const [contactForm, setContactForm] = useState({
    name: '',
    publicKey: '',
  });
  const [isImporting, setIsImporting] = useState(false);


  // Reset or initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialValues?.publicKey) {
        setContactForm({
          name: initialValues.name || '',
          publicKey: initialValues.publicKey,
        });
      } else {
        setContactForm({ name: '', publicKey: '' });
      }
    }
  }, [isOpen, initialValues]);



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
      } else if (err.message === 'MULTI_CONTACT_INTRO_DETECTED') {
        // Handle multi-contact detection
        const multiErr = err as { contacts: Array<{ name: string; publicKey: string }> };
        if (onDetection && multiErr.contacts && multiErr.contacts.length > 0) {
           onDetection({
              type: 'multi_id',
              contactName: `${multiErr.contacts.length} Contacts`,
              contacts: multiErr.contacts
           });
           setContactForm({ ...contactForm, publicKey: '' });
           onOpenChange(false);
        } else {
           toast.error(t('contact_import.toast.invalid_contact_key'));
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
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {t('manual_paste.title_import', 'Import from Text')}
              <p className="text-sm font-normal text-industrial-400">
                {t('manual_paste.desc')}
              </p>
            </ModalHeader>
              <ModalBody className="py-4">
                <Textarea
                  autoFocus
                  value={contactForm.publicKey}
                  onChange={(e) => setContactForm({ ...contactForm, publicKey: e.target.value })}
                  placeholder={t('manual_paste.placeholder')}
                  minRows={6}
                  maxRows={12}
                  variant="bordered"
                  classNames={{
                    input: 'text-sm font-mono',
                    inputWrapper:
                      'bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:border-primary',
                  }}
                  data-testid="manual-import-textarea"
                />

                <div className="flex justify-between items-center mt-1">
                  <div />
                  <div className="text-xs font-mono text-industrial-500">
                    {contactForm.publicKey.length}/5000
                  </div>
                </div>
              </ModalBody>
            <ModalFooter>
              <Button
                color="primary"
                onPress={handleImportDecode}
                isLoading={isImporting}
                isDisabled={!contactForm.publicKey.trim() || isImporting}
                className="font-medium w-full"
                data-testid="manual-import-decode-btn"
              >
                {t('manual_paste.import_decode', 'Import & Decode')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
