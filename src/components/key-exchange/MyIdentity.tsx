/* eslint-disable max-lines-per-function */
import { Button, Divider, useDisclosure } from '@heroui/react';
import { Copy, QrCode, Share } from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { dataURItoBlob } from '../../lib/utils';
import { formatNahanIdentity } from '../../services/stealthId';
import { useAppStore } from '../../stores/appStore';
import { useUIStore } from '../../stores/uiStore';
import * as logger from '../../utils/logger';
import { MyQRModal } from '../MyQRModal';

export function MyIdentity() {
  const { t } = useTranslation();
  const { identity } = useAppStore();
  const { camouflageLanguage } = useUIStore();
  const { isOpen: isQROpen, onOpen: onQROpen, onOpenChange: onQROpenChange } = useDisclosure();
  
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  const generateQRCode = useCallback(async () => {
    if (!identity) return;

    try {
      // Use formatNahanIdentity to get the stealth ID string
      const qrData = formatNahanIdentity(identity, camouflageLanguage || 'fa');

      const dataUrl = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#e2e8f0', // industrial-200
          light: '#020617', // industrial-950
        },
      });

      setQrCodeDataUrl(dataUrl);
    } catch {
      toast.error(t('my_identity.toast.qr_gen_fail'));
    }
  }, [identity, camouflageLanguage, t]);

  useEffect(() => {
    if (identity) {
      generateQRCode();
    }
  }, [identity, generateQRCode]);

  const copyIdentityKey = async () => {
    if (!identity) return;
    try {
      // Generate stealth ID (steganographic poetry) instead of plaintext
      const stealthID = formatNahanIdentity(identity, camouflageLanguage || 'fa');
      await navigator.clipboard.writeText(stealthID);
      toast.success(t('my_identity.toast.stealth_copy_success'));
    } catch (error) {
      logger.error('Failed to generate stealth ID:', error);
      toast.error(t('my_identity.toast.stealth_copy_fail'));
    }
  };

  const copyQRData = async () => {
    if (!qrCodeDataUrl) return;
    try {
      const blob = dataURItoBlob(qrCodeDataUrl);
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      toast.success(t('my_identity.toast.qr_copy_success'));
    } catch (err) {
      logger.error(err);
      toast.error(t('my_identity.toast.qr_copy_fail'));
    }
  };

  const shareQRCode = async () => {
    if (!qrCodeDataUrl || !identity) return;
    try {
      const blob = dataURItoBlob(qrCodeDataUrl);
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `nahan-${identity.name}-qr.png`, {
          type: 'image/png',
        });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: t('my_identity.share_title', { name: identity.name }),
            text: identity.publicKey,
            files: [file],
          });
        }
      } else {
        copyQRData();
      }
    } catch {
      toast.error(t('my_identity.toast.share_fail'));
    }
  };

  if (!identity) return null;

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-industrial-100">{t('my_identity.title')}</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Button
            size="lg"
            variant="flat"
            onPress={copyIdentityKey}
            className="bg-industrial-800 text-industrial-100 h-24 flex flex-col gap-2 p-2 min-w-0"
          >
            <Copy className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium text-center whitespace-normal leading-tight">
              {t('my_identity.copy_id')}
            </span>
          </Button>
          <Button
            size="lg"
            variant="flat"
            onPress={shareQRCode}
            className="bg-industrial-800 text-industrial-100 h-24 flex flex-col gap-2 p-2 min-w-0"
          >
            <Share className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium text-center whitespace-normal leading-tight">
              {t('my_identity.share_id')}
            </span>
          </Button>
          <Button
            size="lg"
            variant="flat"
            onPress={onQROpen}
            className="bg-industrial-800 text-industrial-100 h-24 flex flex-col gap-2 p-2 min-w-0"
          >
            <QrCode className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium text-center whitespace-normal leading-tight">
              {t('my_identity.view_qr')}
            </span>
          </Button>
        </div>
      </div>

      <Divider className="my-6 bg-industrial-800" />

      {/* View QR Code Modal */}
      <MyQRModal isOpen={isQROpen} onOpenChange={onQROpenChange} />
    </>
  );
}
