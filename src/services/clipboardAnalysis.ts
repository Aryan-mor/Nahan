/* eslint-disable max-lines-per-function, no-useless-catch, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import * as logger from '../utils/logger';
import { ImageSteganographyService } from './steganography';
import { Contact, Identity, storageService } from './storage';

export interface ProcessingContext {
  identity: Identity | null;
  sessionPassphrase: string | null;
  contacts: Contact[];
  handleUniversalInput: (
    input: string,
    senderFingerprint?: string,
    isPaste?: boolean,
  ) => Promise<any>;
}

export interface ProcessedResult {
  type: 'message' | 'id' | 'none';
  fingerprint?: string;
  senderName?: string;
  isBroadcast?: boolean;
  data?: any;
  source?: 'image' | 'text';
}

export interface AnalysisResult {
  processed: ProcessedResult | null;
  contentHash?: string; // For images
  textContent?: string; // For text
}

const stegoService = ImageSteganographyService.getInstance();

// Helper to hash blob for deduplication
const getImageHash = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  const view = new Uint8Array(buffer);
  // Simple hash: length + sum of first 100 bytes + sum of last 100 bytes
  let sum = 0;
  for (let i = 0; i < Math.min(100, view.length); i++) sum += view[i];
  for (let i = Math.max(0, view.length - 100); i < view.length; i++) sum += view[i];
  return `${blob.size}-${blob.type}-${sum}`;
};

/**
 * Core logic to process a specific image blob for steganography
 */
export async function processStegoImage(
  blob: Blob,
  context: ProcessingContext,
): Promise<ProcessedResult | null> {
  const { identity, sessionPassphrase, contacts } = context;

  if (!identity || !sessionPassphrase) {
    throw new Error('Authentication required');
  }

  const file = new File([blob], 'clipboard_image.png', { type: blob.type });
  const knownPublicKeys = contacts.map((c) => c.publicKey);

  try {
    const result = await stegoService.decode(
      file,
      identity.privateKey,
      sessionPassphrase,
      knownPublicKeys,
    );

    if (result.senderPublicKey) {
      const sender = contacts.find((c) => c.publicKey === result.senderPublicKey);
      if (sender) {
        // Parse decoded content
        let messageType: 'text' | 'image' | 'image_stego' = 'text';
        const finalImageUrl = result.url;
        const finalPlainText = result.text || '';

        if (finalImageUrl) {
          messageType = 'image';
        }

        // Convert original carrier to base64 for storage
        const base64Carrier = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Store message
        await storageService.storeMessage(
          {
            senderFingerprint: sender.fingerprint,
            recipientFingerprint: identity.fingerprint,
            type: messageType,
            content: {
              plain: finalPlainText,
              encrypted: base64Carrier,
              image: messageType === 'image' ? finalImageUrl : undefined,
            },
            isOutgoing: false,
            read: false,
            status: 'sent',
            isVerified: true,
            isBroadcast: false,
          },
          sessionPassphrase,
        );

        return {
          type: 'message',
          fingerprint: sender.fingerprint,
          senderName: sender.name,
          isBroadcast: false,
          source: 'image',
        };
      }
    }
  } catch (error) {
    // If decode fails, it might not be a stego image
    // We throw specific errors if we want them handled, or just log
    // But for "not a stego image", we usually just return null or let caller handle
    // However, if it IS a stego image but decode failed (wrong key?), that's different.
    // stegoService.decode throws if it can't find a sender or decode fails.

    // We'll let the caller decide what to do with errors, but for "unified" analysis,
    // we often treat "decode failed" as "not a message" and move on.
    throw error;
  }

  return null;
}

/**
 * Unified clipboard processor
 * Handles both Text and Image content with priority logic
 */
export async function analyzeClipboard(
  context: ProcessingContext,
  options: {
    previousText?: string;
    previousImageHash?: string;
  } = {}
): Promise<AnalysisResult> {
  const { handleUniversalInput } = context;
  const { previousText, previousImageHash } = options;

  // EXIT SILENTLY if document not focused (Silent Focus-Aware Clipboard rule)
  if (!document.hasFocus()) {
    logger.debug('[ClipboardAnalysis] Document not focused - exiting silently');
    return { processed: null };
  }

  // OPTIMIZATION: Try Text Detection FIRST (Faster, covers 90% of cases)
  // This avoids the 2s delay often caused by navigator.clipboard.read() for images
  try {
    console.log(`[PERF][TRACE] 1. Navigator readText started`);
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      console.log(`[PERF][TRACE] 2. Text acquired (length: ${text.length}) - matches previous: ${previousText === text}`);
      if (previousText && text === previousText) {
          // If text matches last check, we can skip text processing.
          // BUT if we haven't checked for images yet, and text didn't yield a result last time,
          // checking images might still be needed?
          // However, if the clipboard hasn't changed, the image implies it hasn't changed either (single clipboard entry).
          return { processed: null, textContent: text };
      }

      let result;
      try {
        console.log(`[PERF][TRACE] 3a. Calling handleUniversalInput...`);
        result = await handleUniversalInput(text, undefined, true);
        console.log(`[PERF][TRACE] 3b. handleUniversalInput returned type:`, result?.type);
      } catch (error: any) {
        if (error.message === 'CONTACT_INTRO_DETECTED') {
          return {
            processed: { type: 'id', data: error.keyData, source: 'text' },
            textContent: text,
          };
        }
        // Known "soft" errors - treat as "handled but no result"
        if (error.message === 'SENDER_UNKNOWN' || error.message === 'DUPLICATE_MESSAGE') {
           logger.debug(`[ClipboardAnalysis] ${error.message} - suppressing loop`);
           // If it was a duplicate message, we STOP here. We don't check for images.
           return { processed: null, textContent: text };
        }
        // For other errors (e.g. invalid format), we might still want to check for images?
        // E.g. if I copied a stego image, readText might return "garbage" or nothing.
        // If it throws, we continue to Image check.
      }

      // If we got a valid text result, return it immediately
      if (result) {
        let processed: ProcessedResult | null = null;
        if (result.type === 'message') {
          processed = {
            type: 'message',
            fingerprint: result.fingerprint,
            senderName: result.senderName,
            isBroadcast: result.isBroadcast,
            source: 'text',
          };
        } else if (result.type === 'id' || result.type === 'contact') {
          processed = { type: 'id', data: result, source: 'text' };
        }
        if (processed) return { processed, textContent: text };
      }
    }
  } catch (err) {
    // Ignore text read errors (continue to image)
  }

  // 2. Try Image Detection (Slower, fallback or stego)
  if (navigator.clipboard && navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const hash = await getImageHash(blob);

          if (previousImageHash && hash === previousImageHash) {
             return { processed: null, contentHash: hash };
          }

          try {
            const stegoResult = await processStegoImage(blob, context);
            if (stegoResult) {
                return { processed: stegoResult, contentHash: hash };
            }
          } catch (err) {
            // Not a stego image or decode failed
          }
           // Image found but not stego. Return hash to avoid re-process.
           // return { processed: null, contentHash: hash };
           // Actually, if we found an image and processed it (even if failed), we should update the hash.
           return { processed: null, contentHash: hash };
        }
      }
    } catch (err) {
      logger.debug('[ClipboardAnalysis] Image read failed or permission denied:', err);
    }
  }

  return { processed: null };
}

