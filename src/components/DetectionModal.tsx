/**
 * Detection Modal - Shows detected Nahan messages or contact IDs
 * Provides user-friendly actions for detected content
 */

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { MessageSquare, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { CryptoService } from '../services/crypto';
import { Contact, storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

const cryptoService = CryptoService.getInstance();

interface DetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'message' | 'id' | 'duplicate_message';
  contactName: string;
  contactPublicKey?: string; // For ID type
  contactFingerprint?: string; // For message types
  encryptedData?: string; // Base64-encoded encrypted message (for message type)
}

/* eslint-disable max-lines-per-function */
export function DetectionModal({
  isOpen,
  onClose,
  type,
  contactName,
  contactPublicKey,
  contactFingerprint,
}: DetectionModalProps) {
  const { addContact, setActiveChat, contacts, sessionPassphrase } = useAppStore();

  const { setActiveTab } = useUIStore();
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddContact = async () => {
    if (!contactPublicKey) return;

    setIsProcessing(true);
    try {
      // Generate fingerprint from public key
      const fingerprint = await cryptoService.getFingerprint(contactPublicKey);

      // Check if contact already exists
      const existingContact = contacts.find((c) => c.fingerprint === fingerprint);
      if (existingContact) {
        // Contact already exists - just navigate to chat
        setActiveChat(existingContact);
        setActiveTab('chats');
        onClose();
        return;
      }

      // Create new contact
      const newContact: Omit<Contact, 'id' | 'createdAt' | 'lastUsed'> = {
        name: contactName,
        publicKey: contactPublicKey,
        fingerprint: fingerprint,
      };

      // Store contact in database first
      if (!sessionPassphrase) {
        throw new Error('SecureStorage: Missing key');
      }

      const storedContact = await storageService.storeContact(newContact, sessionPassphrase);

      // Add contact to store
      addContact(storedContact);

      // Navigate to chat with new contact
      setActiveChat(storedContact);
      setActiveTab('chats');
      onClose();
    } catch (error) {
      logger.error('Failed to add contact:', error);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleGoToChat = async () => {
    if (!contactFingerprint) return;

    setIsProcessing(true);
    try {
        const contact = contacts.find((c) => c.fingerprint === contactFingerprint);
        if (contact) {
            await setActiveChat(contact); // Await to ensure smooth transition
            setActiveTab('chats');
            onClose();
        }
    } finally {
        setIsProcessing(false);
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'id':
        return t('detection.new_contact');
      case 'duplicate_message':
        return t('detection.duplicate_message');
      default:
        return t('detection.new_message');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isProcessing ? undefined : onClose}
      size="md"
      isDismissable={!isProcessing}
      isKeyboardDismissDisabled={isProcessing}

      classNames={{
        base: 'bg-industrial-950 border border-industrial-800',
        header: 'border-b border-industrial-800',
        body: 'py-6',
        footer: 'border-t border-industrial-800',
      }}
    >
      <ModalContent>
        {() => (
          <div data-testid="detection-modal">
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {type === 'id' ? (
                  <UserPlus className="w-5 h-5 text-primary" />
                ) : (
                  <MessageSquare className="w-5 h-5 text-primary" />
                )}
                <span>{getTitle()}</span>
              </div>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                {type === 'id' ? (
                  <>
                    <p className="text-sm text-industrial-300">
                      <Trans
                        i18nKey="detection.contact_found"
                        values={{ name: contactName }}
                        components={{ b: <strong className="text-industrial-100" /> }}
                      />
                    </p>
                    <div className="bg-industrial-900 rounded-lg p-3 border border-industrial-800">
                      <p className="text-xs text-industrial-400">
                        {t('detection.steganography_info')}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-industrial-300">
                      <Trans
                        i18nKey={type === 'duplicate_message' ? 'detection.duplicate_found' : 'detection.message_found'}
                        values={{ name: contactName }}
                        components={{ b: <strong className="text-industrial-100" /> }}
                      />
                    </p>
                    <div className="bg-industrial-900 rounded-lg p-3 border border-industrial-800">
                      <p className="text-xs text-industrial-400">
                        {type === 'duplicate_message' ? t('detection.duplicate_info') : t('detection.message_info')}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} startContent={<X className="w-4 h-4" />} isDisabled={isProcessing}>
                {t('detection.dismiss')}
              </Button>
              {type === 'id' ? (
                <Button
                  color="primary"
                  onPress={handleAddContact}
                  startContent={!isProcessing && <UserPlus className="w-4 h-4" />}
                  isLoading={isProcessing}
                  data-testid="detection-add-contact-btn"
                >
                  {t('detection.add_chat')}
                </Button>
              ) : (
                <Button
                  color="primary"
                  onPress={handleGoToChat}
                  startContent={!isProcessing && <MessageSquare className="w-4 h-4" />}
                  isLoading={isProcessing}
                >
                  {t('detection.view_chat')}
                </Button>
              )}
            </ModalFooter>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
