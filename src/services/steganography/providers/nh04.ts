import { AlgorithmMetadata, AlgorithmType } from '../types';
import { bitsToBytes, bytesToBits } from '../utils/bitManipulation';
import { BaseStegoProvider } from './baseProvider';

export class NH04Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH04;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH04,
      name: "Whitespace",
      description: "Hides data by manipulating whitespace characters",
      stealthLevel: 5,
      platform: 'universal',
      requiresCoverText: true,
      supportsAutoDetect: true
    };
  }

  getCapacity(coverText?: string): number {
    if (!coverText) {
      return 0;
    }

    // Count sequences of spaces (U+0020)
    const matches = coverText.match(/ +/g);
    if (!matches) {
      return 0;
    }

    const spaceCount = matches.length;
    // Each space location = 1 bit. Result in bytes (floor).
    return Math.floor(spaceCount / 8);
  }

  async encode(payload: Uint8Array, coverText?: string): Promise<string> {
    if (!coverText) throw new Error('Cover text is required for NH04 encoding');
    const payloadWithHeader = this.embedWithMagicHeader(payload);
    const dataToEncode = this.prepareDataWithLength(payloadWithHeader);
    const grossCapacity = this.getCapacity(coverText);
    if (dataToEncode.length > grossCapacity) {
      throw new Error(`Payload size exceeds cover text capacity`);
    }

    const { bits } = this.encodeBitsInSpaces(coverText, bytesToBits(dataToEncode));
    return bits;
  }

  async decode(stegoText: string): Promise<Uint8Array> {
    const bits: number[] = [];

    // Scan through text character by character to detect whitespace sequences
    let i = 0;
    while (i < stegoText.length) {
      const char = stegoText[i];

      if (char === ' ') {
        // Check if next character is also a space
        if (i + 1 < stegoText.length && stegoText[i + 1] === ' ') {
          // Double space → bit 1
          bits.push(1);
          i += 2;

          // Skip any additional spaces in this cluster (they don't carry data)
          while (i < stegoText.length && stegoText[i] === ' ') {
            i++;
          }
        } else {
          // Single space → bit 0
          bits.push(0);
          i++;
        }
      } else {
        // Non-space character (including other whitespace like tabs/newlines), skip
        i++;
      }
    }

    const rawBytes = bitsToBytes(bits);
    if (rawBytes.length < 4) throw new Error("Data too short to contain length header");

    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const length = view.getUint32(0, false);
    if (rawBytes.length < 4 + length) throw new Error("Data incomplete based on length header");

    // Extract payload with header and verify
    const payloadWithHeader = new Uint8Array(rawBytes.buffer, rawBytes.byteOffset + 4, length);
    return this.extractWithMagicHeader(payloadWithHeader);
  }

  private encodeBitsInSpaces(coverText: string, bits: number[]): { bits: string } {
    const parts = coverText.split(/( +)/);
    let result = '';
    let bitIndex = 0;
    for (const part of parts) {
      if (/^ +$/.test(part) && bitIndex < bits.length) {
        result += bits[bitIndex++] === 0 ? ' ' : '  ';
      } else {
        result += part;
      }
    }
    if (bitIndex < bits.length) throw new Error("Insufficient whitespace");
    return { bits: result };
  }

  private prepareDataWithLength(payloadWithHeader: Uint8Array): Uint8Array {
    const lengthBuffer = new Uint8Array(4);
    new DataView(lengthBuffer.buffer).setUint32(0, payloadWithHeader.length, false);

    const dataToEncode = new Uint8Array(4 + payloadWithHeader.length);
    dataToEncode.set(lengthBuffer);
    dataToEncode.set(payloadWithHeader, 4);
    return dataToEncode;
  }
}
