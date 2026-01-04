import { Button, Textarea, Tooltip } from '@heroui/react';
import { ClipboardPaste, Lock, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as naclUtil from 'tweetnacl-util';
import { useLongPress } from '../hooks/useLongPress';
import { CamouflageService } from '../services/camouflage';
import { useAppStore } from '../stores/appStore';
import { ManualPasteModal } from './ManualPasteModal';

const camouflageService = CamouflageService.getInstance();

export function ChatInput() {
  const {
    sendAutoStealthMessage,
    setShowStealthModal,
    setPendingStealthBinary,
    setPendingPlaintext,
    processIncomingMessage,
    messageInput,
    setMessageInput,
  } = useAppStore();
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);
  const [isAutoStealthEncoding, setIsAutoStealthEncoding] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Handle single click: Auto-stealth mode
   * Automatically encrypts and embeds message with random cover text
   * Ensures safety ratio is met before sending
   */
  const handleSingleClick = async () => {
    if (!messageInput.trim()) return;

    setIsAutoStealthEncoding(true);
    try {
      // Auto-stealth: encrypt + embed with random cover text
      // sendAutoStealthMessage ensures safety ratio is >= 80% before sending
      // It also clears messageInput upon success
      const stealthOutput = await sendAutoStealthMessage(messageInput);

      // Auto-copy stealth message to clipboard
      try {
        await navigator.clipboard.writeText(stealthOutput);
        toast.success(t('chat.input.send_success_clipboard'));
      } catch (clipboardError) {
        console.warn('Failed to auto-copy to clipboard:', clipboardError);
        toast.success(t('chat.input.send_success')); // Still success, just clipboard failed
      }
    } catch (error) {
      toast.error(t('chat.input.send_error'));
      console.error(error);
    } finally {
      setIsAutoStealthEncoding(false);
      textareaRef.current?.focus();
    }
  };

  /**
   * Handle long press (>500ms): Open Stealth Modal
   * Works for both mouse (long click) and touch (long press)
   * Allows user to customize cover text
   */
  const handleLongPress = async () => {
    if (!messageInput.trim()) return;

    try {
      // Encrypt message to binary for stealth modal
      const { activeChat, identity, sessionPassphrase } = useAppStore.getState();
      if (!activeChat || !identity || !sessionPassphrase) {
        toast.error('Cannot send message: Missing context');
        return;
      }

      const { CryptoService } = await import('../services/crypto');
      const cryptoService = CryptoService.getInstance();

      const encryptedBinary = await cryptoService.encryptMessage(
        messageInput,
        activeChat.publicKey,
        identity.privateKey,
        sessionPassphrase,
        { binary: true }
      ) as Uint8Array;

      // Open stealth modal with pending binary
      setPendingStealthBinary(encryptedBinary);
      setPendingPlaintext(messageInput);
      setShowStealthModal(true);
    } catch (error) {
      toast.error('Failed to prepare stealth message');
      console.error(error);
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
      if (camouflageService.hasZWC(content)) {
        try {
          // First try strict decoding
          let binary: Uint8Array;
          try {
            binary = camouflageService.decodeFromZWC(content, false);
          } catch (strictError: unknown) {
            // If strict fails with checksum error, try lenient mode
            const error = strictError as Error;
            if (error.message?.includes('Checksum mismatch')) {
              console.warn('Strict decode failed, trying lenient mode...');
              binary = camouflageService.decodeFromZWC(content, true);
              toast.warning('Some invisible characters may have been lost, but message recovered.');
            } else {
              throw strictError; // Re-throw if it's a different error
            }
          }
          // Convert to base64 for decryption (processIncomingMessage expects string)
          encryptedData = naclUtil.encodeBase64(binary);
        } catch (error: unknown) {
          console.warn('Failed to extract stealth message:', error);
          // Show user-friendly error
          const err = error as Error;
          if (err.message?.includes('prefix signature')) {
            toast.error('Invalid stealth message format. Make sure you copied the entire message.');
          } else if (err.message?.includes('too many invisible characters')) {
            toast.error('Message is too corrupted to recover. Some invisible characters were lost.');
          } else {
            toast.error('Failed to extract hidden message. The message may be corrupted.');
          }
          // Continue to try other formats
        }
      }

      // 2. Check if it's a PGP message (legacy format)
      if (!encryptedData && content.includes('-----BEGIN PGP MESSAGE-----')) {
        encryptedData = content;
      }

      // 3. Check if it's a Nahan Compact Protocol message (base64)
      if (!encryptedData) {
        // Try to decode as base64 and check if it has the protocol version byte
        try {
          const decoded = naclUtil.decodeBase64(content.trim());
          // Nahan Compact Protocol starts with version byte (0x01)
          if (decoded.length > 0 && decoded[0] === 0x01) {
            encryptedData = content.trim();
          }
        } catch {
          // Not base64, continue
        }
      }

      // 4. If we found encrypted data, try to decrypt and add to chat
      if (encryptedData) {
        await processIncomingMessage(encryptedData);
        toast.success(t('chat.input.decrypt_success'));
        setMessageInput(''); // Clear input
        return;
      }

      // 5. No encrypted message detected - show modal for manual paste
      throw new Error('No encrypted message detected');
    } catch (err: unknown) {
      // If it's a decryption error or unknown sender, show modal
      const error = err as Error;
      if (error.message === 'SENDER_UNKNOWN' || error.message === 'No encrypted message detected' || error.message?.includes('decrypt') || error.message?.includes('Failed')) {
        setIsManualPasteOpen(true);
        toast.error(t('chat.input.decrypt_error'));
      } else {
        toast.error(t('chat.input.decrypt_error'));
        console.error(error);
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
      console.warn('Clipboard access failed, opening manual input:', error);
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
                'bg-industrial-900 shadow-inner border-industrial-800 focus-within:bg-industrial-800',
            }}
            endContent={
              <div className="absolute right-2 bottom-2 text-xs text-industrial-500 font-mono">
                {messageInput.length}/2000
              </div>
            }
          />
        </div>
        {messageInput.trim() ? (
          <Tooltip content={t('chat.input.long_press_tooltip', { defaultValue: 'Click/Tap: Auto-Stealth | Long Press/Long Click: Custom Stealth' })}>
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
    </div>
  );
}
