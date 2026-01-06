/* eslint-disable max-lines-per-function */
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@heroui/react';
import { AlertTriangle, Copy, Download, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ImageSteganographyService } from '../../services/steganography';
import { useAppStore } from '../../stores/appStore';
import { useSteganographyStore } from '../../stores/steganographyStore';
import * as logger from '../../utils/logger';

const steganographyService = ImageSteganographyService.getInstance();

interface SteganographyPreviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  onDownload: () => void;
  onSend?: () => void;
}

export function SteganographyPreviewSheet({
  isOpen,
  onClose,
  imageUrl,
  onDownload,
  onSend,
}: SteganographyPreviewSheetProps) {
  const { t } = useTranslation();
  const { identity, sessionPassphrase } = useAppStore();
  const {
    viewMode,
    decodingStatus,
    decodedImageUrl,
    encodedCarrierUrl,
    decodingCarrierUrl,
    senderPublicKey,
    setDecodingStatus,
    setDecodedImageUrl,
    setDecodingError,
  } = useSteganographyStore();

  const [decodedText, setDecodedText] = useState<string | null>(null);

  useEffect(() => {
    if (decodingStatus === 'processing') {
      setDecodedText(null);
    }
  }, [decodingStatus]);

  useEffect(() => {
    if (isOpen && viewMode === 'decode' && decodingStatus === 'processing' && decodingCarrierUrl) {
      const decode = async () => {
        if (!identity || !sessionPassphrase) {
          setDecodingStatus('error');
          setDecodingError('Missing identity or passphrase');
          return;
        }

        try {
          const response = await fetch(decodingCarrierUrl);
          const blob = await response.blob();
          const file = new File([blob], 'carrier.png', { type: 'image/png' });

          const { url: resultUrl, text: resultText } = await steganographyService.decode(
            file,
            identity.privateKey,
            sessionPassphrase,
            senderPublicKey ? [senderPublicKey] : [],
          );

          setDecodedImageUrl(resultUrl || null);
          setDecodedText(resultText || null);
          setDecodingStatus('success');
        } catch (error) {
          logger.error('Decoding failed', error);
          setDecodingError((error as Error).message);
          setDecodingStatus('error');
          toast.error(t('steganography.decode_error', 'Failed to decode image'));
        }
      };
      decode();
    }
  }, [
    isOpen,
    viewMode,
    decodingStatus,
    decodingCarrierUrl,
    identity,
    sessionPassphrase,
    senderPublicKey,
    setDecodingStatus,
    setDecodedImageUrl,
    setDecodingError,
    t,
  ]);

  const isDecoding = viewMode === 'decode' && decodingStatus === 'processing';
  const showDecoded = viewMode === 'decode' && decodingStatus === 'success' && decodedImageUrl;

  // Logic for display image:
  // 1. If successfully decoded, show decoded result
  // 2. If decoding but not done, or just starting, show the input carrier (if available)
  // 3. If encoding, show the encoded result (if available)
  // 4. Fallback to passed prop imageUrl (legacy support or explicit override)

  let displayImage: string | null = null;

  if (viewMode === 'decode') {
    displayImage = showDecoded ? decodedImageUrl : decodingCarrierUrl || imageUrl || null;
  } else {
    // encode mode
    displayImage = encodedCarrierUrl || imageUrl || null;
  }

  const handleCopyImage = async () => {
    if (!displayImage) return;
    try {
      const response = await fetch(displayImage);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      toast.success(t('steganography.image_copied', 'Image copied to clipboard'));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Copy failed', error);
      toast.error(t('steganography.copy_failed', 'Failed to copy image'));
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      placement="bottom"
      classNames={{
        base: 'm-0 sm:m-0 w-full max-w-full sm:max-w-md rounded-b-none rounded-t-2xl',
        wrapper: 'justify-end sm:justify-center',
      }}
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            transition: {
              duration: 0.3,
              ease: 'easeOut',
            },
          },
          exit: {
            y: 100,
            opacity: 0,
            transition: {
              duration: 0.2,
              ease: 'easeIn',
            },
          },
        },
      }}
      backdrop="blur"
      scrollBehavior="inside"
    >
      <ModalContent className="bg-industrial-900 border-t border-industrial-800 pb-safe">
        <ModalHeader className="flex flex-col gap-1 text-industrial-100">
          {viewMode === 'encode'
            ? t('steganography.preview_title', 'Encrypted Image Ready')
            : t('steganography.decode_title', 'Hidden Message')}
          <p className="text-xs text-industrial-400 font-normal">
            {viewMode === 'encode'
              ? t('steganography.preview_subtitle', 'Your message is hidden inside this image')
              : t('steganography.decode_subtitle', 'Content extracted from the image')}
          </p>
        </ModalHeader>
        <ModalBody className="p-4 gap-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-industrial-800 bg-black/50 flex items-center justify-center">
            {isDecoding ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner size="lg" color="primary" />
                <p className="text-sm text-industrial-400 animate-pulse">
                  {t('steganography.decoding', 'Extracting hidden message...')}
                </p>
              </div>
            ) : (
              displayImage && (
                <img
                  src={displayImage}
                  alt={viewMode === 'encode' ? 'Steganography Carrier' : 'Decoded Content'}
                  className="w-full h-full object-contain"
                />
              )
            )}
          </div>

          {viewMode === 'decode' && decodingStatus === 'success' && decodedText && (
            <div className="p-3 bg-black/20 rounded-lg border border-industrial-700/50">
              <div className="text-xs text-primary-400 mb-1 font-medium">
                {t('steganography.hidden_message', 'Hidden Message')}
              </div>
              <p className="text-sm text-industrial-100 whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                {decodedText}
              </p>
            </div>
          )}

          {viewMode === 'encode' && (
            <div className="bg-warning-900/20 border border-warning-900/50 rounded-lg p-3 flex gap-3 items-start">
              <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
              <p className="text-sm text-warning-200">
                {t(
                  'steganography.warning_file_transfer',
                  'You MUST send this image as a FILE. Sending it as a standard photo will corrupt the hidden data.',
                )}
              </p>
            </div>
          )}
        </ModalBody>
        <ModalFooter className="flex-col gap-2">
          {viewMode === 'encode' && onSend && (
            <Button
              color="success"
              variant="shadow"
              startContent={<Send className="w-4 h-4" />}
              onPress={onSend}
              className="w-full font-semibold text-white"
            >
              {t('common.send', 'Send Now')}
            </Button>
          )}

          {/* Show Download button if we have an image to download (Carrier or Decoded) */}
          {(displayImage || imageUrl) && (
            <div className="flex gap-2 w-full">
              <Button
                color="primary"
                variant="flat"
                startContent={<Download className="w-4 h-4" />}
                onPress={onDownload}
                className="flex-1 font-semibold"
                isDisabled={isDecoding}
              >
                {t('steganography.download_image', 'Download as File')}
              </Button>
              <Button
                color="secondary"
                variant="flat"
                startContent={<Copy className="w-4 h-4" />}
                onPress={handleCopyImage}
                className="flex-1 font-semibold"
                isDisabled={isDecoding}
              >
                {t('steganography.copy_image', 'Copy Image')}
              </Button>
            </div>
          )}

          <Button variant="light" onPress={onClose} className="w-full text-industrial-400">
            {t('common.close', 'Close')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
