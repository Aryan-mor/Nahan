/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import {
    Avatar,
    Button,
    Card,
    CardBody,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    useDisclosure,
} from '@heroui/react';
import {
    CheckCircle,
    Edit2,
    ImageDown,
    MessageSquare,
    MoreVertical,
    Plus,
    Search,
    Share2,
    Trash2,
    X
} from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';


import { DetectionResult } from '../hooks/useClipboardDetection';
import { ImageSteganographyService } from '../services/steganography';
import { Contact, StorageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useSteganographyStore } from '../stores/steganographyStore';
import * as logger from '../utils/logger';
import { ChatListItem } from './ChatListItem';
import { ManualPasteButton } from './ManualPasteButton';

import { useContactActions } from '../hooks/useContactActions';

import { ContactActionModals } from './ContactActionModals';

export const ChatList = React.memo(ChatListComponent);

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ChatList as any).whyDidYouRender = true;
}

function ChatListComponent({
  onNewChat,
  onDetection,
}: {
  onNewChat: () => void;
  onDetection?: (result: DetectionResult) => void;
}) {


  const { t } = useTranslation();

  // ATOMIC SELECTORS: Each selector only re-renders when its specific state changes
  const contacts = useAppStore(state => state.contacts);
  const getContactsWithBroadcast = useAppStore(state => state.getContactsWithBroadcast);
  const setActiveChat = useAppStore(state => state.setActiveChat);
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
  const [modalSearch, setModalSearch] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // --- SELECTION & LONG PRESS STATE ---
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFingerprints, setSelectedFingerprints] = useState<Set<string>>(new Set());
  const [menuContact, setMenuContact] = useState<Contact | null>(null);

  // Modals state (managed partly by hook now)
  const { isOpen: isMenuOpen, onOpen: openMenu, onOpenChange: onMenuChange } = useDisclosure();

  // Use the new hook for actions
  const {
      openRename,
      openShare,
      openDeleteHistory,
      openDeleteContact,
      modals
  } = useContactActions();

  // --- ACTIONS ---

  const handleLongPress = (contact: Contact) => {
    if (selectionMode) return; // Ignore long press in selection mode
    if (contact.fingerprint === 'BROADCAST') return; // Broadcast is not selectable
    setMenuContact(contact);
    openMenu();
  };

  const toggleSelection = (fingerprint: string) => {
    if (fingerprint === 'BROADCAST') return; // Broadcast cannot be selected
    const newSet = new Set(selectedFingerprints);
    if (newSet.has(fingerprint)) {
      newSet.delete(fingerprint);
    } else {
      newSet.add(fingerprint);
    }
    setSelectedFingerprints(newSet);
  };

  const enterSelectionMode = () => {
    if (menuContact) {
      setSelectedFingerprints(new Set([menuContact.fingerprint]));
      setSelectionMode(true);
      onMenuChange(); // Close menu
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedFingerprints(new Set());
  };

  // Wrapper handlers that pass data to the hook
  const onShareAction = () => {
    if (menuContact) {
        onMenuChange();
        openShare(menuContact);
    }
  };

  const onRenameAction = () => {
    if (menuContact) {
        onMenuChange();
        openRename(menuContact);
    }
  };

  const onDeleteHistoryAction = () => {
    if (menuContact) {
        onMenuChange();
        openDeleteHistory(menuContact);
    }
  };

  const onDeleteContactAction = () => {
    if (menuContact) {
        onMenuChange();
        openDeleteContact(menuContact);
    }
  };

  // Bulk actions from Selection Header
  const onBulkDeleteHistory = () => {
      // Pass the set of fingerprints to the hook
      openDeleteHistory(null, selectedFingerprints);
      // NOTE: Hook handles deletion. To exit selection mode after, we might need to
      // check if modals close or wrap the logic differently.
      // Current hook has no "onSuccess" callback.
      // For now, let's keep it simple: The user manually closes selection or we can improve hooks later.
      // Ideally, the modal closing triggers something?
      // Let's modify hook in next iteration if strictly needed, or just let users click X.
      // Actually, standard behavior is to exit selection mode after bulk action.
      // Since `useContactActions` isolates state, we can't easily callback here without passing a callback TO the hook.
      // Let's just run it. The user can close selection mode.
  };

  const onBulkDeleteContact = () => {
    openDeleteContact(null, selectedFingerprints);
  };

  const onBulkShare = () => {
    // Get all selected contacts from fingerprints
    const selectedContacts = contacts.filter(c => selectedFingerprints.has(c.fingerprint));
    if (selectedContacts.length > 0) {
      openShare(selectedContacts);
      exitSelectionMode();
    }
  };



  // Get contacts with broadcast at index 0
  const allContacts = getContactsWithBroadcast();

  // MEMOIZED: Expensive filtering and sorting only runs when dependencies change
  // Prevents re-sorting on every render (major performance improvement)
  const filteredContacts = useMemo(() => {
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

    return result;
  }, [allContacts, searchQuery, chatSummaries]); // selectionMode is unnecessary here



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


  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 space-y-4">
        {selectionMode ? (
           // SELECTION MODE HEADER
           <div className="flex items-center justify-between bg-industrial-800 p-2 rounded-lg animate-in fade-in slide-in-from-top-2">
             <div className="flex items-center gap-3">
               <Button isIconOnly variant="light" onPress={exitSelectionMode}>
                 <X className="w-5 h-5 text-industrial-400" />
               </Button>
               <span className="font-bold text-industrial-100">
                 {selectedFingerprints.size} {t('common.selected', 'selected')}
               </span>
             </div>
             <div className="flex items-center gap-1">
               <Dropdown>
                 <DropdownTrigger>
                   <Button
                     isIconOnly
                     variant="light"
                     className="text-industrial-300"
                     data-testid="selection-menu-trigger"
                   >
                     <MoreVertical className="w-5 h-5" />
                   </Button>
                 </DropdownTrigger>
                 <DropdownMenu
                    aria-label="Selection Actions"
                    onAction={(key) => {
                      if (key === 'share') onBulkShare();
                      if (key === 'delete_history') onBulkDeleteHistory();
                      if (key === 'delete_contact') onBulkDeleteContact();
                    }}
                  >
                    <DropdownItem
                      key="share"
                      startContent={<Share2 className="w-4 h-4 text-blue-400" />}
                      data-testid="contact-option-bulk-share"
                    >
                      {t('common.share', 'Share')}
                    </DropdownItem>
                    <DropdownItem
                      key="delete_history"
                      startContent={<Trash2 className="w-4 h-4" />}
                      className="text-danger"
                      data-testid="contact-option-bulk-delete-history"
                    >
                      {t('chat.list.delete_history')}
                    </DropdownItem>
                    <DropdownItem
                      key="delete_contact"
                      startContent={<Trash2 className="w-4 h-4" />}
                      className="text-danger"
                      description={t('chat.list.delete_contact_desc', "Also removes form list")}
                      data-testid="contact-option-bulk-delete-contact"
                    >
                      {t('chat.list.delete_contact')}
                    </DropdownItem>
                  </DropdownMenu>
               </Dropdown>
             </div>
           </div>
        ) : (
          // NORMAL HEADER
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-industrial-100" data-testid="chat-list-title">{t('chat.list.title')}</h1>
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
                <ManualPasteButton
                  onNewChat={onNewChat}
                  onDetection={onDetection}
                  className="rounded-full bg-industrial-800 text-industrial-300"
                  variant="flat"
                />
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
          </>
        )}
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
            const isSelected = selectedFingerprints.has(contact.fingerprint);

            return (
              <ChatListItem
                key={contact.id}
                contact={contact}
                lastMsg={lastMsg}
                isBroadcast={isBroadcast}
                showSeparator={showSeparator}
                isSelected={isSelected}
                selectionMode={selectionMode}
                onLongPress={handleLongPress}
                onClick={setActiveChat}
                onToggleSelection={toggleSelection}
              />
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



      {/* --- ACTION SHEET MODAL (Long Press Menu) --- */}
      <Modal
        isOpen={isMenuOpen}
        onOpenChange={onMenuChange}
        placement="bottom"
        classNames={{
            base: 'bg-industrial-900 border border-industrial-800 mb-0 rounded-b-none rounded-t-2xl sm:mb-auto sm:rounded-2xl',
            header: 'border-b border-industrial-800',
            footer: 'border-t border-industrial-800',
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {menuContact?.name || t('common.options')}
                <span className="text-xs font-normal text-industrial-500">{t('chat.list.actions_prompt', 'Choose an action')}</span>
              </ModalHeader>
              <ModalBody className="py-4 gap-3">
                 <Button
                    className="justify-start gap-3 bg-industrial-800 text-industrial-100"
                    size="lg"
                    onPress={enterSelectionMode}
                    data-testid="contact-option-select"
                  >
                    <CheckCircle className="w-5 h-5 text-primary-500" />
                    {t('common.select', 'Select')}
                 </Button>

                 <Button
                    className="justify-start gap-3 bg-industrial-800 text-industrial-100"
                    size="lg"
                    onPress={onShareAction}
                    data-testid="contact-option-share"
                  >
                    <Share2 className="w-5 h-5 text-blue-400" />
                    {t('common.share', 'Share')}
                 </Button>

                 <Button
                    className="justify-start gap-3 bg-industrial-800 text-industrial-100"
                    size="lg"
                    onPress={onRenameAction}
                    data-testid="contact-option-rename"
                  >
                     <Edit2 className="w-5 h-5 text-yellow-400" />
                     {t('common.rename', 'Rename')}
                 </Button>

                 <div className="h-px bg-industrial-800 my-1" />

                 <Button
                    className="justify-start gap-3 bg-industrial-800 text-danger-400"
                    size="lg"
                    onPress={onDeleteHistoryAction}
                    data-testid="contact-option-delete-history"
                  >
                     <Trash2 className="w-5 h-5" />
                     {t('chat.list.delete_history', 'Delete History')}
                 </Button>

                 <Button
                    className="justify-start gap-3 bg-industrial-800 text-danger-500"
                    size="lg"
                    onPress={onDeleteContactAction}
                    data-testid="contact-option-delete-contact"
                  >
                     <Trash2 className="w-5 h-5 fill-current" />
                     {t('chat.list.delete_contact', 'Delete Contact')}
                 </Button>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Render the shared action modals (Rename, Delete Confirmations, QR) */}
      <ContactActionModals modals={modals} />


    </div>
  );
}
