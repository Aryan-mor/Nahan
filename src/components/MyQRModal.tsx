import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { Check, Copy, Download, Share } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../stores/appStore';
import { dataURItoBlob } from '../lib/utils';

interface MyQRModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
}

export function MyQRModal({ isOpen, onOpenChange }: MyQRModalProps) {
  const { identity } = useAppStore();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (isOpen && identity) {
      generateQRCode();
    }
  }, [isOpen, identity]);

  const generateQRCode = async () => {
    if (!identity) return;
    try {
      // Format: name+publicKey
      const qrData = `${identity.name}+${identity.publicKey}`;
      const dataUrl = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#e2e8f0', // industrial-200
          light: '#020617', // industrial-950
        },
      });
      setQrCodeDataUrl(dataUrl);
    } catch (err) {
      console.error('QR Generation failed', err);
      toast.error('Failed to generate QR code');
    }
  };

  const copyToClipboard = async () => {
    if (!identity) return;
    try {
      const data = `${identity.name}+${identity.publicKey}`;
      await navigator.clipboard.writeText(data);
      setIsCopied(true);
      toast.success('Identity copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const downloadQR = () => {
    if (!qrCodeDataUrl || !identity) return;
    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    link.download = `nahan-identity-${identity.name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareQR = async () => {
    if (!qrCodeDataUrl || !identity) return;
    try {
      const blob = dataURItoBlob(qrCodeDataUrl);
      const file = new File([blob], `nahan-${identity.name}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `NAHAN Identity - ${identity.name}`,
          text: `Scan to add ${identity.name} on NAHAN`,
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
              My Identity QR
              <span className="text-sm font-normal text-industrial-400">
                Share this code to connect
              </span>
            </ModalHeader>
            <ModalBody className="py-6 flex flex-col items-center gap-6">
              {qrCodeDataUrl ? (
                <div className="p-4 bg-white rounded-xl shadow-lg shadow-black/50">
                  <img
                    src={qrCodeDataUrl}
                    alt="Identity QR Code"
                    className="w-64 h-64 object-contain"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}

              <div className="w-full text-center space-y-2">
                <p className="text-xl font-bold text-industrial-100">{identity?.name}</p>
                <p className="text-xs text-industrial-500 font-mono break-all px-4">
                  {identity?.fingerprint}
                </p>
              </div>
            </ModalBody>
            <ModalFooter className="justify-center gap-3">
              <Button
                variant="flat"
                onPress={copyToClipboard}
                startContent={
                  isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />
                }
                color={isCopied ? 'success' : 'default'}
              >
                {isCopied ? 'Copied' : 'Copy String'}
              </Button>
              <Button
                variant="flat"
                onPress={downloadQR}
                startContent={<Download className="w-4 h-4" />}
              >
                Save
              </Button>
              <Button
                color="primary"
                onPress={shareQR}
                startContent={<Share className="w-4 h-4" />}
              >
                Share
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
