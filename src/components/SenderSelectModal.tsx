/* eslint-disable max-lines-per-function */
import { Avatar, Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Contact } from '../services/storage';

interface SenderSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (fingerprint: string) => void;
  contacts: Contact[];
}

export function SenderSelectModal({ isOpen, onClose, onSelect, contacts }: SenderSelectModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filteredContacts = useMemo(() => {
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.fingerprint.toLowerCase().includes(search.toLowerCase()),
    );
  }, [contacts, search]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      shouldCloseOnInteractOutside={() => false}
      classNames={{
        base: 'bg-industrial-900 border border-industrial-800',
        header: 'border-b border-industrial-800',
        footer: 'border-t border-industrial-800',
        closeButton: 'hover:bg-industrial-800 active:bg-industrial-700',
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {t('chat.list.select_sender.title')}
              <p className="text-sm font-normal text-industrial-400">
                {t('chat.list.select_sender.desc')}
              </p>
            </ModalHeader>
            <ModalBody>
              <Input
                placeholder={t('chat.list.search_contacts_placeholder')}
                startContent={<Search className="w-4 h-4 text-industrial-400" />}
                value={search}
                onValueChange={setSearch}
                classNames={{
                  inputWrapper: 'bg-industrial-950 border-industrial-800',
                }}
                className="mb-4"
              />
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {filteredContacts.length === 0 ? (
                  <div className="text-center py-8 text-industrial-500">
                    <p>{t('chat.list.no_contacts')}</p>
                  </div>
                ) : (
                  filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-industrial-800 cursor-pointer transition-colors"
                      onClick={() => onSelect(contact.fingerprint)}
                    >
                      <Avatar
                        name={contact.name}
                        className="flex-shrink-0 bg-gradient-to-br from-industrial-700 to-industrial-800 text-industrial-200"
                      />
                      <div className="flex-1">
                        <h4 className="text-industrial-100 font-medium">{contact.name}</h4>
                        <p className="text-xs text-industrial-500 truncate">
                          {contact.fingerprint.slice(-8)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                {t('chat.list.cancel')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
