/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Slider,
  Switch,
  Textarea,
} from '@heroui/react';
import { AlertTriangle, Copy, RefreshCw, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { camouflageService } from '../services/camouflage';
import { useUIStore } from '../stores/uiStore';
import * as logger from '../utils/logger';

interface StealthModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  pendingBinary: Uint8Array | null;
  onConfirm: (finalOutput: string) => void;
}

export function StealthModal({
  isOpen,
  onOpenChange,
  pendingBinary,
  onConfirm,
}: StealthModalProps) {
  const { t } = useTranslation();
  const { camouflageLanguage } = useUIStore();
  const [coverText, setCoverText] = useState('');
  const [isCustomText, setIsCustomText] = useState(false);
  const [stealthScore, setStealthScore] = useState(0);
  const [finalOutput, setFinalOutput] = useState('');

  // Initial Auto-Suggestion when binary payload changes
  useEffect(() => {
    if (!pendingBinary) return;

    const suggestion = camouflageService.getRecommendedCover(
      pendingBinary.length,
      camouflageLanguage || 'fa',
    );
    setCoverText(suggestion);
    setIsCustomText(false);
  }, [pendingBinary, camouflageLanguage]);

  // Update stealth score and final output when cover text or payload changes
  // This effect runs on every coverText change, including paste, delete, etc.
  useEffect(() => {
    if (!pendingBinary) {
      setStealthScore(0);
      setFinalOutput('');
      return;
    }

    if (!coverText) {
      setStealthScore(0);
      setFinalOutput('');
      return;
    }

    // Recalculate score and output on every text change
    const payloadSize = pendingBinary.length;
    const score = camouflageService.calculateStealthRatio(payloadSize, coverText);
    setStealthScore(score);

    // Debug logging for large payloads
    if (payloadSize > 1024) {
      logger.debug("📊 Large Payload Stealth Analysis:", {
        payloadSize,
        coverTextLength: coverText.length,
        safetyScore: score,
        isBlocked: score < 30
      });
    }

    try {
      const output = camouflageService.embed(pendingBinary, coverText);
      setFinalOutput(output);

      // Check Telegram message limit (4096 chars, use 4000 as safe threshold)
      if (output.length > 4000) {
        logger.warn("⚠️ Payload too large for Telegram:", {
          finalLength: output.length,
          payloadSize: payloadSize,
          coverTextLength: coverText.length
        });
      }
    } catch (error) {
      logger.error('Embedding failed:', error);
      setFinalOutput('');
    }
  }, [coverText, pendingBinary]);

  const handleConfirm = async () => {
    // Dynamic threshold: 30% for large payloads (>1KB), 61% for small payloads
    const payloadSize = pendingBinary?.length || 0;
    const threshold = payloadSize > 1024 ? 30 : 61;

    // Warning only - do not block
    if (stealthScore < threshold) {
      toast.warning(t('stealth_modal.toast.low_ratio', { score: stealthScore, threshold }));
    }

    // Show warning for Telegram splitting risk but don't block
    if (finalOutput.length > 4000) {
      toast.warning(t('stealth_modal.toast.telegram_risk', { length: finalOutput.length }), {
        duration: 5000
      });
    }

    // TRACE C [Final ZWC Output]
    logger.debug("TRACE C [Final ZWC Output]:", {
      text: finalOutput.substring(0, 50),
      hasHeaders: finalOutput.includes("BEGIN")
    });

    try {
      await navigator.clipboard.writeText(finalOutput);
      toast.success(t('stealth_modal.toast.success'));
    } catch {
      logger.warn('Failed to copy to clipboard');
      // Non-blocking error
    }

    onConfirm(finalOutput);
    onOpenChange(); // Close modal
  };

  const handleRegenerateSuggestion = () => {
    if (!pendingBinary) return;
    const suggestion = camouflageService.getRecommendedCover(
      pendingBinary.length,
      camouflageLanguage || 'fa',
    );
    setCoverText(suggestion);
    setIsCustomText(false);
  };

  // Determine Safety Level
  const getSafetyColor = (score: number) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'danger';
  };

  const getSafetyLabel = (score: number) => {
    if (score >= 80) return t('stealth_modal.safety_levels.safe');
    if (score >= 60) return t('stealth_modal.safety_levels.moderate');
    return t('stealth_modal.safety_levels.risky');
  };

  // Dynamic threshold: 30% for large payloads (>1KB), 61% for small payloads
  const payloadSize = pendingBinary?.length || 0;
  const threshold = payloadSize > 1024 ? 30 : 61;

  // Check Telegram message limit (4096 chars, use 4000 as warning threshold)
  // Show warning but don't block confirmation
  const exceedsTelegramLimit = finalOutput.length > 4000;
  const isSafeToCopy = stealthScore >= threshold;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="2xl"
      placement="center"
      scrollBehavior="inside"
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      shouldCloseOnInteractOutside={() => false}
      classNames={{
        base: 'bg-industrial-900 border border-industrial-800 max-h-[90vh]',
        header: 'border-b border-industrial-800 flex-shrink-0',
        body: 'overflow-y-auto flex-1',
        footer: 'border-t border-industrial-800 flex-shrink-0',
        wrapper: 'p-4',
      }}
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            transition: {
              duration: 0.2,
              ease: 'easeOut',
            },
          },
          exit: {
            y: -20,
            opacity: 0,
            transition: {
              duration: 0.15,
              ease: 'easeIn',
            },
          },
        },
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-green-500 shrink-0" />
                <span className="text-industrial-100">{t('stealth_modal.title')}</span>
              </div>
              <p className="text-sm font-normal text-industrial-400">
                {t('stealth_modal.subtitle')}
              </p>
            </ModalHeader>
            <ModalBody className="py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-y-auto">
              {/* Safety Meter - Using Slider */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-industrial-300">{t('stealth_modal.safety')}</span>
                  <span className={`font-medium text-${getSafetyColor(stealthScore)}-500`}>
                    {getSafetyLabel(stealthScore)} ({stealthScore}%)
                  </span>
                </div>
                <Slider
                  value={stealthScore}
                  minValue={0}
                  maxValue={100}
                  step={1}
                  color={getSafetyColor(stealthScore)}
                  isDisabled
                  className="w-full"
                  classNames={{
                    track: 'h-3',
                    filler: 'h-3',
                    thumb: 'hidden',
                  }}
                  aria-label={t('stealth_modal.safety')}
                />
                <p className="text-xs text-industrial-400">
                  {(() => {
                    const payloadSize = pendingBinary?.length || 0;
                    const threshold = payloadSize > 1024 ? 30 : 61;

                    if (exceedsTelegramLimit) {
                      return t('stealth_modal.status.telegram_risk', { length: finalOutput.length });
                    }

                    return stealthScore < threshold
                      ? t('stealth_modal.status.too_short', { size: payloadSize, threshold })
                      : stealthScore >= 80
                        ? t('stealth_modal.status.excellent')
                        : t('stealth_modal.status.good');
                  })()}
                </p>
              </div>

              {/* Cover Text Input */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <label className="text-sm font-medium text-industrial-300">{t('stealth_modal.cover_text')}</label>
                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <Button
                      size="sm"
                      variant="light"
                      onPress={handleRegenerateSuggestion}
                      startContent={<RefreshCw className="w-3 h-3" />}
                      className="flex-1 sm:flex-none"
                    >
                      <span className="hidden sm:inline">{t('stealth_modal.reset_suggestion')}</span>
                      <span className="sm:hidden">{t('stealth_modal.reset')}</span>
                    </Button>
                    <div className="flex items-center space-x-2 bg-industrial-950 rounded-lg p-1 border border-industrial-800">
                      <span
                        className={`text-xs px-2 cursor-pointer ${
                          !isCustomText ? 'text-green-400 font-medium' : 'text-industrial-500'
                        }`}
                        onClick={() => setIsCustomText(false)}
                      >
                        {t('stealth_modal.mode.auto')}
                      </span>
                      <Switch
                        size="sm"
                        isSelected={isCustomText}
                        onValueChange={setIsCustomText}
                        color="warning"
                      />
                      <span
                        className={`text-xs px-2 cursor-pointer ${
                          isCustomText ? 'text-yellow-400 font-medium' : 'text-industrial-500'
                        }`}
                        onClick={() => setIsCustomText(true)}
                      >
                        {t('stealth_modal.mode.custom')}
                      </span>
                    </div>
                  </div>
                </div>

                <Textarea
                  value={coverText}
                  onValueChange={(val) => {
                    setCoverText(val);
                    setIsCustomText(true);
                  }}
                  onInput={(e) => {
                    // Force recalculation on any input event (paste, delete, etc.)
                    const newValue = (e.target as HTMLTextAreaElement).value;
                    setCoverText(newValue);
                    setIsCustomText(true);
                  }}
                  minRows={3}
                  placeholder={t('stealth_modal.placeholder')}
                  classNames={{
                    input: 'font-sans text-base text-industrial-100 bg-industrial-950',
                    inputWrapper: `bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:!border-${getSafetyColor(
                      stealthScore,
                    )}-500`,
                  }}
                />
              </div>

              {/* Info Box */}
              <div className="bg-industrial-950/50 p-4 rounded-lg border border-industrial-800">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-industrial-300 space-y-1">
                    <p className="font-medium text-industrial-100">{t('stealth_modal.how_it_works.title')}</p>
                    <p>
                      {t('stealth_modal.how_it_works.desc')}
                    </p>
                    <p className="text-xs text-industrial-500 mt-2">
                      {t('stealth_modal.how_it_works.payload_size', { size: pendingBinary?.length || 0 })}
                    </p>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="flex-col sm:flex-row gap-2">
              <Button
                color="danger"
                variant="light"
                onPress={onClose}
                className="w-full sm:w-auto"
              >
                {t('stealth_modal.buttons.cancel')}
              </Button>
              <Button
                color={isSafeToCopy ? 'success' : 'danger'}
                variant={isSafeToCopy ? 'solid' : 'flat'}
                onPress={handleConfirm}
                isDisabled={false}
                className="w-full sm:w-auto"
                startContent={
                  isSafeToCopy ? (
                    <Copy className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )
                }
              >
                {exceedsTelegramLimit
                  ? t('stealth_modal.buttons.too_large')
                  : isSafeToCopy
                    ? t('stealth_modal.buttons.confirm_copy')
                    : t('stealth_modal.buttons.confirm_low_safety')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
