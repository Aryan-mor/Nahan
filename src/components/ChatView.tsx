import {
  Avatar,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react';
import { motion } from 'framer-motion';
import { ArrowLeft, MoreVertical, Shield } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAppStore } from '../stores/appStore';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';

export function ChatView() {
  const { activeChat, messages, setActiveChat, clearChatHistory } = useAppStore();
  const { t, i18n } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const isRTL = i18n.language === 'fa';

  // Auto-scroll to show newest messages
  // With flex-direction: column-reverse, newest messages (first in array) appear at the visual bottom
  useEffect(() => {
    const container = bottomRef.current?.parentElement;
    if (container) {
      // Scroll to bottom to show newest messages (which appear at the bottom in reversed layout)
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const handleClearHistory = async () => {
    if (!activeChat) return;

    // Confirm before clearing
    if (!confirm(t('chat.clear_history_confirm', { name: activeChat.name, defaultValue: `Are you sure you want to clear all messages with ${activeChat.name}? This cannot be undone.` }))) {
      return;
    }

    try {
      await clearChatHistory(activeChat.fingerprint);
      toast.success(t('chat.clear_history_success', { defaultValue: 'Chat history cleared successfully' }));
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast.error(t('chat.clear_history_error', { defaultValue: 'Failed to clear chat history' }));
    }
  };

  if (!activeChat) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-industrial-950 flex flex-col h-[100dvh]"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-industrial-800 bg-industrial-900/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            isIconOnly
            variant="light"
            onPress={() => setActiveChat(null)}
            className="text-industrial-300 -ms-2"
          >
            <ArrowLeft className={`w-6 h-6 ${isRTL ? 'rotate-180' : ''}`} />
          </Button>

          <div className="flex items-center gap-3">
            <Avatar
              name={activeChat.name}
              className="w-10 h-10 text-sm bg-primary-900 text-primary-200"
            />
            <div>
              <h2 className="font-semibold text-industrial-100 leading-tight">{activeChat.name}</h2>
              <p className="text-xs text-industrial-400 font-mono">
                #{activeChat.fingerprint.slice(-8)}
              </p>
            </div>
          </div>
        </div>

        <Dropdown>
          <DropdownTrigger>
            <Button isIconOnly variant="light" className="text-industrial-400">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label={t('chat.options')}
            className="bg-industrial-900 border border-industrial-800 text-industrial-200"
          >
            <DropdownItem key="verify" startContent={<Shield className="w-4 h-4" />}>
              {t('chat.verify_key')}
            </DropdownItem>
            <DropdownItem
              key="clear"
              className="text-danger"
              color="danger"
              onPress={handleClearHistory}
            >
              {t('chat.clear_history')}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 gap-2.5 flex flex-col-reverse scrollbar-hide">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-industrial-500 space-y-4 opacity-50">
            <Shield className="w-16 h-16" />
            <p className="text-center max-w-xs text-sm">
              {t('chat.encrypted_notice', { name: activeChat.name })}
            </p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <ChatInput />
    </motion.div>
  );
}
