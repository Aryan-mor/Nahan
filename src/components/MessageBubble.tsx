/* eslint-disable max-lines-per-function, max-lines */
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Image, Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';
import { motion } from 'framer-motion';
import { Copy, Lock, MoreVertical, Trash2, Download, Maximize2, ImageDown } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ImageSteganographyService } from '../services/steganography';
import { SecureMessage } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useSteganographyStore } from '../stores/steganographyStore';

const steganographyService = ImageSteganographyService.getInstance();

interface MessageBubbleProps {
  message: SecureMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { deleteMessage, identity, sessionPassphrase, activeChat } = useAppStore();
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
  const isOutgoing = message.isOutgoing;

  const [decodedSrc, setDecodedSrc] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const hasImage = message.type === 'image' || !!message.content.image;
  const imageUrl = message.content.image;
  const isDecoding = decodingStatus === 'processing' && decodingCarrierUrl === imageUrl;

  // Auto-decode steganography images for chat view
  useEffect(() => {
    let isMounted = true;
    if (message.type === 'image_stego' && imageUrl && !decodedSrc && identity && sessionPassphrase) {
      const decode = async () => {
        try {
          const senderKey = isOutgoing ? identity.publicKey : activeChat?.publicKey;
          // If WE sent the message, we encrypted it for the recipient (activeChat.publicKey).
          // To decrypt it using OUR private key, we must treat the Recipient's Public Key as the "Peer Key"
          // because nacl.box uses SharedKey = MyPriv * RecipientPub.
          const decryptionPeerKey = isOutgoing ? activeChat?.publicKey : undefined;

          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const file = new File([blob], "carrier.png", { type: "image/png" });
          
          const { url: resultUrl } = await steganographyService.decode(
            file,
            identity.privateKey,
            sessionPassphrase,
            senderKey ? [senderKey] : [],
            decryptionPeerKey
          );
          
          if (isMounted) {
            setDecodedSrc(resultUrl);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Auto-decode failed:', error);
          // Fallback to carrier image is automatic (decodedSrc remains null)
        }
      };
      decode();
    }
    return () => { isMounted = false; };
  }, [message.type, imageUrl, decodedSrc, identity, sessionPassphrase, isOutgoing, activeChat]);

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
            {/* Image Content */}
            {hasImage && imageUrl && (
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

            {/* Message Content */}
            {message.content.plain && (
              <div className="whitespace-pre-wrap">{message.content.plain}</div>
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

      {/* SteganographyPreviewSheet removed, using global one in ChatInput via store */}
    </>
  );
}
