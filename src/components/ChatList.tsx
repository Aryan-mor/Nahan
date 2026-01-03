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
  const { contacts, setActiveChat, processIncomingMessage } = useAppStore();
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
    // Check if it looks like a PGP message
    if (content.includes('-----BEGIN PGP MESSAGE-----')) {
      setIsProcessingPaste(true);
      try {
        await processIncomingMessage(content);
        toast.success('Message decrypted and imported');
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
    } else {
      toast.info('No PGP message found in content');
      throw new Error('No PGP message found');
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
      const map: Record<string, SecureMessage | undefined> = {};
      for (const contact of contacts) {
        map[contact.fingerprint] = await storageService.getLastMessage(contact.fingerprint);
      }
      setLastMessages(map);
    };
    loadLastMessages();
  }, [contacts]);

  const filteredContacts = contacts
    .filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.fingerprint.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      // Sort by last message time, then created time
      const msgA = lastMessages[a.fingerprint];
      const msgB = lastMessages[b.fingerprint];
      const timeA = msgA ? msgA.createdAt.getTime() : a.createdAt.getTime();
      const timeB = msgB ? msgB.createdAt.getTime() : b.createdAt.getTime();
      return timeB - timeA;
    });

  const modalFilteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
      c.fingerprint.toLowerCase().includes(modalSearch.toLowerCase()),
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
