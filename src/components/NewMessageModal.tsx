/**
 * New Message Modal - Shows detected new messages (private or broadcast)
 * Provides "View Chat" action button to navigate to the conversation
 */

/* eslint-disable max-lines-per-function */
import { Avatar, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { MessageSquare, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  senderName: string;
  senderFingerprint: string;
  isBroadcast: boolean;
}

export function NewMessageModal({
  isOpen,
  onClose,
  senderName,
  senderFingerprint,
  isBroadcast,
}: NewMessageModalProps) {
  const { setActiveChat } = useAppStore();
  const { setActiveTab } = useUIStore();
  const { t } = useTranslation();

  const handleViewChat = async () => {
    try {
      // CRITICAL: Unified navigation - always use senderFingerprint to find contact
      // No special broadcast handling - messages are stored by sender's fingerprint
      const freshContacts = useAppStore.getState().contacts;
      const sender = freshContacts.find(c => c.fingerprint === senderFingerprint);
      if (sender) {
        // CRITICAL: await setActiveChat completion before switching tabs
        await setActiveChat(sender);
        setActiveTab('chats');
      }
      onClose();
    } catch (error) {
      logger.error('[NewMessageModal] Failed to navigate to chat:', error);
      // Still close modal even if navigation fails
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
                {isBroadcast ? (
                  <Radio className="w-5 h-5 text-primary" />
                ) : (
                  <MessageSquare className="w-5 h-5 text-primary" />
                )}
                <span>
                  {isBroadcast ? t('new_message.title_broadcast') : t('new_message.title_private')}
                </span>
              </div>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={senderName}
                    className="flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-industrial-100 truncate">
                      {isBroadcast ? t('new_message.broadcast_from', { name: senderName }) : senderName}
                    </p>
                    <p className="text-sm text-industrial-500 truncate">
                      {senderFingerprint.slice(-8)}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-industrial-400">
                  {isBroadcast
                    ? t('new_message.desc_broadcast')
                    : t('new_message.desc_private')}
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                {t('new_message.dismiss')}
              </Button>
              <Button color="primary" onPress={handleViewChat}>
                {t('new_message.view_chat')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

