import { AlgorithmMetadata, AlgorithmType } from '../types';
import { bitsToBytes, bytesToBits } from '../utils/bitManipulation';
import { canSubstitute, getHomoglyph, isHomoglyph } from '../utils/homoglyphMap';
import { LanguageDetector } from '../utils/languageDetector';
import { BaseStegoProvider } from './baseProvider';

export class NH05Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH05;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH05,
      name: 'Script Expert',
      description: 'Language-specific steganography (e.g., Persian kashida)',
      stealthLevel: 4,
      platform: 'universal',
      requiresCoverText: true,
      supportsAutoDetect: true,
    };
  }

  getCapacity(coverText?: string): number {
    if (!coverText) return 0;

    const language = LanguageDetector.detectLanguage(coverText);

    if (language === 'fa') {
      const insertionPoints = LanguageDetector.getKashidaInsertionPoints(coverText);
      return Math.floor(insertionPoints / 8);
    } else if (language === 'en') {
      const substitutable = LanguageDetector.getSubstitutableCharacters(coverText);
      return Math.floor(substitutable / 8);
    }

    return 0;
  }

  async encode(payload: Uint8Array, coverText?: string): Promise<string> {
    if (!coverText) {
      throw new Error('Cover text is required for NH05');
    }

    const language = LanguageDetector.detectLanguage(coverText);
    if (language === 'mixed') {
      throw new Error('Cannot determine dominant language for NH05 encoding');
    }

    const dataWithHeader = this.embedWithMagicHeader(payload);

    // Add length prefix (4 bytes)
    const lengthBuffer = new Uint8Array(4);
    new DataView(lengthBuffer.buffer).setUint32(0, dataWithHeader.length, false);

    const dataToEncode = new Uint8Array(4 + dataWithHeader.length);
    dataToEncode.set(lengthBuffer);
    dataToEncode.set(dataWithHeader, 4);

    const bits = bytesToBits(dataToEncode);

    let encodedText = '';
    let bitIndex = 0;

    if (language === 'fa') {
      const { encodedText: faText, bitIndex: faIndex } = this.encodePersian(coverText, bits, bitIndex);
      encodedText = faText;
      bitIndex = faIndex;
    } else {
      const { encodedText: enText, bitIndex: enIndex } = this.encodeEnglish(coverText, bits, bitIndex);
      encodedText = enText;
      bitIndex = enIndex;
    }

    if (bitIndex < bits.length) {
      throw new Error(
        `Insufficient capacity in cover text. Needed ${bits.length} bits, encoded ${bitIndex} bits.`,
      );
    }

    return encodedText;
  }

  async decode(stegoText: string): Promise<Uint8Array> {
    const language = LanguageDetector.detectLanguage(stegoText);
    const bits: number[] = [];

    if (language === 'fa') {
      // Persian Decoding
      for (let i = 0; i < stegoText.length - 1; i++) {
        const current = stegoText[i];
        const next = stegoText[i + 1];

        if (next === '\u0640') {
          // Found Kashida -> Bit 1
          bits.push(1);
          i++; // Skip the Kashida so next iteration starts after it
        } else if (LanguageDetector.isValidKashidaPosition(current, next)) {
          // Valid position but no Kashida -> Bit 0
          bits.push(0);
        }
      }
    } else if (language === 'en') {
      // English Decoding
      for (const char of stegoText) {
        if (isHomoglyph(char)) {
          bits.push(1);
        } else if (canSubstitute(char)) {
          bits.push(0);
        }
      }
    } else {
      throw new Error('Unable to detect language for NH05 decoding');
    }

    const rawBytes = bitsToBytes(bits);

    if (rawBytes.length < 4) {
      throw new Error('Data too short to contain length header');
    }

    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const length = view.getUint32(0, false);

    if (rawBytes.length < 4 + length) {
      throw new Error('Data incomplete based on length header');
    }

    const payloadWithHeader = new Uint8Array(rawBytes.buffer, rawBytes.byteOffset + 4, length);
    return this.extractWithMagicHeader(payloadWithHeader);
  }

  private encodePersian(coverText: string, bits: number[], bitIndex: number): { encodedText: string; bitIndex: number } {
    let encodedText = '';
    let currentBitIndex = bitIndex;
    for (let i = 0; i < coverText.length; i++) {
        const current = coverText[i];
        encodedText += current;
        if (i < coverText.length - 1) {
          const next = coverText[i + 1];
          if (LanguageDetector.isValidKashidaPosition(current, next) && currentBitIndex < bits.length) {
            if (bits[currentBitIndex] === 1) encodedText += '\u0640';
            currentBitIndex++;
          }
        }
    }
    return { encodedText, bitIndex: currentBitIndex };
  }

  private encodeEnglish(coverText: string, bits: number[], bitIndex: number): { encodedText: string; bitIndex: number } {
    let encodedText = '';
    let currentBitIndex = bitIndex;
    for (const char of coverText) {
      if (canSubstitute(char) && currentBitIndex < bits.length) {
        encodedText += bits[currentBitIndex] === 1 ? getHomoglyph(char) : char;
        currentBitIndex++;
      } else {
        encodedText += char;
      }
    }
    return { encodedText, bitIndex: currentBitIndex };
  }
}
