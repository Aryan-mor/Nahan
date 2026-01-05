/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import {
  Avatar,
  Button,
  Card,
  CardBody,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from '@heroui/react';
import { motion } from 'framer-motion';
import { ClipboardPaste, MessageSquare, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DetectionResult } from '../hooks/useClipboardDetection';
import { useAppStore } from '../stores/appStore';
import * as logger from '../utils/logger';

import { ManualPasteModal } from './ManualPasteModal';
import { MyQRModal } from './MyQRModal';
import { NewMessageModal } from './NewMessageModal';

export function ChatList({
  onNewChat,
  onDetection,
}: {
  onNewChat: () => void;
  onDetection?: (result: DetectionResult) => void;
}) {
  const { t } = useTranslation();
  const {
    contacts,
    getContactsWithBroadcast,
    setActiveChat,
    handleUniversalInput,
    lastStorageUpdate,
    chatSummaries,
    refreshChatSummaries,
  } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');

  // New Chat Modal
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const qrModal = useDisclosure();
  const [modalSearch, setModalSearch] = useState('');
  const [isProcessingPaste, setIsProcessingPaste] = useState(false);
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);

  // Sender Selection Modal
  const [isSenderSelectOpen, setIsSenderSelectOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // New Message Modal
  const [newMessageResult, setNewMessageResult] = useState<{
    type: 'message' | 'contact';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  } | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);

  const handlePaste = async () => {
    let clipboardText = '';
    try {
      clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) {
        throw new Error('Clipboard empty');
      }
      const result = await handleUniversalInput(clipboardText, undefined, true);

      // If a message was detected, show the new message modal
      if (result && result.type === 'message') {
        setNewMessageResult(result);
        setShowNewMessageModal(true);
      }
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
      };
      if (err.message === 'SENDER_UNKNOWN') {
        setPendingMessage(clipboardText);
        setIsSenderSelectOpen(true);
      } else if (err.message === 'CONTACT_INTRO_DETECTED') {
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
          } else {
            toast.info(t('chat.list.contact_key_detected'));
            onNewChat(); // Fallback: Navigate to keys tab if handler not available
          }
        } else {
          toast.info(t('chat.list.contact_key_detected'));
          onNewChat(); // Fallback: Navigate to keys tab if handler not available
        }
      } else {
        toast.error(t('chat.list.process_error'));
        logger.error('[UniversalInput] Error:', error);
        // If clipboard access failed, open manual input
        if (err.message?.includes('Clipboard')) {
          setIsManualPasteOpen(true);
        }
      }
    }
  };

  const handleSelectSender = async (fingerprint: string) => {
    if (!pendingMessage) return;

    setIsSenderSelectOpen(false);
    setIsProcessingPaste(true);

    try {
      const result = await handleUniversalInput(pendingMessage, fingerprint, true);

      // If a message was detected, show the new message modal
      if (result && result.type === 'message') {
        setNewMessageResult(result);
        setShowNewMessageModal(true);
      }

      setPendingMessage(null);
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
          } else {
            toast.info(t('chat.list.contact_key_detected'));
            onNewChat(); // Fallback: Navigate to keys tab if handler not available
          }
        } else {
          toast.info(t('chat.list.contact_key_detected'));
          onNewChat(); // Fallback: Navigate to keys tab if handler not available
        }
      } else {
        logger.error('[UniversalInput] Error:', error);
        toast.error(t('chat.list.import_error'));
      }
    } finally {
      setIsProcessingPaste(false);
    }
  };

  const handleManualPaste = async (content: string) => {
    setIsProcessingPaste(true);
    try {
      const result = await handleUniversalInput(content, undefined, true);

      // If a message was detected, show the new message modal
      if (result && result.type === 'message') {
        setNewMessageResult(result);
        setShowNewMessageModal(true);
      }

      setIsManualPasteOpen(false);
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
      };
      if (err.message === 'SENDER_UNKNOWN') {
        setPendingMessage(content);
        setIsManualPasteOpen(false);
        setIsSenderSelectOpen(true);
      } else if (err.message === 'CONTACT_INTRO_DETECTED') {
        // UNIFICATION: Handle contact ID detection the same way as auto-detector
        setIsManualPasteOpen(false);
        if (onDetection && err.keyData) {
          const contactName = err.keyData.name || err.keyData.username || 'Unknown';
          const contactPublicKey = err.keyData.publicKey || err.keyData.key;
          if (contactPublicKey) {
            onDetection({
              type: 'id',
              contactName: contactName,
              contactPublicKey: contactPublicKey,
            });
          } else {
            toast.info(t('chat.list.contact_key_detected'));
            onNewChat(); // Fallback: Navigate to keys tab if handler not available
          }
        } else {
          toast.info(t('chat.list.contact_key_detected'));
          onNewChat(); // Fallback: Navigate to keys tab if handler not available
        }
      } else {
        toast.error(t('chat.list.process_error'));
        logger.error('[UniversalInput] Error:', error);
      }
    } finally {
      setIsProcessingPaste(false);
    }
  };

  useEffect(() => {
    refreshChatSummaries();
    // REACTIVITY: Strictly tied to lastStorageUpdate to trigger re-fetch when IndexedDB changes
    // This ensures ChatList updates when messages are imported via clipboard or sent
  }, [lastStorageUpdate, contacts, refreshChatSummaries]);

  // Get contacts with broadcast at index 0
  const allContacts = getContactsWithBroadcast();
  const filteredContacts = allContacts
    .filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.fingerprint.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      // Two-Tier Sorting System: Pinned Broadcast + Chronological

      // Tier 1 (Pinned): Broadcast Channel always at top
      if (a.fingerprint === 'BROADCAST') {
        return -1; // Broadcast always comes first
      }
      if (b.fingerprint === 'BROADCAST') {
        return 1; // Broadcast always comes first
      }

      // Tier 2 (Chronological): All other contacts sorted by newest first
      const msgA = chatSummaries[a.fingerprint];
      const msgB = chatSummaries[b.fingerprint];

      // Helper to convert date to timestamp (handles all date formats consistently)
      // Supports: Date objects, ISO strings, timestamp numbers, and invalid dates
      const getTime = (date: Date | string | number | undefined | null): number => {
        if (!date) return 0;

        // Handle Date objects
        if (date instanceof Date) {
          const time = date.getTime();
          return isNaN(time) ? 0 : time;
        }

        // Handle numbers (timestamps)
        if (typeof date === 'number') {
          return isNaN(date) ? 0 : date;
        }

        // Handle strings (ISO format, etc.)
        if (typeof date === 'string') {
          const dateObj = new Date(date);
          const time = dateObj.getTime();
          return isNaN(time) ? 0 : time;
        }

        return 0;
      };

      // Sort Logic: Newest messages/contacts MUST be at the top
      // timeB - timeA ensures descending order (newest first)
      const timeA = msgA ? getTime(msgA.createdAt) : getTime(a.createdAt);
      const timeB = msgB ? getTime(msgB.createdAt) : getTime(b.createdAt);
      return timeB - timeA; // Correct: newest at top
    });

  // Log sorting result
  const broadcastCount = filteredContacts.filter((c) => c.fingerprint === 'BROADCAST').length;
  const regularContactsCount = filteredContacts.length - broadcastCount;
  logger.debug(
    `[UI] Chat list sorted: Broadcast pinned, ${regularContactsCount} contacts chronological`,
  );

  // Filter out broadcast contact from modal (only show real contacts)
  const modalFilteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
      c.fingerprint.toLowerCase().includes(modalSearch.toLowerCase()),
  );

  /**
   * Format date for display
   * Handles both Date objects and date strings (from IndexedDB serialization)
   */
  const formatTime = (date: Date | string) => {
    // Convert string to Date if needed (dates from IndexedDB are serialized as strings)
    const dateObj = date instanceof Date ? date : new Date(date);

    // Validate date
    if (isNaN(dateObj.getTime())) {
      return 'Invalid date';
    }

    const now = new Date();
    const diff = now.getTime() - dateObj.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days < 7) return dateObj.toLocaleDateString([], { weekday: 'short' });
    return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-industrial-100">{t('chat.list.title')}</h1>
          <div className="flex items-center gap-2">
            <Button
              isIconOnly
              variant="flat"
              className="rounded-full bg-industrial-800 text-industrial-300"
              onPress={handlePaste}
              isLoading={isProcessingPaste}
              title={t('chat.list.paste_encrypted')}
            >
              <ClipboardPaste className="w-5 h-5" />
            </Button>
            <Button
              isIconOnly
              color="primary"
              variant="flat"
              onPress={onOpen}
              className="rounded-full"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <Input
          placeholder={t('chat.list.search_placeholder')}
          startContent={<Search className="w-4 h-4 text-industrial-400" />}
          value={searchQuery}
          onValueChange={setSearchQuery}
          classNames={{
            inputWrapper: 'bg-industrial-900 border-industrial-800',
          }}
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-20 space-y-2 scrollbar-hide">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-industrial-500 opacity-50">
            <MessageSquare className="w-12 h-12 mb-2" />
            <p>{t('chat.list.no_chats')}</p>
            <Button size="sm" variant="light" onPress={onOpen} className="mt-2 text-primary-400">
              {t('chat.list.start_chat')}
            </Button>
          </div>
        ) : (
          filteredContacts.map((contact, index) => {
            const lastMsg = chatSummaries[contact.fingerprint];
            const isBroadcast = contact.fingerprint === 'BROADCAST';
            const showSeparator = isBroadcast && filteredContacts.length > 1 && index === 0;

            return (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
                className={isBroadcast ? 'order-first' : ''}
              >
                <Card
                  isPressable
                  onPress={() => setActiveChat(contact)}
                  className={`w-full transition-colors ${
                    isBroadcast
                      ? 'bg-industrial-800/50 border-primary-500/20 hover:bg-industrial-800/70'
                      : 'bg-industrial-900 border-industrial-800 hover:bg-industrial-800'
                  }`}
                >
                  <CardBody className="flex flex-row items-center gap-3 p-3 overflow-hidden">
                    <Avatar
                      name={contact.name}
                      className="flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <h3 className="font-medium text-industrial-100 truncate pr-2">
                          {isBroadcast ? t('broadcast_channel') : contact.name}
                        </h3>
                        {lastMsg && (
                          <span className="text-[10px] text-industrial-500 flex-shrink-0">
                            {formatTime(lastMsg.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-industrial-400 truncate pr-4">
                          {lastMsg ? (
                            lastMsg.content.plain
                          ) : (
                            <span className="italic text-industrial-600">{t('chat.list.no_messages')}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Section Separator: Show after broadcast if there are other contacts */}
                {showSeparator && (
                  <div className="mt-3 mb-2 px-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-industrial-800"></div>
                      <span className="text-xs text-industrial-500 px-2">{t('chat.list.recent_conversations')}</span>
                      <div className="flex-1 h-px bg-industrial-800"></div>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* New Chat Modal */}
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable={false}
        isKeyboardDismissDisabled={true}
        shouldCloseOnInteractOutside={() => false}
        classNames={{
          base: 'bg-industrial-900 border border-industrial-800',
          header: 'border-b border-industrial-800',
          footer: 'border-t border-industrial-800',
          closeButton: 'hover:bg-industrial-800 active:bg-industrial-700',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">{t('chat.list.new_chat.title')}</ModalHeader>
              <ModalBody>
                <Input
                  placeholder={t('chat.list.search_contacts_placeholder')}
                  startContent={<Search className="w-4 h-4 text-industrial-400" />}
                  value={modalSearch}
                  onValueChange={setModalSearch}
                  classNames={{
                    inputWrapper: 'bg-industrial-950 border-industrial-800',
                  }}
                  className="mb-4"
                />
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {modalFilteredContacts.length === 0 ? (
                    <div className="text-center py-8 text-industrial-500">
                      <p>{t('chat.list.no_contacts')}</p>
                      <Button
                        size="sm"
                        variant="light"
                        className="mt-2 text-primary-400"
                        onPress={() => {
                          onClose();
                          onNewChat(); // Go to keys tab
                        }}
                      >
                        {t('chat.list.add_contact')}
                      </Button>
                    </div>
                  ) : (
                    modalFilteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-industrial-800 cursor-pointer transition-colors"
                        onClick={() => {
                          setActiveChat(contact);
                          onClose();
                        }}
                      >
                        <Avatar
                          name={contact.name}
                          className="flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                        />
                        <div className="flex-1">
                          <h4 className="text-industrial-100 font-medium">{contact.name}</h4>
                          <p className="text-xs text-industrial-500 truncate">
                            {contact.fingerprint.slice(-8)}
                          </p>
                        </div>
                        <MessageSquare className="w-4 h-4 text-industrial-500" />
                      </div>
                    ))
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  {t('chat.list.cancel')}
                </Button>
                <Button
                  color="primary"
                  onPress={() => {
                    onClose();
                    onNewChat();
                  }}
                >
                  {t('chat.list.add_new_contact')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      {/* Sender Selection Modal */}
      <Modal
        isOpen={isSenderSelectOpen}
        onOpenChange={setIsSenderSelectOpen}
        isDismissable={false}
        isKeyboardDismissDisabled={true}
        shouldCloseOnInteractOutside={() => false}
        classNames={{
          base: 'bg-industrial-900 border border-industrial-800',
          header: 'border-b border-industrial-800',
          footer: 'border-t border-industrial-800',
          closeButton: 'hover:bg-industrial-800 active:bg-industrial-700',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {t('chat.list.select_sender.title')}
                <p className="text-sm font-normal text-industrial-400">
                  {t('chat.list.select_sender.desc')}
                </p>
              </ModalHeader>
              <ModalBody>
                <Input
                  placeholder={t('chat.list.search_contacts_placeholder')}
                  startContent={<Search className="w-4 h-4 text-industrial-400" />}
                  value={modalSearch}
                  onValueChange={setModalSearch}
                  classNames={{
                    inputWrapper: 'bg-industrial-950 border-industrial-800',
                  }}
                  className="mb-4"
                />
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {modalFilteredContacts.length === 0 ? (
                    <div className="text-center py-8 text-industrial-500">
                      <p>{t('chat.list.no_contacts')}</p>
                    </div>
                  ) : (
                    modalFilteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-industrial-800 cursor-pointer transition-colors"
                        onClick={() => handleSelectSender(contact.fingerprint)}
                      >
                        <Avatar
                          name={contact.name}
                          className="flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                        />
                        <div className="flex-1">
                          <h4 className="text-industrial-100 font-medium">{contact.name}</h4>
                          <p className="text-xs text-industrial-500 truncate">
                            {contact.fingerprint.slice(-8)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  {t('chat.list.cancel')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ManualPasteModal
        isOpen={isManualPasteOpen}
        onClose={() => setIsManualPasteOpen(false)}
        onSubmit={handleManualPaste}
        title={t('chat.list.import_title')}
      />

      {/* New Message Modal */}
      {newMessageResult && (
        <NewMessageModal
          isOpen={showNewMessageModal}
          onClose={() => {
            setShowNewMessageModal(false);
            setNewMessageResult(null);
          }}
          senderName={newMessageResult.senderName}
          senderFingerprint={newMessageResult.fingerprint}
          isBroadcast={newMessageResult.isBroadcast}
        />
      )}
      {/* QR Modal */}
      <MyQRModal isOpen={qrModal.isOpen} onOpenChange={qrModal.onOpenChange} />
    </div>
  );
}
