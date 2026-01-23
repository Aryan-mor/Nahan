/* eslint-disable max-lines-per-function, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import jsQR from 'jsqr';
import * as naclUtil from 'tweetnacl-util';

import * as logger from '../../utils/logger';
import { CryptoService } from '../crypto';

import { StegoFactory } from './factory';
import {
  generateMeshGradient,
  isImagePayload,
  loadCarrierCanvas,
  optimizeImage,
} from './imageUtils';
import { registerAllProviders } from './providers';
import { embedPayload, extractPayload } from './steganography';
import { AlgorithmType } from './types';

// Initialize provider registry
registerAllProviders();

const cryptoService = CryptoService.getInstance();

export interface StegoProcessResult {
  success: boolean;
  data?: Blob | string; // Blob for encode, string (url) for decode
  error?: string;
}

/**
 * ARCHITECTURE NOTE:
 * - ImageSteganographyService: Legacy image-based steganography (NH07)
 * - StegoFactory + StegoProvider: New multi-algorithm architecture (NH01-NH07)
 *
 * For new implementations, use StegoFactory.getInstance().getProvider(algorithmId)
 * Legacy code continues to use ImageSteganographyService.getInstance()
 */
export * from './factory';
export * from './types';
export { embedMagicHeader, extractMagicHeader } from './utils/magicHeader';

export class ImageSteganographyService {
  private static instance: ImageSteganographyService;

  private constructor() {}

  static getInstance(): ImageSteganographyService {
    if (!ImageSteganographyService.instance) {
      ImageSteganographyService.instance = new ImageSteganographyService();
    }
    return ImageSteganographyService.instance;
  }

  private async prepareEncryptedPayload(
    imageBytes: Uint8Array,
    senderPrivateKey: string,
    passphrase: string,
    recipientPublicKey?: string,
  ): Promise<Uint8Array> {
    if (recipientPublicKey) {
      const result = await cryptoService.encryptMessage(
        imageBytes,
        recipientPublicKey,
        senderPrivateKey,
        passphrase,
        { binary: true },
      );
      return typeof result === 'string' ? naclUtil.decodeBase64(result) : result;
    } else {
      const result = await cryptoService.signMessage(imageBytes, senderPrivateKey, passphrase, {
        binary: true,
      });
      return typeof result === 'string' ? naclUtil.decodeBase64(result) : result;
    }
  }

  private calculateCarrierSize(payloadLength: number): number {
    const totalBits = (4 + payloadLength) * 8;
    const pixelsNeeded = Math.ceil(totalBits / 6);
    const minDimension = Math.ceil(Math.sqrt(pixelsNeeded));
    const dimension = Math.ceil(minDimension * 1.1);
    return Math.max(dimension, 500);
  }

  /**
   * Encodes an image into a carrier using Steganography.
   * Phase A: Encoding (Sender)
   */
  async encode(
    file: File,
    senderPrivateKey: string,
    passphrase: string,
    recipientPublicKey?: string,
    text?: string,
  ): Promise<{ carrier: Blob; payload: Uint8Array }> {
    try {
      logger.info('Steganography Encode: Starting...', { hasText: !!text, fileSize: file.size });



      // Optimize the image first
      const optimizedImageBytes = await optimizeImage(file);
      logger.debug('Steganography Encode: Image optimized', { size: optimizedImageBytes.length });

      // If we have text or want to use the standard envelope
      // Convert optimized bytes to Base64 to embed in JSON
      const imageBase64 = naclUtil.encodeBase64(optimizedImageBytes);
      const dataUrl = `data:image/webp;base64,${imageBase64}`;

      const payload = {
        nahan_type: 'image_stego',
        image: dataUrl,
        text: text || '',
      };

      const jsonString = JSON.stringify(payload);
      logger.debug('Steganography Encode: JSON payload created', { length: jsonString.length });
      const payloadBytes = new TextEncoder().encode(jsonString);

      const encryptedPayload = await this.prepareEncryptedPayload(
        payloadBytes,
        senderPrivateKey,
        passphrase,
        recipientPublicKey,
      );

      logger.debug('Steganography Encode: Payload encrypted', { length: encryptedPayload.length });

      const nh07Provider = StegoFactory.getInstance().getProvider(AlgorithmType.NH07);
      const base122Payload = await nh07Provider.encode(encryptedPayload);
      const size = this.calculateCarrierSize(base122Payload.length);
      logger.debug('Steganography Encode: Carrier size calculated', {
        size,
        payloadLength: base122Payload.length,
      });

      const carrier = generateMeshGradient(size, size);

      const resultBlob = await embedPayload(carrier, base122Payload);
      logger.info('Steganography Encode: Complete');
      return { carrier: resultBlob, payload: encryptedPayload };
    } catch (error) {
      logger.error('Steganography Encode Failed:', error);
      throw error;
    }
  }


