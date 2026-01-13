/* eslint-disable max-lines, no-console */
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
import {
    ClipboardPaste,
    ImageDown,
    Image as ImageIcon,
    MessageSquare,
    Plus,
    Search,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DetectionResult } from '../hooks/useClipboardDetection';
import { analyzeClipboard } from '../services/clipboardAnalysis';
import { ImageSteganographyService } from '../services/steganography';
import { Contact, StorageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useSteganographyStore } from '../stores/steganographyStore';
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
  // [PERF] Re-render counter for telemetry
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  console.log(`[PERF][RENDER] ChatList - Render Count: ${renderCountRef.current} - Time: ${performance.now().toFixed(2)}ms`);

  const { t } = useTranslation();

  // ATOMIC SELECTORS: Each selector only re-renders when its specific state changes
  const contacts = useAppStore(state => state.contacts);
  const getContactsWithBroadcast = useAppStore(state => state.getContactsWithBroadcast);
  const setActiveChat = useAppStore(state => state.setActiveChat);
  const handleUniversalInput = useAppStore(state => state.handleUniversalInput);
  const chatSummaries = useAppStore(state => state.chatSummaries);
  const refreshChatSummaries = useAppStore(state => state.refreshChatSummaries);
  const identity = useAppStore(state => state.identity);
  const sessionPassphrase = useAppStore(state => state.sessionPassphrase);

  // ATOMIC SELECTORS for Steganography Store
  const decodingStatus = useSteganographyStore(state => state.decodingStatus);
  const setDecodingStatus = useSteganographyStore(state => state.setDecodingStatus);
  const setDecodedImageUrl = useSteganographyStore(state => state.setDecodedImageUrl);
  const setDecodingError = useSteganographyStore(state => state.setDecodingError);
  const resetDecoding = useSteganographyStore(state => state.resetDecoding);
  const decodedImageUrl = useSteganographyStore(state => state.decodedImageUrl);
  const stegoService = ImageSteganographyService.getInstance();
  const storageService = StorageService.getInstance();
  const [searchQuery, setSearchQuery] = useState('');
  const [decodedContact, setDecodedContact] = useState<Contact | null>(null);

  // New Chat Modal
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const qrModal = useDisclosure();
  const [modalSearch, setModalSearch] = useState('');
  const [isProcessingPaste, setIsProcessingPaste] = useState(false);
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sender Selection Modal
  const [isSenderSelectOpen, setIsSenderSelectOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // New Message Modal
  const [newMessageResult, setNewMessageResult] = useState<{
    type: 'message';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  } | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);

  const handlePaste = async () => {
    setIsProcessingPaste(true);
    setDecodingStatus('processing');
    let decodingOutcome: 'success' | 'error' | null = null;

    try {
      if (!identity || !sessionPassphrase) {
        toast.error(t('auth.required'));
        return;
      }

      const { processed } = await analyzeClipboard({
        identity,
        sessionPassphrase,
        contacts,
        handleUniversalInput,
      });

      if (processed) {
        if (processed.type === 'message') {
          // Message already stored by analyzeClipboard (if image) or handleUniversalInput (if text)
          // We just need to update UI

          if (processed.source === 'image') {
            setDecodingStatus('success');
            decodingOutcome = 'success';
            toast.success(t('stealth.decode_success', 'Image decoded successfully'));
          }

          setNewMessageResult({
            type: 'message',
            fingerprint: processed.fingerprint!,
            isBroadcast: processed.isBroadcast || false,
            senderName: processed.senderName || 'Unknown',
          });
          setShowNewMessageModal(true);
        } else if (processed.type === 'id') {
          // Handle contact detection
          // analyzeClipboard might return contact type from handleUniversalInput
          if (processed.data) {
            const contactData = processed.data;
            // Use existing logic for contact intro
            if (onDetection) {
              onDetection({
                type: 'id',
                contactName: contactData.name || 'Unknown',
                contactPublicKey: contactData.publicKey || contactData.key,
              });
            } else {
              toast.info(t('chat.list.contact_key_detected'));
              onNewChat();
            }
          }
        }
      } else {
        // Nothing found - smart fallback to manual paste
        toast.info(t('chat.list.clipboard_empty', 'Clipboard empty or format not supported'));
        setIsManualPasteOpen(true);
      }
    } catch (error: unknown) {
      setDecodingStatus('error');
      decodingOutcome = 'error';
      const err = error as {
        message?: string;
        keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
      };

      if (err.message === 'SENDER_UNKNOWN') {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            setPendingMessage(text);
            setIsSenderSelectOpen(true);
          }
        } catch {
          // Fallback to manual if clipboard read fails
          setIsManualPasteOpen(true);
        }
      } else if (err.message === 'CONTACT_INTRO_DETECTED') {
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
            onNewChat();
          }
        } else {
          toast.info(t('chat.list.contact_key_detected'));
          onNewChat();
        }
      } else {
        logger.error('[UniversalInput] Error:', error);

        // SMART FALLBACK: For any other error (invalid format, permission denied, etc.),
        // just open the manual paste modal so user can try manually.
        setIsManualPasteOpen(true);
      }
    } finally {
      setIsProcessingPaste(false);
      // Reset status if we didn't finish with success/error (e.g. text message or empty)
      if (!decodingOutcome) {
        setDecodingStatus('idle');
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
    setDecodingStatus('processing');
    setDecodedContact(null);
    setDecodingError(null);

    // Check for Data URL (Image Steganography)
    if (content.startsWith('data:image')) {
      try {
        if (!identity || !sessionPassphrase) {
          toast.error(t('auth.required'));
          return;
        }

        // Convert Data URL to Blob/File
        const res = await fetch(content);
        const blob = await res.blob();
        const file = new File([blob], "pasted_image.png", { type: blob.type });

        // Decode
        const { url, senderPublicKey } = await stegoService.decode(
          file,
          identity.privateKey,
          sessionPassphrase,
          contacts.map((c) => c.publicKey),
        );
        setDecodedImageUrl(url || null);

        // Store message logic
        if (senderPublicKey) {
          const contact = contacts.find((c) => c.publicKey === senderPublicKey);
          if (contact) {
            setDecodedContact(contact);

             // Store as 'image_stego'
             await storageService.storeMessage(
               {
                 senderFingerprint: contact.fingerprint,
                 recipientFingerprint: identity.fingerprint,
                 type: 'image_stego',
                 content: {
                   plain: '',
                   encrypted: '',
                   image: content, // Use the original Data URL
                 },
                 isOutgoing: false,
                 read: false,
                 status: 'sent',
               },
               sessionPassphrase,
             );

            refreshChatSummaries();
            toast.success(t('steganography.message_saved', 'Message saved to chat'));

            // TRIGGER NEW MESSAGE MODAL
            setNewMessageResult({
               type: 'message',
               fingerprint: contact.fingerprint,
               isBroadcast: false,
               senderName: contact.name,
            });
            setShowNewMessageModal(true);
          } else {
             toast.warning(t('steganography.unknown_sender', 'Decoded from unknown sender'));
          }
        }
        setDecodingStatus('success');
        setIsManualPasteOpen(false);
      } catch (error) {
        setDecodingStatus('error');
        setDecodingError((error as Error).message);
        toast.error(t('steganography.decode_error', 'Failed to decode image'));
      } finally {
        setIsProcessingPaste(false);
      }
      return;
    }

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

  // INITIAL LOAD ONLY: Fetch summaries once on mount
  // O(1) updates happen inline in sendMessage/handleUniversalInput
  useEffect(() => {
    refreshChatSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only - O(1) inline updates handle subsequent changes

  // [PERF] UI Rendering Audit - measures time from store update to render commit


  // Get contacts with broadcast at index 0
  const allContacts = getContactsWithBroadcast();

  // MEMOIZED: Expensive filtering and sorting only runs when dependencies change
  // Prevents re-sorting on every render (major performance improvement)
  const filteredContacts = useMemo(() => {
    const sortStart = performance.now();

    // Helper to convert date to timestamp (handles all date formats consistently)
    const getTime = (date: Date | string | number | undefined | null): number => {
      if (!date) return 0;
      if (date instanceof Date) {
        const time = date.getTime();
        return isNaN(time) ? 0 : time;
      }
      if (typeof date === 'number') {
        return isNaN(date) ? 0 : date;
      }
      if (typeof date === 'string') {
        const dateObj = new Date(date);
        const time = dateObj.getTime();
        return isNaN(time) ? 0 : time;
      }
      return 0;
    };

    const result = allContacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.fingerprint.toLowerCase().includes(searchQuery.toLowerCase()),
      )
      .sort((a, b) => {
        // Tier 1: Broadcast always at top
        if (a.fingerprint === 'BROADCAST') return -1;
        if (b.fingerprint === 'BROADCAST') return 1;

        // Tier 2: Chronological (newest first)
        const msgA = chatSummaries[a.fingerprint];
        const msgB = chatSummaries[b.fingerprint];
        const timeA = msgA ? getTime(msgA.createdAt) : getTime(a.createdAt);
        const timeB = msgB ? getTime(msgB.createdAt) : getTime(b.createdAt);
        return timeB - timeA;
      });

    console.log(`[PERF][UI] Contacts Sorting - Duration: ${(performance.now() - sortStart).toFixed(2)}ms - Count: ${result.length}`);
    return result;
  }, [allContacts, searchQuery, chatSummaries]);

  // [PERF] DOM Commit Phase - fires after React updates DOM but before browser paint
  useLayoutEffect(() => {
    console.log(`[PERF][UI] DOM Commit Phase Finished at ${performance.now().toFixed(2)}ms`);
  });

  // Log sorting result (only in dev)
  if (process.env.NODE_ENV === 'development') {
    const broadcastCount = filteredContacts.filter((c) => c.fingerprint === 'BROADCAST').length;
    logger.debug(`[UI] Chat list: ${filteredContacts.length - broadcastCount} contacts`);
  }

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
            <input
              type="file"
              accept="image/*"
              ref={fileRef}
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!identity || !sessionPassphrase) {
                  toast.error(t('chat.input.error.missing_context'));
                  return;
                }
                resetDecoding();
                setDecodingStatus('processing');
                setDecodedContact(null);
                try {
                  const { url, senderPublicKey } = await stegoService.decode(
                    file,
                    identity.privateKey,
                    sessionPassphrase,
                    contacts.map((c) => c.publicKey),
                  );
                  setDecodedImageUrl(url || null);

                  // Store message logic
                  if (senderPublicKey) {
                    const contact = contacts.find((c) => c.publicKey === senderPublicKey);
                    if (contact) {
                      setDecodedContact(contact);

                      // Convert file to base64 for storage
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const base64Image = reader.result as string;
                        // Store as 'image_stego' so it renders as mesh gradient but contains the carrier
                        // The Chat View will auto-decode it using the logic we just added
                        await storageService.storeMessage(
                          {
                            senderFingerprint: contact.fingerprint,
                            recipientFingerprint: identity.fingerprint,
                            type: 'image_stego',
                            content: {
                              plain: '',
                              encrypted: '', // Payload is in the pixels
                              image: base64Image,
                            },
                            isOutgoing: false,
                            read: false,
                            status: 'sent',
                          },
                          sessionPassphrase,
                        );

                        // Refresh summaries to show new message
                        refreshChatSummaries();
                        toast.success(t('steganography.message_saved', 'Message saved to chat'));
                      };
                      reader.readAsDataURL(file);
                    } else {
                      // Unknown sender - maybe just show the decoded image?
                      // Or should we prompt to add contact?
                      // For now, standard behavior is just show success
                      toast.warning(
                        t('steganography.unknown_sender', 'Decoded from unknown sender'),
                      );
                    }
                  }

                  setDecodingStatus('success');
                } catch (error) {
                  setDecodingStatus('error');
                  setDecodingError((error as Error).message);
                  toast.error(t('steganography.decode_error', 'Failed to decode image'));
                } finally {
                  if (fileRef.current) {
                    fileRef.current.value = '';
                  }
                }
              }}
            />
            <Button
              isIconOnly
              variant="flat"
              className="rounded-full bg-industrial-800 text-industrial-300"
              onPress={handlePaste}
              isLoading={isProcessingPaste}
              title={t('chat.list.paste_encrypted')}
              data-testid="chat-list-manual-paste-icon"
            >
              <ClipboardPaste className="w-5 h-5" />
            </Button>
            <Button
              isIconOnly
              variant="flat"
              className="rounded-full bg-industrial-800 text-industrial-300"
              onPress={() => fileRef.current?.click()}
              title={t('steganography.decode_image', 'Decode Stego Image')}
            >
              <ImageDown className="w-5 h-5" />
            </Button>
            <Button
              isIconOnly
              color="primary"
              variant="flat"
              onPress={onOpen}
              className="rounded-full"
              data-testid="add-chat-button"
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
        {decodingStatus !== 'idle' && (
          <Card
            className={`w-full ${
              decodingStatus === 'success'
                ? 'bg-success-900/30 border-success-700'
                : decodingStatus === 'error'
                ? 'bg-danger-900/30 border-danger-700'
                : 'bg-industrial-800 border-industrial-700'
            }`}
          >
            <CardBody className="flex items-center justify-between p-3">
              <div className="text-sm">
                {decodingStatus === 'processing' &&
                  t('steganography.decoding', 'Decoding image...')}
                {decodingStatus === 'success' &&
                  t('steganography.decode_success', 'Decoded successfully')}
                {decodingStatus === 'error' && t('steganography.decode_error', 'Failed to decode')}
              </div>
              {decodingStatus === 'success' && (decodedImageUrl || decodedContact) && (
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    if (decodedContact) {
                      setActiveChat(decodedContact);
                      resetDecoding(); // Close the card
                    } else if (decodedImageUrl) {
                      window.open(decodedImageUrl, '_blank');
                    }
                  }}
                >
                  {decodedContact
                    ? t('steganography.view_in_chat', 'View in Chat')
                    : t('steganography.view_image', 'View Image')}
                </Button>
              )}
            </CardBody>
          </Card>
        )}
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
                  data-testid={`chat-item-${contact.name}`}
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
                        <p className="text-sm text-industrial-400 truncate pr-4 max-w-36">
                          {lastMsg ? (
                            lastMsg.type === 'image' ||
                            lastMsg.type === 'image_stego' ||
                            lastMsg.content.image ? (
                              <span className="flex items-center gap-1">
                                <ImageIcon className="w-3 h-3" />
                                {t('chat.list.image', 'Image')}
                              </span>
                            ) : (
                              lastMsg.content.plain
                            )
                          ) : (
                            <span className="italic text-industrial-600">
                              {t('chat.list.no_messages')}
                            </span>
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
                      <span className="text-xs text-industrial-500 px-2">
                        {t('chat.list.recent_conversations')}
                      </span>
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
              <ModalHeader className="flex flex-col gap-1">
                {t('chat.list.new_chat.title')}
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

      {isManualPasteOpen && (
        <ManualPasteModal
          isOpen={isManualPasteOpen}
          onClose={() => setIsManualPasteOpen(false)}
          onSubmit={handleManualPaste}
          title={t('chat.list.import_title')}
        />
      )}

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
