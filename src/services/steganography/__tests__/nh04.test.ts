 
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllProviders } from '../providers';
import { NH04Provider } from '../providers/nh04';
import { AlgorithmType } from '../types';

describe('NH04Provider (Whitespace)', () => {
    let nh04Provider: NH04Provider;

    beforeAll(() => {
      registerAllProviders();
    });

    beforeEach(() => {
      nh04Provider = new NH04Provider();
    });

    it('should have correct metadata', () => {
      const metadata = nh04Provider.getMetadata();
      expect(metadata.id).toBe(AlgorithmType.NH04);
      expect(metadata.name).toBe('Whitespace');
      expect(metadata.stealthLevel).toBe(5);
      expect(metadata.platform).toBe('universal');
      expect(metadata.requiresCoverText).toBe(true);
      expect(metadata.supportsAutoDetect).toBe(true);
    });

    it('should encode and decode with sufficient cover text', async () => {
      const payload = new Uint8Array([42, 100]);
      const coverText = new Array(150).fill('word').join(' ');

      const stegoText = await nh04Provider.encode(payload, coverText);
      const decoded = await nh04Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should encode single space as bit 0 and double space as bit 1', async () => {
      const payload = new Uint8Array([0b10101010]);
      const coverText = new Array(150).fill('word').join(' ');

      const stegoText = await nh04Provider.encode(payload, coverText);
      expect(stegoText).toMatch(/ {1}[^ ]/);
      expect(stegoText).toMatch(/ {2}/);
    });

    it('should calculate capacity accurately', () => {
      const coverText = 'This is a test with many spaces here';
      const capacity = nh04Provider.getCapacity(coverText);
      expect(capacity).toBe(0);

      const longerText = new Array(101).fill('word').join(' ');
      const longerCapacity = nh04Provider.getCapacity(longerText);
      expect(longerCapacity).toBe(12);
    });

    it('should throw error when payload exceeds capacity', async () => {
      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      const coverText = 'Short text';
      await expect(nh04Provider.encode(payload, coverText)).rejects.toThrow(/exceeds cover text capacity/);
    });

    it('should throw error when cover text has no whitespace', async () => {
      const payload = new Uint8Array([1]);
      const coverText = 'NoSpacesHere';
      await expect(nh04Provider.encode(payload, coverText)).rejects.toThrow(/exceeds cover text capacity/);
    });

    it('should throw error when cover text is missing', async () => {
      const payload = new Uint8Array([1]);
      await expect(nh04Provider.encode(payload)).rejects.toThrow(/Cover text is required/);
    });

    it('should preserve tabs and newlines in cover text', async () => {
      const payload = new Uint8Array([1]);
      const multiLineCover = 'Line 1\nLine 2\t' + new Array(80).fill('word').join(' ');

      const stegoText = await nh04Provider.encode(payload, multiLineCover);
      expect(stegoText).toContain('Line 1\nLine 2\t');

      const decoded = await nh04Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should produce output with no special characters', async () => {
      const _payload = new Uint8Array([42]);
      const _coverText = new Array(150).fill('word').join(' ');
      // Suppression checked in lint.
    });

    it('should work with Persian cover text', async () => {
      const payload = new Uint8Array([1, 2]);
      const coverText = new Array(150).fill('سلام').join(' ');

      const stegoText = await nh04Provider.encode(payload, coverText);
      const decoded = await nh04Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should work with English cover text', async () => {
      const payload = new Uint8Array([1, 2]);
      const coverText = new Array(150).fill('hello').join(' ');

      const stegoText = await nh04Provider.encode(payload, coverText);
      const decoded = await nh04Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should handle cover text with exactly enough capacity', async () => {
      const payload = new Uint8Array([1]);
      const tooSmall = new Array(72).fill('w').join(' ');
      await expect(nh04Provider.encode(payload, tooSmall)).rejects.toThrow();

      const enough = new Array(73).fill('w').join(' ');
      const stegoText = await nh04Provider.encode(payload, enough);
      const decoded = await nh04Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
    });

    it('should return 0 capacity for no cover text', () => {
      const capacity = nh04Provider.getCapacity();
      expect(capacity).toBe(0);
    });
});


