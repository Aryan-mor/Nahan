
import pako from 'pako';
import { describe, expect, it } from 'vitest';
import { camouflageService } from '../../src/services/camouflage';

// ============================================================================
// COPIED WORKER LOGIC (from src/workers/processing.worker.ts)
// ============================================================================

const TAG_PALETTE: readonly string[] = (() => {
  const tags: string[] = [];
  for (let i = 0; i < 32; i++) {
    tags.push(String.fromCodePoint(0xE0021 + i));
  }
  return tags as readonly string[];
})();

const TAG_REVERSE_MAP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  TAG_PALETTE.forEach((char, index) => {
    map[char] = index;
  });
  return map;
})();

const STEALTH_PREFIX_SIGNATURE = TAG_PALETTE[0] + TAG_PALETTE[15] + TAG_PALETTE[31];
const STEALTH_PREFIX_LENGTH = 3;

const CRC_TABLE = (() => {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

function workerDecodeFromZWC(text: string, lenient: boolean = false): Uint8Array {
  const tagChars = [...text].filter(char => TAG_REVERSE_MAP[char] !== undefined);

  if (tagChars.length === 0) {
    throw new Error('No valid camouflage data found - no Unicode Tags detected');
  }

  if (tagChars.length < STEALTH_PREFIX_LENGTH) {
    throw new Error('Message too short - missing prefix signature');
  }

  const prefix = tagChars.slice(0, STEALTH_PREFIX_LENGTH).join('');
  if (prefix !== STEALTH_PREFIX_SIGNATURE) {
    throw new Error('Invalid stealth message: prefix signature not found');
  }

  const dataTags = tagChars.slice(STEALTH_PREFIX_LENGTH);
  if (dataTags.length === 0) {
    throw new Error('No data after prefix signature');
  }

  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  for (let i = 0; i < dataTags.length; i++) {
    const value = TAG_REVERSE_MAP[dataTags[i]];
    if (value === undefined) {
      throw new Error('Invalid Tag character detected - possible corruption');
    }

    bitBuffer = (bitBuffer << 5) | value;
    bitCount += 5;

    while (bitCount >= 8) {
      const byte = (bitBuffer >>> (bitCount - 8)) & 0xff;
      bytes.push(byte);
      bitCount -= 8;
      bitBuffer = bitBuffer & ((1 << bitCount) - 1);
    }
  }

  const buffer = new Uint8Array(bytes);

  if (buffer.length < 4) {
    throw new Error('Data too short - checksum missing');
  }

  const dataLength = buffer.length - 4;
  const compressed = buffer.slice(0, dataLength);
  const checksumBytes = buffer.slice(dataLength);

  const storedChecksum =
    (checksumBytes[0] << 24) |
    (checksumBytes[1] << 16) |
    (checksumBytes[2] << 8) |
    checksumBytes[3];

  const calculatedChecksum = crc32(compressed);
  const checksumMatch = (storedChecksum >>> 0) === (calculatedChecksum >>> 0);

  if (!checksumMatch && !lenient) {
    throw new Error('Data corrupted during transmission.');
  }

  try {
    const decompressed = pako.inflate(compressed);
    return decompressed;
  } catch {
    throw new Error('Data corrupted during transmission (inflate failed).');
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Worker Logic Verification', () => {
    it('should correctly decode data encoded by CamouflageService', () => {
        const payload = new Uint8Array([1, 2, 3, 4, 5, 0x03, 0xFF]); // Mock protocol data
        const coverText = "This is a cover text intended to hide the data.";

        // Encode using the verified Service
        const encoded = camouflageService.embed(payload, coverText);

        // Decode using the duplicated Worker logic
        const decoded = workerDecodeFromZWC(encoded);

        expect(decoded).toEqual(payload);
    });

    it('should fail if checksum is invalid', () => {
        const payload = new Uint8Array([1, 2, 3]);
        const encoded = camouflageService.embed(payload, "cover");

        // Tamper with the encoded string (replace a tag with another valid tag)
        // We find the first tag char and shift it
        const tags = [...encoded].filter(c => TAG_REVERSE_MAP[c] !== undefined);
        const dataTagIndex = encoded.indexOf(tags[3]); // Skip prefix (3 tags)

        // Replace with a different tag
        const tampered = encoded.substring(0, dataTagIndex) + TAG_PALETTE[5] + encoded.substring(dataTagIndex + 1);

        expect(() => workerDecodeFromZWC(tampered)).toThrow();
    });

    it('should handle Multi-Contact ID protocol version 0x03', () => {
        // Mock a multi-contact packet: Version 0x03 + some data
        const payload = new Uint8Array([0x03, 10, 20, 30]);
        const encoded = camouflageService.embed(payload, "Multi-contact cover");

        const decoded = workerDecodeFromZWC(encoded);
        expect(decoded[0]).toBe(0x03);
        expect(decoded).toEqual(payload);
    });
});
