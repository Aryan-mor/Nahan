import { AlgorithmMetadata, AlgorithmType } from '../types';
import { bitsToBytes, bytesToBits } from '../utils/bitManipulation';
import {
  canSubstitute,
  getHomoglyph,
  isHomoglyph
} from '../utils/homoglyphMap';
import { LanguageDetector } from '../utils/languageDetector';
import { BaseStegoProvider } from './baseProvider';

export class NH06Provider extends BaseStegoProvider {
  getAlgorithmId(): AlgorithmType {
    return AlgorithmType.NH06;
  }

  getMetadata(): AlgorithmMetadata {
    return {
      id: AlgorithmType.NH06,
      name: "Hybrid",
      description: "Combines whitespace and script-specific steganography",
      stealthLevel: 5,
      platform: 'universal',
      requiresCoverText: true,
      supportsAutoDetect: true
    };
  }

  getCapacity(coverText?: string): number {
    if (!coverText) return 0;

    // Space capacity (NH04)
    const spaceMatches = coverText.match(/ +/g);
    const spaceCapacityBits = spaceMatches ? spaceMatches.length : 0;

    // Script capacity (NH05)
    const language = LanguageDetector.detectLanguage(coverText);
    let scriptCapacityBits = 0;
    if (language === 'fa') {
      scriptCapacityBits = LanguageDetector.getKashidaInsertionPoints(coverText);
    } else if (language === 'en') {
      scriptCapacityBits = LanguageDetector.getSubstitutableCharacters(coverText);
    }

    // NH06 splits bits 1:1 between space and script channels.
    // The limiting factor is the channel with smaller capacity.
    // Total capacity = 2 * min(space, script)
    const minCapacity = Math.min(spaceCapacityBits, scriptCapacityBits);
    return Math.floor((minCapacity * 2) / 8);
  }

  async encode(payload: Uint8Array, coverText?: string): Promise<string> {
    if (!coverText) {
      throw new Error("Cover text is required for NH06");
    }

    const dataWithHeader = this.embedWithMagicHeader(payload);

    // Add length prefix (4 bytes)
    const lengthBuffer = new Uint8Array(4);
    new DataView(lengthBuffer.buffer).setUint32(0, dataWithHeader.length, false);

    const dataToEncode = new Uint8Array(4 + dataWithHeader.length);
    dataToEncode.set(lengthBuffer);
    dataToEncode.set(dataWithHeader, 4);

    const bits = bytesToBits(dataToEncode);

    const evenBits = bits.filter((_, i) => i % 2 === 0);
    const oddBits = bits.filter((_, i) => i % 2 !== 0);

    // Step 1: Encode even bits into spaces (NH04 logic)
    const spaceEncodedText = this.encodeSpaces(coverText, evenBits);

    // Step 2: Encode odd bits into script (NH05 logic)
    // Note: We use spaceEncodedText as input, so script encoding is applied on top of space encoding
    const finalEncodedText = this.encodeScript(spaceEncodedText, oddBits);

    return finalEncodedText;
  }

  async decode(stegoText: string): Promise<Uint8Array> {
    // Step 1: Extract bits from spaces (NH04 logic)
    const evenBits = this.decodeSpaces(stegoText);

    // Step 2: Extract bits from script (NH05 logic)
    const oddBits = this.decodeScript(stegoText);

    // Interleave bits
    const bits: number[] = [];

    let evenIndex = 0;
    let oddIndex = 0;

    // We expect evenBits to be equal to or 1 greater than oddBits
    // Interleave: Even, Odd, Even, Odd...
    while (evenIndex < evenBits.length || oddIndex < oddBits.length) {
      if (evenIndex < evenBits.length) {
        bits.push(evenBits[evenIndex++]);
      }
      if (oddIndex < oddBits.length) {
        bits.push(oddBits[oddIndex++]);
      }
    }

    const rawBytes = bitsToBytes(bits);
    if (rawBytes.length < 4) throw new Error("Data too short to contain length header");

    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const length = view.getUint32(0, false);
    if (rawBytes.length < 4 + length) throw new Error("Data incomplete based on length header");

    const payloadWithHeader = new Uint8Array(rawBytes.buffer, rawBytes.byteOffset + 4, length);
    return this.extractWithMagicHeader(payloadWithHeader);
  }

  // NH04 Logic Helpers
  private encodeSpaces(text: string, bits: number[]): string {
    const parts = text.split(/( +)/);
    let result = '';
    let bitIndex = 0;

    for (const part of parts) {
      if (/^ +$/.test(part)) {
        if (bitIndex < bits.length) {
          result += bits[bitIndex] === 0 ? ' ' : '  ';
          bitIndex++;
        } else {
          result += part;
        }
      } else {
        result += part;
      }
    }

    if (bitIndex < bits.length) {
       throw new Error(`Insufficient space capacity. Needed ${bits.length} bits, encoded ${bitIndex}.`);
    }
    return result;
  }

  private decodeSpaces(text: string): number[] {
    const bits: number[] = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] === ' ') {
        if (i + 1 < text.length && text[i + 1] === ' ') {
          bits.push(1);
          i += 2;
          while (i < text.length && text[i] === ' ') i++;
        } else {
          bits.push(0);
          i++;
        }
      } else {
        i++;
      }
    }
    return bits;
  }

  // NH05 Logic Helpers
  private encodeScript(text: string, bits: number[]): string {
    const language = LanguageDetector.detectLanguage(text);
    if (language === 'mixed') {
       throw new Error("Cannot determine dominant language for NH06 script encoding");
    }

    let encodedText = '';
    let bitIndex = 0;

    if (language === 'fa') {
      for (let i = 0; i < text.length; i++) {
        const current = text[i];
        encodedText += current;
        if (i < text.length - 1) {
          const next = text[i + 1];
          if (LanguageDetector.isValidKashidaPosition(current, next)) {
            if (bitIndex < bits.length) {
              const bit = bits[bitIndex];
              if (bit === 1) encodedText += '\u0640';
              bitIndex++;
            }
          }
        }
      }
    } else {
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (canSubstitute(char) && bitIndex < bits.length) {
          const bit = bits[bitIndex];
          if (bit === 1) encodedText += getHomoglyph(char);
          else encodedText += char;
          bitIndex++;
        } else {
          encodedText += char;
        }
      }
    }

    if (bitIndex < bits.length) {
      throw new Error(`Insufficient script capacity. Needed ${bits.length} bits, encoded ${bitIndex}.`);
    }
    return encodedText;
  }

  private decodeScript(text: string): number[] {
    const language = LanguageDetector.detectLanguage(text);
    const bits: number[] = [];

    if (language === 'fa') {
      for (let i = 0; i < text.length - 1; i++) {
        const current = text[i];
        const next = text[i + 1];
        if (next === '\u0640') {
           bits.push(1);
           i++;
        } else if (LanguageDetector.isValidKashidaPosition(current, next)) {
           bits.push(0);
        }
      }
    } else if (language === 'en') {
      for (const char of text) {
        if (isHomoglyph(char)) {
          bits.push(1);
        } else if (canSubstitute(char)) {
          bits.push(0);
        }
      }
    } else {
       throw new Error("Unable to detect language for NH06 script decoding");
    }
    return bits;
  }
}
