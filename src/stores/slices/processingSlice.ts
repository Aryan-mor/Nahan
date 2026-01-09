/* eslint-disable max-lines-per-function, max-lines */
import { StateCreator } from 'zustand';

import { CryptoService } from '../../services/crypto';
import { parseStealthID } from '../../services/stealthId';
import { storageService } from '../../services/storage';
import * as logger from '../../utils/logger';
import { processZWC } from '../../utils/processingUtils';
import { AppState, ProcessingSlice } from '../types';

const cryptoService = CryptoService.getInstance();

export const createProcessingSlice: StateCreator<AppState, [], [], ProcessingSlice> = (
  set,
  get,
) => ({
  /**
   * Universal input handler - processes any input (ZWC, keys, messages)
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

    // Step 1: Check for ZWC (Zero-Width Characters) - highest priority
    const { extractedBinary, processedText, isZWC } = await processZWC(input);

    // Step 2: Check if it's a Contact Intro (USERNAME+KEY or plain key)
    const originalKeyParseResult = cryptoService.parseKeyInput(input);
    if (originalKeyParseResult.isValid) {
      logger.log('[UniversalInput] Contact intro detected in original input (key format)');
      const contactIntroError = new Error('CONTACT_INTRO_DETECTED') as Error & {
        keyData: { name: string; publicKey: string };
      };
      contactIntroError.keyData = {
        name: originalKeyParseResult.username || 'Unknown',
        publicKey: originalKeyParseResult.key,
      };
      throw contactIntroError;
    }

    // Also check decoded binary if ZWC was detected
    if (extractedBinary) {
      try {
        const decoder = new TextDecoder();
        const decodedString = decoder.decode(extractedBinary);
        const binaryKeyParseResult = cryptoService.parseKeyInput(decodedString);
        if (binaryKeyParseResult.isValid) {
          logger.log('[UniversalInput] Contact intro detected in decoded binary (key format)');
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
        // Not a valid UTF-8 string or not a key
      }
    }

    // Step 3: Check if it's a Secure Message (check version byte)
    let messageBytes: Uint8Array;
    if (extractedBinary) {
      messageBytes = extractedBinary;
    } else if (typeof processedText === 'string') {
      if (processedText.includes('-----BEGIN PGP MESSAGE-----')) {
        logger.log('[UniversalInput] PGP message detected (legacy format)');
        return await get().processIncomingMessage(
          processedText,
          targetContactFingerprint,
          skipNavigation,
        );
      }

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

    const version = messageBytes[0];
    logger.log(
      '[UniversalInput] Version byte:',
      `0x${version.toString(16).padStart(2, '0')}`,
      version === 0x01 ? '(Encrypted)' : version === 0x02 ? '(Signed/Broadcast)' : '(Unknown)',
    );

    if (version !== 0x01 && version !== 0x02) {
      throw new Error(`Unsupported protocol version: 0x${version.toString(16).padStart(2, '0')}`);
    }

    // For v0x02, check for identity packet first
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
      const { sessionPassphrase, contacts, identity } = get();
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
           // Return a dummy result or throw to stop processing
           // Returning a "handled" state is better to avoid error UI
           return {
             type: 'message' as const,
             fingerprint: sender.fingerprint,
             isBroadcast: true,
             senderName: 'Me (Ignored)',
           };
        }

        const storedEncrypted = isZWC ? input : processedText || input;

        // Deterministic ID Logic
        // Deterministic ID Logic
        const payloadString = typeof signedResult.data === 'string'
          ? signedResult.data
          : new TextDecoder().decode(signedResult.data as Uint8Array);

        // Extract timestamp and nonce from payload if available
        let timestamp = Date.now();
        const finalPlain = payloadString;

        try {
           const json = JSON.parse(payloadString);
           if (json.timestamp) {
             timestamp = json.timestamp;
           }
           // Use the raw payloadString for hashing to match sender's logic exactly
           // The payloadString MUST match what was signed, which includes nonce and timestamp
        } catch (_e) {
           // efficient fallback for legacy non-JSON broadcasts
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
        set({ lastStorageUpdate: now });

        const { activeChat } = get();
        if (skipNavigation && activeChat && activeChat.id === 'system_broadcast') {
          set((state) => {
            const { ids, entities } = state.messages;
            // Prevent duplicates (Redux state level)
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
        } else {
          const { activeChat } = get();
          if (activeChat && activeChat.fingerprint === sender.fingerprint) {
            set((state) => {
               const { ids, entities } = state.messages;
               // Double check to be safe
               if (ids.includes(newMessage.id)) return {};

               const newIds = [newMessage.id, ...ids];
               const newEntities = { ...entities, [newMessage.id]: newMessage };
               return { messages: { ids: newIds, entities: newEntities } };
            });
          }
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

    const naclUtil = await import('tweetnacl-util');
    const base64Message = naclUtil.encodeBase64(messageBytes);
    const result = await get().processIncomingMessage(
      base64Message,
      targetContactFingerprint,
      skipNavigation,
    );

    if (!result) {
      throw new Error('Failed to process incoming message');
    }

    return result;
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

    // Use shared ZWC processing logic
    const { extractedBinary, processedText, isZWC } = await processZWC(encryptedText);

    const exists = await storageService.messageExists(processedText, sessionPassphrase);
    if (exists) {
      const duplicateError = new Error('DUPLICATE_MESSAGE');
      duplicateError.name = 'DuplicateMessageError';
      throw duplicateError;
    }

    try {
      let messageBytes: Uint8Array;
      if (extractedBinary) {
        messageBytes = extractedBinary;
      } else if (typeof processedText === 'string') {
        const naclUtil = await import('tweetnacl-util');
        messageBytes = naclUtil.decodeBase64(processedText);
      } else {
        throw new Error('Invalid message format');
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
      const storedEncrypted = isZWC ? encryptedText : processedText;

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
