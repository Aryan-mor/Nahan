/* eslint-disable max-lines-per-function, no-constant-condition, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import i18next from 'i18next';
import * as naclUtil from 'tweetnacl-util';

import * as logger from '../../utils/logger';
import { CryptoService } from '../crypto';

import { decodeBase122, encodeBase122 } from './base122';
import { generateMeshGradient, optimizeImage } from './imageUtils';
import { embedPayload, extractPayload } from './steganography';

const cryptoService = CryptoService.getInstance();

export interface StegoProcessResult {
  success: boolean;
  data?: Blob | string; // Blob for encode, string (url) for decode
  error?: string;
}

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
    recipientPublicKey?: string
  ): Promise<Uint8Array> {
    if (recipientPublicKey) {
      const result = await cryptoService.encryptMessage(
        imageBytes,
        recipientPublicKey,
        senderPrivateKey,
        passphrase,
        { binary: true }
      );
      return typeof result === 'string' ? naclUtil.decodeBase64(result) : result;
    } else {
      const result = await cryptoService.signMessage(
        imageBytes,
        senderPrivateKey,
        passphrase,
        { binary: true }
      );
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
    text?: string
  ): Promise<{ carrier: Blob; payload: Uint8Array }> {
    try {
      logger.info('Steganography Encode: Starting...', { hasText: !!text, fileSize: file.size });

      let payloadBytes: Uint8Array;

      // Optimize the image first
      const optimizedImageBytes = await optimizeImage(file);
      logger.debug('Steganography Encode: Image optimized', { size: optimizedImageBytes.length });

      // If we have text or want to use the standard envelope
      if (text || true) {
        // Convert optimized bytes to Base64 to embed in JSON
        const imageBase64 = naclUtil.encodeBase64(optimizedImageBytes);
        const dataUrl = `data:image/webp;base64,${imageBase64}`;

        const payload = {
          nahan_type: 'image_stego',
          image: dataUrl,
          text: text || ''
        };

        const jsonString = JSON.stringify(payload);
        logger.debug('Steganography Encode: JSON payload created', { length: jsonString.length });
        payloadBytes = new TextEncoder().encode(jsonString);
      } else {
        // Fallback to raw bytes
        payloadBytes = optimizedImageBytes;
      }

      const encryptedPayload = await this.prepareEncryptedPayload(
        payloadBytes,
        senderPrivateKey,
        passphrase,
        recipientPublicKey
      );
      logger.debug('Steganography Encode: Payload encrypted', { length: encryptedPayload.length });

      const base122Payload = encodeBase122(encryptedPayload);
      const size = this.calculateCarrierSize(base122Payload.length);
      logger.debug('Steganography Encode: Carrier size calculated', { size, payloadLength: base122Payload.length });

      const carrier = generateMeshGradient(size, size);

      const resultBlob = await embedPayload(carrier, base122Payload);
      logger.info('Steganography Encode: Complete');
      return { carrier: resultBlob, payload: encryptedPayload };

    } catch (error) {
      logger.error('Steganography Encode Failed:', error);
      throw error;
    }
  }

  private async loadCarrierCanvas(carrierFile: File): Promise<HTMLCanvasElement> {
    const img = new Image();
    const url = URL.createObjectURL(carrierFile);

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(i18next.t('errors.canvasInitFailed', 'Failed to initialize canvas'));

    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return canvas;
  }

  private async decryptPayload(
    messageBytes: Uint8Array,
    recipientPrivateKey: string,
    passphrase: string,
    senderPublicKeys: string[],
    forcePeerPublicKey?: string
  ): Promise<{ data: Uint8Array; senderPublicKey?: string }> {
    const version = messageBytes[0];
    if (version === 0x02) {
      const verifyResult = await cryptoService.verifySignedMessage(messageBytes, senderPublicKeys, {
        binary: true,
      });
      if (!verifyResult.verified) {
        throw new Error('Signature verification failed');
      }
      const data = typeof verifyResult.data === 'string'
          ? naclUtil.decodeBase64(verifyResult.data)
          : (verifyResult.data as Uint8Array);
      // Use X25519 key if resolved (for contact matching), otherwise fallback to Ed25519 key
      return { data, senderPublicKey: (verifyResult as any).senderX25519PublicKey || verifyResult.senderPublicKey };
    } else {
      const decryptResult = await cryptoService.decryptMessage(
        messageBytes,
        recipientPrivateKey,
        passphrase,
        senderPublicKeys,
        { binary: true, forcePeerPublicKey },
      );
      const data = typeof decryptResult.data === 'string'
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
    decryptionPeerPublicKey?: string
  ): Promise<{ url?: string; text?: string; senderPublicKey?: string }> {
    try {
      const canvas = await this.loadCarrierCanvas(carrierFile);
      const base122Payload = extractPayload(canvas);

      // MEMORY OPTIMIZATION: Dispose canvas immediately
      canvas.width = 0;
      canvas.height = 0;

      const messageBytes = decodeBase122(base122Payload);

      const { data: plaintextBytes, senderPublicKey } = await this.decryptPayload(
        messageBytes,
        recipientPrivateKey,
        passphrase,
        senderPublicKeys,
        decryptionPeerPublicKey
      );

      // Try to detect if it's a JSON payload (text+image) or raw image
      let isJson = false;
      let jsonPayload: any = null;
      try {
        const textDecoder = new TextDecoder();
        const text = textDecoder.decode(plaintextBytes);
        // Check for JSON start/end chars to avoid unnecessary parsing of binary data
        const trimmed = text.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            jsonPayload = JSON.parse(trimmed);
            isJson = true;
        }
      } catch (e) {
        // Not JSON
      }

      if (isJson && (jsonPayload.nahan_type === 'image_stego' || jsonPayload.nahan_type === 'image')) {
        return {
          url: jsonPayload.image, // Assuming this is a Data URL or URL
          text: jsonPayload.text,
          senderPublicKey
        };
      }

      // 3. Fallback: Intelligent Content Detection
      // Check for common image headers (Magic Bytes)
      const isImage = (bytes: Uint8Array): boolean => {
        if (bytes.length < 12) return false;

        // PNG: 89 50 4E 47
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;

        // JPEG: FF D8
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) return true;

        // WebP: RIFF .... WEBP
        // 'R' 'I' 'F' 'F' (0-3) ... 'W' 'E' 'B' 'P' (8-11)
        if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;

        return false;
      };

      if (isImage(plaintextBytes)) {
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
          logger.warn('Steganography Decode: Unknown payload type', { length: plaintextBytes.length });
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
