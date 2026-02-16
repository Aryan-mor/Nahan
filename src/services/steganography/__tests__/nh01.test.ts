 
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllProviders } from '../providers';
import { NH01Provider } from '../providers/nh01';
import { AlgorithmType } from '../types';

describe('NH01Provider (Unicode Tags)', () => {
    let nh01Provider: NH01Provider;

    beforeAll(() => {
      registerAllProviders();
    });

    beforeEach(() => {
      nh01Provider = new NH01Provider();
    });

    it('should have correct metadata', () => {
      const metadata = nh01Provider.getMetadata();
      expect(metadata.id).toBe(AlgorithmType.NH01);
      expect(metadata.name).toBe('Unicode Tags');
      expect(metadata.stealthLevel).toBe(3);
      expect(metadata.requiresCoverText).toBe(true);
    });

    it('should encode and decode payload correctly', async () => {
      const payload = new Uint8Array([10, 20, 30, 40, 50]);
      const coverText = 'Hello World';

      const stegoText = await nh01Provider.encode(payload, coverText);
      expect(stegoText).not.toBe(coverText);
      expect(stegoText.length).toBeGreaterThan(coverText.length);

      const decoded = await nh01Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should inject tags after visible characters', async () => {
      const payload = new Uint8Array([0]);
      const coverText = 'A';

      const stegoText = await nh01Provider.encode(payload, coverText);
      expect(stegoText.startsWith('A')).toBe(true);
      const hasTags = [...stegoText].some((c) => {
        const cp = c.codePointAt(0) || 0;
        return cp >= 0xe0000 && cp <= 0xe007f;
      });
      expect(hasTags).toBe(true);
    });

    it('should append remaining tags if cover text is short', async () => {
      const payload = new Uint8Array(new Array(100).fill(1));
      const coverText = 'Hi';

      const stegoText = await nh01Provider.encode(payload, coverText);
      const decoded = await nh01Provider.decode(stegoText);

      expect(decoded.length).toBeGreaterThanOrEqual(100);
    });

    it('should throw if no cover text provided', async () => {
      await expect(nh01Provider.encode(new Uint8Array([1]))).rejects.toThrow();
    });
});


