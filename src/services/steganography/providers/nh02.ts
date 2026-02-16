import { AlgorithmMetadata, AlgorithmType } from '../types';
import { bitsToBytes, bytesToBits } from '../utils/bitManipulation';
import { BaseStegoProvider } from './baseProvider';

export class NH02Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH02;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH02,
      name: "Zero Width Binary",
      description: "Uses ZWNJ/ZWJ characters hiding data between words for mobile compatibility.",
      stealthLevel: 4,
      platform: 'mobile',
      requiresCoverText: true,
      supportsAutoDetect: true
    };
  }

  getCapacity(coverText: string): number {
    return this.calculateCapacity(coverText);
  }

  calculateCapacity(coverText: string): number {
    // Count whitespace boundaries roughly
    const boundaries = coverText.split(/\s+/).length - 1;
    // 2 chars (bits) per boundary. Result in bytes.
    return Math.floor((boundaries * 2) / 8);
  }

  async encode(payload: Uint8Array, coverText?: string): Promise<string> {
    if (!coverText) throw new Error("Cover text is required for NH02");

    const payloadWithHeader = this.embedWithMagicHeader(payload);
    this.validatePayloadCapacity(payloadWithHeader, coverText);

    const bits = bytesToBits(payloadWithHeader);
    const chars = bits.map(b => b === 0 ? '\u200C' : '\u200D'); // ZWNJ=0, ZWJ=1

    // Split keeping delimiters to preserve exact spacing
    const parts = coverText.split(/(\s+)/);

    let result = '';
    let charIndex = 0;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        result += part;

        if (/\s+/.test(part)) {
             // Inject 2 chars if available
             for (let k = 0; k < 2 && charIndex < chars.length; k++) {
                 result += chars[charIndex++];
             }
        }
    }

    if (charIndex < chars.length) {
      throw new Error("Internal error: Failed to inject all data despite capacity check passing.");
    }

    return result;
  }

  private validatePayloadCapacity(payloadWithHeader: Uint8Array, coverText: string): void {
    const capacityBytes = this.calculateCapacity(coverText);
    if (payloadWithHeader.length > capacityBytes) {
      throw new Error(`Payload too large for cover text. Required: ${payloadWithHeader.length}B, Available: ${capacityBytes}B`);
    }
  }

  async decode(stegoText: string): Promise<Uint8Array> {
    const chars = [...stegoText];
    const bits: number[] = [];

    for (const char of chars) {
      if (char === '\u200C') {
        bits.push(0);
      } else if (char === '\u200D') {
        bits.push(1);
      }
    }

    const bytes = bitsToBytes(bits);
    return this.extractWithMagicHeader(bytes);
  }
}
