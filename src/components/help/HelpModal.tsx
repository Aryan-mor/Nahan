/* eslint-disable max-lines-per-function */
import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
} from '@heroui/react';
import { BookOpen, Map, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHelpStore } from '../../store/useHelpStore';

export const HelpModal = () => {
  const { isHelpModalOpen, closeHelpModal, setHasSeenOnboarding } = useHelpStore();
  const { t } = useTranslation();

  const handleRestartTour = () => {
    closeHelpModal();
    setHasSeenOnboarding(false);
    // The TourGuide component will pick up the change in state and auto-start
  };

  return (
    <Modal
      isOpen={isHelpModalOpen}
      onClose={closeHelpModal}
      size="2xl"
      className="bg-industrial-900 border border-industrial-800 text-industrial-100"
      backdrop="blur"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 border-b border-industrial-800">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-industrial-400" />
                <span>{t('help.title', 'Nahan Field Guide')}</span>
              </div>
            </ModalHeader>
            <ModalBody className="py-6 space-y-6">
              <section className="space-y-3">
                <h3 className="text-xl font-bold text-industrial-50 flex items-center gap-2">
                  <Map className="w-5 h-5 text-amber-500" />
                  {t('help.concept.title', 'The Sealed Letter Metaphor')}
                </h3>
                <div className="bg-industrial-950/50 p-4 rounded-lg border border-industrial-800 text-industrial-300 space-y-2">
                  <p>
                    {t(
                      'help.concept.desc1',
                      'Think of Nahan not as a chat app, but as a digital envelope.',
                    )}
                  </p>
                  <p>
                    {t(
                      'help.concept.desc2',
                      'When you write a message, you are sealing it in an envelope that only the recipient can open. We do not have a postman. You are the courier.',
                    )}
                  </p>
                  <p>
                    {t(
                      'help.concept.desc3',
                      'You must physically transport this sealed envelope (the encrypted text) to your recipient using any existing channel: Email, SMS, WhatsApp, or even a printed QR code.',
                    )}
                  </p>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-industrial-800/30 border border-industrial-700/50 hover:bg-industrial-800/50 transition-colors">
                  <h4 className="font-semibold text-industrial-200 mb-2">
                    1. {t('help.step1.title', 'Share Identity')}
                  </h4>
                  <p className="text-sm text-industrial-400">
                    {t('help.step1.desc', 'Exchange keys physically or via trusted channels to establish a secure link.')}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-industrial-800/30 border border-industrial-700/50 hover:bg-industrial-800/50 transition-colors">
                  <h4 className="font-semibold text-industrial-200 mb-2">
                    2. {t('help.step2.title', 'The Loop')}
                  </h4>
                  <p className="text-sm text-industrial-400">
                    {t('help.step2.desc', 'Encrypt, Copy, Send via External App. Receive, Copy, Decrypt in Nahan.')}
                  </p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="border-t border-industrial-800">
              <Button
                variant="light"
                onPress={onClose}
                startContent={<X className="w-4 h-4" />}
                className="text-industrial-400 hover:text-industrial-200"
              >
                {t('common.close', 'Close')}
              </Button>
              <Button
                color="primary"
                variant="flat"
                onPress={handleRestartTour}
                startContent={<RefreshCw className="w-4 h-4" />}
                className="bg-industrial-700 text-industrial-100 hover:bg-industrial-600"
              >
                {t('help.restart_tour', 'Restart Interactive Tour')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
