/* eslint-disable max-lines-per-function */
import { StateCreator } from 'zustand';

import { CryptoService } from '../../services/crypto';
import { storageService, SecureMessage } from '../../services/storage';
import * as logger from '../../utils/logger';
import { AppState, MessageSlice } from '../types';

const cryptoService = CryptoService.getInstance();

export const createMessageSlice: StateCreator<AppState, [], [], MessageSlice> = (set, get) => ({
  activeChat: null,
  messages: [],
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

      // Handle broadcast contact
      if (contact.id === 'system_broadcast') {
        // Fetch messages using fixed fingerprint 'BROADCAST'
        const messages = await storageService.getMessagesByFingerprint('BROADCAST', sessionPassphrase);
        set({ messages });
      } else {
        // Load messages for regular contact
        const messages = await storageService.getMessagesByFingerprint(contact.fingerprint, sessionPassphrase);
        set({ messages });
        await storageService.updateContactLastUsed(contact.fingerprint, sessionPassphrase);
      }
    } else {
      set({ messages: [] });
    }
  },

  setMessageInput: (val) => set({ messageInput: val }),

  sendMessage: async (text) => {
    const { activeChat, identity, sessionPassphrase, isStealthMode } = get();

    if (!activeChat || !identity || !sessionPassphrase) {
      throw new Error('Cannot send message: Missing context');
    }

    try {
      if (isStealthMode) {
        // Stealth mode: Encrypt to binary and open modal for user customization
        const encryptedBinary = await cryptoService.encryptMessage(
          text,
          activeChat.publicKey,
          identity.privateKey,
          sessionPassphrase,
          { binary: true }
        ) as Uint8Array;

        // Store pending state and trigger modal
        set({
          pendingStealthBinary: encryptedBinary,
          pendingPlaintext: text,
          showStealthModal: true
        });

        return '';
      }

      // Standard mode: Encrypt message (with headers)
      const encryptedContent = await cryptoService.encryptMessage(
        text,
        activeChat.publicKey,
        identity.privateKey,
        sessionPassphrase,
      ) as string;

      const isOffline = !navigator.onLine;

      // CRITICAL: Ensure private messages are stored with contact's fingerprint, not BROADCAST
      // Double-check that we're not in broadcast mode
      if (activeChat.id === 'system_broadcast') {
        throw new Error('Cannot send standard encrypted message to broadcast channel');
      }

      // Store message
      const newMessage = await storageService.storeMessage({
        senderFingerprint: identity.fingerprint,
        recipientFingerprint: activeChat.fingerprint,
        content: {
          plain: text,
          encrypted: encryptedContent,
        },
        isOutgoing: true,
        read: true,
        status: isOffline ? 'pending' : 'sent',
      }, sessionPassphrase);

      // Update lastStorageUpdate to trigger UI reactivity
      const now = Date.now();
      set((state) => ({
        messages: [newMessage, ...state.messages], // Prepend to maintain descending order (newest first)
        messageInput: '', // Clear input after successful standard send
        lastStorageUpdate: now,
      }));

      return encryptedContent;
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  },

  deleteMessage: async (id) => {
    try {
      await storageService.deleteMessage(id);
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== id),
      }));
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
      // Delete all messages for this contact from storage
      await storageService.deleteMessagesByFingerprint(fingerprint, sessionPassphrase);

      // Clear messages from state if this is the active chat
      const { activeChat } = get();
      if (activeChat && activeChat.fingerprint === fingerprint) {
        set({ messages: [] });
      }
    } catch (error) {
      logger.error('Failed to clear chat history:', error);
      throw error;
    }
  },

  refreshMessages: async () => {
    const { activeChat, sessionPassphrase } = get();
    if (activeChat && sessionPassphrase) {
      const messages = await storageService.getMessagesByFingerprint(activeChat.fingerprint, sessionPassphrase);
      set({ messages });
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
      const broadcastMessages = await storageService.getMessagesByFingerprint(
        'BROADCAST',
        sessionPassphrase,
      );
      const latestBroadcast = broadcastMessages.length > 0 ? broadcastMessages[0] : undefined;
      map['BROADCAST'] = latestBroadcast;
    }

    set({ chatSummaries: map });
  },

  processPendingMessages: async () => {
    // Ensure database is initialized before accessing it
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

    const { activeChat } = get();
    if (activeChat) {
         const messages = await storageService.getMessagesByFingerprint(activeChat.fingerprint, sessionPassphrase);
         set({ messages });
    }
    return pending.length;
  },

  clearAllMessages: async () => {
    await storageService.clearAllMessages();
    set({ messages: [] });
  },
});
