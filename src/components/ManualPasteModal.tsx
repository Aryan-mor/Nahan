/* eslint-disable max-lines-per-function */
import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Textarea,
} from '@heroui/react';
import { AlertCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as logger from '../utils/logger';

interface ManualPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
  title?: string;
}

export function ManualPasteModal({
  isOpen,
  onClose,
  onSubmit,
  title,
}: ManualPasteModalProps) {
  const { t } = useTranslation();
  // HMR Trigger
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    setError(null);

    // Validation
    if (text.length < 10) {
      setError(t('manual_paste.error.too_short'));
      return;
    }
    if (text.length > 5000) {
      setError(t('manual_paste.error.too_long'));
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit(text);
      setText(''); // Clear on success
      onClose();
    } catch (err) {
      logger.error('Manual paste submission error:', err);
      setError(t('manual_paste.error.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setText('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleClose}
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      classNames={{
        base: 'bg-industrial-900 border border-industrial-800',
        header: 'border-b border-industrial-800',
        footer: 'border-t border-industrial-800',
        closeButton: 'hover:bg-industrial-800 active:bg-industrial-700',
      }}
      size="2xl"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {title || t('manual_paste.title_import', 'Import from Text')}
              <p className="text-sm font-normal text-industrial-400">
                {t('manual_paste.desc')}
              </p>
            </ModalHeader>
            <ModalBody className="py-4">
              <Textarea
                ref={textareaRef}
                value={text}
                onValueChange={setText}
                placeholder={t('manual_paste.placeholder')}
                minRows={6}
                maxRows={12}
                variant="bordered"
                classNames={{
                  input: 'text-sm font-mono',
                  inputWrapper:
                    'bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:border-primary',
                }}
                data-testid="manual-import-textarea"
              />

              <div className="flex justify-between items-center mt-1">
                {error ? (
                  <div className="flex items-center gap-2 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </div>
                ) : (
                  <div /> // Spacer
                )}
                <div
                  className={`text-xs font-mono ${
                    text.length > 5000 || text.length < 10 ? 'text-red-500' : 'text-industrial-500'
                  }`}
                >
                  {text.length}/5000
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                color="primary"
                onPress={handleSubmit}
                isLoading={isLoading}
                className="font-medium w-full"
                data-testid="manual-import-decode-btn"
              >
                {t('manual_paste.import_decode', 'Import & Decode')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
