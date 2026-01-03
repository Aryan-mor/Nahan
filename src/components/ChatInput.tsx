import { Button, Textarea, Tooltip } from '@heroui/react';
import { ClipboardPaste, Lock, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../stores/appStore';
import { ManualPasteModal } from './ManualPasteModal';

export function ChatInput() {
  const { sendMessage, processIncomingMessage } = useAppStore();
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!text.trim()) return;

    setIsSending(true);
    try {
      const encryptedContent = await sendMessage(text);
      
      // Auto-copy encrypted content to clipboard
      try {
        await navigator.clipboard.writeText(encryptedContent);
        toast.success('Message sent & copied to clipboard');
      } catch (clipboardError) {
        console.warn('Failed to auto-copy to clipboard:', clipboardError);
        toast.success('Message sent'); // Still success, just clipboard failed
      }

      setText('');
      // Reset height
      if (textareaRef.current) {
        // Simple hack to reset height logic if controlled component doesn't do it automatically
      }
    } catch (error) {
      toast.error('Failed to send message');
      console.error(error);
    } finally {
      setIsSending(false);
      // Keep focus
      textareaRef.current?.focus();
    }
  };

  const processPasteContent = async (content: string) => {
    // Check if it looks like a PGP message
    if (content.includes('-----BEGIN PGP MESSAGE-----')) {
      setIsProcessing(true);
      try {
        await processIncomingMessage(content);
        toast.success('Message decrypted and imported');
        setText(''); // Clear input if it was partial
      } catch (err) {
        toast.error('Failed to decrypt message');
        console.error(err);
        throw err; // Re-throw for modal handling
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Regular text paste
      setText((prev) => prev + content);
      toast.info('Text pasted');
      textareaRef.current?.focus();
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) {
        throw new Error('Clipboard empty');
      }
      await processPasteContent(clipboardText);
    } catch (error) {
      console.warn('Clipboard access failed, opening manual input:', error);
      setIsManualPasteOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 bg-industrial-950 border-t border-industrial-800 backdrop-blur-md bg-opacity-90 sticky bottom-0 z-20 pb-safe">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={text}
            onValueChange={setText}
            placeholder="Type a secure message..."
            minRows={1}
            maxRows={4}
            variant="flat"
            onKeyDown={handleKeyDown}
            classNames={{
              input: 'text-sm sm:text-base',
              inputWrapper:
                'bg-industrial-900 shadow-inner border-industrial-800 focus-within:bg-industrial-800',
            }}
            endContent={
              <div className="absolute right-2 bottom-2 text-xs text-industrial-500 font-mono">
                {text.length}/2000
              </div>
            }
          />
        </div>
        {text.trim() ? (
          <Button
            isIconOnly
            color="primary"
            variant="shadow"
            className="rounded-full w-8 h-8 min-w-8 mb-1"
            onPress={handleSend}
            isLoading={isSending}
          >
            <Send className="w-4 h-4" />
          </Button>
        ) : (
          <Tooltip content="Paste from Clipboard">
            <Button
              isIconOnly
              variant="flat"
              className="rounded-full w-8 h-8 min-w-8 mb-1 bg-industrial-800 text-industrial-300"
              onPress={handlePaste}
              isLoading={isProcessing}
            >
              <ClipboardPaste className="w-4 h-4" />
            </Button>
          </Tooltip>
        )}
      </div>
      <div className="text-center mt-1">
        <span className="text-[10px] text-industrial-600 flex items-center justify-center gap-1">
          <Lock className="w-3 h-3" />
          End-to-End Encrypted via PGP
        </span>
      </div>

      <ManualPasteModal
        isOpen={isManualPasteOpen}
        onClose={() => setIsManualPasteOpen(false)}
        onSubmit={processPasteContent}
      />
    </div>
  );
}
