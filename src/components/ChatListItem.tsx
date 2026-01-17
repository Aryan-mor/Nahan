/* eslint-disable max-lines-per-function */
import { Avatar, Card, CardBody } from '@heroui/react';
import { motion } from 'framer-motion';
import { CheckCircle, Circle, Image as ImageIcon } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { useLongPress } from '../hooks/useLongPress';
import { Contact, SecureMessage } from '../services/storage';

interface ChatListItemProps {
  contact: Contact;
  lastMsg?: SecureMessage;
  isBroadcast: boolean;
  showSeparator: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  onLongPress: (contact: Contact) => void;
  onClick: (contact: Contact) => void;
  onToggleSelection: (fingerprint: string) => void;
}

export const ChatListItem = React.memo(
   
  ({
    contact,
  lastMsg,
  isBroadcast,
  showSeparator,
  isSelected,
  selectionMode,
  onLongPress,
  onClick,
  onToggleSelection
}: ChatListItemProps) => {
  const { t } = useTranslation();

  const bindLongPress = useLongPress({
    onLongPress: () => onLongPress(contact),
    onClick: () => {
      if (selectionMode) {
        onToggleSelection(contact.fingerprint);
      } else {
        onClick(contact);
      }
    },
    shouldPreventDefault: true
  });

  const formatTime = (date: Date | string) => {
    const dateObj = date instanceof Date ? date : new Date(date);
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      className={isBroadcast ? 'order-first' : ''}
    >
      <Card
        isPressable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(bindLongPress as any)}
        data-testid={isBroadcast ? 'chat-list-item-BROADCAST' : `chat-item-${contact.name}`}
        className={`w-full transition-colors ${
          isSelected
             ? 'bg-primary-900/20 border-primary-500/50'
             : isBroadcast
                  ? 'bg-industrial-800/50 border-primary-500/20 hover:bg-industrial-800/70'
                  : 'bg-industrial-900 border-industrial-800 hover:bg-industrial-800'
        }`}
      >
        <CardBody className="flex flex-row items-center gap-3 p-3 overflow-hidden">
          {selectionMode && (
              <div className="flex-shrink-0">
                  {isSelected ? (
                      <CheckCircle className="w-5 h-5 text-primary-500 fill-primary-900/50" />
                  ) : (
                      <Circle className="w-5 h-5 text-industrial-600" />
                  )}
              </div>
          )}

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
});

ChatListItem.displayName = 'ChatListItem';
