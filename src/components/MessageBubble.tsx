import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { motion } from 'framer-motion';
import { Copy, Lock, MoreVertical, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SecureMessage } from '../services/storage';
import { useAppStore } from '../stores/appStore';

interface MessageBubbleProps {
  message: SecureMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { deleteMessage } = useAppStore();
  const isOutgoing = message.isOutgoing;

  const [isOpen, setIsOpen] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const smartCopy = () => {
    const textToCopy = isOutgoing ? message.content.encrypted : message.content.plain;
    const label = isOutgoing ? 'Encrypted block' : 'Message text';

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error('Failed to copy'));
  };

  const copyEncrypted = () => {
    navigator.clipboard.writeText(message.content.encrypted);
    toast.success('Encrypted block copied');
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this message?')) {
      deleteMessage(message.id);
      toast.success('Message deleted');
    }
  };

  // Long press handlers
  const handlePressStart = () => {
    setIsPressing(true);
    timerRef.current = setTimeout(() => {
      setIsOpen(true);
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex w-full mb-4 ${isOutgoing ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex flex-col max-w-[80%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
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
        >
          {/* Message Content */}
          <div className="whitespace-pre-wrap">{message.content.plain}</div>

          {/* Context Menu (Visible on Hover/Long Press) */}
          <div
            className={`absolute top-0 ${isOutgoing ? '-left-8' : '-right-8'} ${
              isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            } transition-opacity`}
            // Stop propagation to prevent bubble press handlers from interfering with menu interactions
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Dropdown
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              placement={isOutgoing ? 'bottom-end' : 'bottom-start'}
            >
              <DropdownTrigger>
                <Button isIconOnly size="sm" variant="light" className="text-industrial-400">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Message options"
                className="bg-industrial-900 border border-industrial-800 text-industrial-200"
              >
                <DropdownItem
                  key="copy"
                  startContent={<Copy className="w-4 h-4" />}
                  onPress={smartCopy}
                >
                  {isOutgoing ? 'Copy Encrypted' : 'Copy Text'}
                </DropdownItem>
                {/* Secondary copy option for incoming messages to get encrypted block */}
                {!isOutgoing ? (
                  <DropdownItem
                    key="copy-enc"
                    startContent={<Lock className="w-4 h-4" />}
                    onPress={copyEncrypted}
                  >
                    Copy Encrypted
                  </DropdownItem>
                ) : (
                  // For outgoing, we might want to copy plain text as secondary?
                  <DropdownItem
                    key="copy-plain"
                    startContent={<Copy className="w-4 h-4" />}
                    onPress={() => {
                      navigator.clipboard.writeText(message.content.plain);
                      toast.success('Text copied');
                    }}
                  >
                    Copy Plain Text
                  </DropdownItem>
                )}
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={<Trash2 className="w-4 h-4" />}
                  onPress={handleDelete}
                >
                  Delete
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
            Copy Block
          </button>
        </div>
      </div>
    </motion.div>
  );
}
