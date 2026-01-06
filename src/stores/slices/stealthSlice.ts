/* eslint-disable max-lines-per-function */
import { StateCreator } from 'zustand';

import { CamouflageService } from '../../services/camouflage';
import { CryptoService } from '../../services/crypto';
import { storageService } from '../../services/storage';
import * as logger from '../../utils/logger';
import { AppState, StealthSlice } from '../types';
import { useUIStore } from '../uiStore';

const cryptoService = CryptoService.getInstance();
const camouflageService = CamouflageService.getInstance();

interface PersistParams {
  activeChat: AppState['activeChat'];
  identity: AppState['identity'];
  text: string;
  finalOutput: string;
  sessionPassphrase: string;
  isBroadcast: boolean;
}

/**
 * Helper to persist message to storage and update state
 */
const persistMessageAndState = async (
  set: (partial: AppState | Partial<AppState> | ((state: AppState) => AppState | Partial<AppState>), replace?: boolean) => void,
  params: PersistParams
) => {
  const { activeChat, identity, text, finalOutput, sessionPassphrase, isBroadcast } = params;
  const isOffline = !navigator.onLine;

  if (!activeChat || !identity) return;

  if (isBroadcast) {
    // Broadcast mode: store message with recipientFingerprint: 'BROADCAST'
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
    // Update messages for broadcast channel
    const messages = await storageService.getMessagesByFingerprint('BROADCAST', sessionPassphrase);
    set({ messages, lastStorageUpdate: now });
  } else {
    // Standard mode: store message for single recipient (NOT broadcast)
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
    set((state) => ({
      messages: [newMessage, ...state.messages], // Prepend to maintain descending order (newest first)
      lastStorageUpdate: now,
    }));
  }
};

export const createStealthSlice: StateCreator<AppState, [], [], StealthSlice> = (set, get) => ({
  isStealthMode: false,
  showStealthModal: false,
  pendingStealthBinary: null,
  pendingStealthImage: null,
  pendingPlaintext: null,
  stealthDrawerMode: 'dual',

  setStealthMode: (enabled) => set({ isStealthMode: enabled }),
  setShowStealthModal: (show) => set({ showStealthModal: show }),
  setPendingStealthBinary: (binary) => set({ pendingStealthBinary: binary }),
  setPendingStealthImage: (image) => set({ pendingStealthImage: image }),
  setPendingPlaintext: (text) => set({ pendingPlaintext: text }),
  setStealthDrawerMode: (mode) => set({ stealthDrawerMode: mode }),

  confirmStealthSend: async (finalOutput) => {
    const { activeChat, identity, pendingPlaintext } = get();
    if (!activeChat || !identity || !pendingPlaintext) {
      logger.error("Missing context for stealth send");
      return;
    }

    // Verify final output contains no PGP markers
    if (finalOutput.includes('BEGIN') || finalOutput.includes('PGP') || finalOutput.includes('-----')) {
      logger.error('ERROR: PGP markers detected in final output! This should not happen.');
      throw new Error('Invalid stealth output: PGP markers detected');
    }

    try {
      const { sessionPassphrase } = get();
      if (!sessionPassphrase) {
        throw new Error('SecureStorage: Missing key');
      }

      await persistMessageAndState(set, {
        activeChat,
        identity,
        text: pendingPlaintext,
        finalOutput,
        sessionPassphrase,
        isBroadcast: activeChat.id === 'system_broadcast'
      });

      set({
        showStealthModal: false,
        pendingStealthBinary: null,
        pendingPlaintext: null,
        messageInput: '', // Clear input after successful stealth send
      });
    } catch (error) {
      logger.error('Failed to confirm stealth send:', error);
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

      // Step 3: Embed binary into cover text
      const finalOutput = camouflageService.embed(binaryPayload, coverText, camouflageLanguage || 'fa');
      
      // Step 4: Store message in database
      await persistMessageAndState(set, {
        activeChat,
        identity,
        text,
        finalOutput,
        sessionPassphrase,
        isBroadcast
      });

      // Clear input after successful auto-stealth send
      set({ messageInput: '' });

      return finalOutput;
    } catch (error) {
      logger.error('Failed to send auto-stealth message:', error);
      throw error;
    }
  },
});
