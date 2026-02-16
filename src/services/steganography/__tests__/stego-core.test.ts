import { beforeAll, describe, expect, it } from 'vitest';
import { StegoFactory } from '../factory';
import { registerAllProviders } from '../providers';
import { NH01Provider } from '../providers/nh01';
import { NH02Provider } from '../providers/nh02';
import { NH03Provider } from '../providers/nh03';
import { NH04Provider } from '../providers/nh04';
import { NH07Provider } from '../providers/nh07';
import { AlgorithmType } from '../types';
import { embedMagicHeader, extractMagicHeader } from '../utils/magicHeader';

describe('Stego Architecture', () => {
  beforeAll(() => {
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

      expect(factory.getProvider(AlgorithmType.NH01)).toBeInstanceOf(NH01Provider);
      expect(factory.getProvider(AlgorithmType.NH02)).toBeInstanceOf(NH02Provider);
      expect(factory.getProvider(AlgorithmType.NH03)).toBeInstanceOf(NH03Provider);
      expect(factory.getProvider(AlgorithmType.NH04)).toBeInstanceOf(NH04Provider);
      expect(factory.getProvider(AlgorithmType.NH07)).toBeInstanceOf(NH07Provider);
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
});
