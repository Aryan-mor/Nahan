/* eslint-disable max-lines-per-function, max-lines, no-console */
import { StateCreator } from 'zustand';

import { CryptoService } from '../../services/crypto';
import { parseStealthID } from '../../services/stealthId';
import { storageService } from '../../services/storage';
import { workerService } from '../../services/workerService';
import * as logger from '../../utils/logger';
import { AppState, ProcessingSlice } from '../types';

const cryptoService = CryptoService.getInstance();

export const createProcessingSlice: StateCreator<AppState, [], [], ProcessingSlice> = (
  set,
  get,
) => ({
  /**
   * Universal input handler - processes any input (ZWC, keys, messages).
   *
   * ARCHITECTURE: Zero Main-Thread Scanning
   * All input analysis (ZWC detection, key parsing, protocol detection) is
   * delegated to the processing worker to maintain 60fps on the main thread.
   */
  handleUniversalInput: async (
    input: string,
    targetContactFingerprint?,
    skipNavigation = false,
  ) => {
    const { identity, sessionPassphrase } = get();

    if (!identity || !sessionPassphrase) {
      throw new Error('Authentication required');
    }

    logger.log('[UniversalInput] Processing input, length:', input.length);

    // [PERF] Start timing
    const perfStart = performance.now();
    console.log(`[PERF][Processing] handleUniversalInput Start - Input Length: ${input.length}`);

    // STEP 1: Delegate ALL analysis to Worker (Pure Worker Rule)
    // This moves ZWC scanning, key parsing, and protocol detection off the main thread
    const workerStart = performance.now();
    const analysisResult = await workerService.analyzeInput(input);
    console.log(`[PERF][Processing] Worker analyzeInput - Duration: ${(performance.now() - workerStart).toFixed(2)}ms`);

    logger.log('[UniversalInput] Worker analysis result:', {
      type: analysisResult.type,
      isZWC: analysisResult.isZWC,
      hasExtractedBinary: !!analysisResult.extractedBinary,
      protocolVersion: analysisResult.protocolVersion,
    });

    // STEP 2: Handle key detection (contact intro)
    if (analysisResult.type === 'id' && analysisResult.keyData) {
      logger.log('[UniversalInput] Contact intro detected by worker');
      const contactIntroError = new Error('CONTACT_INTRO_DETECTED') as Error & {
        keyData: { name: string; publicKey: string };
      };
      contactIntroError.keyData = analysisResult.keyData;
      throw contactIntroError;
    }

    // STEP 3: Handle unknown input
    if (analysisResult.type === 'unknown') {
      throw new Error('Invalid message format: Not a valid key, ZWC, PGP, or Base64 message');
    }

    // Get binary payload - worker already extracted it
    const messageBytes = analysisResult.extractedBinary;
    if (!messageBytes || messageBytes.length === 0) {
      // Fallback for PGP messages (legacy format, handled by processIncomingMessage)
      if (input.includes('-----BEGIN PGP MESSAGE-----')) {
        logger.log('[UniversalInput] PGP message detected (legacy format)');
        return await get().processIncomingMessage(
          input,
          targetContactFingerprint,
          skipNavigation,
        );
      }
      throw new Error('Message is empty');
    }

    const version = analysisResult.protocolVersion || messageBytes[0];
    logger.log(
      '[UniversalInput] Version byte:',
      `0x${version.toString(16).padStart(2, '0')}`,
      version === 0x01 ? '(Encrypted)' : version === 0x02 ? '(Signed/Broadcast)' : '(Unknown)',
    );

    if (version !== 0x01 && version !== 0x02) {
      throw new Error(`Unsupported protocol version: 0x${version.toString(16).padStart(2, '0')}`);
    }

    // STEP 4: Handle v0x02 (Identity/Broadcast)
    if (version === 0x02) {
      logger.log('[UniversalInput] Version 0x02 detected - checking for identity packet first');

      try {
        const parsedIdentity = parseStealthID(messageBytes);
        if (parsedIdentity) {
          logger.log('[Protocol] Identity Packet Detected');
          const contactIntroError = new Error('CONTACT_INTRO_DETECTED') as Error & {
            keyData: { name: string; publicKey: string };
          };
          contactIntroError.keyData = {
            name: parsedIdentity.name,
            publicKey: parsedIdentity.publicKey,
          };
          throw contactIntroError;
        }
      } catch (error: unknown) {
        if ((error as Error).message === 'CONTACT_INTRO_DETECTED') {
          throw error;
        }
        logger.log('[UniversalInput] Not an identity packet, proceeding to broadcast verification');
      }

      logger.log('[UniversalInput] Routing v0x02 to verifySignedMessage for broadcast handling');
      const { contacts } = get();
      const contactKeys = contacts.map((c) => c.publicKey);

      const signedResult = await cryptoService.verifySignedMessage(messageBytes, contactKeys);

      if (signedResult.verified && signedResult.senderFingerprint) {
        const sender = contacts.find((c) => c.fingerprint === signedResult.senderFingerprint);
        if (!sender) {
          throw new Error('Sender not found in contacts');
        }

        // Prevent Self-Broadcast Processing
        if (sender.fingerprint === identity.fingerprint) {
           logger.log('[Processing] Ignoring self-broadcast');
           return {
             type: 'message' as const,
             fingerprint: sender.fingerprint,
             isBroadcast: true,
             senderName: 'Me (Ignored)',
           };
        }

        const storedEncrypted = analysisResult.isZWC ? input : input;

        const payloadString = typeof signedResult.data === 'string'
          ? signedResult.data
          : new TextDecoder().decode(signedResult.data as Uint8Array);

        let timestamp = Date.now();
        const finalPlain = payloadString;

        try {
           const json = JSON.parse(payloadString);
           if (json.timestamp) {
             timestamp = json.timestamp;
           }
        } catch {
           // Efficient fallback for legacy non-JSON broadcasts
        }

        const dataToHash = new TextEncoder().encode(sender.publicKey + payloadString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const customId = `msg_BROADCAST_${hashHex}`;

        const newMessage = await storageService.storeMessage(
          {
            id: customId,
            senderFingerprint: sender.fingerprint,
            recipientFingerprint: identity.fingerprint,
            content: {
              plain: finalPlain,
              encrypted: storedEncrypted,
            },
            isOutgoing: false,
            read: false,
            isVerified: true,
            status: 'sent',
            isBroadcast: true,
            createdAt: new Date(timestamp),
          },
          sessionPassphrase,
        );

        const now = Date.now();
        logger.log(`[Storage] Message saved to ${sender.fingerprint}`);

        // ATOMIC STATE UPDATE: Batch all changes into a single set() call
        const { activeChat } = get();
        const shouldUpdateMessages =
          (skipNavigation && activeChat && activeChat.id === 'system_broadcast') ||
          (!skipNavigation) ||
          (activeChat && activeChat.fingerprint === sender.fingerprint);

        if (shouldUpdateMessages) {
          set((state) => {
            const { ids, entities } = state.messages;
            if (ids.includes(newMessage.id)) {
              // Already exists, just update timestamp
              return { lastStorageUpdate: now };
            }

            const newIds = [newMessage.id, ...ids];
            const newEntities = { ...entities, [newMessage.id]: newMessage };
            return {
              messages: { ids: newIds, entities: newEntities },
              lastStorageUpdate: now,
            };
          });
        } else {

          // DEBOUNCE: Prevent rapid storage updates from thrashing the UI
          // Only update if enough time has passed or use a trailing debounce
          // For simplicity and effectiveness, we'll align to 16ms (1 frame)
          const lastUpdate = get().lastStorageUpdate;
          if (now - lastUpdate > 16) {
             set({ lastStorageUpdate: now });
          }
          // Note: If we need strict accuracy for a "done" event, we might need a timeout,
          // but for "repaint" capability, throttling to 16ms is usually sufficient to stop the "storm"
          // while keeping the UI responsive.
        }

        if (!skipNavigation) {
          await get().setActiveChat(sender);
        }

        return {
          type: 'message' as const,
          fingerprint: sender.fingerprint,
          isBroadcast: true,
          senderName: sender.name,
        };
      } else {
        throw new Error(
          'Signature verification failed: Message signature is invalid or sender is unknown',
        );
      }
    }

    // STEP 5: Handle v0x01 (Encrypted message) - Binary-First Pipeline
    // Pass binary directly to decryption, avoiding string conversions
    const contacts = get().contacts;
    const contactKeys = contacts.map((c) => c.publicKey);

    const decryptStart = performance.now();
    const decryptResult = await cryptoService.decryptMessage(
      messageBytes,
      identity.privateKey,
      sessionPassphrase,
      contactKeys,
    );
    console.log(`[PERF][Processing] decryptMessage - Duration: ${(performance.now() - decryptStart).toFixed(2)}ms`);

    let senderFingerprint = decryptResult.senderFingerprint;
    let isVerified = decryptResult.verified;

    if (!senderFingerprint) {
      if (targetContactFingerprint) {
        senderFingerprint = targetContactFingerprint;
        isVerified = false;
      } else {
        const { activeChat } = get();
        if (activeChat) {
          senderFingerprint = activeChat.fingerprint;
          isVerified = false;
        }
      }

      if (!senderFingerprint) {
        throw new Error('SENDER_UNKNOWN');
      }
    }

    const sender = contacts.find((c) => c.fingerprint === senderFingerprint);
    if (!sender) {
      throw new Error('Sender not found in contacts');
    }

    const storedEncrypted = analysisResult.isZWC ? input : input;

    // Parse payload to check for image content
    let finalPlain = typeof decryptResult.data === 'string'
      ? decryptResult.data
      : new TextDecoder().decode(decryptResult.data as Uint8Array);
    let finalImage: string | undefined = undefined;
    let finalType: 'text' | 'image' = 'text';

    try {
      const trimmedPlain = finalPlain.trim();
      if (trimmedPlain.startsWith('{') && (trimmedPlain.includes('"nahan_type":"image"') || trimmedPlain.includes('"nahan_type":"image_stego"'))) {
        const parsed = JSON.parse(trimmedPlain);
        if (parsed.nahan_type === 'image' || parsed.nahan_type === 'image_stego') {
          finalType = 'image';
          finalPlain = parsed.text || '';
          finalImage = parsed.image;
        }
      }
    } catch {
      // Not a JSON payload, treat as regular text
    }

    const storageStart = performance.now();
    const newMessage = await storageService.storeMessage(
      {
        senderFingerprint: sender.fingerprint,
        recipientFingerprint: identity.fingerprint,
        type: finalType,
        content: {
          plain: finalPlain,
          encrypted: storedEncrypted,
          image: finalImage,
        },
        isOutgoing: false,
        read: false,
        isVerified: isVerified,
        status: 'sent',
        isBroadcast: false,
      },
      sessionPassphrase,
    );
    console.log(`[PERF][Processing] storeMessage - Duration: ${(performance.now() - storageStart).toFixed(2)}ms`);

    const now = Date.now();

    // ATOMIC STATE UPDATE: Batch all changes into a single set() call
    const { activeChat } = get();
    const shouldUpdateStore = !activeChat || (activeChat.fingerprint === sender.fingerprint);

    const setStart = performance.now();
    if (shouldUpdateStore) {
      set((state) => {
        const { ids, entities } = state.messages;
        if (ids.includes(newMessage.id)) {
          return { messageInput: '', lastStorageUpdate: now };
        }

        const newIds = [newMessage.id, ...ids];
        const newEntities = { ...entities, [newMessage.id]: newMessage };

        // O(1) INCREMENTAL UPDATE: Update only this contact's summary inline
        const updatedSummaries = {
          ...state.chatSummaries,
          [sender.fingerprint]: newMessage
        };

        return {
          messages: { ids: newIds, entities: newEntities },
          messageInput: '',
          lastStorageUpdate: now,
          chatSummaries: updatedSummaries, // O(1) - no DB call
        };
      });
    } else {
      // Not viewing this chat, but still update the summary
      set((state) => ({
        messageInput: '',
        lastStorageUpdate: now,
        chatSummaries: {
          ...state.chatSummaries,
          [sender.fingerprint]: newMessage
        }
      }));
    }
    console.log(`[PERF][Processing] set() atomic update - Duration: ${(performance.now() - setStart).toFixed(2)}ms`);
    console.log(`[PERF][Processing] handleUniversalInput Complete - Total Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);

    if (!skipNavigation) {
      await get().setActiveChat(sender);
    }

    return {
      type: 'message' as const,
      fingerprint: sender.fingerprint,
      isBroadcast: false,
      senderName: sender.name,
    };
  },


  processIncomingMessage: async (
    encryptedText,
    targetContactFingerprint,
    skipNavigation = false,
  ) => {
    const { identity, sessionPassphrase, contacts } = get();

    if (!identity || !sessionPassphrase) {
      throw new Error('Authentication required');
    }

    // Use worker for ZWC/binary extraction (Pure Worker Rule)
    const analysisResult = await workerService.analyzeInput(encryptedText);
    const extractedBinary = analysisResult.extractedBinary;
    const _isZWC = analysisResult.isZWC; // Unused but kept for debugging/future use

    const exists = await storageService.messageExists(encryptedText, sessionPassphrase);
    if (exists) {
      const duplicateError = new Error('DUPLICATE_MESSAGE');
      duplicateError.name = 'DuplicateMessageError';
      throw duplicateError;
    }

    try {
      let messageBytes: Uint8Array;
      if (extractedBinary) {
        messageBytes = extractedBinary;
      } else {
        const naclUtil = await import('tweetnacl-util');
        messageBytes = naclUtil.decodeBase64(encryptedText.trim());
      }

      if (messageBytes.length === 0) {
        throw new Error('Message is empty');
      }

      const version = messageBytes[0];
      logger.log('[UniversalInput] Version Byte:', `0x${version.toString(16).padStart(2, '0')}`);

      const contactKeys = contacts.map((c) => c.publicKey);
      let result;
      let isBroadcast = false;

      if (version === 0x01) {
        try {
          result = await cryptoService.decryptMessage(
            messageBytes,
            identity.privateKey,
            sessionPassphrase,
            contactKeys,
          );
        } catch (decryptError) {
          logger.error('[UniversalInput] decryptMessage FAILED:', decryptError);
          throw decryptError;
        }
      } else if (version === 0x02) {
        try {
          const signedResult = await cryptoService.verifySignedMessage(messageBytes, contactKeys);
          if (signedResult.verified && signedResult.senderFingerprint) {
            result = {
              data: signedResult.data,
              verified: signedResult.verified,
              signatureValid: true,
              senderFingerprint: signedResult.senderFingerprint,
            };
            isBroadcast = true;
          } else {
            throw new Error('Signature verification failed');
          }
        } catch (verifyError) {
          const err = verifyError as Error;
          if (
            err.message?.includes('verification failed') ||
            err.message?.includes('Invalid signed message')
          ) {
            throw new Error(
              'Signature verification failed: The broadcast message signature is invalid or corrupted',
            );
          }
          throw verifyError;
        }
      } else {
        throw new Error(`Unsupported protocol version: 0x${version.toString(16).padStart(2, '0')}`);
      }

      let senderFingerprint = result.senderFingerprint;
      let isVerified = result.verified;

      if (!senderFingerprint) {
        if (targetContactFingerprint) {
          senderFingerprint = targetContactFingerprint;
          isVerified = false;
        } else {
          const { activeChat } = get();
          if (activeChat) {
            senderFingerprint = activeChat.fingerprint;
            isVerified = false;
          }
        }

        if (!senderFingerprint) {
          throw new Error('SENDER_UNKNOWN');
        }
      }

      const sender = contacts.find((c) => c.fingerprint === senderFingerprint);
      if (!sender) {
        throw new Error('Sender not found in contacts');
      }

      const recipientFingerprint = identity.fingerprint;
      const storedEncrypted = encryptedText; // Store original input (may contain ZWC or be Base64)

      // Parse payload to check for image content
      let finalPlain = typeof result.data === 'string' ? result.data : new TextDecoder().decode(result.data as Uint8Array);
      let finalImage: string | undefined = undefined;
      let finalType: 'text' | 'image' = 'text';

      try {
        const trimmedPlain = finalPlain.trim();
        if (trimmedPlain.startsWith('{') && (trimmedPlain.includes('"nahan_type":"image"') || trimmedPlain.includes('"nahan_type":"image_stego"'))) {
          const parsed = JSON.parse(trimmedPlain);
          if (parsed.nahan_type === 'image' || parsed.nahan_type === 'image_stego') {
            finalType = 'image';
            finalPlain = parsed.text || '';
            finalImage = parsed.image;
          }
        }
      } catch (_e) {
        // Not a JSON payload, treat as regular text
      }

      const newMessage = await storageService.storeMessage(
        {
          senderFingerprint: sender.fingerprint,
          recipientFingerprint: recipientFingerprint,
          type: finalType,
          content: {
            plain: finalPlain,
            encrypted: storedEncrypted,
            image: finalImage,
          },
          isOutgoing: false,
          read: false,
          isVerified: isVerified,
          status: 'sent',
          isBroadcast: isBroadcast,
        },
        sessionPassphrase,
      );

      const now = Date.now();
      set({ messageInput: '', lastStorageUpdate: now });

      const { activeChat } = get();

      // Fix "0 messages" bug: Update store if we are in the correct chat OR if no chat is open (e.g. Keys page)
      // This ensures tests can verify message arrival even if navigation is skipped
      const shouldUpdateStore = !activeChat || (activeChat.fingerprint === sender.fingerprint);

      if (shouldUpdateStore) {
        set((state) => {
          const { ids, entities } = state.messages;
          if (ids.includes(newMessage.id)) return {};

          const newIds = [newMessage.id, ...ids];
          const newEntities = { ...entities, [newMessage.id]: newMessage };
          return {
            messages: { ids: newIds, entities: newEntities }
          };
        });
      }

      if (!skipNavigation) {
        await get().setActiveChat(sender);
      }

      return {
        type: 'message' as const,
        fingerprint: sender.fingerprint,
        isBroadcast: isBroadcast,
        senderName: sender.name,
      };
    } catch (error) {
      logger.error('Failed to process incoming message:', error);
      throw error;
    }
  },
});
