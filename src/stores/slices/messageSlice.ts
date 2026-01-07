/* eslint-disable max-lines-per-function */
import { StateCreator } from 'zustand';

import { CryptoService } from '../../services/crypto';
import { SecureMessage, storageService } from '../../services/storage';
import * as logger from '../../utils/logger';
import { AppState, MessageSlice } from '../types';

const cryptoService = CryptoService.getInstance();
const MAX_MESSAGES_IN_MEMORY = 50;

export const createMessageSlice: StateCreator<AppState, [], [], MessageSlice> = (set, get) => ({
  activeChat: null,
  // Normalized state structure
  messages: {
    ids: [],
    entities: {}
  },
  chatSummaries: {},
  messageInput: '',
  lastStorageUpdate: Date.now(),

  setActiveChat: async (contact) => {
    set({ activeChat: contact });
    if (contact) {
      const { sessionPassphrase } = get();
      if (!sessionPassphrase) {
        throw new Error('SecureStorage: Missing key');
      }

      const fingerprint = contact.id === 'system_broadcast' ? 'BROADCAST' : contact.fingerprint;

      // Use new paginated fetch with limit
      // We pass limit + 1 just to know if there are more, but for now let's stick to strict 50
      const messages = await storageService.getMessagesPaginated(
        fingerprint,
        sessionPassphrase,
        MAX_MESSAGES_IN_MEMORY
      );

      // Normalize
      const ids: string[] = [];
      const entities: Record<string, SecureMessage> = {};

      messages.forEach(msg => {
        ids.push(msg.id);
        entities[msg.id] = msg;
      });

      set({
        messages: { ids, entities }
      });

      if (contact.id !== 'system_broadcast') {
        await storageService.updateContactLastUsed(contact.fingerprint, sessionPassphrase);
      }
    } else {
      set({
        messages: { ids: [], entities: {} }
      });
    }
  },

  setMessageInput: (val) => set({ messageInput: val }),

  sendMessage: async (text, image, type = 'text') => {
    const { activeChat, identity, sessionPassphrase, isStealthMode } = get();

    if (!activeChat || !identity || !sessionPassphrase) {
      throw new Error('Cannot send message: Missing context');
    }

    try {
      if (isStealthMode) {
        if (image) {
          throw new Error('Images cannot be sent in stealth mode yet');
        }
        const encryptedBinary = await cryptoService.encryptMessage(
          text,
          activeChat.publicKey,
          identity.privateKey,
          sessionPassphrase,
          { binary: true }
        ) as Uint8Array;

        set({
          pendingStealthBinary: encryptedBinary,
          pendingPlaintext: text,
          showStealthModal: true
        });

        return '';
      }

      let payloadToEncrypt = text;
      const messageType = type === 'image_stego' ? 'image_stego' : (image ? 'image' : 'text');

      if (image) {
        payloadToEncrypt = JSON.stringify({
          nahan_type: messageType,
          text: text,
          image: image
        });
      }

      let encryptedContent: string;
      const isBroadcast = activeChat.id === 'system_broadcast';

      if (isBroadcast) {
        encryptedContent = await cryptoService.signMessage(
          payloadToEncrypt,
          identity.privateKey,
          sessionPassphrase
        ) as string;
      } else {
        if (!activeChat.publicKey) {
          throw new Error('Missing recipient public key');
        }
        encryptedContent = await cryptoService.encryptMessage(
          payloadToEncrypt,
          activeChat.publicKey,
          identity.privateKey,
          sessionPassphrase,
        ) as string;
      }

      const isOffline = !navigator.onLine;

      const newMessage = await storageService.storeMessage({
        senderFingerprint: identity.fingerprint,
        recipientFingerprint: isBroadcast ? 'BROADCAST' : activeChat.fingerprint,
        type: messageType,
        content: {
          plain: text,
          encrypted: encryptedContent,
          image: image,
        },
        isOutgoing: true,
        read: true,
        status: isOffline ? 'pending' : 'sent',
      }, sessionPassphrase);

      const now = Date.now();

      set((state) => {
        const currentIds = state.messages.ids;
        const currentEntities = state.messages.entities;

        // Prepend new ID
        const newIds = [newMessage.id, ...currentIds];
        const newEntities = { ...currentEntities, [newMessage.id]: newMessage };

        // Prune if > 50
        if (newIds.length > MAX_MESSAGES_IN_MEMORY) {
          const removedId = newIds.pop(); // Remove oldest (last in array)
          if (removedId) {
            delete newEntities[removedId];
            // Here we would also trigger URL.revokeObjectURL if we had reference counting
          }
        }

        return {
          messages: { ids: newIds, entities: newEntities },
          messageInput: '',
          lastStorageUpdate: now,
        };
      });

      return encryptedContent;
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  },

  deleteMessage: async (id) => {
    try {
      await storageService.deleteMessage(id);
      set((state) => {
        const newIds = state.messages.ids.filter((msgId) => msgId !== id);
        const newEntities = { ...state.messages.entities };
        delete newEntities[id];

        return {
          messages: { ids: newIds, entities: newEntities }
        };
      });
    } catch (error) {
      logger.error('Failed to delete message:', error);
      throw error;
    }
  },

  clearChatHistory: async (fingerprint) => {
    const { sessionPassphrase } = get();
    if (!sessionPassphrase) {
      throw new Error('Cannot clear history: Missing passphrase');
    }

    try {
      await storageService.deleteMessagesByFingerprint(fingerprint, sessionPassphrase);

      const { activeChat } = get();
      if (activeChat && activeChat.fingerprint === fingerprint) {
        set({
          messages: { ids: [], entities: {} }
        });
      }
    } catch (error) {
      logger.error('Failed to clear chat history:', error);
      throw error;
    }
  },

  refreshMessages: async () => {
    const { activeChat, sessionPassphrase } = get();
    if (activeChat && sessionPassphrase) {
      const fingerprint = activeChat.id === 'system_broadcast' ? 'BROADCAST' : activeChat.fingerprint;
      const messages = await storageService.getMessagesPaginated(
        fingerprint,
        sessionPassphrase,
        MAX_MESSAGES_IN_MEMORY
      );

      const ids: string[] = [];
      const entities: Record<string, SecureMessage> = {};
      messages.forEach(msg => {
        ids.push(msg.id);
        entities[msg.id] = msg;
      });

      set({
        messages: { ids, entities }
      });
    }
  },

  refreshChatSummaries: async () => {
    const { sessionPassphrase, getContactsWithBroadcast } = get();
    if (!sessionPassphrase) return;

    const allContacts = getContactsWithBroadcast();
    const fingerprints = allContacts
      .filter((c) => c.fingerprint !== 'BROADCAST')
      .map((c) => c.fingerprint);

    const summaries = await storageService.getChatSummaries(fingerprints, sessionPassphrase);
    const map: Record<string, SecureMessage | undefined> = { ...summaries };

    const broadcastContact = allContacts.find((c) => c.fingerprint === 'BROADCAST');
    if (broadcastContact) {
      const broadcastMessages = await storageService.getMessagesPaginated('BROADCAST', sessionPassphrase, 1);
      const latestBroadcast = broadcastMessages.length > 0 ? broadcastMessages[0] : undefined;
      map['BROADCAST'] = latestBroadcast;
    }

    set({ chatSummaries: map });
  },

  processPendingMessages: async () => {
    try {
      await storageService.initialize();
    } catch (error) {
      logger.error('Failed to initialize database for pending messages:', error);
      return 0;
    }

    const { sessionPassphrase } = get();
    if (!sessionPassphrase) {
      return 0;
    }

    const pending = await storageService.getPendingMessages(sessionPassphrase);
    if (pending.length === 0) return 0;

    for (const msg of pending) {
      await storageService.updateMessageStatus(msg.id, 'sent', sessionPassphrase);
    }

    // Refresh current view if active
    const { activeChat } = get();
    if (activeChat) {
         // Re-fetch using refreshMessages to maintain consistency
         const { refreshMessages } = get();
         await refreshMessages();
    }
    return pending.length;
  },

  clearAllMessages: async () => {
    await storageService.clearAllMessages();
    set({
      messages: { ids: [], entities: {} }
    });
  },
});
