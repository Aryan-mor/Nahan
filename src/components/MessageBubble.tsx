/* eslint-disable max-lines-per-function */
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { motion } from 'framer-motion';
import { Copy, Lock, MoreVertical, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { SecureMessage } from '../services/storage';
import { useAppStore } from '../stores/appStore';

interface MessageBubbleProps {
  message: SecureMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { deleteMessage } = useAppStore();
  const { t } = useTranslation();
  const isOutgoing = message.isOutgoing;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const smartCopy = () => {
    const textToCopy = isOutgoing ? message.content.encrypted : message.content.plain;
    const label = isOutgoing ? t('chat.message.encrypted_block') : t('chat.message.text');

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => toast.success(t('chat.message.copied', { label })))
      .catch(() => toast.error(t('chat.message.copy_failed')));
    setMenuPosition(null);
  };

  const copyEncrypted = () => {
    navigator.clipboard.writeText(message.content.encrypted);
    toast.success(t('chat.message.encrypted_copied'));
    setMenuPosition(null);
  };

  const copyPlain = () => {
    navigator.clipboard.writeText(message.content.plain);
    toast.success(t('chat.message.text_copied'));
    setMenuPosition(null);
  };

  const handleDelete = () => {
    setMenuPosition(null);
    if (confirm(t('chat.message.delete_confirm'))) {
      deleteMessage(message.id);
      toast.success(t('chat.message.deleted'));
    }
  };

  // Long press handlers
  const handlePressStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsPressing(true);

    // Capture coordinates
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    timerRef.current = setTimeout(() => {
      setMenuPosition({ x: clientX, y: clientY });
      setIsPressing(false);
      // Haptic feedback if available
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  };

  const handlePressEnd = () => {
    setIsPressing(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Virtual Element for positioning
  const virtualElement = {
    getBoundingClientRect: () => ({
      width: 0,
      height: 0,
      top: menuPosition?.y ?? 0,
      left: menuPosition?.x ?? 0,
      right: menuPosition?.x ?? 0,
      bottom: menuPosition?.y ?? 0,
    }),
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`flex w-full ${isOutgoing ? 'justify-end' : 'justify-start'}`}
      >
        <div
          className={`flex flex-col max-w-[80%] select-none ${
            isOutgoing ? 'items-end' : 'items-start'
          }`}
        >
          <div
            className={`relative group px-4 py-2 rounded-2xl text-sm sm:text-base break-words shadow-md transition-transform duration-200 ${
              isOutgoing
                ? 'bg-primary-600 text-white rounded-br-none'
                : 'bg-industrial-800 text-industrial-100 rounded-bl-none'
            } ${isPressing ? 'scale-95 brightness-110' : ''}`}
            onTouchStart={handlePressStart}
            onTouchEnd={handlePressEnd}
            onTouchCancel={handlePressEnd}
            onMouseDown={handlePressStart}
            onMouseUp={handlePressEnd}
            onMouseLeave={handlePressEnd}
            // Prevent default context menu on long press
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Message Content */}
            <div className="whitespace-pre-wrap">{message.content.plain}</div>

            {/* Context Menu (Desktop Hover - Visible on Hover) */}
            <div
              className={`absolute top-0 ${isOutgoing ? '-left-8' : '-right-8'} ${
                isDropdownOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              } transition-opacity hidden sm:block`}
              // Stop propagation to prevent bubble press handlers from interfering with menu interactions
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Dropdown
                isOpen={isDropdownOpen}
                onOpenChange={setIsDropdownOpen}
                placement={isOutgoing ? 'bottom-end' : 'bottom-start'}
              >
                <DropdownTrigger>
                  <Button isIconOnly size="sm" variant="light" className="text-industrial-400">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label={t('chat.message.options')}
                  className="bg-industrial-900 border border-industrial-800 text-industrial-200"
                >
                  <DropdownItem
                    key="copy"
                    startContent={<Copy className="w-4 h-4" />}
                    onPress={smartCopy}
                  >
                    {isOutgoing ? t('chat.message.copy_encrypted') : t('chat.message.copy_text')}
                  </DropdownItem>
                  {!isOutgoing ? (
                    <DropdownItem
                      key="copy-enc"
                      startContent={<Lock className="w-4 h-4" />}
                      onPress={copyEncrypted}
                    >
                      {t('chat.message.copy_encrypted')}
                    </DropdownItem>
                  ) : (
                    <DropdownItem
                      key="copy-plain"
                      startContent={<Copy className="w-4 h-4" />}
                      onPress={copyPlain}
                    >
                      {t('chat.message.copy_plain')}
                    </DropdownItem>
                  )}
                  <DropdownItem
                    key="delete"
                    className="text-danger"
                    color="danger"
                    startContent={<Trash2 className="w-4 h-4" />}
                    onPress={handleDelete}
                  >
                    {t('chat.message.delete')}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </div>

          {/* Footer: Time + Quick Action */}
          <div className="flex items-center gap-2 mt-1 px-1">
            <span className="text-[10px] text-industrial-500">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <button
              onClick={copyEncrypted}
              className="text-[10px] flex items-center gap-1 text-industrial-500 hover:text-primary-400 transition-colors"
            >
              <Lock className="w-3 h-3" />
              {t('chat.message.copy_block_btn')}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Coordinate-based Context Menu (Virtual Element) */}
      {menuPosition && (
        <Dropdown
          isOpen={true}
          onOpenChange={(open) => !open && setMenuPosition(null)}
          placement="bottom-start"
          triggerScaleOnOpen={false}
          // @ts-expect-error - HeroUI supports virtual elements but types might be strict
          triggerRef={{ current: virtualElement }}
        >
          {/* Invisible trigger to satisfy Dropdown requirement */}
          <DropdownTrigger>
            <div
              className="w-0 h-0 opacity-0 fixed"
              style={{ top: menuPosition.y, left: menuPosition.x }}
            />
          </DropdownTrigger>
          <DropdownMenu
            aria-label={t('chat.message.options')}
            className="bg-industrial-900 border border-industrial-800 text-industrial-200"
          >
            <DropdownItem
              key="copy"
              startContent={<Copy className="w-4 h-4" />}
              onPress={smartCopy}
            >
              {isOutgoing ? t('chat.message.copy_encrypted') : t('chat.message.copy_text')}
            </DropdownItem>
            {!isOutgoing ? (
              <DropdownItem
                key="copy-enc"
                startContent={<Lock className="w-4 h-4" />}
                onPress={copyEncrypted}
              >
                {t('chat.message.copy_encrypted')}
              </DropdownItem>
            ) : (
              <DropdownItem
                key="copy-plain"
                startContent={<Copy className="w-4 h-4" />}
                onPress={copyPlain}
              >
                {t('chat.message.copy_plain')}
              </DropdownItem>
            )}
            <DropdownItem
              key="delete"
              className="text-danger"
              color="danger"
              startContent={<Trash2 className="w-4 h-4" />}
              onPress={handleDelete}
            >
              {t('chat.message.delete')}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}
    </>
  );
}
