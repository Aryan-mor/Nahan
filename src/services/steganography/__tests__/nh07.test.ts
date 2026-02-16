 
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeBase122 } from '../base122';
import { registerAllProviders } from '../providers';
import { NH07Provider } from '../providers/nh07';
import { AlgorithmType } from '../types';
import { extractMagicHeader } from '../utils/magicHeader';

describe('NH07Provider (Base122)', () => {
    let provider: NH07Provider;

    beforeAll(() => {
      registerAllProviders();
    });

    beforeEach(() => {
      provider = new NH07Provider();
    });

    it('should encode and decode payload correctly', async () => {
      const payload = new Uint8Array([1, 20, 30, 40, 50]);
      const stegoText = await provider.encode(payload);
      const decoded = await provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should embed magic header correctly', async () => {
      const payload = new Uint8Array([1, 2, 3]);
      const stegoText = await provider.encode(payload);
      const rawBytes = decodeBase122(stegoText);
      expect(rawBytes[0]).toBe('N'.charCodeAt(0));
      expect(rawBytes[1]).toBe('H'.charCodeAt(0));
      expect(rawBytes[2]).toBe('0'.charCodeAt(0));
      expect(rawBytes[3]).toBe('7'.charCodeAt(0));
      const extracted = extractMagicHeader(rawBytes);
      expect(extracted.algorithmId).toBe(AlgorithmType.NH07);
    });

    it('should handle large payloads (1MB)', async () => {
      const payload = new Uint8Array(1024 * 1024).fill(1);
      const stegoText = await provider.encode(payload);
      const decoded = await provider.decode(stegoText);
      expect(decoded).toEqual(payload);
      expect(stegoText.length).toBeGreaterThan(payload.length);
      expect(stegoText.length).toBeLessThan(payload.length * 2.5);
    }, 15000);

    it('should report correct capacity', () => {
      const capacity = provider.getCapacity();
      expect(capacity).toBe(10 * 1024 * 1024);
    });

    it('should have correct metadata', () => {
      const metadata = provider.getMetadata();
      expect(metadata.name).toBe('Base122');
      expect(metadata.stealthLevel).toBe(5);
    });
});


