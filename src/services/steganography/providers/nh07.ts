import { decodeBase122, encodeBase122 } from '../base122';
import { AlgorithmMetadata, AlgorithmType } from '../types';
import { BaseStegoProvider } from './baseProvider';
import { extractMagicHeader } from '../utils/magicHeader';
import * as logger from '../../../utils/logger';

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

    // Manual Magic Header validation to handle legacy coincidence
    const { algorithmId, payload } = extractMagicHeader(payloadWithHeader);

    // If we detected NH07 header
    if (algorithmId === AlgorithmType.NH07) {
      // Validate that the payload looks like a valid encrypted message (Version 0x01 or 0x02)
      if (payload.length > 0) {
        const version = payload[0];
        if (version === 0x01 || version === 0x02) {
          // Valid version byte, so it's likely a real NH07 payload
          return payload;
        } else {
          // Header present but payload invalid.
          // Likely a coincidence in legacy random bytes.
          // Return ORIGINAL bytes (including what looked like header)
          logger.warn('NH07: Detected magic header but invalid payload version. Treating as legacy.');
          return payloadWithHeader;
        }
      }
    }

    // Use base class logic for other cases (no header or mismatch)
    // Note: extractWithMagicHeader handles "no header" by returning raw bytes
    // But if extractMagicHeader returned a mismatch ID (e.g. NH06), base class would throw.
    // Legacy payloads are random bytes, so they shouldn't match *any* header usually.
    // But to be safe, if we are here, we either have NO header, or a MISMATCH header.
    
    // If it was NH07, we handled it above.
    // If it is another header (e.g. NH06), extractWithMagicHeader will throw mismatch error.
    // Legacy data *could* theoretically start with NH06...
    // But user comment specifically worried about "NH07" coincidence.
    
    return this.extractWithMagicHeader(payloadWithHeader);
  }
}
