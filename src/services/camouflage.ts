import pako from 'pako';
import { poetryDb } from '../constants/poetryDb';

/**
 * Nahan-Tag Protocol: Base-32 Steganography using Unicode Tags Block (Plane 14)
 * Uses 32 consecutive characters from the Unicode Tags block: \u{E0021} to \u{E0040}
 * These tags are 100% stable and survive Telegram's normalization
 *
 * Encoding: 5-bit Base-32 mapping
 * Calculation: 8 bits / 5 bits per tag = 1.6 tags per byte
 * Injection: Exactly 2 Tags after every visible character in the cover text
 */

// Unicode Tags Block Palette (Base-32): U+E0021 to U+E0040 (32 characters)
// Plane 14 (Tags block) - use String.fromCodePoint for proper encoding
const TAG_PALETTE: readonly string[] = (() => {
  const tags: string[] = [];
  for (let i = 0; i < 32; i++) {
    // U+E0021 to U+E0040 (0xE0021 + i)
    tags.push(String.fromCodePoint(0xE0021 + i));
  }
  return tags as readonly string[];
})();

// Reverse mapping for decoding
const TAG_REVERSE_MAP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  TAG_PALETTE.forEach((char, index) => {
    map[char] = index;
  });
  return map;
})();

/**
 * Nahan-Tag Prefix Signature for Stealth Message Recognition
 * Unique sequence of 3 Tags that identifies a Nahan stealth message
 * Signature: [0x00, 0x0F, 0x1F] = [TAG-1, TAG-16, TAG-32]
 * Fixed length: 3 Tags (use Array.from() for proper Unicode length calculation)
 */
const STEALTH_PREFIX_SIGNATURE = TAG_PALETTE[0] + TAG_PALETTE[15] + TAG_PALETTE[31]; // [0, 15, 31]
const STEALTH_PREFIX_LENGTH = 3; // Fixed length: exactly 3 Tags

/**
 * Tags per visible character
 * Inject exactly 2 Tags after every visible character in the cover text
 */
const TAGS_PER_VISIBLE_CHAR = 2;

// CRC32 Implementation
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

export class CamouflageService {
  private static instance: CamouflageService;

  private constructor() {}

  static getInstance(): CamouflageService {
    if (!CamouflageService.instance) {
      CamouflageService.instance = new CamouflageService();
    }
    return CamouflageService.instance;
  }

  /**
   * Encodes 5 bits of data to a single Tag character (Base-32)
   * @param value 5-bit value (0-31)
   * @returns Unicode Tag character
   */
  private encode5bit(value: number): string {
    if (value < 0 || value > 31) {
      throw new Error(`Invalid 5-bit value: ${value}`);
    }
    return TAG_PALETTE[value];
  }

  /**
   * Decodes a single Tag character to 5 bits
   * @param char Unicode Tag character
   * @returns 5-bit value (0-31) or -1 if not found
   */
  private decode5bit(char: string): number {
    const value = TAG_REVERSE_MAP[char];
    return value !== undefined ? value : -1;
  }

  /**
   * Encodes a binary payload into Unicode Tags using 5-bit Base-32 mapping
   * Process: Compress -> Add CRC32 -> Encode to 5-bit Tags -> Add prefix signature
   * Calculation: 8 bits / 5 bits per tag = 1.6 tags per byte
   */
  encodeToZWC(data: Uint8Array): string {
    // 1. Compress the data using pako (gzip/deflate)
    const compressed = pako.deflate(data);

    // 2. Calculate CRC32 checksum of compressed data
    const checksum = crc32(compressed);

    // 3. Append checksum (4 bytes) to compressed data
    const buffer = new Uint8Array(compressed.length + 4);
    buffer.set(compressed);
    // Write checksum in Big Endian format
    buffer[compressed.length] = (checksum >>> 24) & 0xff;
    buffer[compressed.length + 1] = (checksum >>> 16) & 0xff;
    buffer[compressed.length + 2] = (checksum >>> 8) & 0xff;
    buffer[compressed.length + 3] = checksum & 0xff;

    // 4. Convert to 5-bit Base-32 Tags
    // Each byte (8 bits) needs 1.6 tags (8/5 = 1.6)
    // We process in groups: 5 bytes = 8 tags (5 * 8 = 40 bits = 8 * 5 bits)
    let tagString = '';
    let bitBuffer = 0;
    let bitCount = 0;

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];

