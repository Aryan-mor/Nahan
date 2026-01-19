/* eslint-disable max-lines, max-lines-per-function */
import { Button } from '@heroui/react';
import { ClipboardPaste } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DetectionResult } from '../hooks/useClipboardDetection';
import { analyzeClipboard } from '../services/clipboardAnalysis';
import { ImageSteganographyService } from '../services/steganography';
import { StorageService } from '../services/storage';
import { useAppStore } from '../stores/appStore';
import { useSteganographyStore } from '../stores/steganographyStore';
import * as logger from '../utils/logger';

import { ManualPasteModal } from './ManualPasteModal';
import { NewMessageModal } from './NewMessageModal';
import { SenderSelectModal } from './SenderSelectModal';

interface ManualPasteButtonProps {
  onNewChat: () => void;
  onDetection?: (result: DetectionResult) => void;
  className?: string;
  variant?: "solid" | "bordered" | "light" | "flat" | "faded" | "shadow";
  testId?: string;
}

const stegoService = ImageSteganographyService.getInstance();
const storageService = StorageService.getInstance();

export function ManualPasteButton({ onNewChat, onDetection, className, variant = "flat", testId }: ManualPasteButtonProps) {
  const { t } = useTranslation();

  // State
  const [isProcessingPaste, setIsProcessingPaste] = useState(false);

  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);
  const [isSenderSelectOpen, setIsSenderSelectOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [newMessageResult, setNewMessageResult] = useState<{
    type: 'message';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  } | null>(null);

  // Store access
  const contacts = useAppStore(state => state.contacts);
  const handleUniversalInput = useAppStore(state => state.handleUniversalInput);
  const identity = useAppStore(state => state.identity);
  const sessionPassphrase = useAppStore(state => state.sessionPassphrase);
  const refreshChatSummaries = useAppStore(state => state.refreshChatSummaries);

  const {
    setDecodingStatus,
    setDecodedImageUrl,
    setDecodingError,
  } = useSteganographyStore();

  const handlePaste = async () => {
    setIsProcessingPaste(true);
    setDecodingStatus('processing');
    let decodingOutcome: 'success' | 'error' | null = null;

    try {
      if (!identity || !sessionPassphrase) {
        toast.error(t('auth.required'));
        return;
      }

      const { processed } = await analyzeClipboard({
        identity,
        sessionPassphrase,
        contacts,
        handleUniversalInput,
      });

      if (processed) {
        if (processed.type === 'message') {
          if (processed.source === 'image') {
            setDecodingStatus('success');
            decodingOutcome = 'success';
            toast.success(t('stealth.decode_success', 'Image decoded successfully'));
          }

          setNewMessageResult({
            type: 'message',
            fingerprint: processed.fingerprint!,
            isBroadcast: processed.isBroadcast || false,
            senderName: processed.senderName || 'Unknown',
          });
          setShowNewMessageModal(true);
        } else if (processed.type === 'id') {
          if (processed.data) {
            const contactData = processed.data;
            if (onDetection) {
              onDetection({
                type: 'id',
                contactName: contactData.name || 'Unknown',
                contactPublicKey: contactData.publicKey || contactData.key,
              });
            } else {
              toast.info(t('chat.list.contact_key_detected'));
              onNewChat();
            }
          }
        }
      } else {
        toast.info(t('chat.list.clipboard_empty', 'Clipboard empty or format not supported'));
        setIsManualPasteOpen(true);
      }
    } catch (error: unknown) {
      setDecodingStatus('error');
      decodingOutcome = 'error';
      const err = error as {
        message?: string;
        keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
      };

      if (err.message === 'SENDER_UNKNOWN') {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            setPendingMessage(text);
            setIsSenderSelectOpen(true);
          }
        } catch {
          setIsManualPasteOpen(true);
        }
      } else if (err.message === 'CONTACT_INTRO_DETECTED') {
        if (onDetection && err.keyData) {
          const contactName = err.keyData.name || err.keyData.username || 'Unknown';
          const contactPublicKey = err.keyData.publicKey || err.keyData.key;
          if (contactPublicKey) {
            onDetection({
              type: 'id',
              contactName: contactName,
              contactPublicKey: contactPublicKey,
            });
          } else {
            toast.info(t('chat.list.contact_key_detected'));
            onNewChat();
          }
        } else {
          toast.info(t('chat.list.contact_key_detected'));
          onNewChat();
        }
      } else {
        logger.error('[UniversalInput] Error:', error);
        setIsManualPasteOpen(true);
      }
    } finally {
      setIsProcessingPaste(false);
      if (!decodingOutcome) {
        setDecodingStatus('idle');
      }
    }
  };

  const handleManualPaste = async (content: string) => {
    setIsProcessingPaste(true);
    setDecodingStatus('processing');
    setDecodingError(null);

    // Check for Data URL (Image Steganography)
    if (content.startsWith('data:image')) {
      try {
        if (!identity || !sessionPassphrase) {
          toast.error(t('auth.required'));
          return;
        }

        const res = await fetch(content);
        const blob = await res.blob();
        const file = new File([blob], "pasted_image.png", { type: blob.type });

        const { url, senderPublicKey } = await stegoService.decode(
          file,
          identity.privateKey,
          sessionPassphrase,
          contacts.map((c) => c.publicKey),
        );
        setDecodedImageUrl(url || null);

        if (senderPublicKey) {
          const contact = contacts.find((c) => c.publicKey === senderPublicKey);
          if (contact) {
            // Store as 'image_stego'
            await storageService.storeMessage(
              {
                senderFingerprint: contact.fingerprint,
                recipientFingerprint: identity.fingerprint,
                type: 'image_stego',
                content: {
                  plain: '',
                  encrypted: '',
                  image: content,
                },
                isOutgoing: false,
                read: false,
                status: 'sent',
              },
              sessionPassphrase,
            );

            refreshChatSummaries();
            toast.success(t('steganography.message_saved', 'Message saved to chat'));

            setNewMessageResult({
               type: 'message',
               fingerprint: contact.fingerprint,
               isBroadcast: false,
               senderName: contact.name,
            });
            setShowNewMessageModal(true);
          } else {
             toast.warning(t('steganography.unknown_sender', 'Decoded from unknown sender'));
          }
        }
        setDecodingStatus('success');
        setIsManualPasteOpen(false);
      } catch (error) {
        setDecodingStatus('error');
        setDecodingError((error as Error).message);
        toast.error(t('steganography.decode_error', 'Failed to decode image'));
      } finally {
        setIsProcessingPaste(false);
      }
      return;
    }

    try {
      const result = await handleUniversalInput(content, undefined, true);

      if (result && result.type === 'message') {
        setNewMessageResult(result);
        setShowNewMessageModal(true);
      }

      setIsManualPasteOpen(false);
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
      };
      if (err.message === 'SENDER_UNKNOWN') {
        setPendingMessage(content);
        setIsManualPasteOpen(false);
        setIsSenderSelectOpen(true);
      } else if (err.message === 'CONTACT_INTRO_DETECTED') {
        setIsManualPasteOpen(false);
        if (onDetection && err.keyData) {
          const contactName = err.keyData.name || err.keyData.username || 'Unknown';
          const contactPublicKey = err.keyData.publicKey || err.keyData.key;
          if (contactPublicKey) {
            onDetection({
              type: 'id',
              contactName: contactName,
              contactPublicKey: contactPublicKey,
            });
          } else {
            toast.info(t('chat.list.contact_key_detected'));
            onNewChat();
          }
        } else {
          toast.info(t('chat.list.contact_key_detected'));
          onNewChat();
        }
      } else if (err.message === 'MULTI_CONTACT_INTRO_DETECTED') {
        setIsManualPasteOpen(false);
        const multiErr = err as { contacts: Array<{ name: string; publicKey: string }> };
        if (onDetection && multiErr.contacts && multiErr.contacts.length > 0) {
           onDetection({
              type: 'multi_id',
              contactName: `${multiErr.contacts.length} Contacts`,
              contacts: multiErr.contacts
           });
        } else {
            toast.info(t('chat.list.contact_key_detected'));
            onNewChat();
        }
      } else {
        toast.error(t('chat.list.process_error'));
        logger.error('[UniversalInput] Error:', error);
      }
    } finally {
      setIsProcessingPaste(false);
    }
  };

  const handleSelectSender = async (fingerprint: string) => {
    if (!pendingMessage) return;

    setIsSenderSelectOpen(false);
    setIsProcessingPaste(true);

    try {
      const result = await handleUniversalInput(pendingMessage, fingerprint, true);

      if (result && result.type === 'message') {
        setNewMessageResult(result);
        setShowNewMessageModal(true);
      }

      setPendingMessage(null);
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        keyData?: { name?: string; username?: string; publicKey?: string; key?: string };
      };
      if (err.message === 'CONTACT_INTRO_DETECTED') {
        if (onDetection && err.keyData) {
          const contactName = err.keyData.name || err.keyData.username || 'Unknown';
          const contactPublicKey = err.keyData.publicKey || err.keyData.key;
          if (contactPublicKey) {
            onDetection({
              type: 'id',
              contactName: contactName,
              contactPublicKey: contactPublicKey,
            });
          } else {
            toast.info(t('chat.list.contact_key_detected'));
            onNewChat();
          }
        } else {
          toast.info(t('chat.list.contact_key_detected'));
          onNewChat();
        }
      } else {
        logger.error('[UniversalInput] Error:', error);
        toast.error(t('chat.list.import_error'));
      }
    } finally {
      setIsProcessingPaste(false);
    }
  };

  return (
    <>
      <Button
        isIconOnly
        variant={variant}
        className={`${className || ''}`}
        onPress={handlePaste}
        isLoading={isProcessingPaste}
        title={t('chat.list.paste_encrypted')}
        data-testid={testId || "chat-list-manual-paste-icon"}
      >
        <ClipboardPaste className="w-5 h-5" />
      </Button>

      {isManualPasteOpen && (
        <ManualPasteModal
          isOpen={isManualPasteOpen}
          onClose={() => setIsManualPasteOpen(false)}
          onSubmit={handleManualPaste}
          title={t('chat.list.import_title')}
        />
      )}

      <SenderSelectModal
        isOpen={isSenderSelectOpen}
        onClose={() => setIsSenderSelectOpen(false)}
        onSelect={handleSelectSender}
        contacts={contacts}
      />

      {newMessageResult && (
        <NewMessageModal
          isOpen={showNewMessageModal}
          onClose={() => {
            setShowNewMessageModal(false);
            setNewMessageResult(null);
          }}
          senderName={newMessageResult.senderName}
          senderFingerprint={newMessageResult.fingerprint}
          isBroadcast={newMessageResult.isBroadcast}
        />
      )}
    </>
  );
}
