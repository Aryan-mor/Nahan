/* eslint-disable max-lines-per-function */
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { BookOpen, Map, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHelpStore } from '../../store/useHelpStore';

export const HelpModal = () => {
  const { isHelpModalOpen, closeHelpModal, startHelpTopic } = useHelpStore();
  const { t } = useTranslation();



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
            </ModalBody>
            <ModalFooter className="flex-col gap-3 border-t border-industrial-800 bg-industrial-950/30">
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant="flat"
                    onPress={() => startHelpTopic('identity')}
                    className="bg-industrial-800 text-industrial-200"
                  >
                    1. {t('help.topic.identity', 'Identity & Keys')}
                  </Button>
                  <Button
                    variant="flat"
                    onPress={() => startHelpTopic('contacts')}
                    className="bg-industrial-800 text-industrial-200"
                  >
                    2. {t('help.topic.contacts', 'How to Add Contacts')}
                  </Button>
                  <Button
                    variant="flat"
                    onPress={() => startHelpTopic('messaging')}
                    className="bg-industrial-800 text-industrial-200"
                  >
                    3. {t('help.topic.messaging', 'Sending & Receiving')}
                  </Button>
                  <Button
                    variant="flat"
                    onPress={() => startHelpTopic('onboarding')}
                    startContent={<RefreshCw className="w-4 h-4" />}
                    className="bg-industrial-700 text-industrial-100"
                  >
                    {t('help.restart_tour', 'Restart Full Tour')}
                  </Button>
              </div>
              <Button
                fullWidth
                variant="light"
                onPress={onClose}
                className="text-industrial-400 hover:text-industrial-200"
              >
                {t('common.close', 'Close Guide')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
