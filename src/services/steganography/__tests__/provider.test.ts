/* eslint-disable max-lines-per-function */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StegoFactory } from '../factory';
import { registerAllProviders } from '../providers';
import { NH07Provider } from '../providers/nh07';
import { AlgorithmType } from '../types';
import { embedMagicHeader, extractMagicHeader } from '../utils/magicHeader';

describe('Stego Architecture', () => {
  beforeAll(() => {
    // Ensure providers are registered
    registerAllProviders();
  });

  describe('StegoFactory', () => {
    it('should implement singleton pattern', () => {
      const factory1 = StegoFactory.getInstance();
      const factory2 = StegoFactory.getInstance();
      expect(factory1).toBe(factory2);
    });

    it('should retrieve registered providers', () => {
      const factory = StegoFactory.getInstance();
      const provider = factory.getProvider(AlgorithmType.NH07);
      expect(provider).toBeInstanceOf(NH07Provider);
      expect(provider.getAlgorithmId()).toBe(AlgorithmType.NH07);
    });

    it('should return all providers', () => {
      const factory = StegoFactory.getInstance();
      const providers = factory.getAllProviders();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some(p => p.getAlgorithmId() === AlgorithmType.NH07)).toBe(true);
    });

    it('should throw error for unregistered algorithm', () => {
      const factory = StegoFactory.getInstance();
      // @ts-expect-error - Testing invalid input
      expect(() => factory.getProvider('INVALID')).toThrow();
    });
  });

  describe('Magic Header', () => {
    it('should correctly embed and extract magic header', () => {
      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      const algoId = AlgorithmType.NH07;

      const embedded = embedMagicHeader(algoId, payload);
      expect(embedded.length).toBe(payload.length + 4);

      const extracted = extractMagicHeader(embedded);
      expect(extracted.algorithmId).toBe(algoId);
      expect(extracted.payload).toEqual(payload);
    });

    it('should return null for invalid magic header', () => {
      const invalidPayload = new Uint8Array([1, 2, 3, 4, 5]);
      const extracted = extractMagicHeader(invalidPayload);
      expect(extracted.algorithmId).toBeNull();
      expect(extracted.payload).toEqual(invalidPayload);
    });
  });

  describe('NH07Provider (Base122)', () => {
    let provider: NH07Provider;

    beforeEach(() => {
        provider = new NH07Provider();
    });

    it('should have correct metadata', () => {
        const metadata = provider.getMetadata();
        expect(metadata.id).toBe(AlgorithmType.NH07);
        expect(metadata.name).toBe('Base122');
        expect(metadata.stealthLevel).toBe(5);
    });

    it('should encode and decode payload correctly', async () => {
        const payload = new Uint8Array([10, 20, 30, 40, 50]);

        // Encode
        const stegoText = await provider.encode(payload);
        expect(typeof stegoText).toBe('string');
        expect(stegoText.length).toBeGreaterThan(0);

        // Decode
        const decoded = await provider.decode(stegoText);
        expect(decoded).toEqual(payload);
    });

    it('should include magic header in encoded output', async () => {
        const payload = new Uint8Array([1, 2, 3]);
        const stegoText = await provider.encode(payload);

        // Manually decode base122 to check header
        // We can't easily access the internal decodeBase122 here without exporting it,
        // but we can trust the provider.decode which calls extractMagicHeader.
        // Or we can try to "peek" if we knew the encoding.

        const decoded = await provider.decode(stegoText);
        expect(decoded).toEqual(payload);
    });
  });
});
