/* eslint-disable max-lines-per-function */
import { Button, useDisclosure } from '@heroui/react';
import { Camera, Upload, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DetectionResult } from '../../hooks/useClipboardDetection';
import { camouflageService } from '../../services/camouflage';
import { cryptoService } from '../../services/crypto';
import { parseStealthID } from '../../services/stealthId';
import { ImageSteganographyService } from '../../services/steganography';
import { useAppStore } from '../../stores/appStore';
import * as logger from '../../utils/logger';

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
  const { identity, sessionPassphrase } = useAppStore();
  const stegoService = ImageSteganographyService.getInstance();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isOpen: isScanOpen,
    onOpen: onScanOpen,
    onClose: onScanClose,
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
      let publicKey = '';
      let name = '';

      // 1. Check for Stealth ID (Poem with hidden data)
      if (camouflageService.hasZWC(data)) {
        try {
          const binary = camouflageService.decodeFromZWC(data, true); // lenient=true
          const idData = parseStealthID(binary);

          if (idData) {
            publicKey = idData.publicKey;
            name = idData.name;
            logger.info('Detected Stealth ID in QR scan', { name });
          } else {
             // Check for Multi-ID
             const { parseMultiStealthID } = await import('../../services/stealthId');
             const multiData = parseMultiStealthID(binary);
             if (multiData && multiData.length > 0) {
                 toast.success(t('add_contact.toast.scan_success'));
                 if (onDetection) {
                     onDetection({
                        type: 'multi_id',
                        contactName: `${multiData.length} Contacts`,
                        contacts: multiData
                     });
                     return;
                 }
             }
          }
        } catch (e) {
          logger.warn('Failed to decode potential Stealth ID', e);
        }
      }

      // 2. Try parsing as JSON (Nahan QR format) if not found yet
      if (!publicKey) {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData.type === 'nahan-public-key') {
            publicKey = parsedData.publicKey || '';
            name = parsedData.name || '';
          }
        } catch {
          // Not JSON
        }
      }

      // 3. Fallback: Check if it's a raw key OR USERNAME+KEY
      if (!publicKey) {
        const { username: parsedName, key: parsedKey, isValid } = cryptoService.parseKeyInput(data);
        if (isValid) {
          publicKey = parsedKey;
          // Prefer extracted name from prefix if available
          name = parsedName || '';

          // If no name from prefix, try to get from key lookup
          if (!name) {
            name = (await cryptoService.getNameFromKey()) || '';
          }
        }
      }

      if (publicKey && cryptoService.isValidKeyFormat(publicKey)) {
        toast.success(t('add_contact.toast.scan_success'));

        // Direct detection handling - skips the manual import modal
        if (onDetection) {
          onDetection({
            type: 'id',
            contactName: name || 'Unknown',
            contactPublicKey: publicKey,
          });
        } else {
          // Fallback if no detection handler (should not happen in main flow)
          setScannedData({ name, publicKey });
          onManualOpen();
        }
      } else {
        toast.error(t('add_contact.toast.invalid_format'));
      }
    } catch (error) {
      logger.error('Scan processing error', error);
      toast.error(t('add_contact.toast.process_fail'));
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!identity || !sessionPassphrase) {
      toast.error(t('chat.input.error.missing_context'));
      return;
    }

    try {
      const { text, url } = await stegoService.decode(file, identity.privateKey, sessionPassphrase);

      if (text) {
        // Handle as QR code or text payload (Stealth ID or Key)
        handleScannedData(text);
      } else if (url) {
        // If it's an image, maybe it's just a raw image or stego image without text
        // For AddContact, we primarily care about text/keys.
        // But if it decoded successfully, we should maybe inform the user.
        toast.info(t('add_contact.toast.image_decoded_no_text'));
      } else {
        toast.error(t('add_contact.toast.no_qr_found'));
      }
    } catch (error) {
      logger.error('File processing error', error);
      toast.error(t('add_contact.toast.process_fail'));
    }

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
        onClose={onScanClose}
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
