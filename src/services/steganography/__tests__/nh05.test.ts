 
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllProviders } from '../providers';
import { NH05Provider } from '../providers/nh05';
import { AlgorithmType } from '../types';

describe('NH05Provider (Script Expert)', () => {
    let nh05Provider: NH05Provider;

    beforeAll(() => {
      registerAllProviders();
    });

    beforeEach(() => {
      nh05Provider = new NH05Provider();
    });

    it('should have correct metadata', () => {
      const metadata = nh05Provider.getMetadata();
      expect(metadata.id).toBe(AlgorithmType.NH05);
      expect(metadata.stealthLevel).toBe(4);
    });

    it('should encode and decode using Persian Kashida', async () => {
      const payload = new Uint8Array([10, 20]);
      const coverText = new Array(50).fill('سلام').join(' ');
      const stegoText = await nh05Provider.encode(payload, coverText);
      const decoded = await nh05Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
      expect(stegoText).toMatch(/\u0640/);
    });

    it('should encode and decode using English Homoglyphs', async () => {
      const payload = new Uint8Array([10, 20]);
      const longText = new Array(50).fill('hello world').join(' ');
      const stegoText = await nh05Provider.encode(payload, longText);
      const decoded = await nh05Provider.decode(stegoText);
      expect(decoded).toEqual(payload);
      expect(stegoText).not.toBe(longText);
    });

    it('should throw if payload exceeds capacity', async () => {
      const payload = new Uint8Array(100);
      const coverText = 'Short text';
      await expect(nh05Provider.encode(payload, coverText)).rejects.toThrow();
    });
});


