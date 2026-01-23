/**
 * Base122 Encoding/Decoding
 * 
 * NOTE: This module is now wrapped by NH07Provider.
 * Direct usage is discouraged. Please use StegoFactory.getProvider(AlgorithmType.NH07) instead.
 * 
 * Simplified implementation focusing on safety for messaging platforms.
 * Maps 7 bits to safe UTF-8 characters.
 * "Safe" characters are 1 byte. "Unsafe" characters are escaped to 2 bytes.
 */

const ILLEGAL_SET = new Set([
  0x00, // Null
  0x0a, // Newline
  0x0d, // CR
  0x22, // "
  0x26, // &
  0x3c, // <
  0x3e, // >
  0x5c, // \
]);

// Add control characters to illegal set (0x00-0x1f)
for (let i = 0; i < 32; i++) {
  ILLEGAL_SET.add(i);
}
ILLEGAL_SET.add(0x7f); // DEL

// Escape byte (we use a high-bit byte that starts a 2-byte sequence in UTF-8, but here we treat string as chars)
// Actually, since we return a JS string, we can just use a high ASCII char as escape.
// But we want the resulting string to be UTF-8 safe when serialized.
// We will use 0xC2 (194) as escape prefix, which is the start of Latin-1 Supplement in UTF-8.
const ESCAPE_PREFIX = 0xc2;
// We need to ensure the second byte is valid UTF-8 continuation?
// No, in JS string, we just have 16-bit units.
// But if we want "Base122 string" to be copy-pasteable, we should avoid invalid surrogates.
// Let's just use a simple mapping:
// 7-bit value -> char
// If safe -> String.fromCharCode(val)
// If unsafe -> String.fromCharCode(ESCAPE_PREFIX, 0x80 + val)
// This results in valid UTF-8 sequences (C2 80 .. C2 BF) which map to U+0080..U+00FF.
// These are printable-ish (Latin-1 Supplement).

export const encodeBase122 = (data: Uint8Array): string => {
  let bitBuffer = 0;
  let bitCount = 0;
  let result = '';

  for (let i = 0; i < data.length; i++) {
    bitBuffer = (bitBuffer << 8) | data[i];
    bitCount += 8;

    while (bitCount >= 7) {
      const val = (bitBuffer >>> (bitCount - 7)) & 0x7f;
      bitCount -= 7;

      if (ILLEGAL_SET.has(val)) {
        result += String.fromCharCode(ESCAPE_PREFIX);
        result += String.fromCharCode(0x80 + val);
      } else {
        result += String.fromCharCode(val);
      }
    }
  }

  // Handle remaining bits
  if (bitCount > 0) {
    const val = (bitBuffer << (7 - bitCount)) & 0x7f;
    if (ILLEGAL_SET.has(val)) {
      result += String.fromCharCode(ESCAPE_PREFIX);
      result += String.fromCharCode(0x80 + val);
    } else {
      result += String.fromCharCode(val);
    }
  }

  return result;
};

export const decodeBase122 = (str: string): Uint8Array => {
  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  for (let i = 0; i < str.length; i++) {
    let val = str.charCodeAt(i);

    if (val === ESCAPE_PREFIX) {
      // Next char is the value
      i++;
      if (i < str.length) {
        val = str.charCodeAt(i) - 0x80;
      } else {
        // Unexpected end
        break;
      }
    }

    // Add 7 bits
    bitBuffer = (bitBuffer << 7) | val;
    bitCount += 7;

    while (bitCount >= 8) {
      const byte = (bitBuffer >>> (bitCount - 8)) & 0xff;
      bytes.push(byte);
      bitCount -= 8;
    }
  }

  return new Uint8Array(bytes);
};