  private async decryptPayload(
    messageBytes: Uint8Array,
    recipientPrivateKey: string,
    passphrase: string,
    senderPublicKeys: string[],
    forcePeerPublicKey?: string,
  ): Promise<{ data: Uint8Array; senderPublicKey?: string }> {
    const version = messageBytes[0];
    if (version === 0x02) {
      const verifyResult = await cryptoService.verifySignedMessage(messageBytes, senderPublicKeys, {
        binary: true,
      });
      if (!verifyResult.verified) {
        throw new Error('Signature verification failed');
      }
      const verifiedData = verifyResult.data;
      const data =
        typeof verifiedData === 'string'
          ? naclUtil.decodeBase64(verifiedData)
          : (verifiedData as Uint8Array);
      // Use X25519 key if resolved (for contact matching), otherwise fallback to Ed25519 key
      return {
        data,
        senderPublicKey:
          (verifyResult as unknown as { senderX25519PublicKey?: string }).senderX25519PublicKey || verifyResult.senderPublicKey,
      };
    } else {
      const decryptResult = await cryptoService.decryptMessage(
        messageBytes,
        recipientPrivateKey,
        passphrase,
        senderPublicKeys,
        { binary: true, forcePeerPublicKey },
      );
      const data =
        typeof decryptResult.data === 'string'
          ? naclUtil.decodeBase64(decryptResult.data)
          : (decryptResult.data as Uint8Array);
      return { data, senderPublicKey: decryptResult.senderPublicKey };
    }
  }

  /**
   * Decodes an image from a carrier.
   * Phase B: Decoding (Receiver)
   */
  async decode(
    carrierFile: File,
    recipientPrivateKey: string,
    passphrase: string,
    senderPublicKeys: string[] = [],
    decryptionPeerPublicKey?: string,
  ): Promise<{ url?: string; text?: string; senderPublicKey?: string }> {
    try {
      const canvas = await loadCarrierCanvas(carrierFile);

      // 1. Try QR Code Detection First
      try {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (code && code.data) {
            logger.info('Steganography Decode: QR Code detected', { length: code.data.length });
            // Clean up canvas
            canvas.width = 0;
            canvas.height = 0;
            return { text: code.data };
          }
        }
      } catch (e) {
        logger.warn('Steganography Decode: QR detection failed, continuing to stego', e);
      }

      const base122Payload = extractPayload(canvas);

      // MEMORY OPTIMIZATION: Dispose canvas immediately
      canvas.width = 0;
      canvas.height = 0;

      const nh07Provider = StegoFactory.getInstance().getProvider(AlgorithmType.NH07);
      const messageBytes = await nh07Provider.decode(base122Payload);

      const { data: plaintextBytes, senderPublicKey } = await this.decryptPayload(
        messageBytes,
        recipientPrivateKey,
        passphrase,
        senderPublicKeys,
        decryptionPeerPublicKey,
      );

      // Try to detect if it's a JSON payload (text+image) or raw image
      let isJson = false;
      let jsonPayload: any = null;
      try {
        const text = new TextDecoder().decode(plaintextBytes);
        // Check for JSON start/end chars to avoid unnecessary parsing of binary data
        const trimmed = text.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          jsonPayload = JSON.parse(trimmed) as { nahan_type: string; image?: string; text?: string };
          isJson = true;
        }
      } catch (e) {
        // Not JSON
      }

      if (
        isJson &&
        (jsonPayload.nahan_type === 'image_stego' || jsonPayload.nahan_type === 'image')
      ) {
        return {
          url: jsonPayload.image, // Assuming this is a Data URL or URL
          text: jsonPayload.text,
          senderPublicKey,
        };
      }

      if (isImagePayload(plaintextBytes)) {
        // It's a raw image (Legacy behavior)
        const blob = new Blob([plaintextBytes], { type: 'image/webp' });
        return { url: URL.createObjectURL(blob), senderPublicKey };
      } else {
        // It's likely just text (e.g. sent via Stealth Drawer Image Mode)
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(plaintextBytes);
          // Only return as text if it doesn't contain too many control characters (basic sanity check)
          // But UTF-8 fatal decode is usually a good enough filter
          return { text, senderPublicKey };
        } catch (e) {
          // If not text and not image, fallback to displaying as a generic file/blob or error?
          // For now, let's treat as text if it decoded, otherwise empty
          logger.warn('Steganography Decode: Unknown payload type', {
            length: plaintextBytes.length,
          });
          return { senderPublicKey };
        }
      }
    } catch (error) {
      logger.error('Steganography Decode Failed:', error);
      throw error;
    }
  }
}

export const steganographyService = ImageSteganographyService.getInstance();
