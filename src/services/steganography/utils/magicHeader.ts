import { AlgorithmType } from '../types';

export const MAGIC_HEADER_SIZE = 4;

/**
 * Embeds the algorithm ID into the payload as a 4-byte magic header.
 * Format: [N, H, 0, X] where X is the algorithm number.
 */
export function embedMagicHeader(algorithmId: AlgorithmType, payload: Uint8Array): Uint8Array {
  // algorithmId format is "NH0X"
  // We want to store it as bytes 'N', 'H', '0', 'X'

  if (!algorithmId.startsWith('NH0')) {
     throw new Error(`Invalid algorithm ID format: ${algorithmId}`);
  }

  const header = new Uint8Array(MAGIC_HEADER_SIZE);
  header[0] = 'N'.charCodeAt(0);
  header[1] = 'H'.charCodeAt(0);
  header[2] = '0'.charCodeAt(0);

  // Extract the last character (the number)
  // Assuming NH01-NH09, the last char is the number
  const algoNumChar = algorithmId.charAt(3);
  header[3] = algoNumChar.charCodeAt(0);

  const result = new Uint8Array(MAGIC_HEADER_SIZE + payload.length);
  result.set(header);
  result.set(payload, MAGIC_HEADER_SIZE);

  return result;
}

/**
 * Extracts the magic header and returns the algorithm ID and actual payload.
 * Returns null if the header is invalid.
 */
export function extractMagicHeader(payload: Uint8Array): { algorithmId: AlgorithmType | null; payload: Uint8Array } {
  if (payload.length < MAGIC_HEADER_SIZE) {
    return { algorithmId: null, payload };
  }

  // Check 'N', 'H', '0'
  if (
    payload[0] !== 'N'.charCodeAt(0) ||
    payload[1] !== 'H'.charCodeAt(0) ||
    payload[2] !== '0'.charCodeAt(0)
  ) {
    return { algorithmId: null, payload };
  }

  const algoNumChar = String.fromCharCode(payload[3]);
  const algoIdStr = `NH0${algoNumChar}`;

  // Verify it is a valid AlgorithmType
  // Quick check if it matches the pattern of a known algorithm type
  // In a stricter implementation iterating enum values would be safer,
  // but here we just reconstruct the string.

  // Check if the number is valid digit 1-9 (or at least 1-7 as per spec)
  // Check if the algorithm ID is a valid supported type
  const isValidAlgorithm = Object.values(AlgorithmType).includes(algoIdStr as AlgorithmType);

  if (!isValidAlgorithm) {
      return { algorithmId: null, payload };
  }

  const algorithmId = algoIdStr as AlgorithmType;
  const actualPayload = payload.slice(MAGIC_HEADER_SIZE);

  return { algorithmId, payload: actualPayload };
}
