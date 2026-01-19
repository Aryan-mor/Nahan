/* eslint-disable max-lines-per-function, max-lines, no-console */
/**
 * Processing Worker - Handles all CPU-intensive input analysis off the main thread.
 * This keeps the main thread at 60fps during clipboard/message processing.
 *
 * Implements the "Pure Worker Rule": Zero main-thread regex, ZWC scanning, or key parsing.
 */

import pako from 'pako';

const ctx: Worker = self as unknown as Worker;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface WorkerMessage {
  id: string;
  type: string;
  payload: unknown;
}

interface WorkerResponse {
  result: unknown;
  transferList: Transferable[];
}

/**
 * Result of analyzing input for Nahan content.
 * Returned by the 'analyzeInput' worker task.
 */
export interface AnalysisResult {
  type: 'message' | 'id' | 'multi_id' | 'broadcast' | 'unknown';
  extractedBinary: Uint8Array | null;
  isZWC: boolean;
  keyData?: { name: string; publicKey: string };
  protocolVersion?: number;
  coverText?: string;
}

// ============================================================================
// INLINE ZWC (UNICODE TAGS) LOGIC
// ============================================================================

// Unicode Tags Block Palette (Base-32): U+E0021 to U+E0040 (32 characters)
const TAG_PALETTE: readonly string[] = (() => {
  const tags: string[] = [];
  for (let i = 0; i < 32; i++) {
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

// Stealth prefix signature [0, 15, 31]
const STEALTH_PREFIX_SIGNATURE = TAG_PALETTE[0] + TAG_PALETTE[15] + TAG_PALETTE[31];
const STEALTH_PREFIX_LENGTH = 3;

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

/**
 * Check if text contains Unicode Tags from our palette
 */
function hasZWC(text: string): boolean {
  const tagChars = [...text].filter(char => TAG_REVERSE_MAP[char] !== undefined);
  if (tagChars.length === 0) return false;

  // Check for stealth prefix signature
  if (tagChars.length >= STEALTH_PREFIX_LENGTH) {
    const prefix = tagChars.slice(0, STEALTH_PREFIX_LENGTH).join('');
    if (prefix === STEALTH_PREFIX_SIGNATURE) {
      return true;
    }
  }
  return tagChars.length > 0;
}

/**
 * Decode Unicode Tags back to binary payload
 */
function decodeFromZWC(text: string, lenient: boolean = false): Uint8Array {
  // Extract only the 32 Tags in our palette
  const tagChars = [...text].filter(char => TAG_REVERSE_MAP[char] !== undefined);

  if (tagChars.length === 0) {
    throw new Error('No valid camouflage data found - no Unicode Tags detected');
  }

  // Check for and strip prefix signature
  if (tagChars.length < STEALTH_PREFIX_LENGTH) {
    throw new Error('Message too short - missing prefix signature');
  }

  const prefix = tagChars.slice(0, STEALTH_PREFIX_LENGTH).join('');
  if (prefix !== STEALTH_PREFIX_SIGNATURE) {
    throw new Error('Invalid stealth message: prefix signature not found');
  }

  // Remove prefix before decoding
  const dataTags = tagChars.slice(STEALTH_PREFIX_LENGTH);
  if (dataTags.length === 0) {
    throw new Error('No data after prefix signature');
  }

  // Convert 5-bit Tags back to bytes
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

  // Validate checksum
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

  // Decompress
  try {
    const decompressed = pako.inflate(compressed);
    return decompressed;
  } catch {
    throw new Error('Data corrupted during transmission.');
  }
}

/**
 * Extract cover text (visible characters) from ZWC-embedded text
 */
function extractCoverText(text: string): string {
  return [...text].filter(char => TAG_REVERSE_MAP[char] === undefined).join('');
}

// ============================================================================
// INLINE KEY PARSING LOGIC
// ============================================================================

// Base64 regex for detecting keys (32 bytes = 43-44 chars in base64)
const BASE64_KEY_REGEX = /^[A-Za-z0-9+/=]{43,44}$/;

// Username+Key format: "Username+Base64Key"
const USERNAME_KEY_REGEX = /^(.+?)\+([A-Za-z0-9+/=]{43,44})$/;

interface KeyParseResult {
  isValid: boolean;
  username?: string;
  key: string;
}

/**
 * Parse input to check if it's a key or username+key format
 */
function parseKeyInput(input: string): KeyParseResult {
  const trimmed = input.trim();

  // Check for username+key format first
  const usernameMatch = trimmed.match(USERNAME_KEY_REGEX);
  if (usernameMatch) {
    return {
      isValid: true,
      username: usernameMatch[1],
      key: usernameMatch[2]
    };
  }

  // Check for plain base64 key
  if (BASE64_KEY_REGEX.test(trimmed)) {
    return {
      isValid: true,
      key: trimmed
    };
  }

  return { isValid: false, key: '' };
}

// ============================================================================
// WORKER TASK HANDLERS
// ============================================================================

const handleBase64ToBinary = (payload: unknown): WorkerResponse => {
  if (typeof payload !== 'object' || payload === null || !('base64' in payload)) {
    throw new Error('Invalid payload');
  }
  const base64Payload = payload as { base64: string };

  if (typeof base64Payload.base64 !== 'string') throw new Error('Invalid payload');

  const binaryString = atob(base64Payload.base64.split(',')[1] || base64Payload.base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return {
    result: bytes,
    transferList: [bytes.buffer]
  };
};

const handleBinaryToBase64 = (payload: unknown): WorkerResponse => {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new Error('Invalid payload');
  }
  const binaryPayload = payload as { data: Uint8Array };
  const { data } = binaryPayload;

  if (!(data instanceof Uint8Array)) throw new Error('Invalid payload: expected Uint8Array');

  let binary = '';
  const len = data.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }

  return {
    result: btoa(binary),
    transferList: []
  };
};

/**
 * Main input analyzer - performs ALL detection and extraction off main thread.
 * This is the core of the "Pure Worker Rule".
 */
const handleAnalyzeInput = (payload: unknown): WorkerResponse => {
  const perfStart = performance.now();

  if (typeof payload !== 'object' || payload === null || !('input' in payload)) {
    throw new Error('Invalid payload for analyzeInput');
  }

  const { input } = payload as { input: string };
  const result: AnalysisResult = {
    type: 'unknown',
    extractedBinary: null,
    isZWC: false
  };

  // Step 1: Check for ZWC (highest priority)
  const zwcScanStart = performance.now();
  const hasZwcResult = hasZWC(input);
  console.log(`[PERF][Worker] Task: ZWC Scan - Internal Duration: ${(performance.now() - zwcScanStart).toFixed(2)}ms`);

  if (hasZwcResult) {
    result.isZWC = true;
    result.coverText = extractCoverText(input);

    try {
      // Try strict decode first
      const decodeStart = performance.now();
      try {
        result.extractedBinary = decodeFromZWC(input, false);
      } catch (strictError: unknown) {
        const err = strictError as Error;
        if (err.message?.includes('Checksum') || err.message?.includes('corrupted')) {
          // Fallback to lenient mode
          result.extractedBinary = decodeFromZWC(input, true);
        } else {
          throw strictError;
        }
      }
      console.log(`[PERF][Worker] Task: ZWC Decode - Internal Duration: ${(performance.now() - decodeStart).toFixed(2)}ms`);

      // Check extracted binary for key format
      if (result.extractedBinary) {
        const keyParseStart = performance.now();
        try {
          const decoded = new TextDecoder().decode(result.extractedBinary);
          const keyResult = parseKeyInput(decoded);
          if (keyResult.isValid) {
            result.type = 'id';
            result.keyData = {
              name: keyResult.username || 'Unknown',
              publicKey: keyResult.key
            };
            console.log(`[PERF][Worker] Task: Key Parse - Internal Duration: ${(performance.now() - keyParseStart).toFixed(2)}ms`);
            console.log(`[PERF][Worker] Task: analyzeInput Complete - Total Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);
            return { result, transferList: result.extractedBinary ? [result.extractedBinary.buffer] : [] };
          }
        } catch {
          // Not a UTF-8 string or not a key, continue to protocol check
        }
        console.log(`[PERF][Worker] Task: Key Parse - Internal Duration: ${(performance.now() - keyParseStart).toFixed(2)}ms`);

        // Check protocol version byte
        if (result.extractedBinary.length > 0) {
          const version = result.extractedBinary[0];
          result.protocolVersion = version;
          console.log(`[Worker] Decoded ZWC Binary. Length: ${result.extractedBinary.length}, Version: ${version} (0x${version.toString(16)})`);

          if (version === 0x01) {
            result.type = 'message';
          } else if (version === 0x02) {
            // Could be identity or broadcast - will be determined by main thread
            result.type = 'id'; // Default, main thread will verify
          } else if (version === 0x03) {
            // Multi-identity packet
            result.type = 'multi_id';
          }
          console.log(`[Worker] Assigned type: ${result.type}`);
        } else {
          console.log(`[Worker] Decoded ZWC Binary is empty`);
        }
      }
    } catch {
      // ZWC extraction failed, treat as unknown
      result.type = 'unknown';
    }

    console.log(`[PERF][Worker] Task: analyzeInput Complete - Total Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);
    return { result, transferList: result.extractedBinary ? [result.extractedBinary.buffer] : [] };
  }

  // Step 2: Check for plain key format (no ZWC)
  const keyParseStart = performance.now();
  const keyResult = parseKeyInput(input);
  console.log(`[PERF][Worker] Task: Plain Key Parse - Internal Duration: ${(performance.now() - keyParseStart).toFixed(2)}ms`);

  if (keyResult.isValid) {
    result.type = 'id';
    result.keyData = {
      name: keyResult.username || 'Unknown',
      publicKey: keyResult.key
    };
    console.log(`[PERF][Worker] Task: analyzeInput Complete - Total Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);
    return { result, transferList: [] };
  }

  // Step 3: Check for Base64 encoded message (no ZWC)
  const base64DecodeStart = performance.now();
  try {
    const trimmed = input.trim();
    // Skip if it's a PGP message (legacy format handled by main thread)
    if (trimmed.includes('-----BEGIN PGP MESSAGE-----')) {
      result.type = 'message';
      console.log(`[PERF][Worker] Task: PGP Detection - Internal Duration: ${(performance.now() - base64DecodeStart).toFixed(2)}ms`);
      console.log(`[PERF][Worker] Task: analyzeInput Complete - Total Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);
      return { result, transferList: [] };
    }

    // Try to decode as base64
    const binaryString = atob(trimmed);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    console.log(`[PERF][Worker] Task: Base64 Decode - Internal Duration: ${(performance.now() - base64DecodeStart).toFixed(2)}ms`);

    if (bytes.length > 0) {
      result.extractedBinary = bytes;
      const version = bytes[0];
      result.protocolVersion = version;

      if (version === 0x01) {
        result.type = 'message';
      } else if (version === 0x02) {
        result.type = 'id';
      } else if (version === 0x03) {
        result.type = 'multi_id';
      }
    }

    console.log(`[PERF][Worker] Task: analyzeInput Complete - Total Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);
    return { result, transferList: bytes.buffer ? [bytes.buffer] : [] };
  } catch {
    // Not valid base64, return as unknown
    console.log(`[PERF][Worker] Task: Base64 Decode Failed - Internal Duration: ${(performance.now() - base64DecodeStart).toFixed(2)}ms`);
    console.log(`[PERF][Worker] Task: analyzeInput Complete - Total Duration: ${(performance.now() - perfStart).toFixed(2)}ms`);
    return { result, transferList: [] };
  }
};

const processTask = (type: string, payload: unknown): WorkerResponse => {
  switch (type) {
    case 'base64ToBinary':
      return handleBase64ToBinary(payload);

    case 'binaryToBase64':
      return handleBinaryToBase64(payload);

    case 'analyzeInput':
      return handleAnalyzeInput(payload);

    case 'encrypt':
    case 'decrypt':
      // Placeholder for future crypto operations
      return { result: payload, transferList: [] };

    default:
      throw new Error(`Unknown task type: ${type}`);
  }
};

ctx.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data as WorkerMessage;

  try {
    const { result, transferList } = processTask(type, payload);

    ctx.postMessage({
      id,
      success: true,
      data: result
    }, transferList);

  } catch (error) {
    ctx.postMessage({
      id,
      success: false,
      error: (error as Error).message
    });
  }
};

export { };

