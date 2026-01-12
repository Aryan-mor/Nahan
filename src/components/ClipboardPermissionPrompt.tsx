/**
 * Component for requesting clipboard read permission
 * Shows clear explanation of why permission is needed and privacy guarantees
 */

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { ClipboardCheck, Lock, Shield } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { requestClipboardPermission } from '../hooks/useClipboardDetection';
import * as logger from '../utils/logger';

interface ClipboardPermissionPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionGranted: () => void;
}

  /* eslint-disable max-lines-per-function */
export function ClipboardPermissionPrompt({
  isOpen,
  onClose,
  onPermissionGranted,
}: ClipboardPermissionPromptProps) {
  const { t } = useTranslation();
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDenied, setIsDenied] = useState(false);
  // const permissionStatus = useClipboardPermission(); // Removed unused var

  const handleGrantPermission = async () => {
    setIsRequesting(true);
    setIsDenied(false);
    try {
      const granted = await requestClipboardPermission();
      if (granted) {
        onPermissionGranted();
        onClose();
      } else {
        // Permission was denied - user will see browser's denial message or has previously denied
        // Show help message
        setIsDenied(true);
        logger.warn('Clipboard permission denied by user');
      }
    } catch (error) {
      logger.error('Failed to request clipboard permission:', error);
      setIsDenied(true);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleClose = () => {
    setIsDenied(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      shouldCloseOnInteractOutside={() => false}
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
                <span>{t('clipboard.permission.title')}</span>
              </div>
            </ModalHeader>
            <ModalBody>
              {isDenied ? (
                <div className="space-y-4">
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                       <Shield className="w-4 h-4" />
                       {t('clipboard.permission.denied_title', 'Permission Denied')}
                    </h3>
                    <p className="text-sm text-yellow-200/80 mb-3">
                      {t('clipboard.permission.denied_desc', 'It looks like clipboard access was blocked. Browser security blocks access after a denial.')}
                    </p>
                    <p className="text-sm text-yellow-200 font-medium">
                      {t('clipboard.permission.how_to_enable', 'How to enable:')}
                    </p>
                    <ol className="list-decimal list-inside text-sm text-yellow-200/80 mt-1 space-y-1">
                      <li>{t('clipboard.permission.step_1', 'Click the lock or settings icon in your address bar')}</li>
                      <li>{t('clipboard.permission.step_2', 'Find "Clipboard" or "Permissions"')}</li>
                      <li>{t('clipboard.permission.step_3', 'Change setting to "Allow" or "Ask"')}</li>
                      <li>{t('clipboard.permission.step_4', 'Refresh the page')}</li>
                    </ol>
                  </div>
                </div>
              ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-industrial-200 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    {t('clipboard.permission.reason_title')}
                  </h3>
                  <p className="text-sm text-industrial-400">
                    {t('clipboard.permission.reason_desc')}
                  </p>
                </div>

                <div className="bg-industrial-900 rounded-lg p-4 border border-industrial-800">
                  <h3 className="text-sm font-semibold text-industrial-200 mb-2 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {t('clipboard.permission.privacy_title')}
                  </h3>
                  <p className="text-sm text-industrial-400">
                    <strong className="text-industrial-200">
                      {t('clipboard.permission.privacy_desc').split('. ')[0]}.
                    </strong>{' '}
                    {t('clipboard.permission.privacy_desc').split('. ').slice(1).join('. ')}
                  </p>
                </div>

                <div className="text-xs text-industrial-500 space-y-1">
                  <p>• {t('clipboard.permission.privacy_points.check')}</p>
                  <p>• {t('clipboard.permission.privacy_points.contacts')}</p>
                  <p>• {t('clipboard.permission.privacy_points.local')}</p>
                  <p>• {t('clipboard.permission.privacy_points.revoke')}</p>
                </div>
              </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={handleClose}>
                {isDenied ? t('common.close', 'Close') : t('clipboard.permission.not_now')}
              </Button>
              {!isDenied && (
              <Button
                color="primary"
                onPress={handleGrantPermission}
                isLoading={isRequesting}
                startContent={!isRequesting && <ClipboardCheck className="w-4 h-4" />}
              >
                {t('clipboard.permission.grant')}
              </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
