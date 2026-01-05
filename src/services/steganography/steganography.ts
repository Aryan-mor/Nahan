import i18next from 'i18next';

const serializePayload = (payload: string): Uint8Array => {
  const payloadLength = payload.length;
  const allBytes = new Uint8Array(4 + payloadLength);
  
  // Write length
  allBytes[0] = (payloadLength >>> 24) & 0xff;
  allBytes[1] = (payloadLength >>> 16) & 0xff;
  allBytes[2] = (payloadLength >>> 8) & 0xff;
  allBytes[3] = payloadLength & 0xff;

  // Write payload
  for (let i = 0; i < payloadLength; i++) {
    allBytes[4 + i] = payload.charCodeAt(i);
  }
  return allBytes;
};

const checkCapacity = (width: number, height: number, payloadLength: number) => {
  const totalPixels = width * height;
  const totalBitsAvailable = totalPixels * 6;
  const totalBitsNeeded = (4 + payloadLength) * 8;

  if (totalBitsNeeded > totalBitsAvailable) {
    throw new Error(
      i18next.t('errors.capacityExceeded', 'Image capacity exceeded. Needed: {{needed}}, Available: {{available}}', {
        needed: totalBitsNeeded,
        available: totalBitsAvailable,
      })
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
  const ctx = carrier.getContext('2d');
  if (!ctx) throw new Error(i18next.t('errors.canvasInitFailed', 'Failed to initialize canvas'));

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
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    carrier.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(i18next.t('errors.blobCreationFailed', 'Failed to create image blob')));
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
  const ctx = carrier.getContext('2d');
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
  const { data, width, height } = getCanvasData(carrier);

  let length = 0;
  let currentByte = 0;
  let bitIndex = 0;
  let bytesRead = 0;
  let payloadBytes: Uint8Array | null = null;

  for (let i = 0; i < data.length; i += 4) {
    if (payloadBytes && bytesRead >= length + 4) break;

    for (let c = 0; c < 3; c++) {
      if (payloadBytes && bytesRead >= length + 4) break;
      const bits = data[i + c] & 0x03;
      
      currentByte = (currentByte << 2) | bits;
      bitIndex += 2;

      if (bitIndex >= 8) {
        if (bytesRead < 4) {
          length = (length << 8) | currentByte;
        } else if (payloadBytes) {
          payloadBytes[bytesRead - 4] = currentByte;
        }
        
        bytesRead++;
        currentByte = 0;
        bitIndex = 0;

        if (bytesRead === 4) {
          const maxCapacity = (width * height * 6) / 8 - 4;
          if (length < 0 || length > maxCapacity) {
             throw new Error(i18next.t('errors.invalidPayloadLength', 'Invalid payload length detected'));
          }
          payloadBytes = new Uint8Array(length);
        }
      }
    }
  }

  if (!payloadBytes || bytesRead < length + 4) {
     throw new Error(i18next.t('errors.incompletePayload', 'Failed to extract complete payload'));
  }

  return reconstructString(payloadBytes);
};
