 
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllProviders } from '../providers';
import { NH06Provider } from '../providers/nh06';
import { AlgorithmType } from '../types';

describe('NH06Provider (Hybrid)', () => {
    let nh06Provider: NH06Provider;

    beforeAll(() => {
      registerAllProviders();
    });

    beforeEach(() => {
      nh06Provider = new NH06Provider();
    });

    it('should have correct metadata', () => {
      const metadata = nh06Provider.getMetadata();
      expect(metadata.id).toBe(AlgorithmType.NH06);
      expect(metadata.stealthLevel).toBe(5);
    });

    it('should encode and decode using Hybrid method', async () => {
      const payload = new Uint8Array([1, 2, 3]);
      const coverText = new Array(100).fill('hello').join(' ');
      const stegoText = await nh06Provider.encode(payload, coverText);
      const decoded = await nh06Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should utilize both spaces and script', async () => {
      const payload = new Uint8Array([0xff]);
      const coverText = new Array(50).fill('hello').join(' ');
      const stegoText = await nh06Provider.encode(payload, coverText);
      expect(stegoText).toMatch(/ {2}/);
      let hasHomoglyph = false;
      for (const char of stegoText) {
        if (char.charCodeAt(0) > 255) {
          hasHomoglyph = true;
          break;
        }
      }
      expect(hasHomoglyph).toBe(true);
    });

    it('should encode and decode using Hybrid method with Persian text', async () => {
      const payload = new Uint8Array([1, 2, 3]);
      const coverText = new Array(100).fill('سلام دنیا').join(' ');
      const stegoText = await nh06Provider.encode(payload, coverText);
      const decoded = await nh06Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
      expect(stegoText).toMatch(/\u0640/);
    });
});