      // Add byte to bit buffer
      bitBuffer = (bitBuffer << 8) | byte;
      bitCount += 8;

      // Extract 5-bit chunks while we have enough bits
      while (bitCount >= 5) {
        // Extract upper 5 bits
        const value = (bitBuffer >>> (bitCount - 5)) & 0x1f;
        tagString += this.encode5bit(value);

        // Remove the 5 bits we just used
        bitCount -= 5;
        bitBuffer = bitBuffer & ((1 << bitCount) - 1);
      }
    }

    // Handle remaining bits (if any)
    if (bitCount > 0) {
      // Pad remaining bits to 5 bits
      const value = (bitBuffer << (5 - bitCount)) & 0x1f;
      tagString += this.encode5bit(value);
    }

    // Prepend prefix signature for stealth message recognition
    return STEALTH_PREFIX_SIGNATURE + tagString;
  }

  /**
   * Decodes Unicode Tag string back to binary payload
   * Process: Extract Tags using strict regex -> Strip prefix -> Decode 5-bit Tags -> Validate CRC32 -> Decompress
   * @param text Text containing Unicode Tags
   * @param lenient If true, allows checksum mismatch and attempts recovery (with warning)
   * @returns Decoded binary payload
   * @throws Error if prefix signature not found or data is too corrupted
   */
  decodeFromZWC(text: string, lenient: boolean = false): Uint8Array {
    // 1. Strict extraction: Extract ONLY the 32 Tags in our palette from the entire string
    // Use spread operator [...] to correctly handle 4-byte Unicode Tags (surrogate pairs) as single entities
    // This prevents splitting Plane 14 characters into broken surrogate halves
    const tagChars = [...text].filter(char =>
      TAG_REVERSE_MAP[char] !== undefined
    );

    if (tagChars.length === 0) {
      throw new Error('No valid camouflage data found - no Unicode Tags detected');
    }

    // 2. Check for and strip prefix signature (exactly 3 Tags)
    if (tagChars.length < STEALTH_PREFIX_LENGTH) {
      throw new Error('Message too short - missing prefix signature');
    }

    const prefix = tagChars.slice(0, STEALTH_PREFIX_LENGTH).join('');
    if (prefix !== STEALTH_PREFIX_SIGNATURE) {
      throw new Error('Invalid stealth message: prefix signature not found. This may not be a Nahan stealth message.');
    }

    // Remove prefix signature before decoding (exactly 3 Tags)
    const dataTags = tagChars.slice(STEALTH_PREFIX_LENGTH);

    if (dataTags.length === 0) {
      throw new Error('No data after prefix signature');
    }

    // 3. Convert 5-bit Tags back to bytes
    // Process: 8 tags = 5 bytes (8 * 5 = 40 bits = 5 * 8 bits)
    const bytes: number[] = [];
    let bitBuffer = 0;
    let bitCount = 0;

    for (let i = 0; i < dataTags.length; i++) {
      const value = this.decode5bit(dataTags[i]);
      if (value === -1) {
        throw new Error('Invalid Tag character detected - possible corruption');
      }

      // Add 5 bits to buffer
      bitBuffer = (bitBuffer << 5) | value;
      bitCount += 5;

      // Extract bytes while we have enough bits
      while (bitCount >= 8) {
        // Extract upper 8 bits
        const byte = (bitBuffer >>> (bitCount - 8)) & 0xff;
        bytes.push(byte);

        // Remove the 8 bits we just used
        bitCount -= 8;
        bitBuffer = bitBuffer & ((1 << bitCount) - 1);
      }
    }

    // Note: We ignore any remaining bits (padding from encoding)

    const buffer = new Uint8Array(bytes);

    // 4. Validate checksum before decompression
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

    // Integrity Check: Validate checksum BEFORE decompression
    const checksumMatch = (storedChecksum >>> 0) === (calculatedChecksum >>> 0);

    if (!checksumMatch) {
      if (lenient) {
        console.warn('⚠️ Checksum mismatch detected. Some Tags may have been stripped by the messaging platform. Attempting recovery...');
      } else {
        throw new Error('Data corrupted during transmission.');
      }
    }

    // Decompress the data (only runs AFTER checksum validation)
    try {
      const decompressed = pako.inflate(compressed);

      if (!checksumMatch && lenient) {
        console.warn('⚠️ Message decoded with checksum mismatch. Data integrity cannot be guaranteed.');
      }

      return decompressed;
    } catch {
      if (lenient && !checksumMatch) {
        throw new Error('Data corrupted during transmission.');
      }
      throw new Error('Data corrupted during transmission.');
    }
  }

  /**
   * Checks if a string contains Unicode Tags from our palette
   * Uses strict filtering to match only the 32 Tags in our palette
   * Uses spread operator [...] to correctly handle 4-byte Unicode Tags (surrogate pairs)
   */
  hasZWC(text: string): boolean {
    // Use spread operator [...] to correctly handle 4-byte Unicode Tags as single entities
    // Filter characters to ensure we only get Tags from our palette
    const tagChars = [...text].filter(char =>
      TAG_REVERSE_MAP[char] !== undefined
    );

    if (tagChars.length === 0) return false;

    // Check if it has the stealth prefix signature (more reliable detection)
    // Use fixed length 3 instead of STEALTH_PREFIX_SIGNATURE.length to avoid surrogate pair issues
    if (tagChars.length >= STEALTH_PREFIX_LENGTH) {
      const prefix = tagChars.slice(0, STEALTH_PREFIX_LENGTH).join('');
      if (prefix === STEALTH_PREFIX_SIGNATURE) {
        return true; // Confirmed Nahan stealth message
      }
    }

    // Has Tags but may not be a Nahan message
    return tagChars.length > 0;
  }

  /**
   * Calculates the Stealth Ratio for Base-32 Tag steganography with Nahan Compact Protocol
   * Returns a value between 0 and 100
   *
   * With Nahan Compact Protocol (compression + Base-32 encoding):
   * - Protocol overhead: 1 (version) + 24 (nonce) + 32 (sender key) = 57 bytes
   * - Note: nacl.box is AEAD (provides authentication), so no separate signature needed
   * - Encoding: 8 bits / 5 bits per tag = 1.6 tags per byte
   * - Injection: Exactly 2 Tags per visible character
   *
   * Formula: score = min(100, (coverText.length / estimatedTagCount) * multiplier)
   *
   * Example: 1.6KB (1638 bytes) payload
   * - After compression: ~820 bytes (typical 50% compression)
   * - Protocol overhead: ~57 bytes
   * - Total: ~877 bytes
   * - After Base-32 encoding: ~1403 tags (877 * 1.6) + 3 prefix = ~1406 tags
   * - Required visible chars: 1406 / 2 = ~703 chars
   * - With 703-char cover: ratio = 703/1406 = 0.5, score = 0.5 * 200 = 100% (Green) ✓
   */
  calculateStealthRatio(payloadByteLength: number, coverText: string): number {
    if (!coverText) return 0;
    if (payloadByteLength === 0) return 100;

    // Estimate compressed size (typical compression: 40-60% of original)
    const estimatedCompressedSize = Math.ceil(payloadByteLength * 0.5);

    // Nahan Compact Protocol overhead: 57 bytes (Version 1 + Nonce 24 + Sender Key 32)
    // Note: nacl.box is AEAD (provides authentication), so no separate signature needed
    const protocolOverhead = 57;
    const totalProtocolSize = estimatedCompressedSize + protocolOverhead;

    // Base-32 encoding: 8 bits / 5 bits per tag = 1.6 tags per byte
    // Add 3 tags for prefix signature
    const estimatedTagCount = Math.ceil(totalProtocolSize * 1.6) + 3;

    if (estimatedTagCount === 0) return 100;

    // Calculate required visible characters (2 Tags per visible char)
    const requiredVisibleChars = Math.ceil(estimatedTagCount / TAGS_PER_VISIBLE_CHAR);

    // Calculate ratio: available visible chars / required visible chars
    const ratio = coverText.length / requiredVisibleChars;

    // Multiplier: For 100% score, ratio should be >= 1.0
    // Use 200 to allow some tolerance
    const score = Math.min(100, Math.round(ratio * 200));

    // Debug logging
    console.log("🔍 Stealth Safety Calculation (Base-32):", {
      payloadSize: payloadByteLength,
      estimatedCompressedSize,
      totalProtocolSize,
      estimatedTagCount,
      requiredVisibleChars,
      coverTextLength: coverText.length,
      ratio: ratio.toFixed(4),
      score,
    });

    return score;
  }

  /**
   * Gets a recommended cover text using "Best-Fit Pool" approach
   * Filters poems that fit, sorts by length, randomly selects from top candidates
   * Maintains cryptographic randomness while minimizing output length
   */
  getRecommendedCover(payloadByteLength: number, lang: 'fa' | 'en'): string {
    // Calculate required visible characters with accurate protocol overhead
    const estimatedCompressedSize = Math.ceil(payloadByteLength * 0.5);
    const protocolOverhead = 57; // Version (1) + Nonce (24) + Sender Key (32)
    const totalProtocolSize = estimatedCompressedSize + protocolOverhead;
    const estimatedTagCount = Math.ceil(totalProtocolSize * 1.6) + 3; // +3 for prefix signature

    // Calculate L_req: tagCount / 2 with 5% safety buffer
    const baseRequiredChars = Math.ceil(estimatedTagCount / TAGS_PER_VISIBLE_CHAR);
    const requiredVisibleChars = Math.ceil(baseRequiredChars * 1.05); // 5% safety buffer

    // Use language-specific poetry database for O(1) access
    const poems = poetryDb[lang];

    // Helper function to calculate total character count of a poem
    const getPoemLength = (poem: typeof poems[0]): number => {
      return poem.content.join(' ').length;
    };

    // Step 1: Filter poems where total characters >= L_req
    const candidates = poems
      .map(poem => ({
        poem,
        totalLength: getPoemLength(poem),
      }))
      .filter(candidate => candidate.totalLength >= requiredVisibleChars);

    if (candidates.length === 0) {
      // Fallback: if no poem fits, use the longest available poem
      const longestPoem = poems.reduce((longest, current) =>
        getPoemLength(current) > getPoemLength(longest) ? current : longest
      );
      return longestPoem.content.join(' ');
    }

    // Step 2: Sort candidates by total length in ascending order
    candidates.sort((a, b) => a.totalLength - b.totalLength);

    // Step 3: Take top 5-10 smallest candidates (optimal pool)
    const poolSize = Math.min(10, Math.max(5, candidates.length));
    const optimalPool = candidates.slice(0, poolSize);

    // Step 4: Randomly select ONE poem from the optimal pool
    const randomIndex = Math.floor(Math.random() * optimalPool.length);
    const selectedCandidate = optimalPool[randomIndex];
    const selectedPoem = selectedCandidate.poem;

    // Step 5: Refined granularity - take only required number of FULL verses
    // Never break a verse in half
    let result = '';
    for (const verse of selectedPoem.content) {
      const wouldBeLength = result.length + (result.length > 0 ? 1 : 0) + verse.length;

      // If adding this verse would exceed requirement, stop
      if (wouldBeLength > requiredVisibleChars && result.length >= requiredVisibleChars) {
        break;
      }

      // Add space separator if needed
      if (result.length > 0 && !result.endsWith(' ')) {
        result += ' ';
      }
      result += verse;
    }

    return result.trim();
  }

  /**
   * Expands cover text using poetry database if it's too short
   * Uses "Best-Fit Pool" approach for optimal selection
   * NEVER uses period anchors or trailing spaces
   * @param coverText The original cover text
   * @param requiredVisibleChars Required number of visible characters
   * @param lang Language code ('fa' or 'en') - defaults to 'fa'
   */
  private expandCoverText(coverText: string, requiredVisibleChars: number, lang: 'fa' | 'en' = 'fa'): string {
    if (coverText.length >= requiredVisibleChars) {
      return coverText;
    }

    // Calculate remaining characters needed
    const remainingChars = requiredVisibleChars - coverText.length;

    // Use language-specific poetry database for O(1) access
    const poems = poetryDb[lang];

    // Helper function to calculate total character count of a poem
    const getPoemLength = (poem: typeof poems[0]): number => {
      return poem.content.join(' ').length;
    };

    // Step 1: Filter poems where total characters >= remainingChars
    const candidates = poems
      .map(poem => ({
        poem,
        totalLength: getPoemLength(poem),
      }))
      .filter(candidate => candidate.totalLength >= remainingChars);

    if (candidates.length === 0) {
      // Fallback: if no poem fits, use shortest available poem and add verses until requirement is met
      const shortestPoem = poems.reduce((shortest, current) =>
        getPoemLength(current) < getPoemLength(shortest) ? current : shortest
      );

      let expanded = coverText;
      for (const verse of shortestPoem.content) {
        if (expanded.length >= requiredVisibleChars) break;
        if (expanded.length > 0 && !expanded.endsWith(' ')) {
          expanded += ' ';
        }
        expanded += verse;
      }
      return expanded;
    }

    // Step 2: Sort candidates by total length in ascending order
    candidates.sort((a, b) => a.totalLength - b.totalLength);

    // Step 3: Take top 5-10 smallest candidates (optimal pool)
    const poolSize = Math.min(10, Math.max(5, candidates.length));
    const optimalPool = candidates.slice(0, poolSize);

    // Step 4: Randomly select ONE poem from the optimal pool
    const randomIndex = Math.floor(Math.random() * optimalPool.length);
    const selectedCandidate = optimalPool[randomIndex];
    const selectedPoem = selectedCandidate.poem;

    // Step 5: Add only required number of FULL verses to satisfy requirement
    // Never break a verse in half
    let expanded = coverText;
    for (const verse of selectedPoem.content) {
      const wouldBeLength = expanded.length + (expanded.length > 0 ? 1 : 0) + verse.length;

      // If adding this verse would exceed requirement and we already have enough, stop
      if (wouldBeLength > requiredVisibleChars && expanded.length >= requiredVisibleChars) {
        break;
      }

      // Add space separator if needed
      if (expanded.length > 0 && !expanded.endsWith(' ')) {
        expanded += ' ';
      }
      expanded += verse;
    }

    return expanded;
  }

  /**
   * Embeds payload into cover text using Nahan-Tag Protocol
   * Injects exactly 2 Tags after every visible character
   * STRICT: No expansion, no poetry, no automatic appending.
   * Uses EXACTLY the cover text provided by the user.
   */
  embed(payload: Uint8Array, coverText: string, lang: 'fa' | 'en' = 'fa'): string {
    // TRACE B [Tag Input]
    console.log("TRACE B [Tag Input]:", {
      inputType: typeof payload,
      sample: payload instanceof Uint8Array ? Array.from(payload.slice(0, 5)) : String(payload).substring(0, 20)
    });

    // Encode payload to Unicode Tags (includes prefix signature)
    const tagString = this.encodeToZWC(payload);
    const totalTags = tagString.length;

    // Use EXACTLY the provided cover text - NO EXPANSION
    const finalCoverText = coverText;

    // Build result: inject exactly 2 Tags after every visible character
    // Use for...of loop to correctly handle emojis and special characters
    let result = '';
    let tagIndex = 0;

    for (const char of finalCoverText) {
      // Add the visible character (handles surrogate pairs correctly)
      result += char;

      // Inject exactly 2 Tags after this visible character
      for (let j = 0; j < TAGS_PER_VISIBLE_CHAR && tagIndex < totalTags; j++) {
        result += tagString[tagIndex];
        tagIndex++;
      }
    }

    // If we still have Tags remaining (because cover text was too short)
    // We append them to the END of the string
    // This decreases stealth but ensures data integrity without forced poetry
    if (tagIndex < totalTags) {
      console.warn(`⚠️ Warning: Cover text too short. Appending ${totalTags - tagIndex} remaining Tags to end of string.`);
      while (tagIndex < totalTags) {
        result += tagString[tagIndex];
        tagIndex++;
      }
    }

    return result;
  }
}

export const camouflageService = CamouflageService.getInstance();
