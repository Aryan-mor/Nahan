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
import { toast } from 'sonner';
import { SecureMessage, storageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { ManualPasteModal } from './ManualPasteModal';

export function ChatList({ onNewChat }: { onNewChat: () => void }) {
  const { contacts, getContactsWithBroadcast, setActiveChat, processIncomingMessage } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [lastMessages, setLastMessages] = useState<Record<string, SecureMessage | undefined>>({});

  // New Chat Modal
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [modalSearch, setModalSearch] = useState('');
  const [isProcessingPaste, setIsProcessingPaste] = useState(false);
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);

  // Sender Selection Modal
  const [isSenderSelectOpen, setIsSenderSelectOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const processPasteContent = async (content: string) => {
    // Use unified detection logic - same as ChatInput.tsx
    // This ensures ZWC, PGP, and Base64 messages are all handled consistently
    setIsProcessingPaste(true);
    try {
      // Import required services
      const { CamouflageService } = await import('../services/camouflage');
      const camouflageService = CamouflageService.getInstance();
      const naclUtil = await import('tweetnacl-util');

      let encryptedData: string | null = null;

      // 1. Check if it's a stealth message (ZWC-embedded)
      if (camouflageService.hasZWC(content)) {
        try {
          let binary: Uint8Array;
          try {
            binary = camouflageService.decodeFromZWC(content, false);
          } catch (strictError: unknown) {
            const error = strictError as Error;
            if (error.message?.includes('Checksum mismatch') || error.message?.includes('corrupted')) {
              binary = camouflageService.decodeFromZWC(content, true);
            } else {
              throw strictError;
            }
          }
          encryptedData = naclUtil.encodeBase64(binary);
        } catch (error) {
          console.error('Failed to extract ZWC message in ChatList:', error);
          throw new Error('Failed to extract hidden message from cover text');
        }
      }

      // 2. Check if it's a PGP message (legacy format)
      if (!encryptedData && content.includes('-----BEGIN PGP MESSAGE-----')) {
        encryptedData = content;
      }

      // 3. Check if it's a Nahan Compact Protocol message (base64)
      if (!encryptedData) {
        try {
          const decoded = naclUtil.decodeBase64(content.trim());
          if (decoded.length > 0 && (decoded[0] === 0x01 || decoded[0] === 0x02)) {
            encryptedData = content.trim();
          }
        } catch {
          // Not base64, continue
        }
      }

      if (encryptedData) {
        await processIncomingMessage(encryptedData);
        toast.success('Message decrypted and imported');
      } else {
        toast.info('No encrypted message found in content');
        throw new Error('No encrypted message found');
      }
    } catch (error: any) {
      if (error.message === 'SENDER_UNKNOWN') {
        setPendingMessage(content);
        setIsSenderSelectOpen(true);
      } else {
        toast.error('Failed to decrypt message');
        console.error(error);
        throw error; // Re-throw for modal handling if called from there
      }
    } finally {
      setIsProcessingPaste(false);
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) {
        throw new Error('Clipboard empty');
      }
      await processPasteContent(clipboardText);
    } catch (error) {
      console.warn('Clipboard access failed, opening manual input:', error);
      setIsManualPasteOpen(true);
    }
  };

  const handleSelectSender = async (fingerprint: string) => {
    if (!pendingMessage) return;

    setIsSenderSelectOpen(false);
    setIsProcessingPaste(true);

    try {
      await processIncomingMessage(pendingMessage, fingerprint);
      toast.success('Message assigned and imported');
      setPendingMessage(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to import message');
    } finally {
      setIsProcessingPaste(false);
    }
  };

  useEffect(() => {
    const loadLastMessages = async () => {
      const { sessionPassphrase } = useAppStore.getState();
      if (!sessionPassphrase) return;

      const map: Record<string, SecureMessage | undefined> = {};
      // Load messages for all contacts including broadcast
      const allContacts = getContactsWithBroadcast();
      for (const contact of allContacts) {
        // For broadcast contact, we need to aggregate messages from all contacts
        if (contact.id === 'system_broadcast') {
          // Get the most recent broadcast message across all contacts
          let latestBroadcast: SecureMessage | undefined;
          for (const c of contacts) {
            const messages = await storageService.getMessagesByFingerprint(c.fingerprint, sessionPassphrase);
            const broadcastMsgs = messages.filter(m => m.isBroadcast && !m.isOutgoing);
            if (broadcastMsgs.length > 0) {
              const latest = broadcastMsgs[0]; // Already sorted descending
              if (!latestBroadcast || new Date(latest.createdAt) > new Date(latestBroadcast.createdAt)) {
                latestBroadcast = latest;
              }
            }
          }
          map[contact.fingerprint] = latestBroadcast;
        } else {
          map[contact.fingerprint] = await storageService.getLastMessage(contact.fingerprint, sessionPassphrase);
        }
      }
      setLastMessages(map);
    };
    loadLastMessages();
  }, [contacts, getContactsWithBroadcast]);

  // Get contacts with broadcast at index 0
  const allContacts = getContactsWithBroadcast();
  const filteredContacts = allContacts
    .filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.fingerprint.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      // Sort by last message time, then created time
      const msgA = lastMessages[a.fingerprint];
      const msgB = lastMessages[b.fingerprint];

      // Helper to convert date to timestamp (handles both Date objects and strings)
      const getTime = (date: Date | string): number => {
        if (date instanceof Date) {
          return date.getTime();
        }
        const dateObj = new Date(date);
        return isNaN(dateObj.getTime()) ? 0 : dateObj.getTime();
      };

      const timeA = msgA ? getTime(msgA.createdAt) : getTime(a.createdAt);
      const timeB = msgB ? getTime(msgB.createdAt) : getTime(b.createdAt);
      return timeB - timeA;
    });

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
          <h1 className="text-2xl font-bold text-industrial-100">Chats</h1>
          <div className="flex items-center gap-2">
            <Button
              isIconOnly
              variant="flat"
              className="rounded-full bg-industrial-800 text-industrial-300"
              onPress={handlePaste}
              isLoading={isProcessingPaste}
              title="Paste Encrypted Message"
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
          placeholder="Search chats..."
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
            <p>No chats found</p>
            <Button size="sm" variant="light" onPress={onOpen} className="mt-2 text-primary-400">
              Start a new chat
            </Button>
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const lastMsg = lastMessages[contact.fingerprint];

            return (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card
                  isPressable
                  onPress={() => setActiveChat(contact)}
                  className="bg-industrial-900 border-industrial-800 hover:bg-industrial-800 transition-colors w-full"
                >
                  <CardBody className="flex flex-row items-center gap-3 p-3 overflow-hidden">
                    <Avatar
                      name={contact.name}
                      className="flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <h3 className="font-medium text-industrial-100 truncate pr-2">
                          {contact.name}
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
                            <span className="italic text-industrial-600">No messages yet</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* New Chat Modal */}
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
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
              <ModalHeader className="flex flex-col gap-1">New Chat</ModalHeader>
              <ModalBody>
                <Input
                  placeholder="Search contacts..."
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
                      <p>No contacts found</p>
                      <Button
                        size="sm"
                        variant="light"
                        className="mt-2 text-primary-400"
                        onPress={() => {
                          onClose();
                          onNewChat(); // Go to keys tab
                        }}
                      >
                        Add Contact
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
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={() => {
                    onClose();
                    onNewChat();
                  }}
                >
                  Add New Contact
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
                 Select Sender
                 <p className="text-sm font-normal text-industrial-400">
                    This message is unsigned or from an unknown key. Who sent it?
                 </p>
              </ModalHeader>
              <ModalBody>
                <Input
                  placeholder="Search contacts..."
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
                      <p>No contacts found</p>
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
                  Cancel
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ManualPasteModal
        isOpen={isManualPasteOpen}
        onClose={() => setIsManualPasteOpen(false)}
        onSubmit={processPasteContent}
        title="Import PGP Message"
      />
    </div>
  );
}
