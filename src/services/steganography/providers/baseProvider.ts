import { AlgorithmMetadata, AlgorithmType, StegoProvider } from '../types';
import { embedMagicHeader, extractMagicHeader } from '../utils/magicHeader';

export abstract class BaseStegoProvider implements StegoProvider {
  /**
   * Embeds the magic header for this algorithm into the payload
   */
  protected embedWithMagicHeader(payload: Uint8Array): Uint8Array {
    return embedMagicHeader(this.getAlgorithmId(), payload);
  }

  /**
   * Extracts the payload and verifies the magic header matches this algorithm
   */
  protected extractWithMagicHeader(payload: Uint8Array): Uint8Array {
    const { algorithmId, payload: actualPayload } = extractMagicHeader(payload);

    // If we found a header, it MUST match this provider's algorithm
    if (algorithmId && algorithmId !== this.getAlgorithmId()) {
       throw new Error(`Algorithm mismatch: Data encoded with ${algorithmId} cannot be decoded by ${this.getAlgorithmId()}`);
    }

    // If no header found, return the payload as-is (legacy support or raw data)
    // Strict validation requires header, but for robustness we allow fallback if header is missing
    if (!algorithmId) {
      return actualPayload;
    }

    return actualPayload;

    return actualPayload;
  }

  protected validatePayloadSize(payload: Uint8Array, maxSize: number): void {
    if (payload.length > maxSize) {
      throw new Error(`Payload size ${payload.length} bytes exceeds capacity of ${maxSize} bytes`);
    }
  }

  abstract encode(payload: Uint8Array, coverText?: string): Promise<string>;
  abstract decode(stegoText: string): Promise<Uint8Array>;
  abstract getAlgorithmId(): AlgorithmType;
  abstract getCapacity(coverText?: string): number;
  abstract getMetadata(): AlgorithmMetadata;
}
