/* eslint-disable max-lines-per-function */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StegoFactory } from '../factory';
import { registerAllProviders } from '../providers';
import { NH01Provider } from '../providers/nh01';
import { NH02Provider } from '../providers/nh02';
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

  describe('NH01Provider (Unicode Tags)', () => {
    let provider: NH01Provider;

    beforeEach(() => {
        provider = new NH01Provider();
    });

    it('should have correct metadata', () => {
        const metadata = provider.getMetadata();
        expect(metadata.id).toBe(AlgorithmType.NH01);
        expect(metadata.name).toBe('Unicode Tags');
        expect(metadata.stealthLevel).toBe(3);
        expect(metadata.requiresCoverText).toBe(true);
    });

    it('should encode and decode payload correctly', async () => {
        const payload = new Uint8Array([10, 20, 30, 40, 50]);
        const coverText = "Hello World";

        const stegoText = await provider.encode(payload, coverText);
        expect(stegoText).not.toBe(coverText);
        expect(stegoText.length).toBeGreaterThan(coverText.length);

        const decoded = await provider.decode(stegoText);
        // NH01 is now lossless with length prefix
        expect(decoded).toEqual(payload);
    });

    it('should inject tags after visible characters', async () => {
        const payload = new Uint8Array([0]);
        const coverText = "A";
        // NH01 header + payload -> bytes.

        const stegoText = await provider.encode(payload, coverText);
        // "A" + tags
        expect(stegoText.startsWith('A')).toBe(true);
        // Should contain unicode tags
        const hasTags = [...stegoText].some(c => {
            const cp = c.codePointAt(0) || 0;
            return cp >= 0xE0000 && cp <= 0xE007F;
        });
        expect(hasTags).toBe(true);
    });

    it('should append remaining tags if cover text is short', async () => {
        const payload = new Uint8Array(new Array(100).fill(1)); // Large payload
        const coverText = "Hi";

        const stegoText = await provider.encode(payload, coverText);
        const decoded = await provider.decode(stegoText);

        expect(decoded.length).toBeGreaterThanOrEqual(100);
    });

    it('should throw if no cover text provided', async () => {
        await expect(provider.encode(new Uint8Array([1]))).rejects.toThrow();
    });
  });

  describe('NH02Provider (Zero Width Binary iOS)', () => {
    let provider: NH02Provider;

    beforeEach(() => {
        provider = new NH02Provider();
    });

    it('should have correct metadata', () => {
        const metadata = provider.getMetadata();
        expect(metadata.id).toBe(AlgorithmType.NH02);
        expect(metadata.stealthLevel).toBe(4);
        expect(metadata.platform).toBe('mobile');
    });

    it('should encode and decode payload correctly', async () => {
        const payload = new Uint8Array([100, 200]);
        // Need sufficient capacity.
        // Payload: 2 bytes + 6 bytes headers -> 8 bytes -> 64 bits.
        // NH02: 2 bits per word boundary.
        // Need 32 boundaries.
        const coverText = new Array(40).fill("word").join(" ");

        const stegoText = await provider.encode(payload, coverText);
        const decoded = await provider.decode(stegoText);

        expect(decoded).toEqual(payload);
    });

    it('should inject characters only between words (after spaces)', async () => {
        const payload = new Uint8Array([1]);
        // Overhead ~6 bytes. Payload 1 byte. Total 7 bytes -> 56 bits.
        // Need 28 boundaries.
        const coverText = new Array(30).fill("word").join(" ");
        const stegoText = await provider.encode(payload, coverText);

        const parts = stegoText.split(/[\u200C\u200D]+/);
        // Verify reconstruction matches cover text (ignoring that split removes the chars)
        expect(parts.join('').trim()).toBe(coverText);

        // Verify position manually
        // Should not find ZWNJ inside "word"
        const firstSpaceIndex = stegoText.indexOf(" ");
        if (firstSpaceIndex !== -1) {
            // Check segment around space
            // "word " + invisible + "word"
             const segment = stegoText.substring(firstSpaceIndex, firstSpaceIndex + 20);
             // Should start with space, then invisible chars, then 'w'
             expect(segment).toMatch(/^\s+[\u200C\u200D]*word/);
        }
    });

    it('should work with Persian text (preserve ligatures)', async () => {
        const payload = new Uint8Array([1, 2]);
        // Need capacity. Payload 2+6=8 bytes -> 64 bits/2 = 32 boundaries
        const coverText = new Array(35).fill("سلام").join(" ");

        const stegoText = await provider.encode(payload, coverText);
        const decoded = await provider.decode(stegoText);

        expect(decoded).toEqual(payload);

        // Verify injection location
        const parts = stegoText.split(/[\u200C\u200D]+/);
        expect(parts.join('').trim()).toBe(coverText);
    });

    it('should throw if payload exceeds capacity', async () => {
        const payload = new Uint8Array(new Array(50).fill(1));
        const coverText = "Just a few words"; // Low capacity

        await expect(provider.encode(payload, coverText)).rejects.toThrow(/Payload too large/);
    });
  });

  describe('NH07Provider (Base122)', () => {
    let provider: NH07Provider;

    beforeEach(() => {
        provider = new NH07Provider();
    });

    it('should encode and decode payload correctly', async () => {
        const payload = new Uint8Array([10, 20, 30, 40, 50]);
        const stegoText = await provider.encode(payload);
        const decoded = await provider.decode(stegoText);
        expect(decoded).toEqual(payload);
    });
  });
});
