import { CamouflageService } from '../services/camouflage';
import { CryptoService } from '../services/crypto';

import * as logger from './logger';

const camouflageService = CamouflageService.getInstance();
const cryptoService = CryptoService.getInstance();

/**
 * Process Zero-Width Characters (ZWC) from input
 */
export const processZWC = async (input: string) => {
  let extractedBinary: Uint8Array | null = null;
  let processedText = input;
  let isZWC = false;

  if (camouflageService.hasZWC(input)) {
    isZWC = true;
    logger.log('[UniversalInput] ZWC detected, extracting binary...');
    try {
      try {
        extractedBinary = camouflageService.decodeFromZWC(input, false);
        logger.log(
          '[UniversalInput] ZWC strict decode successful, binary length:',
          extractedBinary.length,
        );
      } catch (strictError: unknown) {
        const error = strictError as Error;
        if (
          error.message?.includes('Checksum mismatch') ||
          error.message?.includes('corrupted')
        ) {
          logger.warn(
            '[UniversalInput] ZWC strict decode failed, trying lenient mode...',
            error.message,
          );
          extractedBinary = camouflageService.decodeFromZWC(input, true);
          logger.log(
            '[UniversalInput] ZWC lenient decode successful, binary length:',
            extractedBinary.length,
          );
        } else {
          throw strictError;
        }
      }
      const naclUtil = await import('tweetnacl-util');
      if (extractedBinary) {
        processedText = naclUtil.encodeBase64(extractedBinary);
        logger.log('[UniversalInput] Converted ZWC to Base64, length:', processedText.length);
      }
    } catch (error) {
      logger.error('[UniversalInput] Failed to decode ZWC message:', error);
      throw new Error('Failed to extract hidden message from cover text');
    }
  }
  return { extractedBinary, processedText, isZWC };
};

/**
 * Detect if the input is a Contact Intro (Key)
 */
export const detectContactIntro = (input: string, extractedBinary: Uint8Array | null) => {
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
};

/**
 * Decode message bytes from processed text or binary
 */
export const decodeMessageBytes = async (processedText: string, extractedBinary: Uint8Array | null) => {
  let messageBytes: Uint8Array;
  if (extractedBinary) {
    messageBytes = extractedBinary;
  } else if (typeof processedText === 'string') {
    if (processedText.includes('-----BEGIN PGP MESSAGE-----')) {
      logger.log('[UniversalInput] PGP message detected (legacy format)');
      return { messageBytes: null, isPGP: true };
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

  return { messageBytes, isPGP: false };
};
