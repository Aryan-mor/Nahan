/* eslint-disable max-lines-per-function, no-useless-catch, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { ImageSteganographyService } from './steganography';
import { storageService } from './storage';
import { Contact } from './storage';
import { Identity } from './storage';
import * as logger from '../utils/logger';

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
  type: 'message' | 'contact' | 'none';
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

  // 1. Try Image Detection first (Steganography takes precedence if valid)
  if (navigator.clipboard && navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const hash = await getImageHash(blob);

          if (previousImageHash && hash === previousImageHash) {
             // Skip duplicate image
             return { processed: null, contentHash: hash };
          }

          try {
            const stegoResult = await processStegoImage(blob, context);
            if (stegoResult) {
                return { processed: stegoResult, contentHash: hash };
            }
          } catch (err) {
            // Not a stego image or decode failed.
            // We should treat this as "image handled but no message found"
            // unless we want to propagate error?
            // For unified detector, we usually ignore non-stego images.
          }
          
          // If we are here, image was found but not processed as message.
          // We return the hash so we don't re-check this image.
          // But we continue to check text? 
          // Usually if there is an image, we don't check text? 
          // Browser clipboard usually has one or the other as "primary".
          // If we have an image, we probably stop.
          // return { processed: null, contentHash: hash };
          
          // Actually, let's fall through to text if image yielded nothing.
          // But we must return the hash so we know we checked this image.
        }
      }
    } catch (err) {
      logger.debug('[ClipboardAnalysis] Image read failed or permission denied:', err);
    }
  }

  // 2. Try Text Detection
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      if (previousText && text === previousText) {
          return { processed: null, textContent: text };
      }

      // Propagate logic errors from handleUniversalInput
      const result = await handleUniversalInput(text, undefined, true);
      
      let processed: ProcessedResult | null = null;
      if (result && result.type === 'message') {
        processed = {
          type: 'message',
          fingerprint: result.fingerprint,
          senderName: result.senderName,
          isBroadcast: result.isBroadcast,
          source: 'text',
        };
      } else if (result && result.type === 'contact') {
        processed = {
          type: 'contact',
          data: result,
          source: 'text',
        };
      } else if (result && result.type === 'id') {
         // Some handleUniversalInput implementations return 'id' for contacts
          processed = {
            type: 'contact', // Map to contact
            data: result,
            source: 'text',
          };
      }
      
      return { processed, textContent: text };
    }
  } catch (err) {
    // If it's a permission error, ignore.
    // If it's a logic error from handleUniversalInput, we want to re-throw it so caller can handle specific cases
    if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        // ignore
    } else {
        throw err;
    }
  }

  return { processed: null };
}
