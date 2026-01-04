/*
 * Re-trigger HMR by adding this comment.
 * The store interface and implementation have been updated to use initializeApp.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CamouflageService } from '../services/camouflage';
import { CryptoService } from '../services/crypto';
import { secureStorage, setPassphrase } from '../services/secureStorage';
import { Contact, Identity, SecureMessage, storageService } from '../services/storage';
import { useUIStore } from './uiStore';

const cryptoService = CryptoService.getInstance();
const camouflageService = CamouflageService.getInstance();

interface AppState {
  // Global
  error: string | null;

  // Identity (SENSITIVE - must be encrypted)
  identity: Identity | null;
  isLoading: boolean;

  // Contacts (SENSITIVE - must be encrypted)
  contacts: Contact[];

  // Security (in-memory only - never persisted)
  sessionPassphrase: string | null; // In-memory only

  // Chat (runtime state - never persisted)
  activeChat: Contact | null;
  messages: SecureMessage[];
  messageInput: string; // Global chat input state

  // Stealth Mode State
  isStealthMode: boolean;
  showStealthModal: boolean;
  pendingStealthBinary: Uint8Array | null;
  pendingPlaintext: string | null;

  // Actions
  setStealthMode: (enabled: boolean) => void;
  setShowStealthModal: (show: boolean) => void;
  setPendingStealthBinary: (binary: Uint8Array | null) => void;
  setPendingPlaintext: (text: string | null) => void;
  confirmStealthSend: (finalOutput: string) => Promise<void>;
  sendAutoStealthMessage: (text: string) => Promise<string>;
  setMessageInput: (val: string) => void;
  initializeApp: () => Promise<void>;
  addIdentity: (identity: Identity) => void;
  addContact: (contact: Contact) => void;
  removeContact: (fingerprint: string) => Promise<void>;
  wipeData: () => Promise<void>;

  // New Actions
  unlockApp: (pin: string) => Promise<boolean>;
  lockApp: () => void;
  setActiveChat: (contact: Contact | null) => Promise<void>;
  sendMessage: (text: string) => Promise<string>;
  deleteMessage: (id: string) => Promise<void>;
  clearChatHistory: (fingerprint: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  processPendingMessages: () => Promise<number>;
  processIncomingMessage: (encryptedText: string, targetContactFingerprint?: string, skipNavigation?: boolean) => Promise<void>;
  setSessionPassphrase: (passphrase: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial State matching AppState interface
      error: null,
      identity: null,
      isLoading: true,
      contacts: [],
      sessionPassphrase: null,
      activeChat: null,
      messages: [],
      messageInput: '', // Global chat input state

      // Stealth Mode Initial State
      isStealthMode: false,
      showStealthModal: false,
      pendingStealthBinary: null,
      pendingPlaintext: null,

      initializeApp: async () => {
        set({ isLoading: true });
        try {
          // Boot Cleanup: Permanently delete old unencrypted data
          localStorage.removeItem('nahan-storage');

          // Initialize DB
          await storageService.initialize();

          // Update UI state (non-sensitive) - can be done without passphrase
          // Check if app is running in standalone mode
          const isStandaloneMode =
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone ||
            document.referrer.includes('android-app://');

          // Update UI store (non-sensitive, doesn't require passphrase)
          useUIStore.getState().setStandalone(!!isStandaloneMode);

          // Check if identity exists (without requiring passphrase for boot detection)
          const identityExists = await storageService.hasIdentity();
          const passphrase = get().sessionPassphrase;

          if (!passphrase) {
            // No passphrase - can't decrypt data, but we can detect if identity exists
            if (identityExists) {
              // Identity exists but not unlocked - we need to decrypt the vault entry to get
              // the identity structure (including encrypted privateKey) for PIN verification.
              // But we can't decrypt the vault entry without a passphrase.
              //
              // Solution: We'll decrypt the vault entry in unlockApp with the PIN attempt.
              // For boot detection, we set a placeholder to prevent Onboarding from showing.
              // The unlockApp will decrypt with the PIN attempt to get the identity structure.

              // Set placeholder - unlockApp will decrypt vault entry with PIN attempt
              set({ identity: { id: 'placeholder' } as Identity, contacts: [] });
              // Lock the app to force PIN entry
              useUIStore.getState().setLocked(true);
            } else {
              // No identity exists - allow Onboarding to show
              set({ identity: null, contacts: [] });
            }
            set({ isLoading: false });
            return;
          }

          // Passphrase available - decrypt and load real data
          const [identities, contacts] = await Promise.all([
            storageService.getIdentities(passphrase),
            storageService.getContacts(passphrase),
          ]);

          // ALWAYS update state with loaded identity/contacts for UI rendering
          // The UI needs the identity to be set so it can show the LockScreen
          // SecureStorage middleware will block any unencrypted writes to disk
          // Load the first identity found (single-identity architecture)
          const identity = identities.length > 0 ? identities[0] : null;
          set({ identity, contacts });

          // Security Check: If we have an identity (not onboarding) but no session passphrase
          // (e.g. after page reload), we MUST lock the app to force password re-entry.
          if (identity) {
            const { sessionPassphrase } = get();
            const { isLocked } = useUIStore.getState();
            if (!isLocked && !sessionPassphrase) {
              useUIStore.getState().setLocked(true);
            }
          }
        } catch (error) {
          console.error('Failed to load data:', error);
          set({ error: 'Failed to initialize application' });
        } finally {
          set({ isLoading: false });
        }
      },

      setStealthMode: (enabled) => set({ isStealthMode: enabled }),
      setShowStealthModal: (show) => set({ showStealthModal: show }),
      setPendingStealthBinary: (binary) => set({ pendingStealthBinary: binary }),
      setPendingPlaintext: (text) => set({ pendingPlaintext: text }),

      setMessageInput: (val) => set({ messageInput: val }),

      confirmStealthSend: async (finalOutput) => {
        const { activeChat, identity, pendingPlaintext } = get();
        if (!activeChat || !identity || !pendingPlaintext) {
          console.error("Missing context for stealth send");
          return;
        }

        // TRACE D [Store Final]
        console.log("TRACE D [Store Final]:", {
          content: finalOutput.substring(0, 30),
          length: finalOutput.length
        });

        // Verify final output contains no PGP markers
        if (finalOutput.includes('BEGIN') || finalOutput.includes('PGP') || finalOutput.includes('-----')) {
          console.error('ERROR: PGP markers detected in final output! This should not happen.');
          throw new Error('Invalid stealth output: PGP markers detected');
        }

        const isOffline = !navigator.onLine;

        try {
          const { sessionPassphrase } = get();
          if (!sessionPassphrase) {
            throw new Error('SecureStorage: Missing key');
          }

          const newMessage = await storageService.storeMessage({
            senderFingerprint: identity.fingerprint,
            recipientFingerprint: activeChat.fingerprint,
            content: {
              plain: pendingPlaintext,
              encrypted: finalOutput,
            },
            isOutgoing: true,
            read: true,
            status: isOffline ? 'pending' : 'sent',
          }, sessionPassphrase);

          set((state) => ({
            messages: [newMessage, ...state.messages], // Prepend to maintain descending order (newest first)
            showStealthModal: false,
            pendingStealthBinary: null,
            pendingPlaintext: null,
            messageInput: '', // Clear input after successful stealth send
          }));
        } catch (error) {
          console.error('Failed to confirm stealth send:', error);
        }
      },

      addIdentity: async (identity) => {
        set({ identity });
        const { sessionPassphrase } = get();
        if (sessionPassphrase) {
          await storageService.updateIdentityLastUsed(identity.fingerprint, sessionPassphrase);
        }
      },

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
          console.error('Failed to remove contact:', error);
        }
      },


      wipeData: async () => {
        await storageService.clearAllData();
        // Reset UI state (non-sensitive)
        useUIStore.getState().setLocked(false);
        useUIStore.getState().resetFailedAttempts();
        // Reset sensitive state
        set({
          identity: null,
          contacts: [],
          sessionPassphrase: null,
          activeChat: null,
          messages: [],
        });
        // Reload to ensure clean slate
        window.location.reload();
      },

      unlockApp: async (pin: string) => {
        // Check if identity exists (even if placeholder)
        const identityExists = await storageService.hasIdentity();
        if (!identityExists) return false;

        try {
          // Step 1: Decrypt the vault entry with PIN attempt to get identity structure
          // This decrypts the vault entry and returns the identity object
          // The identity.privateKey is already encrypted with the user's PIN
          const identityWithEncryptedPrivateKey = await storageService.getIdentity(pin);
          if (!identityWithEncryptedPrivateKey) {
            return false;
          }

          // Step 2: Verify PIN via cryptoService using the encrypted privateKey from identity
          // The privateKey in the identity is already encrypted with the user's PIN
          const isValid = await cryptoService.verifyPrivateKeyPassphrase(
            identityWithEncryptedPrivateKey.privateKey,
            pin,
          );

          if (!isValid) {
            return false;
          }

          // Step 3: Set passphrase FIRST to enable encryption layer
          setPassphrase(pin);

          // Step 4: Re-fetch the decrypted identity and contacts (now that PIN is verified)
          // The identity we got above is already decrypted (we decrypted the vault entry with PIN)
          // But we re-fetch to ensure consistency and load contacts
          const decryptedIdentity = await storageService.getIdentity(pin);
          const decryptedContacts = await storageService.getContacts(pin);

          if (!decryptedIdentity) {
            return false;
          }

          // Step 5: Replace placeholder with real decrypted identity and load contacts
          set({
            sessionPassphrase: pin,
            identity: decryptedIdentity,
            contacts: decryptedContacts,
          });

          // Step 6: Update UI lock state in uiStore
          useUIStore.getState().setLocked(false);
          useUIStore.getState().resetFailedAttempts();

          return true;
        } catch (error) {
          console.error('Unlock failed:', error);
          return false;
        }
      },

      lockApp: () => {
        // Update UI state (non-sensitive)
        useUIStore.getState().setLocked(true);
        // Clear sensitive in-memory state
        set({ sessionPassphrase: null, activeChat: null, messages: [] });
      },

      setActiveChat: async (contact) => {
        set({ activeChat: contact });
        if (contact) {
          const { sessionPassphrase } = get();
          if (!sessionPassphrase) {
            throw new Error('SecureStorage: Missing key');
          }
          // Load messages
          const messages = await storageService.getMessagesByFingerprint(contact.fingerprint, sessionPassphrase);
          set({ messages });
          await storageService.updateContactLastUsed(contact.fingerprint, sessionPassphrase);
        } else {
          set({ messages: [] });
        }
      },

      /**
       * Auto-Stealth: Automatically encrypt and embed message with random cover text
       * This function performs stealth encoding in the background without opening the modal
       * @param text Plaintext message to send
       * @returns Stealth-encoded string (ready to copy/share)
       */
      sendAutoStealthMessage: async (text: string): Promise<string> => {
        const { activeChat, identity, sessionPassphrase } = get();
        const { camouflageLanguage } = useUIStore.getState();

        if (!activeChat || !identity || !sessionPassphrase) {
          throw new Error('Cannot send message: Missing context');
        }

        try {
          // Step 1: Encrypt message to binary (raw Uint8Array, no headers)
          const encryptedBinary = await cryptoService.encryptMessage(
            text,
            activeChat.publicKey,
            identity.privateKey,
            sessionPassphrase,
            { binary: true }
          ) as Uint8Array;

          // Step 2: Generate random cover text that meets safety requirements
          // Use getRecommendedCover which ensures Green Zone (80%+ safety)
          const coverText = camouflageService.getRecommendedCover(
            encryptedBinary.length,
            camouflageLanguage || 'fa'
          );

          // Step 3: Verify safety ratio meets Green Zone requirement (80%+)
          // This is critical to prevent data leakage with insufficient cover text
          const safetyScore = camouflageService.calculateStealthRatio(encryptedBinary.length, coverText);
          let finalCover = coverText;
          let finalScore = safetyScore;

          if (safetyScore < 80) {
            // If safety is below 80%, expand cover text until it meets requirement
            // This ensures auto-stealth always uses safe cover text
            let expandedCover = coverText;
            let attempts = 0;
            let currentScore = safetyScore;

            while (currentScore < 80 && attempts < 5) {
              // Expand cover text by getting another recommendation
              const additionalCover = camouflageService.getRecommendedCover(
                encryptedBinary.length,
                camouflageLanguage || 'fa'
              );
              expandedCover = expandedCover + ' ' + additionalCover;
              currentScore = camouflageService.calculateStealthRatio(encryptedBinary.length, expandedCover);
              if (currentScore >= 80) {
                finalCover = expandedCover;
                finalScore = currentScore;
                break;
              }
              attempts++;
            }
            // Use expanded cover text if it's longer
            if (expandedCover.length > coverText.length) {
              finalCover = expandedCover;
              finalScore = currentScore;
            }
          }

          // Safety check: Prevent sending if safety ratio is still too low
          // This prevents data leakage with insufficient cover text
          if (finalScore < 60) {
            throw new Error(
              `Safety ratio too low (${finalScore}%). Cannot send message with insufficient cover text. Please use Long Press to manually adjust cover text.`
            );
          }

          // Step 4: Embed binary into cover text
          const finalOutput = camouflageService.embed(encryptedBinary, finalCover, camouflageLanguage || 'fa');

          // Step 5: Store message in database
          const isOffline = !navigator.onLine;
          const newMessage = await storageService.storeMessage({
            senderFingerprint: identity.fingerprint,
            recipientFingerprint: activeChat.fingerprint,
            content: {
              plain: text,
              encrypted: finalOutput,
            },
            isOutgoing: true,
            read: true,
            status: isOffline ? 'pending' : 'sent',
          }, sessionPassphrase);

          // Update state
          set((state) => ({
            messages: [newMessage, ...state.messages], // Prepend to maintain descending order (newest first)
            messageInput: '', // Clear input after successful auto-stealth send
          }));

          return finalOutput;
        } catch (error) {
          console.error('Failed to send auto-stealth message:', error);
          throw error;
        }
      },

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

          // Update state
          set((state) => ({
            messages: [newMessage, ...state.messages], // Prepend to maintain descending order (newest first)
            messageInput: '', // Clear input after successful standard send
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
          console.error('Failed to clear chat history:', error);
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

      processPendingMessages: async () => {
        // Ensure database is initialized before accessing it
        try {
          await storageService.initialize();
        } catch (error) {
          console.error('Failed to initialize database for pending messages:', error);
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

      processIncomingMessage: async (encryptedText, targetContactFingerprint, skipNavigation = false) => {
        const { identity, sessionPassphrase, contacts } = get();

        if (!identity || !sessionPassphrase) {
          throw new Error('Authentication required');
        }

        // Check if message already exists (deduplication)
        const exists = await storageService.messageExists(encryptedText, sessionPassphrase);
        if (exists) {
          // Message is a duplicate - silently return without processing
          // This prevents duplicate entries and redundant notifications
          const duplicateError = new Error('DUPLICATE_MESSAGE');
          duplicateError.name = 'DuplicateMessageError';
          throw duplicateError;
        }

        try {
          // Attempt to decrypt using all known contact keys for verification
          const contactKeys = contacts.map((c) => c.publicKey);

          const result = await cryptoService.decryptMessage(
            encryptedText,
            identity.privateKey,
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
          const newMessage = await storageService.storeMessage({
            senderFingerprint: sender.fingerprint,
            recipientFingerprint: identity.fingerprint,
            content: {
              plain: result.data,
              encrypted: encryptedText,
            },
            isOutgoing: false,
            read: false, // Mark as unread initially
            isVerified: isVerified,
            status: 'sent',
          }, sessionPassphrase);

          // Only navigate if skipNavigation is false (default behavior for backward compatibility)
          if (!skipNavigation) {
            // Navigate to the chat
            set({ activeChat: sender });

            // Refresh messages if we are now in that chat
            const messages = await storageService.getMessagesByFingerprint(sender.fingerprint, sessionPassphrase);
            set({ messages });
          } else {
            // If skipNavigation is true (auto-import), update state if this is the active chat
            const { activeChat } = get();
            if (activeChat && activeChat.fingerprint === sender.fingerprint) {
              // Prepend new message to maintain descending order (newest first)
              set((state) => ({
                messages: [newMessage, ...state.messages],
              }));
            }
          }
        } catch (error) {
          console.error('Failed to process incoming message:', error);
          throw error;
        }
      },

      setSessionPassphrase: (passphrase) => set({ sessionPassphrase: passphrase }),
    }),
    {
      name: 'nahan-secure-data',
      version: 1,
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        // ONLY persist these two sensitive fields (must be encrypted)
        identity: state.identity,
        contacts: state.contacts,
        // sessionPassphrase is NEVER persisted (in-memory only)
        // activeChat, messages are NOT persisted
        // Messages are stored in IndexedDB only (via storageService)
        // UI state (language, PWA, isLocked, failedAttempts) is in separate unencrypted store
      }),
    },
  ),
);
