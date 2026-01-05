import { describe, it, expect } from 'vitest';
import { encodeBase122, decodeBase122 } from '../steganography/base122';

describe('Base122 Encoding', () => {
  it('should encode and decode simple string correctly', () => {
    const input = new TextEncoder().encode('Hello World');
    const encoded = encodeBase122(input);
    const decoded = decodeBase122(encoded);
    expect(new TextDecoder().decode(decoded)).toBe('Hello World');
  });

  it('should encode and decode binary data correctly', () => {
    // Create random binary data including "illegal" bytes
    const input = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      input[i] = i;
    }
    
    const encoded = encodeBase122(input);
    const decoded = decodeBase122(encoded);
    
    expect(decoded.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(decoded[i]).toBe(input[i]);
    }
  });

  it('should handle empty input', () => {
    const input = new Uint8Array(0);
    const encoded = encodeBase122(input);
    const decoded = decodeBase122(encoded);
    expect(decoded.length).toBe(0);
  });
});
