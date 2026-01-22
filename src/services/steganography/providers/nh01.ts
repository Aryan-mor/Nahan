import { AlgorithmMetadata, AlgorithmType } from '../types';
import { bitsToBytes, bytesToBits } from '../utils/bitManipulation';
import { BaseStegoProvider } from './baseProvider';

export class NH01Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH01;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH01,
      name: "Unicode Tags",
      description: "Uses Unicode Tag characters (U+E0000-U+E007F) to hide data after visible characters.",
      stealthLevel: 3,
      platform: 'desktop',
      requiresCoverText: true,
      supportsAutoDetect: true
    };
  }

  getCapacity(coverText: string): number {
    return this.calculateCapacity(coverText);
  }

  calculateCapacity(coverText: string): number {
    // 2 tags per char, 7 bits per tag. Result in bytes (div 8).
    return Math.floor((coverText.length * 2 * 7) / 8);
  }

  async encode(payload: Uint8Array, coverText?: string): Promise<string> {
    if (!coverText) throw new Error("Cover text is required for NH01");

    const payloadWithHeader = this.embedWithMagicHeader(payload);

    // Create length prefix (4 bytes)
    const lengthBuffer = new Uint8Array(4);
    new DataView(lengthBuffer.buffer).setUint32(0, payloadWithHeader.length, false); // Big Endian

    // Combine length + payload
    const dataToEncode = new Uint8Array(lengthBuffer.length + payloadWithHeader.length);
    dataToEncode.set(lengthBuffer);
    dataToEncode.set(payloadWithHeader, 4);

    const bits = bytesToBits(dataToEncode);

    // Pad bits to be divisible by 7
    while (bits.length % 7 !== 0) {
      bits.push(0);
    }

    const tags: string[] = [];
    for (let i = 0; i < bits.length; i += 7) {
      let value = 0;
      for (let j = 0; j < 7; j++) {
        value = (value << 1) | bits[i + j];
      }
      tags.push(String.fromCodePoint(0xE0000 + value));
    }

    let result = '';
    const visibleChars = [...coverText]; // Handle surrogate pairs
    let tagIndex = 0;

    for (const char of visibleChars) {
      result += char;
      // Inject 2 tags after each character if available
      for (let k = 0; k < 2 && tagIndex < tags.length; k++) {
        result += tags[tagIndex++];
      }
    }

    // Append remaining tags
    while (tagIndex < tags.length) {
      result += tags[tagIndex++];
    }

    return result;
  }

  async decode(stegoText: string): Promise<Uint8Array> {
    const chars = [...stegoText];
    const bits: number[] = [];

    for (const char of chars) {
      const codePoint = char.codePointAt(0);
      if (codePoint !== undefined && codePoint >= 0xE0000 && codePoint <= 0xE007F) {
        const value = codePoint - 0xE0000;
        // Extract 7 bits from value
        for (let j = 6; j >= 0; j--) {
          bits.push((value >> j) & 1);
        }
      }
    }

    const rawBytes = bitsToBytes(bits);

    if (rawBytes.length < 4) {
        throw new Error("Data too short to contain length header");
    }

    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const length = view.getUint32(0, false); // Big Endian

    if (rawBytes.length < 4 + length) {
        // It's possible the data is incomplete or corrupted, but we proceed with what we have
        // or throw. For now, let's verify if we have enough data.
        throw new Error("Data incomplete based on length header");
    }

    const payloadWithHeader = rawBytes.subarray(4, 4 + length);
    return this.extractWithMagicHeader(payloadWithHeader);
  }
}
