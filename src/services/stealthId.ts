/**
 * Stealth ID Service - Generates and parses steganographic contact IDs
 * Uses Nahan-Tag Protocol to hide public keys in plain sight
 * Format: ID|name|publicKey (compressed and embedded in poetry)
 */

import pako from 'pako';
import { CamouflageService } from './camouflage';
import * as naclUtil from 'tweetnacl-util';
import { poetryDb } from '../constants/poetryDb';

const camouflageService = CamouflageService.getInstance();

/**
 * Packet type identifiers
 */
const PACKET_TYPE_ID = 0x02; // Identity packet (different from message protocol version 0x01)
const PACKET_TYPE_MSG = 0x01; // Message packet (Nahan Compact Protocol)

/**
 * Generate a stealth ID (steganographic contact sharing)
 * @param name Contact name
 * @param publicKey Base64-encoded public key
 * @param lang Language for cover text ('fa' or 'en')
 * @returns Stealth ID string (poetry with embedded contact info)
 */
export function generateStealthID(name: string, publicKey: string, lang: 'fa' | 'en' = 'fa'): string {
  // Format: ID|name|publicKey
  const idData = `ID|${name}|${publicKey}`;

  // Convert to UTF-8 bytes
  const encoder = new TextEncoder();
  const idBytes = encoder.encode(idData);

  // Compress using pako (same as message protocol)
  const compressed = pako.deflate(idBytes);

  // Create packet: [Type (1 byte: 0x02 for ID)] + [Compressed Data]
  const packet = new Uint8Array(1 + compressed.length);
  packet[0] = PACKET_TYPE_ID;
  packet.set(compressed, 1);

  // Get a short "Invite Poem" from the database
  const invitePoem = getInvitePoem(lang);

  // Embed using Nahan-Tag Protocol
  return camouflageService.embed(packet, invitePoem, lang);
}

/**
 * Parse a stealth ID from decoded binary data
 * @param binary Decoded binary data (after extracting from Tags)
 * @returns Parsed contact info or null if invalid
 */
export function parseStealthID(binary: Uint8Array): { name: string; publicKey: string } | null {
  try {
    // Check packet type
    if (binary.length < 1) {
      return null;
    }

    const packetType = binary[0];

    // Only process ID packets
    if (packetType !== PACKET_TYPE_ID) {
      return null;
    }

    // Extract compressed data (skip type byte)
    const compressed = binary.slice(1);

    // Decompress
    const decompressed = pako.inflate(compressed);

    // Decode UTF-8
    const decoder = new TextDecoder();
    const idData = decoder.decode(decompressed);

    // Parse format: ID|name|publicKey
    const parts = idData.split('|');
    if (parts.length !== 3 || parts[0] !== 'ID') {
      return null;
    }

    const [, name, publicKey] = parts;

    // Validate public key format (should be base64, 32 bytes when decoded)
    try {
      const keyBytes = naclUtil.decodeBase64(publicKey);
      if (keyBytes.length !== 32) {
        return null;
      }
    } catch {
      return null;
    }

    return { name, publicKey };
  } catch (error) {
    console.error('Failed to parse stealth ID:', error);
    return null;
  }
}

/**
 * Check if decoded binary is an ID packet or message packet
 * @param binary Decoded binary data
 * @returns 'id' | 'message' | null
 */
export function detectPacketType(binary: Uint8Array): 'id' | 'message' | null {
  if (binary.length < 1) {
    return null;
  }

  const packetType = binary[0];

  if (packetType === PACKET_TYPE_ID) {
    return 'id';
  } else if (packetType === PACKET_TYPE_MSG) {
    return 'message';
  }

  return null;
}

/**
 * Get a short "Invite Poem" for contact sharing
 * Selects a short poem from the database (preferably 2-4 lines)
 */
function getInvitePoem(lang: 'fa' | 'en'): string {
  // Use imported poetryDb directly (ES module import)
  const poems = poetryDb[lang];

  // Filter for short poems (2-4 lines, preferably 2)
  const shortPoems = poems.filter(poem => {
    const lineCount = poem.content.length;
    return lineCount >= 2 && lineCount <= 4;
  });

  // Prefer 2-line poems
  const twoLinePoems = shortPoems.filter(poem => poem.content.length === 2);

  // Select randomly from preferred pool (2-line) or fallback to all short poems
  const pool = twoLinePoems.length > 0 ? twoLinePoems : shortPoems;

  if (pool.length === 0) {
    // Fallback: use first poem and take first 2 lines
    const fallbackPoem = poems[0];
    return fallbackPoem.content.slice(0, 2).join(' ');
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  const selectedPoem = pool[randomIndex];

  return selectedPoem.content.join(' ');
}

