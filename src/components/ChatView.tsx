/* eslint-disable max-lines-per-function */
import {
  Avatar,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, MoreVertical, Shield } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAppStore } from '../stores/appStore';
import { useSteganographyStore } from '../stores/steganographyStore';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';
import { TemporarySteganographyMessage } from './steganography/TemporarySteganographyMessage';

export function ChatView() {
  const { activeChat, messages, setActiveChat, clearChatHistory } = useAppStore();
  const { encodingStatus } = useSteganographyStore();
  const { scrollPositions, setScrollPosition } = useUIStore();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'fa';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isAutoScrolling = useRef(false);

  const scrollToBottom = (smooth = true) => {
    if (!scrollContainerRef.current) return;

    // Set flag to prevent Scroll event from overwriting "last user position" immediately
    // or to help logic know we are auto-scrolling.
    isAutoScrolling.current = true;

    // Using scrollTo instead of scrollIntoView for better control over the container
    // const { scrollHeight, clientHeight } = scrollContainerRef.current;
    // For flex-col-reverse + overflow-y-auto, scrollHeight is the total height.
    // We want to be at the bottom ??
    // Actually, let's stick to scrollIntoView for the anchor if it works reliably,
    // but manually setting scrollTop is often more precise for restoration.
    // For "Bottom", scrollTop should be max.

    // scrollContainerRef.current.scrollTop = scrollHeight; // Instant

    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });

    // Reset flag after animation roughly
    setTimeout(() => {
      isAutoScrolling.current = false;
    }, 500);
  };

  // Debounced Scroll Handler
  const handleScroll = () => {
    if (!scrollContainerRef.current || !activeChat || isAutoScrolling.current) return;

    const { scrollTop } = scrollContainerRef.current;
    const currentId = activeChat.fingerprint;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      setScrollPosition(currentId, scrollTop);
    }, 500);
  };

  // Scroll to Bottom Button Logic (IntersectionObserver)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowScrollButton(!entry.isIntersecting);
      },
      {
        root: scrollContainerRef.current,
        threshold: 0,
        rootMargin: '200px',
      },
    );

    if (messagesEndRef.current) {
      observer.observe(messagesEndRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Restore Scroll Position or Scroll to Bottom on Chat Change
  useEffect(() => {
    if (!activeChat || !scrollContainerRef.current) return;

    const savedPosition = scrollPositions[activeChat.fingerprint];

    if (savedPosition !== undefined) {
      // Restore position
      // We need to wait for layout repaint if possible, but standard useEffect is often late enough.
      // If virtuoso passed, we'd wait. standard div is immediate.
      scrollContainerRef.current.scrollTop = savedPosition;
    } else {
      // New chat or never scrolled -> Start at bottom
      scrollToBottom(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.fingerprint]); // Only run when chat changes

  // Auto-scroll logic for new messages
  useEffect(() => {
    if (messages.ids.length === 0) return;

    const newestId = messages.ids[0];
    const newestMsg = messages.entities[newestId];
    const isOutgoing = newestMsg?.isOutgoing;

    if (isOutgoing) {
      scrollToBottom();
    } else {
      // For incoming:
      // If we are ALREADY near bottom, snap to bottom.
      // If we are scrolled up, do NOT scroll (user is reading history).
      if (scrollContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        // "Bottom" in most browsers is scrollTop + clientHeight ~= scrollHeight
        // Or simplified: calc distance from bottom
        const distanceFromBottom = Math.abs(scrollHeight - clientHeight - scrollTop);

        if (distanceFromBottom < 150) {
          scrollToBottom();
        }
      }
    }
  }, [messages.ids, messages.entities]);

  const handleClearHistory = async () => {
    if (!activeChat) return;

    // Confirm before clearing
    if (!confirm(t('chat.clear_history_confirm', { name: activeChat.name }))) {
      return;
    }

    try {
      await clearChatHistory(activeChat.fingerprint);
      toast.success(t('chat.clear_history_success'));
    } catch (error) {
      logger.error('Failed to clear history:', error);
      toast.error(t('chat.clear_history_error'));
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
              name={
                activeChat.fingerprint === 'BROADCAST' ? t('broadcast_channel') : activeChat.name
              }
              className="w-10 h-10 text-sm bg-primary-900 text-primary-200"
            />
            <div>
              <h2 className="font-semibold text-industrial-100 leading-tight">
                {activeChat.fingerprint === 'BROADCAST' ? t('broadcast_channel') : activeChat.name}
              </h2>
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
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 gap-2.5 flex flex-col-reverse scrollbar-hide relative scroll-smooth"
      >
        {/* Visual Bottom Anchor (Top of DOM in col-reverse) */}
        <div ref={messagesEndRef} />

        {encodingStatus !== 'idle' && <TemporarySteganographyMessage />}
        {messages.ids.length === 0 && encodingStatus === 'idle' ? (
          <div className="flex flex-col items-center justify-center h-full text-industrial-500 space-y-4 opacity-50">
            <Shield className="w-16 h-16" />
            <p className="text-center max-w-xs text-sm">
              {t('chat.encrypted_notice', { name: activeChat.name })}
            </p>
          </div>
        ) : (
          messages.ids.map((id) => <MessageBubble key={id} id={id} />)
        )}
      </div>

      {/* Scroll to Bottom Button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-24 right-6 z-20"
          >
            <Button
              isIconOnly
              className="rounded-full bg-industrial-800/90 backdrop-blur-md text-industrial-100 shadow-xl border border-industrial-700 hover:bg-industrial-700 transition-colors"
              onPress={() => scrollToBottom()}
            >
              <ChevronDown className="w-6 h-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <ChatInput />
    </motion.div>
  );
}
