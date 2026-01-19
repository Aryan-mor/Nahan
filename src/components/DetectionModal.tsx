/* eslint-disable max-lines */
/**
 * Detection Modal - Shows detected Nahan messages or contact IDs
 * Provides user-friendly actions for detected content
 * Now supports multi_id type for multiple contact detection
 */

import { Avatar, Button, Checkbox, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { MessageSquare, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CryptoService } from '../services/crypto';
import { Contact, storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

const cryptoService = CryptoService.getInstance();

interface DetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'message' | 'id' | 'multi_id' | 'duplicate_message';
  contactName: string;
  contactPublicKey?: string; // For ID type
  contactFingerprint?: string; // For message types
  encryptedData?: string; // Base64-encoded encrypted message (for message type)
  contacts?: Array<{ name: string; publicKey: string }>; // For multi_id type
}

/* eslint-disable max-lines-per-function */
export function DetectionModal({
  isOpen,
  onClose,
  type,
  contactName,
  contactPublicKey,
  contactFingerprint,
  contacts = [],
}: DetectionModalProps) {
  const { addContact, setActiveChat, contacts: existingContacts, sessionPassphrase } = useAppStore();

  const { setActiveTab } = useUIStore();
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(contacts.map((_, i) => i)) // Select all by default
  );

  const toggleSelection = (index: number) => {
    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleAddContact = async () => {
    if (!contactPublicKey) return;

    setIsProcessing(true);
    try {
      // Generate fingerprint from public key
      const fingerprint = await cryptoService.getFingerprint(contactPublicKey);

      // Check if contact already exists
      const existingContact = existingContacts.find((c) => c.fingerprint === fingerprint);
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

  const handleAddMultipleContacts = async () => {
    if (contacts.length === 0 || selectedIndices.size === 0) return;

    setIsProcessing(true);
    try {
      if (!sessionPassphrase) {
        throw new Error('SecureStorage: Missing key');
      }

      let addedCount = 0;
      let skippedCount = 0;

      for (const index of selectedIndices) {
        const contact = contacts[index];
        if (!contact) continue;

        try {
          // Generate fingerprint
          const fingerprint = await cryptoService.getFingerprint(contact.publicKey);

          // Check if already exists
          const existing = existingContacts.find((c) => c.fingerprint === fingerprint);
          if (existing) {
            skippedCount++;
            continue;
          }

          // Create and store new contact
          const newContact: Omit<Contact, 'id' | 'createdAt' | 'lastUsed'> = {
            name: contact.name,
            publicKey: contact.publicKey,
            fingerprint: fingerprint,
          };

          const storedContact = await storageService.storeContact(newContact, sessionPassphrase);
          addContact(storedContact);
          addedCount++;
        } catch (error) {
          logger.error(`Failed to add contact ${contact.name}:`, error);
        }
      }

      // Show result toast
      if (addedCount > 0 && skippedCount > 0) {
        toast.success(t('detection.multi_added_partial', { added: addedCount, skipped: skippedCount }));
      } else if (addedCount > 0) {
        toast.success(t('detection.multi_added', { count: addedCount }));
      } else if (skippedCount > 0) {
        toast.info(t('detection.multi_all_exist', { count: skippedCount }));
      }

      setActiveTab('chats');
      onClose();
    } catch (error) {
      logger.error('Failed to add multiple contacts:', error);
      toast.error(t('detection.multi_error', 'Failed to add contacts'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGoToChat = async () => {
    if (!contactFingerprint) return;

    setIsProcessing(true);
    try {
        const contact = existingContacts.find((c) => c.fingerprint === contactFingerprint);
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
      case 'multi_id':
        return t('detection.multi_contacts', 'Multiple Contacts Found');
      case 'duplicate_message':
        return t('detection.duplicate_message');
      default:
        return t('detection.new_message');
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'id':
        return <UserPlus className="w-5 h-5 text-primary" />;
      case 'multi_id':
        return <Users className="w-5 h-5 text-primary" />;
      default:
        return <MessageSquare className="w-5 h-5 text-primary" />;
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
                {getIcon()}
                <span>{getTitle()}</span>
              </div>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                {type === 'multi_id' ? (
                  // Multi-contact detection UI
                  <>
                    <p className="text-sm text-industrial-300">
                      {t('detection.multi_found', { count: contacts.length })}
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {contacts.map((contact, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                            selectedIndices.has(index)
                              ? 'bg-primary-900/20 border-primary-700'
                              : 'bg-industrial-900 border-industrial-800'
                          }`}
                          onClick={() => toggleSelection(index)}
                        >
                          <Checkbox
                            isSelected={selectedIndices.has(index)}
                            onValueChange={() => toggleSelection(index)}
                            data-testid={`contact-checkbox-${index}`}
                          />
                          <Avatar
                            name={contact.name}
                            size="sm"
                            className="flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-industrial-100 truncate">
                              {contact.name}
                            </p>
                            <p className="text-xs text-industrial-500 font-mono truncate">
                              {contact.publicKey.slice(0, 12)}...
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-industrial-400">
                      {t('detection.multi_select_hint', 'Select the contacts you want to add')}
                    </p>
                  </>
                ) : type === 'id' ? (
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
              {type === 'multi_id' ? (
                <Button
                  color="primary"
                  onPress={handleAddMultipleContacts}
                  startContent={!isProcessing && <UserPlus className="w-4 h-4" />}
                  isLoading={isProcessing}
                  isDisabled={selectedIndices.size === 0}
                  data-testid="detection-add-multi-btn"
                >
                  {t('detection.add_selected', { count: selectedIndices.size })}
                </Button>
              ) : type === 'id' ? (
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
                  data-testid="detection-view-chat-btn"
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
