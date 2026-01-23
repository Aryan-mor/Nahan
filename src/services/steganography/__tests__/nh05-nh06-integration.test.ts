 
import { describe, expect, it } from 'vitest';
import { StegoFactory } from '../factory';
import { registerAllProviders } from '../providers/index';
import { NH05Provider } from '../providers/nh05';
import { NH06Provider } from '../providers/nh06';
import { AlgorithmType } from '../types';
import { LanguageDetector } from '../utils/languageDetector';

describe('NH05 and NH06 Basic Integration', () => {
  // Ensure providers are registered
  registerAllProviders();
  const factory = StegoFactory.getInstance();

  it('should retrieve NH05 and NH06 from factory', () => {
    const nh05 = factory.getProvider(AlgorithmType.NH05);
    const nh06 = factory.getProvider(AlgorithmType.NH06);
    expect(nh05).toBeInstanceOf(NH05Provider);
    expect(nh06).toBeInstanceOf(NH06Provider);
  });

  it('should fail gracefully (or produce garbage) when NH05 data decoded by NH06', async () => {
    const nh05 = new NH05Provider();
    const nh06 = new NH06Provider();
    const payload = new Uint8Array([1, 2, 3]);
    const coverText = new Array(50).fill("hello world").join(" ");

    const nh05Stego = await nh05.encode(payload, coverText);

    // NH06 will interpret NH05 data as Hybrid, resulting in corrupted bits (interleaved with 0s).
    // The Magic Header will likely be corrupted, causing extractWithMagicHeader to return raw garbage.
    // So we expect it NOT to equal the original payload.
    // Note: Ideally we want a clear error, but without strict header enforcement in BaseStegoProvider,
    // we fallback to raw data.
    const decoded = await nh06.decode(nh05Stego);
    expect(decoded).not.toEqual(payload);
  });
});

describe('NH05 and NH06 Language Detection', () => {
  it('should auto-detect Persian in encoding workflow', async () => {
    const nh05 = new NH05Provider();
    const payload = new Uint8Array([10]);
    const persianText = "سلام دنیا";
    const stegoPersian = await nh05.encode(payload, new Array(50).fill(persianText).join(" "));
    expect(stegoPersian).toMatch(/\u0640/); // Kashida
  });

  it('should auto-detect English in encoding workflow', async () => {
    const nh05 = new NH05Provider();
    const payload = new Uint8Array([10]);
    const englishText = "hello world";
    const stegoEnglish = await nh05.encode(payload, new Array(50).fill(englishText).join(" "));
    expect(stegoEnglish).not.toMatch(/\u0640/);
    const originalEnglish = new Array(50).fill(englishText).join(" ");
    expect(stegoEnglish).not.toBe(originalEnglish);
  });
});

describe('NH05 and NH06 Performance', () => {

  it('should benchmark performance for both algorithms', async () => {
    const nh05 = new NH05Provider();
    const nh06 = new NH06Provider();
    const payload = new Uint8Array(100).fill(1); // 100 bytes
    const coverText = new Array(500).fill("hello world").join(" "); // Large cover text

    const start05 = performance.now();
    await nh05.encode(payload, coverText);
    const end05 = performance.now();

    const start06 = performance.now();
    await nh06.encode(payload, coverText);
    const end06 = performance.now();

    // Benchmark logs removed for lint compatibility
    // NH05 Encode Time: ${end05 - start05}ms
    // NH06 Encode Time: ${end06 - start06}ms

    // Just ensure they finish in reasonable time (e.g. < 1000ms)
    expect(end05 - start05).toBeLessThan(1000);
    expect(end06 - start06).toBeLessThan(1000);
  });
});

describe('NH05 and NH06 Real-world Samples', () => {

  it('should handle real-world Persian poetry', async () => {
    const nh05 = new NH05Provider();
    const payload = new Uint8Array([1, 2, 3]);
    // Hafez poem snippet
    const poem = "ای که مهجوری عشاق روا می‌داری بندگان را ز بر خویش جدا می‌داری";
    const longPoem = new Array(20).fill(poem).join(" ");

    const stegoText = await nh05.encode(payload, longPoem);
    const decoded = await nh05.decode(stegoText);

    expect(decoded).toEqual(payload);
    expect(LanguageDetector.detectLanguage(stegoText)).toBe('fa');
  });

  it('should handle real-world English prose', async () => {
    const nh06 = new NH06Provider();
    const payload = new Uint8Array([1, 2, 3]);
    const prose = "The quick brown fox jumps over the lazy dog. It was the best of times, it was the worst of times.";
    const longProse = new Array(20).fill(prose).join(" ");

    const stegoText = await nh06.encode(payload, longProse);
    const decoded = await nh06.decode(stegoText);

    expect(decoded).toEqual(payload);
    expect(LanguageDetector.detectLanguage(stegoText)).toBe('en');
  });
});
