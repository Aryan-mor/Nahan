/* eslint-disable max-lines, max-lines-per-function */
import { Avatar, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { Check, Copy, Download, Share, Users } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { dataURItoBlob } from '../lib/utils';
import { formatMultiNahanIdentity, formatNahanIdentity } from '../services/stealthId';
import { useAppStore } from '../stores/appStore';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

import { Contact, Identity } from '../services/storage';

interface MyQRModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  contact?: Contact | null;
  contacts?: Contact[];
}

export function MyQRModal({ isOpen, onOpenChange, contact, contacts = [] }: MyQRModalProps) {
  const { identity: myself } = useAppStore();
  const { camouflageLanguage } = useUIStore();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { t } = useTranslation();

  // Determine if we're in multi-contact mode
  const isMultiMode = contacts.length > 0;
  const multiContacts = useMemo(() =>
    contacts.map(c => ({ name: c.name, publicKey: c.publicKey })),
    [contacts]
  );

  // Use provided contact or fallback to self (for single mode)
  // We construct a "partial identity" from the contact for display/QR purposes
  const target = useMemo(() => {
    if (isMultiMode) {
      // In multi-mode, we don't use a single target
      return null;
    }
    if (contact) {
      return {
        name: contact.name,
        fingerprint: contact.fingerprint,
        publicKey: contact.publicKey,
      } as unknown as Identity;
    }
    return myself;
  }, [contact, myself, isMultiMode]);

  // Generate display name for multi-mode
  const displayName = useMemo(() => {
    if (isMultiMode) {
      return t('my_qr.multi_contacts', { count: contacts.length });
    }
    return target?.name || '';
  }, [isMultiMode, contacts.length, target, t]);

  useEffect(() => {
    const generateQRCode = async () => {
      try {
        let qrData: string;

        if (isMultiMode) {
          // Multi-contact mode: use formatMultiNahanIdentity
          qrData = formatMultiNahanIdentity(multiContacts, camouflageLanguage || 'fa');
        } else if (target) {
          // Single contact mode: use formatNahanIdentity
          qrData = formatNahanIdentity(target, camouflageLanguage || 'fa');
        } else {
          return;
        }

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

    if (isOpen && (target || isMultiMode)) {
      generateQRCode();
    }
  }, [isOpen, target, isMultiMode, multiContacts, camouflageLanguage, t]);


  const copyToClipboard = async () => {
    try {
      let data: string;
      if (isMultiMode) {
        data = formatMultiNahanIdentity(multiContacts, camouflageLanguage || 'fa');
      } else if (target) {
        data = formatNahanIdentity(target, camouflageLanguage || 'fa');
      } else {
        return;
      }

      await navigator.clipboard.writeText(data);
      setIsCopied(true);
      toast.success(t('my_qr.success.copied'));
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error(t('my_qr.error.copy'));
    }
  };

  const downloadQR = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    const filename = isMultiMode
      ? `nahan-contacts-${contacts.length}.png`
      : `nahan-identity-${target?.name || 'unknown'}.png`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareQR = async () => {
    if (!qrCodeDataUrl) return;
    try {
      const blob = dataURItoBlob(qrCodeDataUrl);
      const filename = isMultiMode
        ? `nahan-contacts-${contacts.length}.png`
        : `nahan-${target?.name || 'unknown'}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      const shareTitle = isMultiMode
        ? t('my_qr.multi_share_title', { count: contacts.length })
        : t('my_qr.share_title', { name: target?.name });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: shareTitle,
          text: shareTitle,
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

  const getModalTitle = () => {
    if (isMultiMode) {
      return t('my_qr.multi_title', 'Share Contacts');
    }
    return contact ? t('my_qr.contact_title', 'Contact Identity') : t('my_qr.title');
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
              {getModalTitle()}
              <span className="text-sm font-normal text-industrial-400">
                {isMultiMode
                  ? t('my_qr.multi_subtitle', 'Scan or share to add these contacts')
                  : t('my_qr.subtitle')}
              </span>
            </ModalHeader>
            <ModalBody className="py-6 flex flex-col items-center gap-6">
              {qrCodeDataUrl ? (
                <div className="p-4 bg-white rounded-xl shadow-lg shadow-black/50">
                  <img
                    src={qrCodeDataUrl}
                    alt={getModalTitle()}
                    className="w-64 h-64 object-contain"
                    data-testid="qr-code-img"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}

              {isMultiMode ? (
                // Multi-contact display
                <div className="w-full space-y-3">
                  <div className="flex items-center justify-center gap-2 text-industrial-300">
                    <Users className="w-5 h-5" />
                    <span className="text-lg font-semibold">
                      {t('my_qr.multi_contacts', { count: contacts.length })}
                    </span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-2 px-2">
                    {contacts.map((c) => (
                      <div
                        key={c.fingerprint}
                        className="flex items-center gap-2 p-2 bg-industrial-800 rounded-lg"
                      >
                        <Avatar
                          name={c.name}
                          size="sm"
                          className="flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-industrial-100 truncate">{c.name}</p>
                          <p className="text-xs text-industrial-500 font-mono truncate">
                            {c.fingerprint.slice(-8)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // Single contact display
                <div className="w-full text-center space-y-2">
                  <p className="text-xl font-bold text-industrial-100">{displayName}</p>
                  <p className="text-xs text-industrial-500 font-mono break-all px-4">
                    {target?.fingerprint}
                  </p>
                </div>
              )}
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
