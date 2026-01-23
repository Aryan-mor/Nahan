import { AlgorithmMetadata, AlgorithmType } from '../types';
import { BaseStegoProvider } from './baseProvider';

// 16-emoji lookup table for 4-bit values (0-15)
const EMOJI_MAP = [
  '😀', '😊', '😂', '🤣', '😍', '😎', '🤔', '😴',
  '👍', '👎', '🖖', '🤝', '🎉', '🔥', '💯', '✨'
];

// Create reverse lookup map for decoding
const EMOJI_TO_VALUE = new Map<string, number>();
EMOJI_MAP.forEach((emoji, index) => {
  EMOJI_TO_VALUE.set(emoji, index);
  // Also map normalized versions if they differ (though 🖖 is single codepoint)
  const normalized = emoji.normalize('NFC');
  if (normalized !== emoji) {
    EMOJI_TO_VALUE.set(normalized, index);
  }
});

export class NH03Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH03;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH03,
      name: "Emoji Map",
      description: "Hides data within emoji sequences",
      stealthLevel: 2,
      platform: 'social',
      requiresCoverText: false,
      supportsAutoDetect: true
    };
  }

  getCapacity(_coverText?: string): number {
    // No cover text required - unlimited capacity
    return Number.MAX_SAFE_INTEGER;
  }

  async encode(payload: Uint8Array, _coverText?: string): Promise<string> {
    // Add magic header to payload
    const payloadWithHeader = this.embedWithMagicHeader(payload);

    // Convert bytes to emojis (each byte = 2 nibbles = 2 emojis)
    let result = '';
    for (const byte of payloadWithHeader) {
      // High nibble (upper 4 bits)
      const highNibble = (byte >> 4) & 0x0F;
      result += EMOJI_MAP[highNibble];

      // Low nibble (lower 4 bits)
      const lowNibble = byte & 0x0F;
      result += EMOJI_MAP[lowNibble];
    }

    return result;
  }

  async decode(stegoText: string): Promise<Uint8Array> {
    // Parse emoji sequence character by character
    const emojis: string[] = [];

    // Split by grapheme clusters to handle multi-codepoint emojis
    let segments: Iterable<{ segment: string }>;
    if (typeof Intl !== 'undefined' && (Intl as unknown as { Segmenter: { new (l: string, o: { granularity: string }): { segment: (t: string) => Iterable<{ segment: string }> } } }).Segmenter) {
      const Segmenter = (Intl as unknown as { Segmenter: { new (l: string, o: { granularity: string }): { segment: (t: string) => Iterable<{ segment: string }> } } }).Segmenter;
      const segmenter = new Segmenter('en', { granularity: 'grapheme' });
      segments = segmenter.segment(stegoText);
    } else {
      // Fallback for environments without Intl.Segmenter
      segments = Array.from(stegoText).map(char => ({ segment: char }));
    }

    for (const segment of segments) {
      const char = segment.segment;
      if (EMOJI_TO_VALUE.has(char)) {
        emojis.push(char);
      } else if (!/\s/.test(char)) {
        // As per plan: throw error on invalid emojis
        throw new Error(`Invalid character in emoji sequence: ${char}`);
      }
    }

    // Validate even number of emojis (each byte = 2 emojis)
    if (emojis.length % 2 !== 0) {
      throw new Error('Invalid emoji sequence: odd number of emojis');
    }

    // Convert emojis back to bytes
    const bytes: number[] = [];
    for (let i = 0; i < emojis.length; i += 2) {
      const highNibble = EMOJI_TO_VALUE.get(emojis[i])!;
      const lowNibble = EMOJI_TO_VALUE.get(emojis[i + 1])!;

      const byte = (highNibble << 4) | lowNibble;
      bytes.push(byte);
    }

    const payloadWithHeader = new Uint8Array(bytes);

    // Extract and verify magic header
    return this.extractWithMagicHeader(payloadWithHeader);
  }
}
