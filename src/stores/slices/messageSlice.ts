/* eslint-disable max-lines, no-console */
/* eslint-disable max-lines-per-function */
import { StateCreator } from 'zustand';

import { CryptoService } from '../../services/crypto';
import { getMasterKey } from '../../services/secureStorage';
import { SecureMessage, storageService } from '../../services/storage';
import * as logger from '../../utils/logger';
import { AppState, MessageSlice } from '../types';

const cryptoService = CryptoService.getInstance();
const MAX_MESSAGES_IN_MEMORY = 50;

// Initialize Worker
const storageWorker = new Worker(new URL('../../workers/storage.worker.ts', import.meta.url), {
  type: 'module'
});

export const createMessageSlice: StateCreator<AppState, [], [], MessageSlice> = (set, get) => ({
  activeChat: null,
  // Normalized state structure
  messages: {
    ids: [],
    entities: {}
  },
  isLoadingMessages: false,
  chatSummaries: {},
  chatCache: {},
  messageInput: '',
  lastStorageUpdate: Date.now(),

  setActiveChat: async (contact) => {
    set({ activeChat: contact });
    if (contact) {
      const { chatCache } = get();
      const fingerprint = contact.id === 'system_broadcast' ? 'BROADCAST' : contact.fingerprint;

      const cachedChat = chatCache[fingerprint];
      console.log(`[CACHE] SetActiveChat: ${fingerprint}`, {
          hasCache: !!cachedChat,
          cacheSize: cachedChat?.ids.length
      });

      if (cachedChat && cachedChat.ids.length > 0) {
        // INSTANT LOAD FROM CACHE
        console.log(`[CACHE] HIT - Instant Load`);
        set({
            messages: cachedChat,
            isLoadingMessages: false
        });

        // Background refresh to get new messages (offset 0, limit 50)
        performFetch(fingerprint, 0, MAX_MESSAGES_IN_MEMORY, true).catch(console.error);
      } else {
        // First load or empty cache
        console.log(`[CACHE] MISS - Loading Skeleton`);
        set({
            messages: { ids: [], entities: {} },
            isLoadingMessages: true
        });

        try {
            await performFetch(fingerprint, 0, MAX_MESSAGES_IN_MEMORY, false);
        } catch (error) {
            set({ isLoadingMessages: false });
            throw error;
        }
      }
    } else {
      // Navigating away
      set({ isLoadingMessages: false });
    }

    // Helper defined inside closure to capture 'get' and 'set' safely
    async function performFetch(targetFingerprint: string, offset: number, limit: number, isBackground: boolean) {
        const { sessionPassphrase } = get();
        if (!sessionPassphrase) return;

        const activeMasterKey = getMasterKey();
        if (!activeMasterKey) return;

        const fetchPromise = new Promise<SecureMessage[]>((resolve, reject) => {
            const id = crypto.randomUUID();
            const handler = (event: MessageEvent) => {
                const { id: responseId, success, data, error } = event.data;
                if (responseId === id) {
                   storageWorker.removeEventListener('message', handler);
                   if (success) resolve(data);
                   else reject(new Error(error));
                }
            };
            storageWorker.addEventListener('message', handler);
            storageWorker.postMessage({
                id,
                type: 'getMessages',
                payload: {
                    fingerprint: targetFingerprint,
                    limit,
                    offset,
                    masterKey: activeMasterKey
                }
            });
        });

        try {
            const fetchedMessages = await fetchPromise;

            // Post-Processing
            fetchedMessages.forEach(msg => {
                if (msg.content.imageBlob) {
                   msg.content.image = URL.createObjectURL(msg.content.imageBlob);
                   delete msg.content.imageBlob;
                }
            });

            // Normalize
            const ids: string[] = [];
            const entities: Record<string, SecureMessage> = {};
            fetchedMessages.forEach(msg => {
                ids.push(msg.id);
                entities[msg.id] = msg;
            });

            set((state) => {
                // If loading more (offset > 0), simple merge?
                // For now, let's assume this helper is just for the initial fetch/refresh (offset 0)
                // or we need better merging logic for pagination.
                // UPDATED: Merging logic for pagination support
                let finalIds = ids;
                let finalEntities = entities;

                if (offset > 0) {
                     // MERGE with existing
                     const currentCache = state.chatCache[targetFingerprint];
                     if (currentCache) {
                         // Append new messages (older) to the end
                         finalIds = [...currentCache.ids, ...ids]; // Duplicates handled? Ideally fetched shouldn't overlap hard
                         finalEntities = { ...currentCache.entities, ...entities };

                         // Deduplicate IDs
                         finalIds = Array.from(new Set(finalIds));
                     }
                }

                const finalState = { ids: finalIds, entities: finalEntities };

                // Update Cache
                const newCache = {
                    ...state.chatCache,
                    [targetFingerprint]: finalState
                };

                // If this is still the active chat, update the view
                const currentActive = state.activeChat;
                const currentFingerprint = currentActive
                    ? (currentActive.id === 'system_broadcast' ? 'BROADCAST' : currentActive.fingerprint)
                    : null;

                if (currentFingerprint === targetFingerprint) {
                    return {
                        chatCache: newCache,
                        messages: finalState,
                        isLoadingMessages: false
                    };
                }

                return { chatCache: newCache };
            });

            if (!isBackground && contact && contact.id !== 'system_broadcast' && offset === 0) {
                 await storageService.updateContactLastUsed(contact.fingerprint, sessionPassphrase);
            }

        } catch (error) {
            console.error('[MessageSlice] Fetch failed:', error);
            if (!isBackground) {
                set({ isLoadingMessages: false });
                throw error;
            }
        }
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

      const start = performance.now();
      logger.log('[PERF] sendMessage START');

      let payloadToEncrypt = text;
      const messageType = type === 'image_stego' ? 'image_stego' : (image ? 'image' : 'text');
      const timestamp = Date.now();

      // Generate a nonce using crypto.getRandomValues for compatibility
      const nonceBytes = new Uint8Array(16);
      crypto.getRandomValues(nonceBytes);
      const nonce = Array.from(nonceBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const isBroadcast = activeChat.id === 'system_broadcast';

      if (image || isBroadcast) {
        payloadToEncrypt = JSON.stringify({
          nahan_type: messageType,
          text: text,
          image: image,
          timestamp: timestamp,
          nonce: nonce
        });
      }

      let encryptedContent: string;
      const cryptoStart = performance.now();

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
      logger.log(`[PERF] sendMessage Crypto - Duration: ${(performance.now() - cryptoStart).toFixed(2)}ms`);

      const isOffline = !navigator.onLine;

      // Generate Deterministic ID for Broadcasts
      let customId;
      if (isBroadcast) {
         // ID = msg_{fingerprint}_{SHA256(senderPubKey + timestamp + nonce + content)}
         // We use the raw payload content for the hash to be perfectly deterministic
         // The payload already contains the nonce and timestamp
         const dataToHash = new TextEncoder().encode(identity.publicKey + payloadToEncrypt);
         const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
         const hashArray = Array.from(new Uint8Array(hashBuffer));
         const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

         // logic in storage.ts uses recipientFingerprint which is BROADCAST for outgoing.

         // NOTE: storage.ts expects `msg_{conversationFingerprint}_...`
         // For outgoing broadcast, recipient is 'BROADCAST'.
         customId = `msg_BROADCAST_${hashHex}`;
      }

      const storeStart = performance.now();
      const newMessage = await storageService.storeMessage({
        id: customId,
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
        createdAt: new Date(timestamp), // Ensure consistent creation time
      }, sessionPassphrase);
      logger.log(`[PERF] sendMessage Storage - Duration: ${(performance.now() - storeStart).toFixed(2)}ms`);

      const now = Date.now();
      const messageFingerprint = isBroadcast ? 'BROADCAST' : activeChat.fingerprint;

      set((state) => {
        const { chatCache } = state;
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
          }
        }

        // UPDATE CACHE
        const newCache = {
            ...chatCache,
            [messageFingerprint]: { ids: newIds, entities: newEntities }
        };

        // O(1) INCREMENTAL UPDATE: Update only this contact's summary inline
        const updatedSummaries = {
          ...state.chatSummaries,
          [messageFingerprint]: newMessage
        };

        return {
          messages: { ids: newIds, entities: newEntities },
          chatCache: newCache,
          messageInput: '',
          lastStorageUpdate: now,
          chatSummaries: updatedSummaries, // O(1) - no DB call
        };
      });

      logger.log(`[PERF] sendMessage END - Total Duration: ${(performance.now() - start).toFixed(2)}ms`);
      return encryptedContent;
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  },

  deleteMessage: async (id) => {
    try {
      // Memory Leak Prevention: Revoke Blob URL if exists
      const { messages } = get();
      const message = messages.entities[id];
      if (message && message.content.image) {
        logger.debug(`[MessageSlice] Revoking blob URL for message ${id}`);
        URL.revokeObjectURL(message.content.image);
      }

      await storageService.deleteMessage(id);
      set((state) => {
        const { chatCache, messages, activeChat } = state;
        const newIds = messages.ids.filter((msgId) => msgId !== id);
        const newEntities = { ...messages.entities };
        delete newEntities[id];

        let newCache = chatCache;
        // Efficiently find which chat this belongs to?
        // Or deeper: we don't know the fingerprint easily here without looking it up.
        // But activeChat is known. If the message interacts with activeChat, we update it.
        // Ideally we update the cache for the specific fingerprint.
        // For simplicity/safety, we update the cache for the active chat if it exists.

        if (activeChat) {
             const fp = activeChat.id === 'system_broadcast' ? 'BROADCAST' : activeChat.fingerprint;
             if (chatCache[fp]) {
                 const cachedIds = chatCache[fp].ids.filter(mid => mid !== id);
                 const cachedEntities = { ...chatCache[fp].entities };
                 delete cachedEntities[id];
                 newCache = { ...chatCache, [fp]: { ids: cachedIds, entities: cachedEntities } };
             }
        }

        return {
          messages: { ids: newIds, entities: newEntities },
          chatCache: newCache
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

      set((state) => {
          const { chatCache } = state;
          // Clear Cache
          const newCache = { ...chatCache };
          delete newCache[fingerprint]; // Or set to empty: { ids: [], entities: {} }

          const { activeChat } = state;

          if (activeChat && (activeChat.fingerprint === fingerprint || (activeChat.id === 'system_broadcast' && fingerprint === 'BROADCAST'))) {
             return {
                 messages: { ids: [], entities: {} },
                 chatCache: newCache
             };
          }
          return { chatCache: newCache };
      });
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
    const perfStart = performance.now();
    console.log(`[PERF][UI] refreshChatSummaries Start`);

    const { sessionPassphrase, getContactsWithBroadcast } = get();
    if (!sessionPassphrase) {
      console.log(`[PERF][UI] refreshChatSummaries Skipped (no passphrase) - Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);
      return;
    }

    const allContacts = getContactsWithBroadcast();
    const fingerprints = allContacts
      .filter((c) => c.fingerprint !== 'BROADCAST')
      .map((c) => c.fingerprint);

    console.log(`[PERF][UI] Fetching summaries for ${fingerprints.length} contacts`);
    const dbStart = performance.now();
    const summaries = await storageService.getChatSummaries(fingerprints, sessionPassphrase);
    console.log(`[PERF][UI] getChatSummaries DB call - Duration: ${(performance.now() - dbStart).toFixed(2)}ms`);

    const map: Record<string, SecureMessage | undefined> = { ...summaries };

    const broadcastContact = allContacts.find((c) => c.fingerprint === 'BROADCAST');
    if (broadcastContact) {
      const broadcastStart = performance.now();
      const broadcastMessages = await storageService.getMessagesPaginated('BROADCAST', sessionPassphrase, 1);
      console.log(`[PERF][UI] Broadcast fetch - Duration: ${(performance.now() - broadcastStart).toFixed(2)}ms`);
      const latestBroadcast = broadcastMessages.length > 0 ? broadcastMessages[0] : undefined;
      map['BROADCAST'] = latestBroadcast;
    }

    set({ chatSummaries: map });
    console.log(`[PERF][UI] refreshChatSummaries End - Total Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);
  },

  // O(1) INCREMENTAL UPDATE: Update only a single contact's summary without DB call
  updateSummaryForContact: (fingerprint, lastMessage) => {
    const start = performance.now();
    set((state) => ({
      chatSummaries: {
        ...state.chatSummaries,
        [fingerprint]: lastMessage
      }
    }));
    console.log(`[PERF][Storage] updateSummaryForContact - Duration: ${(performance.now() - start).toFixed(4)}ms`);
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

  loadMoreMessages: async () => {
      const { activeChat, messages } = get();
      if (!activeChat) return;

      const fingerprint = activeChat.id === 'system_broadcast' ? 'BROADCAST' : activeChat.fingerprint;
      const currentCount = messages.ids.length;

      console.log(`[PAGINATION] loadMoreMessages: fetch offset ${currentCount}`);

      // We reuse the verify logic or just duplicate fetch logic?
      // Since 'performFetch' is inside setActiveChat closure, we can't call it here easily.
      // We should really move performFetch to be a stand-alone helper or a slice method method.
      // BUT for now, to avoid massive refactor risk, I'll duplicate the worker call with offset.
      // Re-duplication is safer than breaking setActiveChat.

      const { sessionPassphrase } = get();
      if (!sessionPassphrase) return;

      const activeMasterKey = getMasterKey();
      if (!activeMasterKey) return;

      const fetchPromise = new Promise<SecureMessage[]>((resolve, reject) => {
        const id = crypto.randomUUID();
        const handler = (event: MessageEvent) => {
            const { id: responseId, success, data, error } = event.data;
            if (responseId === id) {
               storageWorker.removeEventListener('message', handler);
               if (success) resolve(data);
               else reject(new Error(error));
            }
        };
        storageWorker.addEventListener('message', handler);
        storageWorker.postMessage({
            id,
            type: 'getMessages',
            payload: {
                fingerprint,
                limit: MAX_MESSAGES_IN_MEMORY,
                offset: currentCount, // Pagination!
                masterKey: activeMasterKey
            }
        });
      });

      try {
        const fetchedMessages = await fetchPromise;
         if (fetchedMessages.length === 0) return;

         fetchedMessages.forEach(msg => {
            if (msg.content.imageBlob) {
               msg.content.image = URL.createObjectURL(msg.content.imageBlob);
               delete msg.content.imageBlob;
            }
         });

         const ids: string[] = [];
         const entities: Record<string, SecureMessage> = {};
         fetchedMessages.forEach(msg => {
            ids.push(msg.id);
            entities[msg.id] = msg;
         });

         set((state) => {
             const prevIds = state.messages.ids;
             const prevEntities = state.messages.entities;

             // Append to end (oldest messages)
             const newIds = [...prevIds, ...ids];
             const newEntities = { ...prevEntities, ...entities };

             const uniqueIds = Array.from(new Set(newIds));
             const finalState = { ids: uniqueIds, entities: newEntities };

             // Update Cache
             const newCache = {
                 ...state.chatCache,
                 [fingerprint]: finalState
             };

             return {
                 messages: finalState,
                 chatCache: newCache
             };
         });
      } catch (error) {
        console.error('[PAGINATION] Failed to load more:', error);
      }
  },
});
