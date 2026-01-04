/**
 * Component for requesting clipboard read permission
 * Shows clear explanation of why permission is needed and privacy guarantees
 */

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { ClipboardCheck, Lock, Shield } from 'lucide-react';
import { useState } from 'react';
import { requestClipboardPermission, useClipboardPermission } from '../hooks/useClipboardDetection';

interface ClipboardPermissionPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionGranted: () => void;
}

export function ClipboardPermissionPrompt({
  isOpen,
  onClose,
  onPermissionGranted,
}: ClipboardPermissionPromptProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const permissionStatus = useClipboardPermission();

  const handleGrantPermission = async () => {
    setIsRequesting(true);
    try {
      const granted = await requestClipboardPermission();
      if (granted) {
        onPermissionGranted();
        onClose();
      } else {
        // Permission was denied - user will see browser's denial message
        // We can show a helpful message
        console.warn('Clipboard permission denied by user');
      }
    } catch (error) {
      console.error('Failed to request clipboard permission:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      shouldCloseOnInteractOutside={(e) => false}
      classNames={{
        base: 'bg-industrial-950 border border-industrial-800',
        header: 'border-b border-industrial-800',
        body: 'py-6',
        footer: 'border-t border-industrial-800',
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                <span>Enable Clipboard Detection</span>
              </div>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-industrial-200 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Why do we need this?
                  </h3>
                  <p className="text-sm text-industrial-400">
                    To automatically detect encrypted messages from your contacts when you copy them.
                    When you return to Nahan, we check if your clipboard contains a message from someone
                    in your contact list and offer to import it automatically.
                  </p>
                </div>

                <div className="bg-industrial-900 rounded-lg p-4 border border-industrial-800">
                  <h3 className="text-sm font-semibold text-industrial-200 mb-2 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Privacy Guarantee
                  </h3>
                  <p className="text-sm text-industrial-400">
                    <strong className="text-industrial-200">This app is 100% OFFLINE.</strong> All encryption
                    and decryption happens locally on your device. No data ever leaves your device. We only
                    check the clipboard when you return to this tab, and only process messages from contacts
                    you've already added.
                  </p>
                </div>

                <div className="text-xs text-industrial-500 space-y-1">
                  <p>• Clipboard is only checked when you switch back to this tab</p>
                  <p>• Only messages from your contacts are processed</p>
                  <p>• All processing happens locally - no network requests</p>
                  <p>• You can revoke this permission anytime in your browser settings</p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Not Now
              </Button>
              <Button
                color="primary"
                onPress={handleGrantPermission}
                isLoading={isRequesting}
                startContent={!isRequesting && <ClipboardCheck className="w-4 h-4" />}
              >
                Grant Permission
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

