/**
 * Detection Modal - Shows detected Nahan messages or contact IDs
 * Provides user-friendly actions for detected content
 */

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { MessageSquare, UserPlus, X } from 'lucide-react';
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
  type: 'message' | 'id';
  contactName: string;
  contactPublicKey?: string; // For ID type
  contactFingerprint?: string; // For message type
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
  const {
    addContact,
    setActiveChat,
    contacts,
    sessionPassphrase,
  } = useAppStore();

  const { setActiveTab } = useUIStore();
  const { t } = useTranslation();

  const handleAddContact = async () => {
    if (!contactPublicKey) return;

    try {
      // Generate fingerprint from public key
      const fingerprint = await cryptoService.getFingerprint(contactPublicKey);

      // Check if contact already exists
      const existingContact = contacts.find(c => c.fingerprint === fingerprint);
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
    }
  };

  const handleGoToChat = async () => {
    if (!contactFingerprint) return;

    const contact = contacts.find(c => c.fingerprint === contactFingerprint);
    if (contact) {
      setActiveChat(contact);
      setActiveTab('chats');
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      shouldCloseOnInteractOutside={() => false}
      classNames={{
        base: 'bg-industrial-950 border border-industrial-800',
        header: 'border-b border-industrial-800',
        body: 'py-6',
        footer: 'border-t border-industrial-800',
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {type === 'id' ? (
                  <UserPlus className="w-5 h-5 text-primary" />
                ) : (
                  <MessageSquare className="w-5 h-5 text-primary" />
                )}
                <span>
                  {type === 'id' ? t('detection.new_contact') : t('detection.new_message')}
                </span>
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
                        components={{ strong_text: <strong className="text-industrial-100" /> }}
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
                        i18nKey="detection.message_found"
                        values={{ name: contactName }}
                        components={{ strong_text: <strong className="text-industrial-100" /> }}
                      />
                    </p>
                    <div className="bg-industrial-900 rounded-lg p-3 border border-industrial-800">
                      <p className="text-xs text-industrial-400">
                        {t('detection.message_info')}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} startContent={<X className="w-4 h-4" />}>
                {t('detection.dismiss')}
              </Button>
              {type === 'id' ? (
                <Button
                  color="primary"
                  onPress={handleAddContact}
                  startContent={<UserPlus className="w-4 h-4" />}
                >
                  {t('detection.add_chat')}
                </Button>
              ) : (
                <Button
                  color="primary"
                  onPress={handleGoToChat}
                  startContent={<MessageSquare className="w-4 h-4" />}
                >
                  {t('detection.view_chat')}
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
