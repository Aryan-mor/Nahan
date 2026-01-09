/* eslint-disable max-lines-per-function */
import { Button, useDisclosure } from '@heroui/react';
import jsQR from 'jsqr';
import { Camera, Upload, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DetectionResult } from '../../hooks/useClipboardDetection';
import { cryptoService } from '../../services/crypto';

import { ContactImportModal } from './ContactImportModal';
import { QRScannerModal } from './QRScannerModal';

interface AddContactProps {
  onDetection?: (result: DetectionResult) => void;
  onNewMessage?: (result: {
    type: 'message' | 'contact';
    fingerprint: string;
    isBroadcast: boolean;
    senderName: string;
  }) => void;
}

export function AddContact({ onDetection, onNewMessage }: AddContactProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isOpen: isScanOpen,
    onOpen: onScanOpen,
    onOpenChange: onScanOpenChange,
  } = useDisclosure();

  const {
    isOpen: isManualOpen,
    onOpen: onManualOpen,
    onOpenChange: onManualOpenChange,
  } = useDisclosure();

  const [scannedData, setScannedData] = useState<{ name?: string; publicKey?: string } | undefined>(
    undefined,
  );

  const handleScannedData = async (data: string) => {
    onScanOpenChange(); // Close scan modal if open

    try {
      // Try parsing as JSON (Nahan QR format)
      let publicKey = '';
      let name = '';

      try {
        const parsedData = JSON.parse(data);
        if (parsedData.type === 'nahan-public-key') {
          publicKey = parsedData.publicKey || '';
          name = parsedData.name || '';
        }
      } catch {
        // Not JSON, check if it's a raw key OR USERNAME+KEY
        const { username: parsedName, key: parsedKey, isValid } = cryptoService.parseKeyInput(data);
        if (isValid) {
          publicKey = parsedKey;
          // Prefer extracted name from prefix if available
          name = parsedName || '';

          // If no name from prefix, try to get from key
          if (!name) {
            name = (await cryptoService.getNameFromKey()) || '';
          }
        }
      }

      if (publicKey && cryptoService.isValidKeyFormat(publicKey)) {
        setScannedData({ name, publicKey });
        toast.success(t('add_contact.toast.scan_success'));
        onManualOpen();
      } else {
        toast.error(t('add_contact.toast.invalid_format'));
      }
    } catch {
      toast.error(t('add_contact.toast.process_fail'));
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          handleScannedData(code.data);
        } else {
          toast.error(t('add_contact.toast.no_qr_found'));
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-industrial-100">{t('add_contact.title')}</h3>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileUpload}
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Button
          size="lg"
          color="primary"
          variant="flat"
          onPress={onScanOpen}
          className="h-24 flex flex-col gap-2 p-2 min-w-0"
          data-testid="add-contact-scan-btn"
        >
          <Camera className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium text-center whitespace-normal leading-tight">
            {t('add_contact.buttons.scan_qr')}
          </span>
        </Button>
        <Button
          size="lg"
          color="secondary"
          variant="flat"
          onPress={() => fileInputRef.current?.click()}
          className="h-24 flex flex-col gap-2 p-2 min-w-0"
          data-testid="add-contact-upload-btn"
        >
          <Upload className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium text-center whitespace-normal leading-tight">
            {t('add_contact.buttons.upload_qr')}
          </span>
        </Button>
        <Button
          size="lg"
          color="default"
          variant="flat"
          onPress={() => {
            setScannedData(undefined); // Clear any previous scan data
            onManualOpen();
          }}
          className="h-24 flex flex-col gap-2 p-2 min-w-0"
          data-testid="manual-entry-button"
        >
          <User className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium text-center whitespace-normal leading-tight">
            {t('add_contact.buttons.manual')}
          </span>
        </Button>
      </div>

      <QRScannerModal
        isOpen={isScanOpen}
        onOpenChange={onScanOpenChange}
        onScan={handleScannedData}
      />

      <ContactImportModal
        isOpen={isManualOpen}
        onOpenChange={onManualOpenChange}
        initialValues={scannedData}
        onDetection={onDetection}
        onNewMessage={onNewMessage}
      />
    </div>
  );
}
