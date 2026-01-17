
import {
    useDisclosure
} from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Contact } from '../services/storage';
import { useAppStore } from '../stores/appStore';

/**
 * Hook to manage common contact actions: Rename, Share, Delete History, Delete Contact.
 * Returns handlers to trigger these actions and a Component to render the necessary modals.
 */
// eslint-disable-next-line max-lines-per-function
export function useContactActions() {
    const { t } = useTranslation();
    const updateContact = useAppStore(state => state.updateContact);
    const removeContact = useAppStore(state => state.removeContact);
    const clearChatHistory = useAppStore(state => state.clearChatHistory);
    const setActiveChat = useAppStore(state => state.setActiveChat);

    const [targetContact, setTargetContact] = useState<Contact | null>(null);
    const [newName, setNewName] = useState('');

    // Selection Mode context (optional, if actions are triggered from bulk selection)
    const [selectedFingerprints, setSelectedFingerprints] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    const renameModal = useDisclosure();
    const deleteHistoryModal = useDisclosure();
    const deleteContactModal = useDisclosure();
    const qrModal = useDisclosure();

    const openRename = (contact: Contact) => {
        setTargetContact(contact);
        setNewName(contact.name);
        renameModal.onOpen();
    };

    const openShare = (contact: Contact) => {
        setTargetContact(contact);
        qrModal.onOpen();
    };

    const openDeleteHistory = (contact: Contact | null, selection: Set<string> = new Set()) => {
        if (selection.size > 0) {
            setIsSelectionMode(true);
            setSelectedFingerprints(selection);
            setTargetContact(null);
        } else if (contact) {
            setIsSelectionMode(false);
            setTargetContact(contact);
        }
        deleteHistoryModal.onOpen();
    };

    const openDeleteContact = (contact: Contact | null, selection: Set<string> = new Set()) => {
        if (selection.size > 0) {
            setIsSelectionMode(true);
            setSelectedFingerprints(selection);
            setTargetContact(null);
        } else if (contact) {
            setIsSelectionMode(false);
            setTargetContact(contact);
        }
        deleteContactModal.onOpen();
    };

    const handleRename = async () => {
        if (targetContact && newName.trim()) {
            await updateContact({ ...targetContact, name: newName.trim() });
            toast.success(t('chat.list.renamed'));

            // If the renamed contact is the active chat, update the active chat state to reflect the new name immediately
            // (though activeChat selector might handle this if it selects by ID, but often it's a copy)
            // Ideally setActiveChat should be called if ID matches?
            // The store relies on fingerprint usually.
            // Let's safe update if needed.
            // Actually, best to let the UI react to store changes.

            renameModal.onClose();
        }
    };

    const handleConfirmDeleteHistory = async () => {
        const targets = isSelectionMode ? Array.from(selectedFingerprints) : (targetContact ? [targetContact.fingerprint] : []);

        for (const fingerprint of targets) {
            await clearChatHistory(fingerprint);
        }

        toast.success(t('chat.list.history_cleared'));
        deleteHistoryModal.onClose();
        // Return success callback if needed?
    };

    const handleConfirmDeleteContact = async () => {
        const targets = isSelectionMode ? Array.from(selectedFingerprints) : (targetContact ? [targetContact.fingerprint] : []);

        for (const fingerprint of targets) {
            // Requirement: "reun delete history and also we will remove contact from db"
            await clearChatHistory(fingerprint);
            await removeContact(fingerprint);

            // If active chat is being deleted, deselect it
            const currentActive = useAppStore.getState().activeChat;
            if (currentActive && currentActive.fingerprint === fingerprint) {
                setActiveChat(null);
            }
        }

        toast.success(t('chat.list.contact_deleted'));
        deleteContactModal.onClose();
    };

    return {
        openRename,
        openShare,
        openDeleteHistory,
        openDeleteContact,
        // Expose state and modal handlers to allow parent component to render modals directly
        modals: {
            rename: {
                isOpen: renameModal.isOpen,
                onOpenChange: renameModal.onOpenChange,
                newName,
                setNewName,
                handleRename,
            },
            deleteHistory: {
                isOpen: deleteHistoryModal.isOpen,
                onOpenChange: deleteHistoryModal.onOpenChange,
                isSelectionMode,
                handleConfirmDeleteHistory,
            },
            deleteContact: {
                isOpen: deleteContactModal.isOpen,
                onOpenChange: deleteContactModal.onOpenChange,
                isSelectionMode,
                handleConfirmDeleteContact,
            },
            qr: {
                isOpen: qrModal.isOpen,
                onOpenChange: qrModal.onOpenChange,
                contact: targetContact,
            },
        },
    };
}

