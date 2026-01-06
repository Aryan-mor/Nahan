/* eslint-disable max-lines-per-function, max-lines */
import { Button, Image, Tab, Tabs } from '@heroui/react';
import {
  AlertTriangle,
  Copy,
  Download,
  Image as ImageIcon,
  RefreshCw,
  Shield,
  Type,
  Upload,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { camouflageService } from '../../services/camouflage';
import { encodeBase122 } from '../../services/steganography/base122';
import { generateMeshGradient } from '../../services/steganography/imageUtils';
import { embedPayload } from '../../services/steganography/steganography';
import { useAppStore } from '../../stores/appStore';
import { useUIStore } from '../../stores/uiStore';
import * as logger from '../../utils/logger';
import { AdvancedOptions } from './AdvancedOptions';

export function UnifiedStealthDrawer() {
  const { t } = useTranslation();
  const { camouflageLanguage } = useUIStore();
  const {
    showStealthModal,
    setShowStealthModal,
    pendingStealthBinary,
    pendingStealthImage,
    confirmStealthSend,
    stealthDrawerMode,
    pendingPlaintext, // Use pendingPlaintext for "Hide in Text" logic if needed
    sendMessage,
  } = useAppStore();

  // Tab State
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');

  // Text Mode State
  const [coverText, setCoverText] = useState('');
  const [stealthScore, setStealthScore] = useState(0);
  const [finalTextOutput, setFinalTextOutput] = useState('');

  // Image Mode State
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Tab based on Mode
  useEffect(() => {
    if (showStealthModal) {
      if (stealthDrawerMode === 'image') {
        setActiveTab('image');
        // Load pending image if available
        if (pendingStealthImage) {
          setGeneratedImage(pendingStealthImage);
        }
      } else {
        setActiveTab('text');
      }
    }
  }, [showStealthModal, stealthDrawerMode, pendingStealthImage]);

  // --- Text Mode Logic (Copied from StealthModal) ---

  // Initial Auto-Suggestion when binary payload changes
  useEffect(() => {
    if (!pendingStealthBinary || activeTab !== 'text') return;

    const suggestion = camouflageService.getRecommendedCover(
      pendingStealthBinary.length,
      camouflageLanguage || 'fa',
    );
    setCoverText(suggestion);
  }, [pendingStealthBinary, camouflageLanguage, activeTab]);

  // Update stealth score and final output when cover text or payload changes
  useEffect(() => {
    if (!pendingStealthBinary || activeTab !== 'text') {
      setStealthScore(0);
      setFinalTextOutput('');
      return;
    }

    if (!coverText) {
      setStealthScore(0);
      setFinalTextOutput('');
      return;
    }

    const payloadSize = pendingStealthBinary.length;
    const score = camouflageService.calculateStealthRatio(payloadSize, coverText);
    setStealthScore(score);

    try {
      const output = camouflageService.embed(pendingStealthBinary, coverText);
      setFinalTextOutput(output);
    } catch (error) {
      logger.error('Embedding failed:', error);
      setFinalTextOutput('');
    }
  }, [pendingStealthBinary, coverText, activeTab]);

  // --- Image Mode Logic ---

  const embedDataIntoCanvas = async (canvas: HTMLCanvasElement) => {
    if (!pendingStealthBinary) {
      // If no data to hide (e.g. image mode only for viewing?), just return canvas data
      // But typically we should have data.
      return canvas.toDataURL('image/png');
    }

    const base122Payload = encodeBase122(pendingStealthBinary);
    const blob = await embedPayload(canvas, base122Payload);
    return URL.createObjectURL(blob);
  };

  const handleGenerateMask = async () => {
    setIsGenerating(true);
    try {
      // Generate Mesh Gradient
      const canvas = generateMeshGradient(1080, 1080);
      const dataUrl = await embedDataIntoCanvas(canvas);
      setGeneratedImage(dataUrl);
    } catch (error) {
      logger.error('Failed to generate mask:', error);
      toast.error(t('stealth.error.generate_failed', 'Failed to generate image'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCustomCarrierUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsGenerating(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Failed to get canvas context');

          // Fill with black to ensure opacity and prevent PNG optimization of transparent pixels
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.drawImage(img, 0, 0);
          const dataUrl = await embedDataIntoCanvas(canvas);
          setGeneratedImage(dataUrl);
        } catch (error) {
          logger.error('Failed to process custom carrier:', error);
          toast.error(
            t(
              'stealth.error.process_failed',
              'Failed to process image. It might be too small for the data.',
            ),
          );
        } finally {
          setIsGenerating(false);
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadImage = () => {
    if (!generatedImage) return;
    const a = document.createElement('a');
    a.href = generatedImage;
    a.download = `nahan_stealth_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(t('common.download_success', 'Saved to gallery'));
  };

  const handleCopyImage = async () => {
    if (!generatedImage) return;
    try {
      const blob = await (await fetch(generatedImage)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      toast.success(t('common.copy_success', 'Copied to clipboard'));
    } catch (error) {
      logger.error('Failed to copy image:', error);
      toast.error(t('common.copy_failed', 'Failed to copy'));
    }
  };

  const handleSendStealthImage = async () => {
    if (!generatedImage) return;

    try {
      // Convert Blob URL to Base64 for persistence and cross-device compatibility
      // This ensures the image data is embedded directly in the message payload
      // and survives page reloads or device transfers.
      let imageToSend = generatedImage;
      if (generatedImage.startsWith('blob:')) {
        const response = await fetch(generatedImage);
        const blob = await response.blob();
        imageToSend = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      await sendMessage(pendingPlaintext || '', imageToSend, 'image_stego');
      toast.success(t('stealth.send_success', 'Stealth image sent successfully'));
      setGeneratedImage(null);
      setShowStealthModal(false);
    } catch (error) {
      logger.error('Failed to send stealth image:', error);
      toast.error(t('stealth.send_error', 'Failed to send stealth image'));
    }
  };

  // --- Render Helpers ---

  const renderTextTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-industrial-400">{t('stealth.cover_text', 'Cover Text')}</span>
        <Button
          size="sm"
          variant="light"
          isIconOnly
          onPress={() => {
            if (pendingStealthBinary) {
              const suggestion = camouflageService.getRecommendedCover(
                pendingStealthBinary.length,
                camouflageLanguage || 'fa',
              );
              setCoverText(suggestion);
            }
          }}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <Textarea
        value={coverText}
        onChange={(e) => setCoverText(e.target.value)}
        minRows={5}
        maxRows={10}
        placeholder={t('stealth.enter_cover_text', 'Enter text to hide your message...')}
        className="font-mono text-sm"
        classNames={{
          input: 'bg-industrial-900 border-industrial-700',
          inputWrapper: 'bg-industrial-900 border-industrial-700 hover:bg-industrial-800',
        }}
      />

      {/* Stealth Score Indicator */}
      <div className="flex items-center gap-2 text-xs">
        <div
          className={`h-2 w-2 rounded-full ${
            stealthScore > 50 ? 'bg-success-500' : 'bg-warning-500'
          }`}
        />
        <span className="text-industrial-400">
          {t('stealth.security_score', 'Security Score')}: {stealthScore}%
        </span>
      </div>
    </div>
  );

  const renderImageTab = () => (
    <div className="space-y-6">
      {/* Image Preview / Placeholder */}
      <div className="relative w-full aspect-square bg-industrial-900 rounded-xl overflow-hidden border border-industrial-800 flex flex-col items-center justify-center">
        {generatedImage ? (
          <img src={generatedImage} alt="Stealth Mask" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center p-6 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-industrial-800 rounded-full flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-industrial-500" />
            </div>
            <p className="text-industrial-400 text-sm max-w-[200px]">
              {t('stealth.image_placeholder', 'Generate a unique gradient mask to hide your data.')}
            </p>

            <div className="flex gap-3">
              <Button color="primary" onPress={handleGenerateMask} isLoading={isGenerating}>
                {t('stealth.generate_mask', 'Generate Mask')}
              </Button>
              <Button
                variant="flat"
                onPress={() => fileInputRef.current?.click()}
                isLoading={isGenerating}
                startContent={<Upload className="w-4 h-4" />}
              >
                {t('stealth.upload_carrier', 'Upload Custom')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCustomCarrierUpload}
              />
            </div>
          </div>
        )}
      </div>

      {!generatedImage && <AdvancedOptions />}

      {/* Action Buttons (Only if image generated) */}
      {generatedImage && (
        <div className="space-y-4">
          {/* Global Warning */}
          <div className="bg-warning-900/20 border border-warning-900/50 rounded-lg p-3 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
            <p className="text-sm text-warning-200">
              {t(
                'stealth.warning.file_transfer',
                'Important: Always send this image as a File/Document in messaging apps. Standard photo sharing will destroy the hidden data.',
              )}
            </p>
          </div>

          <Button
            color="primary"
            className="w-full"
            size="lg"
            startContent={<Shield className="w-5 h-5" />}
            onPress={handleSendStealthImage}
          >
            {t('stealth.send_now', 'Send Now')}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button
              startContent={<Download className="w-4 h-4" />}
              variant="flat"
              onPress={handleDownloadImage}
            >
              {t('common.download', 'Download')}
            </Button>
            <Button
              startContent={<Copy className="w-4 h-4" />}
              variant="flat"
              onPress={handleCopyImage}
            >
              {t('common.copy', 'Copy')}
            </Button>
          </div>

          <Button
            variant="light"
            className="w-full text-industrial-400"
            onPress={() => setGeneratedImage(null)} // Reset to allow regeneration
          >
            {t('common.regenerate', 'Regenerate / Choose Different Image')}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={showStealthModal}
      onOpenChange={(open) => setShowStealthModal(open)}
      size="lg"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: 'bg-industrial-950 border border-industrial-800',
        header: 'border-b border-industrial-800',
        footer: 'border-t border-industrial-800',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {stealthDrawerMode === 'image' ? (
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary-500" />
                  <span>{t('stealth.image_mode_title', 'Stealth Image')}</span>
                </div>
              ) : (
                <Tabs
                  aria-label="Stealth Modes"
                  selectedKey={activeTab}
                  onSelectionChange={(key) => setActiveTab(key as 'text' | 'image')}
                  color="primary"
                  variant="underlined"
                  fullWidth
                >
                  <Tab
                    key="text"
                    title={
                      <div className="flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        <span>{t('stealth.tab.text', 'Hide in Text')}</span>
                      </div>
                    }
                  />
                  <Tab
                    key="image"
                    title={
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        <span>{t('stealth.tab.image', 'Hide in Image')}</span>
                      </div>
                    }
                  />
                </Tabs>
              )}
            </ModalHeader>

            <ModalBody className="py-6">
              {activeTab === 'text' ? renderTextTab() : renderImageTab()}
            </ModalBody>

            {activeTab === 'text' && (
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  color="primary"
                  onPress={() => confirmStealthSend(finalTextOutput)}
                  isDisabled={!finalTextOutput}
                >
                  {t('stealth.send', 'Send Stealth Message')}
                </Button>
              </ModalFooter>
            )}

            {/* Image tab footer is integrated into the body as per design (actions appear after generation) */}
            {activeTab === 'image' && !generatedImage && (
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t('common.cancel', 'Cancel')}
                </Button>
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
