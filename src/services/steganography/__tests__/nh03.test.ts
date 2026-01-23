 
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllProviders } from '../providers';
import { NH03Provider } from '../providers/nh03';
import { AlgorithmType } from '../types';

describe('NH03Provider (Emoji Map)', () => {
    let nh03Provider: NH03Provider;

    beforeAll(() => {
      registerAllProviders();
    });

    beforeEach(() => {
      nh03Provider = new NH03Provider();
    });

    it('should have correct metadata', () => {
      const metadata = nh03Provider.getMetadata();
      expect(metadata.id).toBe(AlgorithmType.NH03);
      expect(metadata.name).toBe('Emoji Map');
      expect(metadata.stealthLevel).toBe(2);
      expect(metadata.platform).toBe('social');
      expect(metadata.requiresCoverText).toBe(false);
      expect(metadata.supportsAutoDetect).toBe(true);
    });

    it('should encode and decode 1 byte payload', async () => {
      const payload = new Uint8Array([42]);
      const stegoText = await nh03Provider.encode(payload);
      const decoded = await nh03Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should encode and decode 10 byte payload', async () => {
      const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const stegoText = await nh03Provider.encode(payload);
      const decoded = await nh03Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should encode and decode 100 byte payload', async () => {
      const payload = new Uint8Array(100).fill(0).map((_, i) => i % 256);
      const stegoText = await nh03Provider.encode(payload);
      const decoded = await nh03Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should output only valid emojis from EMOJI_MAP', async () => {
      const payload = new Uint8Array([1, 2, 3]);
      const stegoText = await nh03Provider.encode(payload);

      const validEmojis = [
        '😀', '😊', '😂', '🤣', '😍', '😎', '🤔', '😴',
        '👍', '👎', '🖖', '🤝', '🎉', '🔥', '💯', '✨',
      ];

      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
      const segments = segmenter.segment(stegoText);

      for (const segment of segments) {
        expect(validEmojis).toContain(segment.segment);
      }
    });

    it('should output correct emoji count (payload + header) * 2', async () => {
      const payload = new Uint8Array([1, 2, 3]);
      const stegoText = await nh03Provider.encode(payload);

      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
      const segments = Array.from(segmenter.segment(stegoText));

      expect(segments.length).toBe((payload.length + 4) * 2);
    });

    it('should throw error when decoding invalid emojis', async () => {
      const invalidText = 'Hello 🌟 World';
      await expect(nh03Provider.decode(invalidText)).rejects.toThrow();
    });

    it('should handle empty payload', async () => {
      const payload = new Uint8Array([]);
      const stegoText = await nh03Provider.encode(payload);
      const decoded = await nh03Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should handle large payload (1KB) for social media', async () => {
      const payload = new Uint8Array(1024).fill(0).map((_, i) => i % 256);
      const stegoText = await nh03Provider.encode(payload);
      const decoded = await nh03Provider.decode(stegoText);
      expect(decoded).toEqual(payload);

      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
      const segments = Array.from(segmenter.segment(stegoText));
      expect(segments.length).toBe(2056);
    });

    it('should have unlimited capacity', () => {
      const capacity = nh03Provider.getCapacity();
      expect(capacity).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should fall back when Intl.Segmenter is unavailable', async () => {
      const payload = new Uint8Array([1, 2, 3]);
      const stegoText = await nh03Provider.encode(payload);

      // Mock missing Intl.Segmenter
      const originalSegmenter = (Intl as unknown as { Segmenter: unknown }).Segmenter;
      (Intl as unknown as { Segmenter: unknown }).Segmenter = undefined;

      try {
        const decoded = await nh03Provider.decode(stegoText);
        expect(decoded).toEqual(payload);
      } finally {
        (Intl as unknown as { Segmenter: unknown }).Segmenter = originalSegmenter;
      }
    });
});


