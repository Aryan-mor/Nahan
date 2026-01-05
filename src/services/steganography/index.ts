import i18next from 'i18next';
import * as naclUtil from 'tweetnacl-util';

import { CryptoService } from '../crypto';
import * as logger from '../../utils/logger';

import { encodeBase122, decodeBase122 } from './base122';
import { optimizeImage, generateMeshGradient } from './imageUtils';
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
    recipientPublicKey?: string
  ): Promise<Blob> {
    try {
      const optimizedImageBytes = await optimizeImage(file);
      const encryptedPayload = await this.prepareEncryptedPayload(
        optimizedImageBytes,
        senderPrivateKey,
        passphrase,
        recipientPublicKey
      );

      const base122Payload = encodeBase122(encryptedPayload);
      const size = this.calculateCarrierSize(base122Payload.length);
      const carrier = generateMeshGradient(size, size);

      const resultBlob = await embedPayload(carrier, base122Payload);
      return resultBlob;

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
      return { data, senderPublicKey: verifyResult.senderPublicKey };
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
  ): Promise<{ url: string; senderPublicKey?: string }> {
    try {
      const canvas = await this.loadCarrierCanvas(carrierFile);
      const base122Payload = extractPayload(canvas);
      const messageBytes = decodeBase122(base122Payload);
      
      const { data: plaintextBytes, senderPublicKey } = await this.decryptPayload(
        messageBytes,
        recipientPrivateKey,
        passphrase,
        senderPublicKeys,
        decryptionPeerPublicKey
      );

      const blob = new Blob([plaintextBytes], { type: 'image/webp' });
      return { url: URL.createObjectURL(blob), senderPublicKey };

    } catch (error) {
      logger.error('Steganography Decode Failed:', error);
      throw error;
    }
  }
}

export const steganographyService = ImageSteganographyService.getInstance();
