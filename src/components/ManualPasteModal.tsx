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
  title = "Couldn't access clipboard",
}: ManualPasteModalProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    setError(null);

    // Validation
    if (text.length < 10) {
      setError('Content must be at least 10 characters long.');
      return;
    }
    if (text.length > 5000) {
      setError('Content cannot exceed 5000 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit(text);
      setText(''); // Clear on success
      onClose();
    } catch (err) {
      console.error('Manual paste submission error:', err);
      setError('Failed to process content. Please try again.');
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
      classNames={{
        base: 'bg-industrial-900 border border-industrial-800',
        header: 'border-b border-industrial-800',
        footer: 'border-t border-industrial-800',
        closeButton: 'hover:bg-industrial-800 active:bg-industrial-700',
      }}
      size="2xl"
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            transition: {
              duration: 0.3,
              ease: 'easeOut',
            },
          },
          exit: {
            y: -20,
            opacity: 0,
            transition: {
              duration: 0.2,
              ease: 'easeIn',
            },
          },
        },
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {title}
              <p className="text-sm font-normal text-industrial-400">
                Please manually enter or paste your content below.
              </p>
            </ModalHeader>
            <ModalBody className="py-4">
              <Textarea
                ref={textareaRef}
                value={text}
                onValueChange={setText}
                placeholder="Paste or type your content here..."
                minRows={6}
                maxRows={12}
                variant="bordered"
                classNames={{
                  input: 'text-sm font-mono',
                  inputWrapper:
                    'bg-industrial-950 border-industrial-700 hover:border-industrial-600 focus-within:border-primary',
                }}
                autoFocus
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
                variant="light"
                onPress={handleClose}
                isDisabled={isLoading}
                className="text-industrial-400 hover:text-industrial-200"
              >
                Cancel
              </Button>
              <Button
                color="primary"
                onPress={handleSubmit}
                isLoading={isLoading}
                className="font-medium"
              >
                Submit Content
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
