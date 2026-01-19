
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
    const [targetContacts, setTargetContacts] = useState<Contact[]>([]);
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

    const openShare = (contactOrContacts: Contact | Contact[]) => {
        if (Array.isArray(contactOrContacts)) {
            setTargetContacts(contactOrContacts);
            setTargetContact(null);
        } else {
            setTargetContact(contactOrContacts);
            setTargetContacts([]);
        }
        // If sharing multiple contacts, wait for prompt confirmation inside the QR modal logic
        // But the prompt needs to happen BEFORE showing the QR modal with the final list.
        // So we might need an intermediate state or a separate "Confirm Share Identity" modal.
        // Or we can handle this inside MyQRModal?
        // The user request implies a prompt "Do you want include your identity also?".
        // If we handle it here, we need another modal.
        // Let's add a `shareConfirmModal` state.
        
        if (Array.isArray(contactOrContacts) && contactOrContacts.length > 0) {
             shareConfirmModal.onOpen();
        } else {
             qrModal.onOpen();
        }
    };

    const shareConfirmModal = useDisclosure();
    
    const handleConfirmShare = (includeIdentity: boolean) => {
        if (includeIdentity) {
            const { identity } = useAppStore.getState();
            if (identity) {
                 // Convert identity to Contact-like structure to append
                 // However, identity has privateKey. We need to be careful.
                 // MyQRModal expects Contact[] or Identity.
                 // Let's construct a temporary Contact object for "Me"
                 const meAsContact: Contact = {
                     id: 'me',
                     name: identity.name,
                     publicKey: identity.publicKey,
                     fingerprint: identity.fingerprint,
                     createdAt: new Date(),
                     lastUsed: new Date()
                 };
                 setTargetContacts(prev => [...prev, meAsContact]);
            }
        }
        shareConfirmModal.onClose();
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
            shareConfirm: {
                isOpen: shareConfirmModal.isOpen,
                onOpenChange: shareConfirmModal.onOpenChange,
                handleConfirm: handleConfirmShare,
            },
            qr: {
                isOpen: qrModal.isOpen,
                onOpenChange: qrModal.onOpenChange,
                contact: targetContact,
                contacts: targetContacts,
            },
        },
    };
}

