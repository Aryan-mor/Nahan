import { canSubstitute, isHomoglyph } from './homoglyphMap';

export class LanguageDetector {
  // Persian/Arabic Unicode ranges
  private static readonly PERSIAN_REGEX = /[\u0600-\u06FF\uFB50-\uFDFF]/;
  // Basic Latin range (0-127)
  private static readonly LATIN_REGEX = /[\x21-\x7E]/;

  // Non-connecting characters (left-side) in Persian
  // These characters do not connect to the following letter
  private static readonly NON_CONNECTING_CHARS = new Set([
    '\u0622', // Alef with Madda above
    '\u0627', // Alef
    '\u062F', // Dal
    '\u0630', // Thal
    '\u0631', // Ra
    '\u0632', // Zain
    '\u0698', // Zhe
    '\u0648', // Waw
    '\u0624', // Waw with Hamza above
    '\u0629', // Teh Marbuta
    '\u0649', // Alef Maksura
    '\u06C0', // He with Yeh above (sometimes) - sticking to main ones
    '\u06D5', // Ae (Uighur/Kurdish/Persian He) - behaves like He usually but let's be safe
  ]);

  static detectLanguage(text: string): 'fa' | 'en' | 'mixed' {
    if (!text) return 'mixed';

    let persianCount = 0;
    let latinCount = 0;
    let totalCount = 0;

    const normalizedText = text.toLowerCase().replace(/[\s\p{P}]/gu, '');
    for (const char of normalizedText) {
      if (this.isPersianCharacter(char)) {
        persianCount++;
        totalCount++;
      } else if (this.isLatinCharacter(char)) {
        latinCount++;
        totalCount++;
      }
    }

    if (totalCount === 0) return 'mixed';

    const persianPercentage = persianCount / totalCount;
    const latinPercentage = latinCount / totalCount;

    if (persianPercentage > 0.5) return 'fa';
    if (latinPercentage > 0.5) return 'en';

    return 'mixed';
  }

  static isPersianCharacter(char: string): boolean {
    return this.PERSIAN_REGEX.test(char);
  }

  static isLatinCharacter(char: string): boolean {
    return this.LATIN_REGEX.test(char) || isHomoglyph(char);
  }

  static getSubstitutableCharacters(text: string): number {
    let count = 0;
    for (const char of text) {
      if (canSubstitute(char)) {
        count++;
      }
    }
    return count;
  }

  static getKashidaInsertionPoints(text: string): number {
    let count = 0;
    for (let i = 0; i < text.length - 1; i++) {
      const current = text[i];
      const next = text[i + 1];

      if (this.isValidKashidaPosition(current, next)) {
        count++;
      }
    }
    return count;
  }

  static isValidKashidaPosition(current: string, next: string): boolean {
    // Check if both are Persian characters
    if (!this.isPersianCharacter(current) || !this.isPersianCharacter(next)) {
      return false;
    }

    // Check if current character connects to the left
    if (this.NON_CONNECTING_CHARS.has(current)) {
      return false;
    }

    // Exclude numbers
    if (current >= '\u06F0' && current <= '\u06F9') return false;
    if (next >= '\u06F0' && next <= '\u06F9') return false;

    // Exclude Persian punctuation that might be in the range but shouldn't have kashida
    // e.g. comma, semicolon, question mark
    // \u060C (comma), \u061B (semicolon), \u061F (question mark)
    if (current === '\u060C' || current === '\u061B' || current === '\u061F') return false;
    // Next char shouldn't be punctuation either usually
    if (next === '\u060C' || next === '\u061B' || next === '\u061F') return false;

    return true;
  }
}
