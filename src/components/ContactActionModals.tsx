
import {
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
} from '@heroui/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Contact } from '../services/storage';
import { MyQRModal } from './MyQRModal';

interface ContactActionModalsProps {
    modals: {
        rename: {
            isOpen: boolean;
            onOpenChange: (isOpen: boolean) => void;
            newName: string;
            setNewName: (name: string) => void;
            handleRename: () => void;
        };
        deleteHistory: {
            isOpen: boolean;
            onOpenChange: (isOpen: boolean) => void;
            isSelectionMode: boolean;
            handleConfirmDeleteHistory: () => void;
        };
        deleteContact: {
            isOpen: boolean;
            onOpenChange: (isOpen: boolean) => void;
            isSelectionMode: boolean;
            handleConfirmDeleteContact: () => void;
        };
    shareConfirm: {
        isOpen: boolean;
        onOpenChange: (isOpen: boolean) => void;
        handleConfirm: (includeIdentity: boolean) => void;
    };
    qr: {
        isOpen: boolean;
            onOpenChange: (isOpen: boolean) => void;
            contact: Contact | null;
            contacts: Contact[];
        };
    };
}

/**
 * Component to render the modals for contact actions (rename, delete, share).
 * Defined externally to prevent re-creation on every render of the hook consumer.
 */
// eslint-disable-next-line max-lines-per-function
export const ContactActionModals: React.FC<ContactActionModalsProps> = ({ modals }) => {
    const { t } = useTranslation();

    return (
        <>
            {/* RENAME MODAL */}
            <Modal
                isOpen={modals.rename.isOpen}
                onOpenChange={modals.rename.onOpenChange}
                classNames={{ base: 'bg-industrial-900 border-industrial-800' }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader data-testid="rename-modal-header">{t('common.rename', 'Rename Contact')}</ModalHeader>
                            <ModalBody>
                                <Input
                                    value={modals.rename.newName}
                                    onValueChange={modals.rename.setNewName}
                                    placeholder={t('chat.list.enter_new_name', 'Enter new name')}
                                    classNames={{ inputWrapper: 'bg-industrial-950 border-industrial-800' }}
                                    data-testid="rename-input"
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose}>{t('common.cancel')}</Button>
                                <Button color="primary" onPress={modals.rename.handleRename} data-testid="rename-save-button">
                                    {t('common.save')}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* DELETE HISTORY CONFIRMATION */}
            <Modal
                isOpen={modals.deleteHistory.isOpen}
                onOpenChange={modals.deleteHistory.onOpenChange}
                classNames={{ base: 'bg-industrial-900 border-industrial-800' }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="text-danger-400">
                                {t('chat.list.delete_history', 'Delete History')}
                            </ModalHeader>
                            <ModalBody>
                                <p className="text-industrial-300">
                                    {modals.deleteHistory.isSelectionMode
                                        ? t(
                                              'chat.list.confirm_bulk_history',
                                              'Are you sure you want to delete history for selected contacts?',
                                          )
                                        : t(
                                              'chat.list.confirm_history',
                                              'Are you sure you want to delete message history for this contact?',
                                          )}
                                </p>
                                <p className="text-xs text-industrial-500">
                                    {t(
                                        'chat.list.delete_history_note',
                                        'Start fresh. Contact will remain in your list.',
                                    )}
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose}>
                                    {t('common.cancel')}
                                </Button>
                                <Button color="danger" onPress={modals.deleteHistory.handleConfirmDeleteHistory} data-testid="confirm-delete-history">
                                    {t('common.delete')}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* DELETE CONTACT CONFIRMATION */}
            <Modal
                isOpen={modals.deleteContact.isOpen}
                onOpenChange={modals.deleteContact.onOpenChange}
                classNames={{ base: 'bg-industrial-900 border-industrial-800' }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="text-danger-500">
                                {t('chat.list.delete_contact', 'Delete Contact')}
                            </ModalHeader>
                            <ModalBody>
                                <p className="text-industrial-300">
                                    {modals.deleteContact.isSelectionMode
                                        ? t(
                                              'chat.list.confirm_bulk_contact',
                                              'Are you sure you want to delete selected contacts?',
                                          )
                                        : t(
                                              'chat.list.confirm_contact',
                                              'Are you sure you want to delete this contact?',
                                          )}
                                </p>
                                <p className="text-xs text-danger-300/80">
                                    {t(
                                        'chat.list.delete_contact_warning',
                                        'This will also delete the chat history permanently this action cannot be undone.',
                                    )}
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose}>
                                    {t('common.cancel')}
                                </Button>
                                <Button color="danger" onPress={modals.deleteContact.handleConfirmDeleteContact} data-testid="confirm-delete-contact">
                                    {t('common.delete')}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* SHARE CONFIRM MODAL */}
            <Modal
                isOpen={modals.shareConfirm.isOpen}
                onOpenChange={modals.shareConfirm.onOpenChange}
                classNames={{ base: 'bg-industrial-900 border-industrial-800' }}
            >
                <ModalContent>
                    {() => (
                        <>
                            <ModalHeader className="text-industrial-100">
                                {t('chat.list.share_contacts_title', 'Share Contacts')}
                            </ModalHeader>
                            <ModalBody>
                                <p className="text-industrial-300">
                                    {t(
                                        'chat.list.share_include_identity',
                                        'Would you like to include your own identity in this shared list? This allows the recipient to add you back immediately.',
                                    )}
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    variant="flat"
                                    onPress={() => modals.shareConfirm.handleConfirm(false)}
                                    data-testid="share-confirm-no"
                                >
                                    {t('common.no', 'No, just contacts')}
                                </Button>
                                <Button
                                    color="primary"
                                    onPress={() => modals.shareConfirm.handleConfirm(true)}
                                    data-testid="share-confirm-yes"
                                >
                                    {t('common.yes', 'Yes, include me')}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* SHARE QR MODAL */}
            <MyQRModal
                isOpen={modals.qr.isOpen}
                onOpenChange={modals.qr.onOpenChange}
                contact={modals.qr.contact}
                contacts={modals.qr.contacts}
            />
        </>
    );
};
