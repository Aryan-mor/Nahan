import { decodeBase122, encodeBase122 } from '../base122';
import { AlgorithmMetadata, AlgorithmType } from '../types';
import { BaseStegoProvider } from './baseProvider';

/**
 * NH07: Base122 Image Steganography
 * Wraps the legacy Base122 encoding used for image steganography.
 * High capacity, high stealth, but requires an image container (handled by service layer).
 */
export class NH07Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH07;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH07,
      name: "Base122",
      description: "Binary-to-text encoding for image steganography",
      stealthLevel: 5,
      platform: 'universal',
      requiresCoverText: false,
      supportsAutoDetect: false
    };
  }

  getCapacity(_coverText?: string): number {
    // Theoretical maximum, actual limit depends on image dimensions
    return 1024 * 1024 * 10; // 10MB default limit
  }

  async encode(payload: Uint8Array, _coverText?: string): Promise<string> {
    // Add magic header
    const payloadWithHeader = this.embedWithMagicHeader(payload);

    // Encode using existing Base122 implementation
    return encodeBase122(payloadWithHeader);
  }

  async decode(stegoText: string): Promise<Uint8Array> {
    // Decode using existing Base122 implementation
    const payloadWithHeader = decodeBase122(stegoText);

    // Validate and strip magic header
    return this.extractWithMagicHeader(payloadWithHeader);
  }
}
