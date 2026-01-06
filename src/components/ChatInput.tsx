/* eslint-disable max-lines */
import { Button, Textarea, Tooltip } from '@heroui/react';
import { ClipboardPaste, Lock, Paperclip, Send } from 'lucide-react';
/* eslint-disable max-lines-per-function */
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as naclUtil from 'tweetnacl-util';

import { useLongPress } from '../hooks/useLongPress';
import { CamouflageService } from '../services/camouflage';
import { ImageSteganographyService } from '../services/steganography';
import { useAppStore } from '../stores/appStore';
import { useSteganographyStore } from '../stores/steganographyStore';
import * as logger from '../utils/logger';

import { ManualPasteModal } from './ManualPasteModal';
import { SteganographyPreviewSheet } from './steganography/SteganographyPreviewSheet';

const camouflageService = CamouflageService.getInstance();
const steganographyService = ImageSteganographyService.getInstance();

export function ChatInput() {
  const {
    sendAutoStealthMessage,
    setShowStealthModal,
    setPendingStealthBinary,
    setPendingStealthImage,
    setStealthDrawerMode,
    setPendingPlaintext,
    processIncomingMessage,
    sendMessage,
    messageInput,
    setMessageInput,
    activeChat,
    sessionPassphrase,
    identity,
  } = useAppStore();
  const { t } = useTranslation();

  // Steganography Store
  const {
    setEncodingStatus,
    setOriginalPreviewUrl,
    setEncodingError,
    setPendingMessageId,
    resetEncoding,
    encodedCarrierUrl,
    decodedImageUrl,
    viewMode,
    isPreviewOpen,
    setPreviewOpen,
  } = useSteganographyStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);
  const [isAutoStealthEncoding, setIsAutoStealthEncoding] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageSendSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!activeChat || !sessionPassphrase || !identity) {
      toast.error(t('chat.input.error.missing_context'));
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are supported');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image is too large (max 5MB)');
      return;
    }

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Image = reader.result as string;
          await sendMessage(messageInput, base64Image);
          toast.success('Image sent successfully');
          setMessageInput('');
        } catch (error) {
          logger.error('Failed to send image:', error);
          toast.error('Failed to send image');
        } finally {
          setIsProcessing(false);
          if (imageInputRef.current) {
            imageInputRef.current.value = '';
          }
        }
      };
      reader.onerror = () => {
        setIsProcessing(false);
        toast.error('Failed to read image file');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsProcessing(false);
      logger.error('Image processing error:', error);
    }
  };

  // Steganography: Handle Image Selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!activeChat || !sessionPassphrase || !identity) {
      toast.error(t('chat.input.error.missing_context'));
      return;
    }

    // Reset previous state
    resetEncoding();

    // Create a temporary ID for the skeleton message
    const tempId = `temp_${Date.now()}`;
    setPendingMessageId(tempId);
    setEncodingStatus('processing');

    // Show original preview (optional, maybe not needed for skeleton, but good for debug)
    const objectUrl = URL.createObjectURL(file);
    setOriginalPreviewUrl(objectUrl);

    try {
      // Determine recipient public key (null for Broadcast/Public mode)
      const recipientPublicKey =
        activeChat.fingerprint === 'BROADCAST' ? undefined : activeChat.publicKey;

      // Encode
      logger.info('ChatInput: Starting encoding', { hasText: !!messageInput });
      const { carrier, payload } = await steganographyService.encode(
        file,
        identity.privateKey,
        sessionPassphrase,
        recipientPublicKey,
        messageInput // Pass the text from the input
      );

      logger.info('ChatInput: Encoding successful', { 
        carrierSize: carrier.size, 
        payloadSize: payload.length 
      });

      // Auto-send the carrier
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Image = reader.result as string;
          // Open UnifiedStealthDrawer in Image Mode
          setPendingStealthImage(base64Image);
          setStealthDrawerMode('image');
          setShowStealthModal(true);
          resetEncoding();
          
          // Clear the text input since it's now embedded in the image
          if (messageInput) {
             setMessageInput('');
          }
        } catch (error) {
          logger.error('Failed to open stealth drawer:', error);
          toast.error('Failed to process image');
          setEncodingStatus('error');
        } finally {
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      reader.onerror = () => {
        toast.error('Failed to process image');
        setEncodingStatus('error');
      };
      reader.readAsDataURL(carrier);
    } catch (error) {
      logger.error('Steganography Encoding Failed:', error);
      setEncodingStatus('error');
      setEncodingError((error as Error).message);
      toast.error(t('steganography.encode_error', 'Failed to encode image'));
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadCarrier = () => {
    const url = viewMode === 'encode' ? encodedCarrierUrl : decodedImageUrl;

    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `nahan_${viewMode === 'encode' ? 'stego' : 'decoded'}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (viewMode === 'encode') {
        toast.success(t('steganography.download_success', 'Image saved. Send it as a FILE!'));
        setPreviewOpen(false);
      } else {
        toast.success(t('common.download_success', 'Saved to gallery'));
      }
    }
  };

  /**
   * Handle single click: Auto-stealth mode (unified for both regular and broadcast)
   * sendAutoStealthMessage handles both regular messages (encrypted) and broadcast messages (signed)
   * Both are encoded into stealth cover text (ZWC) before being returned
   */
  const handleSingleClick = async () => {
    if (!messageInput.trim()) return;

    setIsAutoStealthEncoding(true);
    try {
      // Unified auto-stealth: encrypt (regular) or sign (broadcast) + embed with random cover text
      // sendAutoStealthMessage ensures safety ratio is >= 80% before sending
      // It also clears messageInput upon success and returns stealth-encoded text (not Base64)
      const stealthOutput = await sendAutoStealthMessage(messageInput);

      // Auto-copy stealth message to clipboard
      try {
        await navigator.clipboard.writeText(stealthOutput);
        toast.success(t('chat.input.send_success_clipboard'));
      } catch (clipboardError) {
        logger.warn('Failed to auto-copy to clipboard:', clipboardError);
        toast.success(t('chat.input.send_success')); // Still success, just clipboard failed
      }
    } catch (error) {
      toast.error(t('chat.input.send_error'));
      logger.error(error);
    } finally {
      setIsAutoStealthEncoding(false);
      textareaRef.current?.focus();
    }
  };

  /**
   * Handle long press (>500ms): Open Stealth Modal
   * Works for both mouse (long click) and touch (long press)
   * Allows user to customize cover text
   * In broadcast mode, passes signed broadcast payload instead of encrypted binary
   */
  const handleLongPress = async () => {
    if (!messageInput.trim()) return;

    try {
      const { identity, sessionPassphrase } = useAppStore.getState();
      if (!identity || !sessionPassphrase) {
        toast.error(t('chat.input.error.missing_context'));
        return;
      }

      const { CryptoService } = await import('../services/crypto');
      const cryptoService = CryptoService.getInstance();

      // Check if we're in broadcast mode
      if (activeChat?.id === 'system_broadcast') {
        // Broadcast mode: sign message (no encryption)
        const signedBinary = (await cryptoService.signMessage(
          messageInput,
          identity.privateKey,
          sessionPassphrase,
          { binary: true },
        )) as Uint8Array;

        // Open stealth modal with signed broadcast payload
        setPendingStealthBinary(signedBinary);
        setPendingPlaintext(messageInput);
        setStealthDrawerMode('dual');
        setShowStealthModal(true);
      } else {
        // Standard mode: encrypt message to binary for stealth modal
        if (!activeChat) {
          toast.error(t('chat.input.error.missing_context'));
          return;
        }

        const encryptedBinary = (await cryptoService.encryptMessage(
          messageInput,
          activeChat.publicKey,
          identity.privateKey,
          sessionPassphrase,
          { binary: true },
        )) as Uint8Array;

        // Open stealth modal with pending binary
        setPendingStealthBinary(encryptedBinary);
        setPendingPlaintext(messageInput);
        setStealthDrawerMode('dual');
        setShowStealthModal(true);
      }
    } catch (error) {
      toast.error(t('chat.input.error.prepare_stealth'));
      logger.error(error);
    }
  };

  // Use custom hook for long press detection
  const longPressHandlers = useLongPress({
    onLongPress: handleLongPress,
    onClick: handleSingleClick,
    threshold: 500,
    preventDefault: true,
  });

  /**
   * Handle Enter key press
   * Uses auto-stealth by default
   */
  const handleSend = async () => {
    await handleSingleClick();
  };

  const processPasteContent = async (content: string) => {
    // Never paste into input field - always try to decrypt first
    setIsProcessing(true);

    try {
      let encryptedData: string | null = null;

      // 1. Check if it's a stealth message (ZWC-embedded)
      const hasZWC = camouflageService.hasZWC(content);
      logger.debug('TRACE [ChatInput] ZWC Detection:', { hasZWC, contentLength: content.length });

      if (hasZWC) {
        logger.debug('TRACE [ChatInput] ZWC detected, attempting extraction...');
        try {
          // First try strict decoding
          let binary: Uint8Array;
          try {
            binary = camouflageService.decodeFromZWC(content, false);
            logger.debug(
              'TRACE [ChatInput] ZWC strict decode successful, binary length:',
              binary.length,
            );
          } catch (strictError: unknown) {
            // If strict fails with checksum error, try lenient mode
            const error = strictError as Error;
            if (
              error.message?.includes('Checksum mismatch') ||
              error.message?.includes('corrupted')
            ) {
              logger.warn(
                'TRACE [ChatInput] ZWC strict decode failed (checksum), trying lenient mode...',
                error.message,
              );
              binary = camouflageService.decodeFromZWC(content, true);
              logger.debug(
                'TRACE [ChatInput] ZWC lenient decode successful, binary length:',
                binary.length,
              );
              toast.warning('Some invisible characters may have been lost, but message recovered.');
            } else {
              logger.error(
                'TRACE [ChatInput] ZWC strict decode failed with non-checksum error:',
                error.message,
              );
              throw strictError; // Re-throw if it's a different error
            }
          }
          // Convert to base64 for decryption (processIncomingMessage expects string)
          encryptedData = naclUtil.encodeBase64(binary);
          logger.debug(
            'TRACE [ChatInput] ZWC extraction complete, base64 length:',
            encryptedData.length,
          );
        } catch (error: unknown) {
          const err = error as Error;
          logger.error('TRACE [ChatInput] ZWC extraction FAILED:', {
            error: err.message,
            errorType: err.name,
            stack: err.stack,
          });
          // Provide specific error log about why ZWC was invalid
          if (err.message?.includes('prefix signature')) {
            logger.error(
              'TRACE [ChatInput] ZWC Error: Missing or invalid prefix signature - message may be incomplete',
            );
            toast.error('Invalid stealth message format. Make sure you copied the entire message.');
          } else if (
            err.message?.includes('too many invisible characters') ||
            err.message?.includes('corrupted')
          ) {
            logger.error(
              'TRACE [ChatInput] ZWC Error: Message corrupted - invisible characters lost during transmission',
            );
            toast.error(
              'Message is too corrupted to recover. Some invisible characters were lost.',
            );
          } else if (err.message?.includes('Data too short')) {
            logger.error('TRACE [ChatInput] ZWC Error: Message too short - incomplete data');
            toast.error('Message appears incomplete. Please copy the entire message.');
          } else {
            logger.error('TRACE [ChatInput] ZWC Error: Unknown extraction failure', err.message);
            toast.error('Failed to extract hidden message. The message may be corrupted.');
          }
          // DO NOT fall back to PGP if ZWC was detected but failed - this is a specific error
          // Throw error to prevent fallback to other formats
          throw new Error(`ZWC extraction failed: ${err.message}`);
        }
      } else {
        logger.debug('TRACE [ChatInput] No ZWC detected, checking other formats...');
      }

      // 2. Check if it's a PGP message (legacy format)
      if (!encryptedData && content.includes('-----BEGIN PGP MESSAGE-----')) {
        logger.debug('TRACE [ChatInput] PGP message detected');
        encryptedData = content;
      }

      // 3. Check if it's a Nahan Compact Protocol message (base64)
      if (!encryptedData) {
        logger.debug('TRACE [ChatInput] Checking for Base64 Nahan Protocol message...');
        // Try to decode as base64 and check if it has the protocol version byte
        try {
          const decoded = naclUtil.decodeBase64(content.trim());
          // Nahan Compact Protocol: 0x01 = encrypted, 0x02 = signed broadcast
          if (decoded.length > 0 && (decoded[0] === 0x01 || decoded[0] === 0x02)) {
            logger.debug(
              'TRACE [ChatInput] Base64 Nahan Protocol detected, version:',
              `0x${decoded[0].toString(16).padStart(2, '0')}`,
            );
            encryptedData = content.trim();
          } else {
            logger.debug('TRACE [ChatInput] Base64 decoded but invalid version byte:', decoded[0]);
          }
        } catch {
          logger.debug('TRACE [ChatInput] Not valid base64, skipping...');
          // Not base64, continue
        }
      }

      // Log which detection step succeeded
      if (encryptedData) {
        logger.debug(
          'TRACE [ChatInput] Detection successful, encryptedData length:',
          encryptedData.length,
        );
      } else {
        logger.debug('TRACE [ChatInput] No encrypted data detected in any format');
      }

      // 4. If we found encrypted data, try to decrypt and add to chat
      if (encryptedData) {
        try {
          await processIncomingMessage(encryptedData);
          toast.success(t('chat.input.decrypt_success'));
          setMessageInput(''); // Clear input
          return;
        } catch (processError: unknown) {
          const procErr = processError as Error;
          // Provide clear feedback based on error type
          if (
            procErr.message?.includes('Signature verification failed') ||
            procErr.message?.includes('verify')
          ) {
            toast.error(
              'Signature verification failed. The message may be corrupted or from an unknown sender.',
            );
          } else if (
            procErr.message?.includes('decrypt') ||
            procErr.message?.includes('Decryption failed')
          ) {
            toast.error(
              'Decryption failed. The message may be corrupted or encrypted for a different recipient.',
            );
          } else if (procErr.message === 'SENDER_UNKNOWN') {
            setIsManualPasteOpen(true);
            toast.error('Unknown sender. Please select the sender manually.');
            return;
          } else if (procErr.name === 'DuplicateMessageError') {
            // Silently ignore duplicates
            setMessageInput('');
            return;
          } else {
            toast.error(t('chat.input.decrypt_error'));
          }
          throw processError; // Re-throw to continue to manual paste modal if needed
        }
      }

      // 5. No encrypted message detected - show modal for manual paste
      logger.debug(
        'TRACE [ChatInput] No encrypted data detected in any format, showing manual paste modal',
      );
      throw new Error('No encrypted message detected');
    } catch (err: unknown) {
      // If it's a decryption error or unknown sender, show modal
      const error = err as Error;
      logger.debug('TRACE [ChatInput] Error caught in processPasteContent:', {
        message: error.message,
        name: error.name,
      });

      if (
        error.message === 'SENDER_UNKNOWN' ||
        error.message === 'No encrypted message detected' ||
        error.message?.includes('decrypt') ||
        error.message?.includes('Failed') ||
        error.message?.includes('verify') ||
        error.message?.includes('ZWC extraction failed')
      ) {
        setIsManualPasteOpen(true);
        // Don't show duplicate error toast here - already handled above
        if (error.name !== 'DuplicateMessageError') {
          // ZWC errors already have specific toasts, don't show generic error
          if (!error.message?.includes('ZWC extraction failed')) {
            toast.error(t('chat.input.decrypt_error'));
          }
        }
      } else {
        toast.error(t('chat.input.decrypt_error'));
        logger.error(error);
      }
    } finally {
      setIsProcessing(false);
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
      logger.warn('Clipboard access failed, opening manual input:', error);
      setIsManualPasteOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 bg-industrial-950 border-t border-industrial-800 backdrop-blur-md bg-opacity-90 sticky bottom-0 z-20 pb-safe">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          className="hidden"
          onChange={handleImageSelect}
        />
        <input
          type="file"
          accept="image/*"
          ref={imageInputRef}
          className="hidden"
          onChange={handleImageSendSelect}
        />
        <Tooltip content={t('steganography.clip_tooltip', 'Hide data in image')}>
          <Button
            isIconOnly
            variant="light"
            className="rounded-full w-8 h-8 min-w-8 mb-1 text-industrial-400"
            onPress={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-5 h-5" />
          </Button>
        </Tooltip>

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={messageInput}
            onValueChange={setMessageInput}
            placeholder={t('chat.input.placeholder')}
            minRows={1}
            maxRows={4}
            variant="flat"
            onKeyDown={handleKeyDown}
            classNames={{
              input: 'text-sm sm:text-base',
              inputWrapper:
                'bg-industrial-900 shadow-inner border-industrial-800 focus-within:bg-industrial-800 pb-2',
            }}
            endContent={
              <div className="absolute end-2 bottom-0.5 text-xs text-industrial-500 font-mono">
                {messageInput.length}/2000
              </div>
            }
          />
        </div>
        {messageInput.trim() ? (
          <Tooltip content={t('chat.input.long_press_tooltip')}>
            <Button
              isIconOnly
              color="primary"
              variant="shadow"
              className="rounded-full w-8 h-8 min-w-8 mb-1"
              {...longPressHandlers}
              isLoading={isAutoStealthEncoding}
            >
              <Send className="w-4 h-4" />
            </Button>
          </Tooltip>
        ) : (
          <Tooltip content={t('chat.input.paste_tooltip')}>
            <Button
              isIconOnly
              variant="flat"
              className="rounded-full w-8 h-8 min-w-8 mb-1 bg-industrial-800 text-industrial-300"
              onPress={handlePaste}
              isLoading={isProcessing}
            >
              <ClipboardPaste className="w-4 h-4" />
            </Button>
          </Tooltip>
        )}
      </div>
      <div className="text-center mt-1">
        <span className="text-[10px] text-industrial-600 flex items-center justify-center gap-1">
          <Lock className="w-3 h-3" />
          {t('chat.input.footer')}
        </span>
      </div>

      <ManualPasteModal
        isOpen={isManualPasteOpen}
        onClose={() => setIsManualPasteOpen(false)}
        onSubmit={processPasteContent}
      />

      <SteganographyPreviewSheet
        isOpen={isPreviewOpen}
        onClose={() => setPreviewOpen(false)}
        imageUrl={encodedCarrierUrl}
        onDownload={handleDownloadCarrier}
        // onSend removed as it is now auto-sent
      />
    </div>
  );
}
