/* eslint-disable max-lines-per-function */
import { Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';
import jsQR from 'jsqr';
import { Camera } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import * as logger from '../../utils/logger';

interface QRScannerModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClose: () => void;
  onScan: (data: string) => void;
}

export function QRScannerModal({ isOpen, onOpenChange, onClose, onScan }: QRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const { t } = useTranslation();

  const stopScanning = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const scanFrame = useCallback(() => {
    if (!mediaStreamRef.current || !mediaStreamRef.current.active) return;
    if (!videoRef.current) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          onScan(code.data);
          stopScanning();
          return;
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [onScan, stopScanning]);

  const startScanning = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Camera not supported');
      onClose();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      mediaStreamRef.current = stream;

      // Attach to video element if available
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => logger.error(err));
      }

      // Start scanning loop
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      logger.error('Camera error:', error);
      toast.error('Failed to access camera');
      onClose();
    }
  }, [onClose, scanFrame]);

  useEffect(() => {
    if (isOpen) {
      startScanning();
    } else {
      stopScanning();
    }
    return () => {
      stopScanning();
    };
  }, [isOpen, startScanning, stopScanning]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      classNames={{
        base: 'bg-industrial-900 border border-industrial-800',
      }}
      size="lg"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{t('qr_scanner.title')}</ModalHeader>
            <ModalBody
              className="py-0 px-0 items-center justify-center bg-black overflow-hidden relative"
              style={{ minHeight: '400px' }}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-cover absolute inset-0 z-0"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                muted
                playsInline
                data-testid="contact-scan-video"
              />
              <div className="z-10 w-64 h-64 border-2 border-primary/50 border-dashed rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] pointer-events-none relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-primary/50 animate-pulse" />
                </div>
              </div>
              <p className="absolute bottom-8 z-20 text-white font-medium bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">
                {t('qr_scanner.instruction')}
              </p>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
