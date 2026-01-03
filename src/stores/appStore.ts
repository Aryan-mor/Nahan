/*
 * Re-trigger HMR by adding this comment.
 * The store interface and implementation have been updated to use initializeApp.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cryptoService } from '../services/crypto';
import { Contact, Identity, SecureMessage, storageService } from '../services/storage';

interface AppState {
  // Global
  error: string | null;
  language: string | null;

  // Identities
  identities: Identity[];
  currentIdentity: Identity | null;
  isLoading: boolean;

  // Contacts
  contacts: Contact[];

  // Security
  isLocked: boolean;
  failedAttempts: number;
  sessionPassphrase: string | null; // In-memory only

  // Chat
  activeChat: Contact | null;
  messages: SecureMessage[];

  // Navigation
  activeTab: 'chats' | 'keys' | 'settings';
  setActiveTab: (tab: 'chats' | 'keys' | 'settings') => void;

  // Actions
  setLanguage: (lang: string) => void;
  initializeApp: () => Promise<void>;
  setCurrentIdentity: (identity: Identity) => void;
  addIdentity: (identity: Identity) => void;
  addContact: (contact: Contact) => void;
  removeContact: (fingerprint: string) => Promise<void>;
  setLocked: (locked: boolean) => void;
  incrementFailedAttempts: () => void;
  resetFailedAttempts: () => void;
  wipeData: () => Promise<void>;

  // New Actions
  unlockApp: (pin: string) => Promise<boolean>;
  lockApp: () => void;
  setActiveChat: (contact: Contact | null) => Promise<void>;
  sendMessage: (text: string) => Promise<string>;
  deleteMessage: (id: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  processPendingMessages: () => Promise<number>;
  processIncomingMessage: (encryptedText: string, targetContactFingerprint?: string) => Promise<void>;
  setSessionPassphrase: (passphrase: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial State matching AppState interface
      error: null,
      language: null,
      activeTab: 'chats',
      identities: [],
      currentIdentity: null,
      isLoading: true,
      contacts: [],
      isLocked: false,
      failedAttempts: 0,
      sessionPassphrase: null,
      activeChat: null,
      messages: [],

      initializeApp: async () => {
        set({ isLoading: true });
        try {
          // Initialize DB
          await storageService.initialize();

          const [identities, contacts] = await Promise.all([
            storageService.getIdentities(),
            storageService.getContacts(),
          ]);

          set({ identities, contacts });

          // If we have a current identity, ensure it's up to date
          const current = get().currentIdentity;
          if (current) {
            const updated = identities.find((i) => i.id === current.id);
            if (updated) {
              set({ currentIdentity: updated });
            } else if (identities.length > 0) {
              set({ currentIdentity: identities[0] });
            } else {
              set({ currentIdentity: null });
            }
          } else if (identities.length > 0) {
            set({ currentIdentity: identities[0] });
          }

          // Security Check: If we have identities (not onboarding) but no session passphrase
          // (e.g. after page reload), we MUST lock the app to force password re-entry.
          // This ensures sessionPassphrase is re-populated for PGP operations.
          if (identities.length > 0) {
            const { sessionPassphrase, isLocked } = get();
            if (!isLocked && !sessionPassphrase) {
              console.warn('Session passphrase missing on init. Locking app.');
              set({ isLocked: true });
            }
          }
        } catch (error) {
          console.error('Failed to load data:', error);
          set({ error: 'Failed to initialize application' });
        } finally {
          set({ isLoading: false });
        }
      },

      setLanguage: (lang) => set({ language: lang }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      setCurrentIdentity: (identity) => {
        set({ currentIdentity: identity });
        storageService.updateIdentityLastUsed(identity.fingerprint);
      },

      addIdentity: (identity) => {
        set((state) => ({
          identities: [...state.identities, identity],
          currentIdentity: identity,
        }));
      },

      addContact: (contact) => {
        set((state) => ({
          contacts: [...state.contacts, contact],
        }));
      },

      removeContact: async (fingerprint) => {
        try {
          await storageService.deleteContact(fingerprint);
          set((state) => ({
            contacts: state.contacts.filter((c) => c.fingerprint !== fingerprint),
          }));
        } catch (error) {
          console.error('Failed to remove contact:', error);
        }
      },

      setLocked: (locked) => {
        set({ isLocked: locked });
        if (locked) {
          set({ sessionPassphrase: null });
        }
      },

      incrementFailedAttempts: () => {
        set((state) => ({ failedAttempts: state.failedAttempts + 1 }));
      },

      resetFailedAttempts: () => {
        set({ failedAttempts: 0 });
      },

      wipeData: async () => {
        await storageService.clearAllData();
        set({
          identities: [],
          currentIdentity: null,
          contacts: [],
          isLocked: false, // Or true? Usually wipe resets to fresh state.
          failedAttempts: 0,
          sessionPassphrase: null,
          activeChat: null,
          messages: [],
        });
        // Reload to ensure clean slate
        window.location.reload();
      },

      unlockApp: async (pin: string) => {
        const { currentIdentity } = get();
        if (!currentIdentity) return false;

        try {
          const isValid = await cryptoService.verifyPrivateKeyPassphrase(
            currentIdentity.privateKey,
            pin,
          );
          if (isValid) {
            set({
              isLocked: false,
              sessionPassphrase: pin,
              failedAttempts: 0,
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Unlock failed:', error);
          return false;
        }
      },

      lockApp: () => {
        set({ isLocked: true, sessionPassphrase: null, activeChat: null, messages: [] });
      },

      setActiveChat: async (contact) => {
        set({ activeChat: contact });
        if (contact) {
          // Load messages
          const messages = await storageService.getMessagesByFingerprint(contact.fingerprint);
          set({ messages });
          storageService.updateContactLastUsed(contact.fingerprint);
        } else {
          set({ messages: [] });
        }
      },

      sendMessage: async (text) => {
        const { activeChat, currentIdentity, sessionPassphrase } = get();
        if (!activeChat || !currentIdentity || !sessionPassphrase) {
          throw new Error('Cannot send message: Missing context');
        }

        try {
          // Encrypt message
          const encryptedContent = await cryptoService.encryptMessage(
            text,
            activeChat.publicKey,
            currentIdentity.privateKey,
            sessionPassphrase,
          );

          const isOffline = !navigator.onLine;

          // Store message
          const newMessage = await storageService.storeMessage({
            senderFingerprint: currentIdentity.fingerprint,
            recipientFingerprint: activeChat.fingerprint,
            content: {
              plain: text,
              encrypted: encryptedContent,
            },
            isOutgoing: true,
            read: true,
            status: isOffline ? 'pending' : 'sent',
          });

          // Update state
          set((state) => ({
            messages: [...state.messages, newMessage],
          }));

          return encryptedContent;
        } catch (error) {
          console.error('Failed to send message:', error);
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
          console.error('Failed to delete message:', error);
          throw error;
        }
      },

      refreshMessages: async () => {
        const { activeChat } = get();
        if (activeChat) {
          const messages = await storageService.getMessagesByFingerprint(activeChat.fingerprint);
          set({ messages });
        }
      },

      processPendingMessages: async () => {
        const pending = await storageService.getPendingMessages();
        if (pending.length === 0) return 0;
        
        for (const msg of pending) {
          await storageService.updateMessageStatus(msg.id, 'sent');
        }

        const { activeChat } = get();
        if (activeChat) {
             const messages = await storageService.getMessagesByFingerprint(activeChat.fingerprint);
             set({ messages });
        }
        return pending.length;
      },

      processIncomingMessage: async (encryptedText, targetContactFingerprint) => {
        const { currentIdentity, sessionPassphrase, contacts } = get();

        if (!currentIdentity || !sessionPassphrase) {
          throw new Error('Authentication required');
        }

        try {
          // Attempt to decrypt using all known contact keys for verification
          const contactKeys = contacts.map((c) => c.publicKey);

          const result = await cryptoService.decryptMessage(
            encryptedText,
            currentIdentity.privateKey,
            sessionPassphrase,
            contactKeys,
          );

          let senderFingerprint = result.senderFingerprint;
          let isVerified = result.verified;

          // If verification failed (sender unknown or unsigned)
          if (!senderFingerprint) {
            // 1. Check if explicit target was provided
            if (targetContactFingerprint) {
              senderFingerprint = targetContactFingerprint;
              isVerified = false;
            } 
            // 2. Check active chat fallback
            else {
              const { activeChat } = get();
              if (activeChat) {
                console.warn('Sender verification failed. Defaulting to active chat contact.');
                senderFingerprint = activeChat.fingerprint;
                isVerified = false; // Mark as unverified
              }
            }
            
            // 3. If still no sender, throw specific error for UI handling
            if (!senderFingerprint) {
              throw new Error('SENDER_UNKNOWN');
            }
          }

          // Find the contact
          const sender = contacts.find((c) => c.fingerprint === senderFingerprint);
          if (!sender) {
            throw new Error('Sender not found in contacts');
          }

          // Store the message
          await storageService.storeMessage({
            senderFingerprint: sender.fingerprint,
            recipientFingerprint: currentIdentity.fingerprint,
            content: {
              plain: result.data,
              encrypted: encryptedText,
            },
            isOutgoing: false,
            read: false, // Mark as unread initially
            isVerified: isVerified,
            status: 'sent',
          });

          // Navigate to the chat
          set({ activeChat: sender });

          // Refresh messages if we are now in that chat
          const messages = await storageService.getMessagesByFingerprint(sender.fingerprint);
          set({ messages });
        } catch (error) {
          console.error('Failed to process incoming message:', error);
          throw error;
        }
      },

      setSessionPassphrase: (passphrase) => set({ sessionPassphrase: passphrase }),
    }),
    {
      name: 'nahan-storage',
      partialize: (state) => ({
        // Only persist these fields
        identities: state.identities,
        currentIdentity: state.currentIdentity,
        contacts: state.contacts,
        isLocked: state.isLocked,
        failedAttempts: state.failedAttempts,
        language: state.language,
        // sessionPassphrase, activeChat, messages are NOT persisted
      }),
    },
  ),
);
