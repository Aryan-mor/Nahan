 
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllProviders } from '../providers';
import { NH02Provider } from '../providers/nh02';
import { AlgorithmType } from '../types';

describe('NH02Provider (Zero Width Binary iOS)', () => {
    let nh02Provider: NH02Provider;

    beforeAll(() => {
      registerAllProviders();
    });

    beforeEach(() => {
      nh02Provider = new NH02Provider();
    });

    it('should have correct metadata', () => {
      const metadata = nh02Provider.getMetadata();
      expect(metadata.id).toBe(AlgorithmType.NH02);
      expect(metadata.stealthLevel).toBe(4);
      expect(metadata.platform).toBe('mobile');
    });

    it('should encode and decode payload correctly', async () => {
      const payload = new Uint8Array([100, 200]);
      const coverText = new Array(40).fill('word').join(' ');

      const stegoText = await nh02Provider.encode(payload, coverText);
      const decoded = await nh02Provider.decode(stegoText);

      expect(decoded).toEqual(payload);
    });

    it('should inject characters only between words (after spaces)', async () => {
      const payload = new Uint8Array([1]);
      const coverText = new Array(30).fill('word').join(' ');
      const stegoText = await nh02Provider.encode(payload, coverText);

      const parts = stegoText.split(/[\u200C\u200D]+/);
      expect(parts.join('').trim()).toBe(coverText);

      const firstSpaceIndex = stegoText.indexOf(' ');
      if (firstSpaceIndex !== -1) {
        const segment = stegoText.substring(firstSpaceIndex, firstSpaceIndex + 20);
        expect(segment).toMatch(/^\s+[\u200C\u200D]*word/);
      }
    });

    it('should work with Persian text (preserve ligatures)', async () => {
      const payload = new Uint8Array([1, 2]);
      const coverText = new Array(35).fill('سلام').join(' ');

      const stegoText = await nh02Provider.encode(payload, coverText);
      const decoded = await nh02Provider.decode(stegoText);

      expect(decoded).toEqual(payload);

      const parts = stegoText.split(/[\u200C\u200D]+/);
      expect(parts.join('').trim()).toBe(coverText);
    });

    it('should throw if payload exceeds capacity', async () => {
      const payload = new Uint8Array(new Array(50).fill(1));
      const coverText = 'Just a few words';

      await expect(nh02Provider.encode(payload, coverText)).rejects.toThrow(/Payload too large/);
    });
});


