/*
 * Re-trigger HMR by adding this comment.
 * The store interface and implementation have been updated to use initializeApp.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CamouflageService } from '../services/camouflage';
import { CryptoService } from '../services/crypto';
import { clearKeyCache, secureStorage, setPassphrase } from '../services/secureStorage';
import { parseStealthID } from '../services/stealthId';
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
  lastStorageUpdate: number; // Timestamp of last IndexedDB write - triggers UI reactivity

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
  processIncomingMessage: (encryptedText: string, targetContactFingerprint?: string, skipNavigation?: boolean) => Promise<{ type: 'message' | 'contact'; fingerprint: string; isBroadcast: boolean; senderName: string } | null>;
  handleUniversalInput: (input: string, targetContactFingerprint?: string, skipNavigation?: boolean) => Promise<{ type: 'message' | 'contact'; fingerprint: string; isBroadcast: boolean; senderName: string } | null>;
  setSessionPassphrase: (passphrase: string) => void;
  getContactsWithBroadcast: () => Contact[];
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
      lastStorageUpdate: Date.now(), // Initialize to current time for reactivity

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

        // ADD FINAL VERIFICATION LOGS
        console.log("[FINAL-CHECK] Manual Confirm - Final String Length:", finalOutput.length);

        const isOffline = !navigator.onLine;

        try {
          const { sessionPassphrase } = get();
          if (!sessionPassphrase) {
            throw new Error('SecureStorage: Missing key');
          }

          // CRITICAL: Strict broadcast vs private message isolation
          // Broadcast messages MUST use 'BROADCAST' as recipientFingerprint
          // Private messages MUST use the contact's fingerprint
          if (activeChat.id === 'system_broadcast') {
            // Broadcast mode: store message with recipientFingerprint: 'BROADCAST'
            await storageService.storeMessage({
              senderFingerprint: identity.fingerprint,
              recipientFingerprint: 'BROADCAST',
              content: {
                plain: pendingPlaintext,
                encrypted: finalOutput,
              },
              isOutgoing: true,
              read: true,
              status: isOffline ? 'pending' : 'sent',
              isBroadcast: true,
            }, sessionPassphrase);

            // Update lastStorageUpdate to trigger UI reactivity
            const now = Date.now();
            // Update messages for broadcast channel
            const messages = await storageService.getMessagesByFingerprint('BROADCAST', sessionPassphrase);
            set({ messages, lastStorageUpdate: now });
          } else {
            // Standard mode: store message for single recipient (NOT broadcast)
            const newMessage = await storageService.storeMessage({
              senderFingerprint: identity.fingerprint,
              recipientFingerprint: activeChat.fingerprint, // Use contact's fingerprint, not BROADCAST
              content: {
                plain: pendingPlaintext,
                encrypted: finalOutput,
              },
              isOutgoing: true,
              read: true,
              status: isOffline ? 'pending' : 'sent',
              isBroadcast: false, // Explicitly mark as not broadcast
            }, sessionPassphrase);

            // Update lastStorageUpdate to trigger UI reactivity
            const now = Date.now();
            set((state) => ({
              messages: [newMessage, ...state.messages], // Prepend to maintain descending order (newest first)
              lastStorageUpdate: now,
            }));
          }

          set({
            showStealthModal: false,
            pendingStealthBinary: null,
            pendingPlaintext: null,
            messageInput: '', // Clear input after successful stealth send
          });
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
          // CRITICAL: Clear any stale key cache at the very beginning
          // This ensures fresh key derivation for the unlock attempt
          setPassphrase(null);
          clearKeyCache();
          console.log('[AUTH] Cache Cleared');

          // Step 1: Decrypt the vault entry with PIN attempt to get identity structure
          // This decrypts the vault entry and returns the identity object
          // The identity.privateKey is already encrypted with the user's PIN
          // Use fresh PIN (no cached keys) for decryption
          const identityWithEncryptedPrivateKey = await storageService.getIdentity(pin);
          if (!identityWithEncryptedPrivateKey) {
            // Decryption failed - likely wrong PIN
            console.warn('[unlockApp] Failed to decrypt identity - wrong PIN or corrupted data');
            return false;
          }

          // Step 2: Verify PIN via cryptoService using the encrypted privateKey from identity
          // The privateKey in the identity is already encrypted with the user's PIN
          const isValid = await cryptoService.verifyPrivateKeyPassphrase(
            identityWithEncryptedPrivateKey.privateKey,
            pin,
          );

          if (!isValid) {
            // PIN verification failed - wrong PIN
            console.warn('[unlockApp] PIN verification failed - wrong PIN');
            return false;
          }

          // Step 3: Set passphrase FIRST to enable encryption layer
          // This clears the key cache to ensure fresh keys are used
          setPassphrase(pin);

          // Step 4: Re-fetch the decrypted identity and contacts (now that PIN is verified)
          // The identity we got above is already decrypted (we decrypted the vault entry with PIN)
          // But we re-fetch to ensure consistency and load contacts
          const decryptedIdentity = await storageService.getIdentity(pin);
          const decryptedContacts = await storageService.getContacts(pin);

          if (!decryptedIdentity) {
            console.error('[unlockApp] Failed to re-fetch identity after PIN verification');
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
          // Log the full error for debugging
          console.error('[unlockApp] Unlock failed:', error);

          // Check if it's a decryption error (wrong PIN or corrupted data)
          if (error instanceof Error) {
            if (error.message.includes('Decryption failed')) {
              console.error('[unlockApp] Decryption error - wrong PIN or corrupted vault data');
            } else if (error.message.includes('invalid passphrase')) {
              console.error('[unlockApp] Invalid passphrase - wrong PIN');
            } else {
              console.error('[unlockApp] Unexpected error during unlock:', error.message);
            }
          }

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

      /**
       * Auto-Stealth: Unified entry point for sending messages (both regular and broadcast)
       * - Regular messages: Encrypts message and embeds into cover text
       * - Broadcast messages: Signs message and embeds into cover text
       * This function performs stealth encoding in the background without opening the modal
       * Both flows return stealth-encoded Persian text (ZWC), not Base64
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
          let binaryPayload: Uint8Array;
          let isBroadcast = false;

          // Check if we're in broadcast mode
          if (activeChat.id === 'system_broadcast') {
            // Broadcast mode: sign message instead of encrypting
            binaryPayload = await cryptoService.signMessage(
              text,
              identity.privateKey,
              sessionPassphrase,
              { binary: true }
            ) as Uint8Array;
            isBroadcast = true;
          } else {
            // Regular mode: encrypt message to binary (raw Uint8Array, no headers)
            binaryPayload = await cryptoService.encryptMessage(
              text,
              activeChat.publicKey,
              identity.privateKey,
              sessionPassphrase,
              { binary: true }
            ) as Uint8Array;
          }

          // Step 2: Generate random cover text
          // Use getRecommendedCover (recommendation only, no enforcement)
          const coverText = camouflageService.getRecommendedCover(
            binaryPayload.length,
            camouflageLanguage || 'fa'
          );

          // Step 3: Calculate safety ratio for logging
          const safetyScore = camouflageService.calculateStealthRatio(binaryPayload.length, coverText);
          const finalCover = coverText;
          const finalScore = safetyScore;

          // TRACE LOGS
          console.log("[DEBUG-STEALTH] Input Length:", text.length);
          console.log("[DEBUG-STEALTH] Final Cover used:", finalCover);

          // Step 4: Embed binary into cover text
          const finalOutput = camouflageService.embed(binaryPayload, finalCover, camouflageLanguage || 'fa');
          
          console.log("[DEBUG-STEALTH] Final Output sent to DB:", finalOutput.length);
          // ADD FINAL VERIFICATION LOGS
          console.log("[FINAL-CHECK] Payload Size:", binaryPayload.length);
          console.log("[FINAL-CHECK] Text before ZWC:", finalCover);
          console.log("[FINAL-CHECK] Final String Length:", finalOutput.length);

          // Step 5: Store message in database
          const isOffline = !navigator.onLine;

          // CRITICAL: Strict broadcast vs private message isolation
          // Broadcast messages MUST use 'BROADCAST' as recipientFingerprint
          // Private messages MUST use the contact's fingerprint
          if (isBroadcast) {
            // Broadcast mode: store with recipientFingerprint: 'BROADCAST'
            await storageService.storeMessage({
              senderFingerprint: identity.fingerprint,
              recipientFingerprint: 'BROADCAST',
              content: {
                plain: text,
                encrypted: finalOutput,
              },
              isOutgoing: true,
              read: true,
              status: isOffline ? 'pending' : 'sent',
              isBroadcast: true,
            }, sessionPassphrase);

            // Update lastStorageUpdate to trigger UI reactivity
            const now = Date.now();
            // Update messages if active chat is broadcast
            const messages = await storageService.getMessagesByFingerprint('BROADCAST', sessionPassphrase);
            set({ messages, lastStorageUpdate: now });
          } else {
            // Regular mode: store for specific recipient (NOT broadcast)
            const newMessage = await storageService.storeMessage({
              senderFingerprint: identity.fingerprint,
              recipientFingerprint: activeChat.fingerprint, // Use contact's fingerprint, not BROADCAST
              content: {
                plain: text,
                encrypted: finalOutput,
              },
              isOutgoing: true,
              read: true,
              status: isOffline ? 'pending' : 'sent',
              isBroadcast: false, // Explicitly mark as not broadcast
            }, sessionPassphrase);

            // Update lastStorageUpdate to trigger UI reactivity
            const now = Date.now();
            // Update state
            set((state) => ({
              messages: [newMessage, ...state.messages], // Prepend to maintain descending order (newest first)
              lastStorageUpdate: now,
            }));
          }

          // Clear input after successful auto-stealth send
          set({ messageInput: '' });

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

      /**
       * Universal input handler - processes any input (ZWC, keys, messages)
       * Detection priority:
       * 1. ZWC: Decode if camouflageService.hasZWC()
       * 2. Contact Intro: Check if decoded binary or original string is a key using parseKeyInput()
       * 3. Secure Message: Check version byte (0x01 = encrypted, 0x02 = signed/broadcast)
       */
      handleUniversalInput: async (input: string, targetContactFingerprint?, skipNavigation = false) => {
        const { identity, sessionPassphrase } = get();

        if (!identity || !sessionPassphrase) {
          throw new Error('Authentication required');
        }

        console.log('[UniversalInput] Processing input, length:', input.length);

        // Step 1: Check for ZWC (Zero-Width Characters) - highest priority
        let extractedBinary: Uint8Array | null = null;
        let processedText = input;
        let isZWC = false;

        if (camouflageService.hasZWC(input)) {
          isZWC = true;
          console.log('[UniversalInput] ZWC detected, extracting binary...');
          try {
            // Try strict decoding first
            try {
              extractedBinary = camouflageService.decodeFromZWC(input, false);
              console.log('[UniversalInput] ZWC strict decode successful, binary length:', extractedBinary.length);
            } catch (strictError: unknown) {
              // If strict fails with checksum error, try lenient mode
              const error = strictError as Error;
              if (error.message?.includes('Checksum mismatch') || error.message?.includes('corrupted')) {
                console.warn('[UniversalInput] ZWC strict decode failed, trying lenient mode...', error.message);
                extractedBinary = camouflageService.decodeFromZWC(input, true);
                console.log('[UniversalInput] ZWC lenient decode successful, binary length:', extractedBinary.length);
              } else {
                throw strictError; // Re-throw if it's a different error
              }
            }
            // Convert binary to base64 for further processing
            const naclUtil = await import('tweetnacl-util');
            processedText = naclUtil.encodeBase64(extractedBinary);
            console.log('[UniversalInput] Converted ZWC to Base64, length:', processedText.length);
          } catch (error) {
            console.error('[UniversalInput] Failed to decode ZWC message:', error);
            throw new Error('Failed to extract hidden message from cover text');
          }
        }

        // Step 2: Check if it's a Contact Intro (USERNAME+KEY or plain key)
        // CRITICAL: Check the ORIGINAL input string first (before ZWC decoding)
        // This handles cases like "Name+Key" format which won't be in the decoded binary
        const originalKeyParseResult = cryptoService.parseKeyInput(input);
        if (originalKeyParseResult.isValid) {
          console.log('[UniversalInput] Contact intro detected in original input (key format)');
          // Trigger Add Contact flow by throwing a specific error that UI can catch
          // CRITICAL: Use consistent keys (name, publicKey) for CONTACT_INTRO_DETECTED
          const contactIntroError = new Error('CONTACT_INTRO_DETECTED') as Error & {
            keyData: { name: string; publicKey: string };
          };
          contactIntroError.keyData = {
            name: originalKeyParseResult.username || 'Unknown',
            publicKey: originalKeyParseResult.key,
          };
          throw contactIntroError;
        }

        // Also check decoded binary if ZWC was detected (in case key is embedded in ZWC)
        if (extractedBinary) {
          // Try to decode binary as UTF-8 string to check for key format
          try {
            const decoder = new TextDecoder();
            const decodedString = decoder.decode(extractedBinary);
            const binaryKeyParseResult = cryptoService.parseKeyInput(decodedString);
            if (binaryKeyParseResult.isValid) {
              console.log('[UniversalInput] Contact intro detected in decoded binary (key format)');
              // CRITICAL: Use consistent keys (name, publicKey) for CONTACT_INTRO_DETECTED
              const contactIntroError = new Error('CONTACT_INTRO_DETECTED') as Error & {
                keyData: { name: string; publicKey: string };
              };
              contactIntroError.keyData = {
                name: binaryKeyParseResult.username || 'Unknown',
                publicKey: binaryKeyParseResult.key,
              };
              throw contactIntroError;
            }
          } catch {
            // Not a valid UTF-8 string or not a key - continue to message processing
          }
        }

        // Step 3: Check if it's a Secure Message (check version byte)
        let messageBytes: Uint8Array;
        if (extractedBinary) {
          messageBytes = extractedBinary;
        } else if (typeof processedText === 'string') {
          // Check if it's a PGP message (legacy format)
          if (processedText.includes('-----BEGIN PGP MESSAGE-----')) {
            console.log('[UniversalInput] PGP message detected (legacy format)');
            // Route to processIncomingMessage for PGP handling
            return await get().processIncomingMessage(processedText, targetContactFingerprint, skipNavigation);
          }

          // Try to decode as base64
          try {
            const naclUtil = await import('tweetnacl-util');
            messageBytes = naclUtil.decodeBase64(processedText.trim());
          } catch {
            throw new Error('Invalid message format: Not a valid key, ZWC, PGP, or Base64 message');
          }
        } else {
          throw new Error('Invalid message format');
        }

        if (messageBytes.length === 0) {
          throw new Error('Message is empty');
        }

        // Read version byte (first byte)
        const version = messageBytes[0];
        console.log('[UniversalInput] Version byte:', `0x${version.toString(16).padStart(2, '0')}`, version === 0x01 ? '(Encrypted)' : version === 0x02 ? '(Signed/Broadcast)' : '(Unknown)');

        if (version !== 0x01 && version !== 0x02) {
          throw new Error(`Unsupported protocol version: 0x${version.toString(16).padStart(2, '0')}`);
        }

        // PROTOCOL COLLISION FIX: For v0x02, check for identity packet first
        // Identity packets (Stealth IDs) also use version 0x02, so we must check before broadcast handling
        if (version === 0x02) {
          console.log('[UniversalInput] Version 0x02 detected - checking for identity packet first');

          // First, try parseStealthID to detect identity packets
          try {
            const parsedIdentity = parseStealthID(messageBytes);
            if (parsedIdentity) {
              // This is an identity packet (Stealth ID), not a broadcast message
              console.log('[Protocol] Identity Packet Detected');
              const contactIntroError = new Error('CONTACT_INTRO_DETECTED') as Error & { keyData: { name: string; publicKey: string } };
              contactIntroError.keyData = {
                name: parsedIdentity.name,
                publicKey: parsedIdentity.publicKey,
              };
              throw contactIntroError;
            }
          } catch (error: any) {
            // If it's a CONTACT_INTRO_DETECTED error, re-throw it
            if (error.message === 'CONTACT_INTRO_DETECTED') {
              throw error;
            }
            // If parseStealthID fails (not an identity packet), continue to broadcast handling
            console.log('[UniversalInput] Not an identity packet, proceeding to broadcast verification');
          }

          // Only proceed to verifySignedMessage if it's not an identity packet
          console.log('[UniversalInput] Routing v0x02 to verifySignedMessage for broadcast handling');
          const { sessionPassphrase, contacts, identity } = get();
          const contactKeys = contacts.map((c) => c.publicKey);

          const signedResult = await cryptoService.verifySignedMessage(messageBytes, contactKeys);

          if (signedResult.verified && signedResult.senderFingerprint) {
            // Find the sender contact
            const sender = contacts.find((c) => c.fingerprint === signedResult.senderFingerprint);
            if (!sender) {
              throw new Error('Sender not found in contacts');
            }

            // CRITICAL: Use sender's fingerprint as storage context (unified routing)
            // Do NOT use 'BROADCAST' as recipient fingerprint
            // Use original input if ZWC, otherwise use processed text
            const storedEncrypted = isZWC ? input : (processedText || input);
            const newMessage = await storageService.storeMessage({
              senderFingerprint: sender.fingerprint,
              recipientFingerprint: identity.fingerprint, // Use user's fingerprint, not 'BROADCAST'
              content: {
                plain: signedResult.data,
                encrypted: storedEncrypted,
              },
              isOutgoing: false,
              read: false,
              isVerified: true,
              status: 'sent',
              isBroadcast: true,
            }, sessionPassphrase);

            // REACTIVITY: Update lastStorageUpdate after successful storeMessage
            const now = Date.now();
            console.log(`[Storage] Message saved to ${sender.fingerprint}`);
            console.log(`[Store] Storage updated at ${now}, triggering UI refresh`);
            set({ lastStorageUpdate: now });
            console.log('[UI] Triggering Re-render');
            console.log('[UI] Modal Triggered');

            // If activeChat is broadcast, update messages array immediately
            // This ensures the UI shows the new message even when skipNavigation is true
            const { activeChat } = get();
            if (skipNavigation && activeChat && activeChat.id === 'system_broadcast') {
              set((state) => ({
                messages: [newMessage, ...state.messages],
              }));
            }

          // UI-driven navigation: Do not auto-navigate when skipNavigation is true
          // The UI will show a modal and let the user decide when to navigate
          if (!skipNavigation) {
            // Navigate to sender's chat (unified routing - no special broadcast handling)
            set({ activeChat: sender });
            const messages = await storageService.getMessagesByFingerprint(sender.fingerprint, sessionPassphrase);
            set({ messages });
          } else {
            // If skipNavigation is true, update state only if already in sender's chat
            const { activeChat } = get();
            if (activeChat && activeChat.fingerprint === sender.fingerprint) {
              // Update messages if already in sender's chat
              set((state) => ({
                messages: [newMessage, ...state.messages],
              }));
            }
          }

          // Always return result object for UI to show modal
          // For broadcast, fingerprint is the sender's fingerprint, but isBroadcast is true
          return {
            type: 'message' as const,
            fingerprint: sender.fingerprint,
            isBroadcast: true,
            senderName: sender.name,
          };
          } else {
            throw new Error('Signature verification failed: Message signature is invalid or sender is unknown');
          }
        }

        // For v0x01 (encrypted), route to processIncomingMessage
        // CRITICAL: Ensure processIncomingMessage returns the full result object
        const naclUtil = await import('tweetnacl-util');
        const base64Message = naclUtil.encodeBase64(messageBytes);
        const result = await get().processIncomingMessage(base64Message, targetContactFingerprint, skipNavigation);

        // Ensure we return the full result object (not null)
        if (!result) {
          throw new Error('Failed to process incoming message');
        }

        return result;
      },

      processIncomingMessage: async (encryptedText, targetContactFingerprint, skipNavigation = false) => {
        const { identity, sessionPassphrase, contacts } = get();

        if (!identity || !sessionPassphrase) {
          throw new Error('Authentication required');
        }

        // Step 1: De-camouflage - Check if input contains ZWC (Zero-Width Characters)
        let extractedBinary: Uint8Array | null = null;
        let processedText = encryptedText;
        let isZWC = false;

        if (camouflageService.hasZWC(encryptedText)) {
          isZWC = true;
          console.log('[UniversalInput] ZWC detected in processIncomingMessage');
          try {
            // Try strict decoding first
            try {
              extractedBinary = camouflageService.decodeFromZWC(encryptedText, false);
              console.log('[UniversalInput] ZWC strict decode successful, binary length:', extractedBinary.length);
            } catch (strictError: unknown) {
              // If strict fails with checksum error, try lenient mode
              const error = strictError as Error;
              if (error.message?.includes('Checksum mismatch') || error.message?.includes('corrupted')) {
                console.warn('[UniversalInput] ZWC strict decode failed, trying lenient mode...', error.message);
                extractedBinary = camouflageService.decodeFromZWC(encryptedText, true);
                console.log('[UniversalInput] ZWC lenient decode successful, binary length:', extractedBinary.length);
              } else {
                throw strictError; // Re-throw if it's a different error
              }
            }
            // Convert binary to base64 for duplicate check and crypto operations
            const naclUtil = await import('tweetnacl-util');
            processedText = naclUtil.encodeBase64(extractedBinary);
            console.log('[UniversalInput] processedText (Base64):', processedText.substring(0, 50) + '...', 'length:', processedText.length);
          } catch (error) {
            console.error('[UniversalInput] Failed to decode ZWC message:', error);
            throw new Error('Failed to extract hidden message from cover text');
          }
        } else {
          console.log('[UniversalInput] No ZWC detected, using processedText as-is:', processedText.substring(0, 50) + '...');
        }

        // Step 2: Check if message already exists (deduplication)
        // Use the extracted binary/base64 for duplicate check, not the original ZWC text
        const exists = await storageService.messageExists(processedText, sessionPassphrase);
        if (exists) {
          // Message is a duplicate - silently return without processing
          // This prevents duplicate entries and redundant notifications
          const duplicateError = new Error('DUPLICATE_MESSAGE');
          duplicateError.name = 'DuplicateMessageError';
          throw duplicateError;
        }

        try {
          // Step 3: Check protocol version byte to determine message type
          // CRITICAL: Check version before attempting decryption to avoid pako errors
          let messageBytes: Uint8Array;
          if (extractedBinary) {
            messageBytes = extractedBinary;
          } else if (typeof processedText === 'string') {
            // Decode base64 string to bytes
            const naclUtil = await import('tweetnacl-util');
            messageBytes = naclUtil.decodeBase64(processedText);
          } else {
            throw new Error('Invalid message format');
          }

          if (messageBytes.length === 0) {
            throw new Error('Message is empty');
          }

          // Read version byte (first byte)
          const version = messageBytes[0];
          console.log('[UniversalInput] Version Byte:', `0x${version.toString(16).padStart(2, '0')}`, version === 0x01 ? '(Encrypted)' : version === 0x02 ? '(Signed/Broadcast)' : '(Unknown)');

          const contactKeys = contacts.map((c) => c.publicKey);
          let result;
          let isBroadcast = false;

          // Route to correct handler based on version byte
          if (version === 0x01) {
            // Version 0x01: Encrypted message - use decryptMessage
            console.log('[UniversalInput] Routing to decryptMessage (v0x01)');
            try {
              result = await cryptoService.decryptMessage(
                messageBytes,
                identity.privateKey,
                sessionPassphrase,
                contactKeys,
              );
              console.log('[UniversalInput] decryptMessage succeeded');
            } catch (decryptError) {
              console.error('[UniversalInput] decryptMessage FAILED:', decryptError);
              throw decryptError;
            }
          } else if (version === 0x02) {
            // Version 0x02: Signed broadcast message - use verifySignedMessage
            // CRITICAL: Do not call decryptMessage on version 0x02, it will cause pako errors
            console.log('[UniversalInput] Routing to verifySignedMessage (v0x02)');
            try {
              const signedResult = await cryptoService.verifySignedMessage(messageBytes, contactKeys);
              console.log('[UniversalInput] verifySignedMessage result:', {
                verified: signedResult.verified,
                senderFingerprint: signedResult.senderFingerprint,
              });

              if (signedResult.verified && signedResult.senderFingerprint) {
                // This is a broadcast message (signed, not encrypted)
                result = {
                  data: signedResult.data,
                  verified: signedResult.verified,
                  signatureValid: true,
                  senderFingerprint: signedResult.senderFingerprint,
                };
                isBroadcast = true;
                console.log('[UniversalInput] Broadcast message verified successfully');
              } else {
                console.error('[UniversalInput] Signature verification failed: verified=false or no senderFingerprint');
                throw new Error('Signature verification failed: Message signature is invalid or sender is unknown');
              }
            } catch (verifyError) {
              // Re-throw with clear error message for UI feedback
              const err = verifyError as Error;
              console.error('[UniversalInput] verifySignedMessage FAILED:', err.message);
              if (err.message?.includes('verification failed') || err.message?.includes('Invalid signed message')) {
                throw new Error('Signature verification failed: The broadcast message signature is invalid or corrupted');
              }
              throw verifyError;
            }
          } else {
            console.error('[UniversalInput] Unsupported protocol version:', `0x${version.toString(16).padStart(2, '0')}`);
            throw new Error(`Unsupported protocol version: 0x${version.toString(16).padStart(2, '0')}`);
          }

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
          // CRITICAL: Unified routing - use sender's fingerprint as storage context for BOTH v0x01 and v0x02
          // Do NOT use 'BROADCAST' as recipient fingerprint
          const recipientFingerprint = identity.fingerprint; // Always use user's fingerprint
          console.log('[UniversalInput] Storing message, isBroadcast:', isBroadcast, 'senderFingerprint:', sender.fingerprint, 'recipientFingerprint:', recipientFingerprint);

          // Store the original encryptedText (ZWC text if it was ZWC, or original text if not)
          // This preserves the original format for display and re-sharing
          const storedEncrypted = isZWC ? encryptedText : processedText;

          const newMessage = await storageService.storeMessage({
            senderFingerprint: sender.fingerprint,
            recipientFingerprint: recipientFingerprint,
            content: {
              plain: result.data,
              encrypted: storedEncrypted,
            },
            isOutgoing: false,
            read: false, // Mark as unread initially
            isVerified: isVerified,
            status: 'sent',
            isBroadcast: isBroadcast,
          }, sessionPassphrase);

          // REACTIVITY: Update lastStorageUpdate after successful storeMessage
          const now = Date.now();
          console.log(`[Storage] Message saved to ${sender.fingerprint}`);
          console.log(`[Store] Storage updated at ${now}, triggering UI refresh`);
          set({ messageInput: '', lastStorageUpdate: now });
          console.log('[UI] Triggering Re-render');
          console.log('[UI] Modal Triggered');
          console.log('[UI] Modal Triggered');

          // If activeChat matches the sender, update messages array immediately
          // This ensures the UI shows the new message even when skipNavigation is true
            const { activeChat } = get();
          if (skipNavigation && activeChat && activeChat.fingerprint === sender.fingerprint) {
            // Update messages if already in sender's chat (unified routing)
              set((state) => ({
                messages: [newMessage, ...state.messages],
              }));
            }

          // UI-driven navigation: Do not auto-navigate when skipNavigation is true
          // The UI will show a modal and let the user decide when to navigate
          if (!skipNavigation) {
            // Unified routing - navigate to sender's chat for both v0x01 and v0x02
            set({ activeChat: sender });
            const messages = await storageService.getMessagesByFingerprint(sender.fingerprint, sessionPassphrase);
            set({ messages });
          }
          // Note: Message array update for skipNavigation=true is handled above before navigation check

          // Always return result object for UI to show modal
          return {
            type: 'message' as const,
            fingerprint: sender.fingerprint,
            isBroadcast: isBroadcast,
            senderName: sender.name,
          };
        } catch (error) {
          console.error('Failed to process incoming message:', error);
          throw error;
        }
      },

      setSessionPassphrase: (passphrase) => set({ sessionPassphrase: passphrase }),

      /**
       * Get contacts list with broadcast contact always at index 0
       */
      getContactsWithBroadcast: () => {
        const { contacts } = get();
        const broadcastContact: Contact = {
          id: 'system_broadcast',
          name: 'Broadcast Channel',
          fingerprint: 'BROADCAST',
          publicKey: '',
          createdAt: new Date(),
          lastUsed: new Date(),
        };
        return [broadcastContact, ...contacts];
      },

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
