/* eslint-disable max-lines-per-function */
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { Check, Copy, Download, Share } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { dataURItoBlob } from '../lib/utils';
import { formatNahanIdentity } from '../services/stealthId';
import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

import { Contact, Identity } from '../services/storage';

interface MyQRModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  contact?: Contact | null;
}

export function MyQRModal({ isOpen, onOpenChange, contact }: MyQRModalProps) {
  const { identity: myself } = useAppStore();
  const { camouflageLanguage } = useUIStore();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { t } = useTranslation();

  // Use provided contact or fallback to self
  // We construct a "partial identity" from the contact for display/QR purposes
  const target = useMemo(() => {
    if (contact) {
      return {
        name: contact.name,
        fingerprint: contact.fingerprint,
        publicKey: contact.publicKey,
      } as unknown as Identity;
    }
    return myself;
  }, [contact, myself]);

  useEffect(() => {
    const generateQRCode = async () => {
      if (!target) return;
      try {
        // Warning: formatNahanIdentity likely expects a full Identity object.
        // If passing a Contact, we need to ensure compatibility.
        // For shared contacts, we are sharing THEIR public info.
        // formatNahanIdentity handles formatting the "stealth ID" string.
        const qrData = formatNahanIdentity(target, camouflageLanguage || 'fa');
        const dataUrl = await QRCode.toDataURL(qrData, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeDataUrl(dataUrl);
      } catch (err) {
        logger.error('QR Generation failed', err);
        toast.error(t('my_qr.error.generate'));
      }
    };

    if (isOpen && target) {
      generateQRCode();
    }
  }, [isOpen, target, camouflageLanguage, t]);


  const copyToClipboard = async () => {
    if (!target) return;
    try {
      const data = formatNahanIdentity(target, camouflageLanguage || 'fa');
      await navigator.clipboard.writeText(data);
      setIsCopied(true);
      toast.success(t('my_qr.success.copied'));
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error(t('my_qr.error.copy'));
    }
  };

  const downloadQR = () => {
    if (!qrCodeDataUrl || !target) return;
    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    link.download = `nahan-identity-${target.name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareQR = async () => {
    if (!qrCodeDataUrl || !target) return;
    try {
      const blob = dataURItoBlob(qrCodeDataUrl);
      const file = new File([blob], `nahan-${target.name}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: t('my_qr.share_title', { name: target.name }),
          text: t('my_qr.share_text', { name: target.name }),
          files: [file],
        });
      } else {
        copyToClipboard();
      }
    } catch {
      // Fallback to copy if share fails or is cancelled
      copyToClipboard();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      classNames={{
        base: 'bg-industrial-900 border border-industrial-800 text-industrial-100',
        header: 'border-b border-industrial-800',
        footer: 'border-t border-industrial-800',
        closeButton: 'hover:bg-industrial-800 active:bg-industrial-700',
      }}
      backdrop="blur"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {contact ? t('my_qr.contact_title', 'Contact Identity') : t('my_qr.title')}
              <span className="text-sm font-normal text-industrial-400">
                {t('my_qr.subtitle')}
              </span>
            </ModalHeader>
            <ModalBody className="py-6 flex flex-col items-center gap-6">
              {qrCodeDataUrl ? (
                <div className="p-4 bg-white rounded-xl shadow-lg shadow-black/50">
                  <img
                    src={qrCodeDataUrl}
                    alt={t('my_qr.title')}
                    className="w-64 h-64 object-contain"
                    data-testid="qr-code-img"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}

              <div className="w-full text-center space-y-2">
                <p className="text-xl font-bold text-industrial-100">{target?.name}</p>
                <p className="text-xs text-industrial-500 font-mono break-all px-4">
                  {target?.fingerprint}
                </p>
              </div>
            </ModalBody>
            <ModalFooter className="justify-center gap-3">
              <Button
                variant="light"
                onPress={() => onOpenChange(false)}
                data-testid="qr-modal-close-button"
              >
                {t('common.close')}
              </Button>
              <Button
                variant="flat"
                onPress={copyToClipboard}
                startContent={
                  isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />
                }
                color={isCopied ? 'success' : 'default'}
                data-testid="copy-identity-modal"
              >
                {isCopied ? t('my_qr.copied') : t('common.copy_identity', 'Copy Identity')}
              </Button>
              <Button
                variant="flat"
                onPress={downloadQR}
                startContent={<Download className="w-4 h-4" />}
              >
                {t('my_qr.save')}
              </Button>
              <Button
                color="primary"
                onPress={shareQR}
                startContent={<Share className="w-4 h-4" />}
              >
                {t('my_qr.share')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
