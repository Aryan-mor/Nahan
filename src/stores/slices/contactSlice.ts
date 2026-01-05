import { StateCreator } from 'zustand';

import i18n from '../../i18n';
import { storageService, Contact } from '../../services/storage';
import * as logger from '../../utils/logger';
import { AppState, ContactSlice } from '../types';

export const createContactSlice: StateCreator<AppState, [], [], ContactSlice> = (set, get) => ({
  contacts: [],

  addContact: (contact) => {
    set((state) => ({
      contacts: [...state.contacts, contact],
    }));
  },

  removeContact: async (fingerprint) => {
    try {
      const { sessionPassphrase } = get();
      if (!sessionPassphrase) {
        throw new Error('SecureStorage: Missing key');
      }

      // Find contact to get its ID
      const contact = get().contacts.find((c) => c.fingerprint === fingerprint);
      if (contact) {
        await storageService.deleteContactById(contact.id);
        set((state) => ({
          contacts: state.contacts.filter((c) => c.fingerprint !== fingerprint),
        }));
      }
    } catch (error) {
      logger.error('Failed to remove contact:', error);
    }
  },

  getContactsWithBroadcast: () => {
    const { contacts } = get();
    const broadcastContact: Contact = {
      id: 'system_broadcast',
      name: i18n.t('broadcast_channel'),
      fingerprint: 'BROADCAST',
      publicKey: '',
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    return [broadcastContact, ...contacts];
  },
});
