/* eslint-disable max-lines-per-function, max-lines */
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Image, Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';
import { motion } from 'framer-motion';
import { Copy, Download, ImageDown, Lock, Maximize2, MoreVertical, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ImageSteganographyService } from '../services/steganography';
import { workerService } from '../services/workerService';
import { useAppStore } from '../stores/appStore';
import { useSteganographyStore } from '../stores/steganographyStore';
import * as logger from '../utils/logger';

const steganographyService = ImageSteganographyService.getInstance();

interface MessageBubbleProps {
  id: string;
}

const MessageBubbleComponent = ({ id }: MessageBubbleProps) => {
  // ATOMIC SELECTION: Only selecting the specific message to prevent re-renders of list
  const message = useAppStore(state => state.messages.entities[id]);
  const deleteMessage = useAppStore(state => state.deleteMessage);
  const identity = useAppStore(state => state.identity);
  const sessionPassphrase = useAppStore(state => state.sessionPassphrase);
  const activeChat = useAppStore(state => state.activeChat);

  const {
    setViewMode,
    setPreviewOpen,
    setEncodedCarrierUrl,
    setDecodingStatus,
    setDecodedImageUrl,
    decodingStatus,
    decodingCarrierUrl
  } = useSteganographyStore();
  const { t } = useTranslation();

  const [decodedSrc, setDecodedSrc] = useState<string | null>(null);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Intersection Observer Ref
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const isOutgoing = message?.isOutgoing;
  const hasImage = message?.type === 'image' || !!message?.content.image;
  const imageUrl = message?.content.image;
  const isDecoding = decodingStatus === 'processing' && decodingCarrierUrl === imageUrl;

  // Intersection Observer for Predictive Loading
  useEffect(() => {
    if (!message) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (!entry.isIntersecting) {
            // OPTIONAL: Cancel ongoing decoding task if user scrolls away fast
            // But we'll leave it simple for now, relying on worker queue management
        }
      },
      { rootMargin: '150px' } // Pre-load 150px before entering viewport
    );

    if (bubbleRef.current) {
      observer.observe(bubbleRef.current);
    }

    return () => {
      observer.disconnect();
      // CLEANUP: Revoke object URLs when component unmounts
      if (decodedSrc) {
        URL.revokeObjectURL(decodedSrc);
      }
    };
  }, [decodedSrc, message]); // Dependency on decodedSrc to ensure we revoke the *current* on unmount

  // Auto-decode steganography images for chat view ONLY IF VISIBLE
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    if (message?.type === 'image_stego' && imageUrl && !decodedSrc && !decodedText && !decodeFailed && identity && sessionPassphrase && isVisible) {
      const decode = async () => {
        try {
          // Fix: Resolve peer key for outgoing messages from contacts list if activeChat is unavailable or mismatched.
          // This is critical for the "Sender Flow" (decrypting own sent strings/images).
          // We need to pair our Private Key with the Recipient's Public Key.
          const contacts = useAppStore.getState().contacts;
          const recipientContact = isOutgoing
            ? (activeChat?.fingerprint === message.recipientFingerprint ? activeChat : contacts.find(c => c.fingerprint === message.recipientFingerprint))
            : null;

          const senderKey = isOutgoing ? identity.publicKey : activeChat?.publicKey;
          const decryptionPeerKey = isOutgoing ? recipientContact?.publicKey : undefined;

          if (isOutgoing && !decryptionPeerKey) {
             logger.warn('Decryption warning: Could not resolve recipient public key for outgoing message', {
               recipientFingerprint: message.recipientFingerprint
             });
             // We continue, but decryption will likely fail if it relies on forcePeerPublicKey
          }

          // FETCHING: fetch blob from URL (or base64)
          // Since imageUrl is likely base64 from IDB, we can use it directly?
          // Actually, imageUrl in store is base64 string.
          // We need to convert base64 -> Uint8Array via WORKER

          // Convert Base64 to Binary via Worker (Zero-Copy flow)
          // We use fetch just to turn dataURL into blob? No, we have base64 string.
          // Let's use our workerService 'base64ToBinary'

          let file: File;

          // Optimization: If URL is data URL, use worker. Otherwise fetch.
          if (imageUrl.startsWith('data:')) {
             const binaryData = await workerService.execute<Uint8Array>(
                 'base64ToBinary',
                 { base64: imageUrl },
                 { priority: 'HIGH', signal: abortController.signal }
             );
             file = new File([binaryData], "carrier.png", { type: "image/png" });
          } else {
             // Fallback for object URLs (rare for persistence)
             const response = await fetch(imageUrl);
             const blob = await response.blob();
             file = new File([blob], "carrier.png", { type: "image/png" });
          }

          // Steganography decode still on main thread (service) for now?
          // Plan said: "Steganography decoding/encoding (future step)".
          // So we use existing stegoService but passed a File created from worker-processed binary.

          const { url: resultUrl, text: resultText } = await steganographyService.decode(
            file,
            identity.privateKey,
            sessionPassphrase,
            senderKey ? [senderKey] : [],
            decryptionPeerKey
          );

          if (isMounted) {
            if (resultUrl) setDecodedSrc(resultUrl);
            if (resultText) setDecodedText(resultText);
          }
        } catch (error) {
          const errorMessage = (error as Error).message;
          if (errorMessage?.includes('Aborted')) return;

          if (errorMessage?.includes('No hidden message found')) {
            logger.warn('Auto-decode skipped (no steganography data found):', message?.id);
          } else {
            logger.error('Auto-decode failed:', error);
          }
          if (isMounted) {
            setDecodeFailed(true);
          }
        }
      };
      decode();
    }
    return () => {
        isMounted = false;
        abortController.abort();
    };
  }, [message?.type, imageUrl, decodedSrc, decodedText, decodeFailed, identity, sessionPassphrase, isOutgoing, activeChat, message?.id, isVisible]);

  const handleDownloadImage = () => {
    if (imageUrl) {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `nahan_image_${message.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Image downloaded');
      setMenuPosition(null);
    }
  };

  const handleSteganographyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!imageUrl) return;

    // Show the ENCODED carrier in the drawer as requested
    setViewMode('encode');
    setEncodedCarrierUrl(imageUrl);
    setPreviewOpen(true);

    // Reset decoding state
    setDecodingStatus('idle');
    setDecodedImageUrl(null);
  };

  const smartCopy = () => {
    // For Steganography messages, open the carrier view (which allows downloading/copying the image)
    // instead of copying the text payload.
    if (message.type === 'image_stego' && imageUrl) {
      handleSteganographyClick({ stopPropagation: () => {} } as React.MouseEvent);
      toast.success(t('steganography.encrypted_image_ready', 'Encrypted Image Ready'));
      setMenuPosition(null);
      return;
    }

    const textToCopy = isOutgoing ? message.content.encrypted : message.content.plain;
    const label = isOutgoing ? t('chat.message.encrypted_block') : t('chat.message.text');

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => toast.success(t('chat.message.copied', { label })))
      .catch(() => toast.error(t('chat.message.copy_failed')));
    setMenuPosition(null);
  };

  const copyEncrypted = () => {
    // Same logic for explicit "Copy Encrypted" action
    if (message.type === 'image_stego' && imageUrl) {
        handleSteganographyClick({ stopPropagation: () => {} } as React.MouseEvent);
        toast.success(t('steganography.encrypted_image_ready', 'Encrypted Image Ready'));
        setMenuPosition(null);
        return;
    }

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
        ref={bubbleRef}
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
            {/* Image Content */}
            {hasImage && imageUrl && (decodedSrc || (!decodedText && !message.content.plain)) && (
              <div className="mb-2 relative group/image">
                <Image
                  src={decodedSrc || imageUrl}
                  alt={decodedSrc ? "Decoded Image" : "Encrypted Image"}
                  classNames={{
                    wrapper: "bg-black/20 rounded-lg overflow-hidden cursor-pointer",
                    img: "max-w-full max-h-[300px] object-cover"
                  }}
                  onClick={(e) => {
                    if (message.type === 'image_stego') {
                      handleSteganographyClick(e);
                    } else {
                      setIsImageModalOpen(true);
                    }
                  }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/20 transition-colors flex items-center justify-center gap-4 opacity-0 group-hover/image:opacity-100">
                  <button
                    onClick={() => setIsImageModalOpen(true)}
                    className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
                    title={t('common.view', 'View')}
                  >
                    <Maximize2 className="w-6 h-6 drop-shadow-lg" />
                  </button>
                  {message.type === 'image_stego' && (
                    <button
                      onClick={handleSteganographyClick}
                      disabled={isDecoding}
                      className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors disabled:opacity-50"
                      title={t('steganography.view_carrier', 'View Encoded Carrier')}
                    >
                      <ImageDown className={`w-6 h-6 drop-shadow-lg ${isDecoding ? 'animate-pulse' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Message Content (or Decoded Text if Plain is Missing) */}
            {(message.content.plain || (decodedText && !decodedSrc)) && (
              <div className="whitespace-pre-wrap">{message.content.plain || decodedText}</div>
            )}

            {/* Decoded Steganography Text (Only if DIFFERENT from main content and NOT already shown as main content) */}
            {decodedText &&
             decodedText.trim() !== (message.content.plain || '').trim() &&
             decodedSrc && // If decodedSrc exists, decodedText is secondary (like metadata), so show it in box.
             (
              <div className="whitespace-pre-wrap mt-2 p-2 bg-black/20 rounded-lg border border-industrial-700/50 text-industrial-100">
                <span className="text-xs text-primary-400 block mb-1 font-medium flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {t('steganography.hidden_message', 'Hidden Message')}
                </span>
                {decodedText}
              </div>
            )}

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
            {hasImage && (
              <DropdownItem
                key="download-image"
                startContent={<Download className="w-4 h-4" />}
                onPress={handleDownloadImage}
              >
                {t('common.download_image', 'Download Image')}
              </DropdownItem>
            )}
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

      {/* Image Preview Modal */}
      <Modal
        isOpen={isImageModalOpen}
        onOpenChange={setIsImageModalOpen}
        size="5xl"
        classNames={{
          base: "bg-industrial-950/90 border border-industrial-800 backdrop-blur-xl",
          closeButton: "hover:bg-industrial-800 text-white z-50",
        }}
        backdrop="blur"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1 text-white">{t('common.image_preview', 'Image Preview')}</ModalHeader>
              <ModalBody className="flex items-center justify-center p-0 overflow-hidden h-[80vh]">
                {imageUrl && (
                   <Image
                    src={imageUrl}
                    alt="Full Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

// Strict Memoization: Only re-render if ID changes or Message Status changes
// We pull the message inside the component, but if the wrapper re-renders, check ID.
// Actually, since we use `useAppStore` hook inside, changes to the *specific message* will trigger re-render
// of the component due to Zustand subscription, assuming we select granularly.
// But Zustand selectors run on every state change.
// To avoid expensive re-renders, we use memo check here.
export const MessageBubble = memo(MessageBubbleComponent, (prev, next) => {
  return prev.id === next.id;
});

