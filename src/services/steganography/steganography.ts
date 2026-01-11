/* eslint-disable max-lines-per-function */
import i18next from 'i18next';
import * as logger from '../../utils/logger';

const HEADER = [0x53, 0x54]; // 'ST' (Stealth)

const serializePayload = (payload: string): Uint8Array => {
  const payloadLength = payload.length;
  const headerLength = HEADER.length;
  const lengthBytes = 4;
  const allBytes = new Uint8Array(headerLength + lengthBytes + payloadLength);

  // Write Header
  allBytes[0] = HEADER[0];
  allBytes[1] = HEADER[1];

  // Write length
  allBytes[2] = (payloadLength >>> 24) & 0xff;
  allBytes[3] = (payloadLength >>> 16) & 0xff;
  allBytes[4] = (payloadLength >>> 8) & 0xff;
  allBytes[5] = payloadLength & 0xff;

  // Write payload
  for (let i = 0; i < payloadLength; i++) {
    allBytes[headerLength + lengthBytes + i] = payload.charCodeAt(i);
  }
  return allBytes;
};

const checkCapacity = (width: number, height: number, payloadLength: number) => {
  const totalPixels = width * height;
  const totalBitsAvailable = totalPixels * 6;
  const totalBitsNeeded = (HEADER.length + 4 + payloadLength) * 8;

  if (totalBitsNeeded > totalBitsAvailable) {
    throw new Error(
      i18next.t(
        'errors.capacityExceeded',
        'Image capacity exceeded. Needed: {{needed}}, Available: {{available}}',
        {
          needed: totalBitsNeeded,
          available: totalBitsAvailable,
        },
      ),
    );
  }
};

/**
 * Embeds a string payload into an image using LSB-2 steganography.
 * @param carrier The canvas containing the carrier image (e.g., Mesh Gradient).
 * @param payload The string data to embed (usually Base122 encoded).
 * @returns A Promise resolving to the resulting image Blob (PNG).
 */
export const embedPayload = async (carrier: HTMLCanvasElement, payload: string): Promise<Blob> => {
  logger.debug(`[Stego] Embedding payload: ${payload.length} chars`);
  const ctx = carrier.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!ctx) throw new Error(i18next.t('errors.canvasInitFailed', 'Failed to initialize canvas'));

  // CRITICAL: Disable smoothing to preserve precise pixel values for steganography
  ctx.imageSmoothingEnabled = false;

  const { width, height } = carrier;
  checkCapacity(width, height, payload.length);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const allBytes = serializePayload(payload);

  let byteIndex = 0;
  let bitIndex = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (byteIndex >= allBytes.length) break;
    for (let c = 0; c < 3; c++) {
      if (byteIndex >= allBytes.length) break;
      const currentByte = allBytes[byteIndex];
      const bits = (currentByte >>> (6 - bitIndex)) & 0x03;
      data[i + c] = (data[i + c] & 0xfc) | bits;
      bitIndex += 2;
      if (bitIndex >= 8) {
        bitIndex = 0;
        byteIndex++;
      }
    }
    // Force alpha to 255 to prevent browser optimization/premultiplication of transparent pixels
    // which would destroy the embedded data in RGB channels.
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    carrier.toBlob((blob) => {
      if (blob) {
        logger.debug(`[Stego] Embed success. Blob size: ${blob.size}`);
        resolve(blob);
      } else
        reject(new Error(i18next.t('errors.blobCreationFailed', 'Failed to create image blob')));
    }, 'image/png'); // Must use PNG to be lossless
  });
};

const reconstructString = (payloadBytes: Uint8Array): string => {
  let result = '';
  const chunkSize = 1024;
  for (let i = 0; i < payloadBytes.length; i += chunkSize) {
    const chunk = payloadBytes.subarray(i, i + chunkSize);
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return result;
};

const getCanvasData = (carrier: HTMLCanvasElement) => {
  const ctx = carrier.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!ctx) throw new Error(i18next.t('errors.canvasInitFailed', 'Failed to initialize canvas'));
  const { width, height } = carrier;
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
};

/**
 * Extracts a string payload from an image using LSB-2 steganography.
 * @param carrier The canvas containing the image to scan.
 * @returns The extracted string payload.
 */
export const extractPayload = (carrier: HTMLCanvasElement): string => {
  logger.debug(`[Stego] Extracting payload from ${carrier.width}x${carrier.height} image`);
  const { data, width, height } = getCanvasData(carrier);

  let length = 0;
  let currentByte = 0;
  let bitIndex = 0;
  let bytesRead = 0;
  let payloadBytes: Uint8Array | null = null;

  for (let i = 0; i < data.length; i += 4) {
    if (payloadBytes && bytesRead >= length + 6) break;

    for (let c = 0; c < 3; c++) {
      if (payloadBytes && bytesRead >= length + 6) break;
      const bits = data[i + c] & 0x03;

      currentByte = (currentByte << 2) | bits;
      bitIndex += 2;

      if (bitIndex >= 8) {
        if (bytesRead < 2) {
          if (currentByte !== HEADER[bytesRead]) {
            logger.error(
              `[Stego] Invalid Header Byte ${bytesRead}: Expected ${HEADER[bytesRead]}, Got ${currentByte}`,
            );
            throw new Error(
              i18next.t(
                'stealth.error.invalid_header',
                'No hidden message found. The image might be compressed or not contain stealth data.',
              ),
            );
          }
        } else if (bytesRead < 6) {
          length = (length << 8) | currentByte;
        } else if (payloadBytes) {
          payloadBytes[bytesRead - 6] = currentByte;
        }

        bytesRead++;
        currentByte = 0;
        bitIndex = 0;

        if (bytesRead === 6) {
          const maxCapacity = (width * height * 6) / 8 - 6;
          logger.debug(
            `[Stego] Header valid. Payload Length: ${length}, Max Capacity: ${maxCapacity}`,
          );
          if (length < 0 || length > maxCapacity) {
            logger.error(`[Stego] Invalid payload length: ${length}`);
            throw new Error(
              i18next.t(
                'stealth.error.invalid_payload',
                'Invalid payload length detected. The image might be corrupted.',
              ),
            );
          }
          payloadBytes = new Uint8Array(length);
        }
      }
    }
  }

  if (!payloadBytes || bytesRead < length + 6) {
    logger.error(`[Stego] Incomplete payload. Read: ${bytesRead}, Expected: ${length + 6}`);
    throw new Error(i18next.t('errors.incompletePayload', 'Failed to extract complete payload'));
  }

  const result = reconstructString(payloadBytes);
  logger.debug(`[Stego] Extraction success. Result length: ${result.length}`);
  return result;
};
