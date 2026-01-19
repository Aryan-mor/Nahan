
/**
 * @deprecated This file is deprecated and should not be used for detection.
 * Use handleUniversalInput from appStore.ts instead, which handles all input types
 * including ZWC, contact intros, and messages without causing "incorrect header check" errors.
 *
 * This file is kept only for backward compatibility with generateStealthID function
 * which is still used for generating contact sharing IDs.
 *
 * Stealth ID Service - Generates and parses steganographic contact IDs
 * Uses Nahan-Tag Protocol to hide public keys in plain sight
 * Format: ID|name|publicKey (compressed and embedded in poetry)
 */

import pako from 'pako';
import * as naclUtil from 'tweetnacl-util';

import * as logger from '../utils/logger';

import { CamouflageService } from './camouflage';

const camouflageService = CamouflageService.getInstance();

/**
 * Packet type identifiers
 */
const PACKET_TYPE_ID = 0x02; // Identity packet (different from message protocol version 0x01)
const PACKET_TYPE_MSG = 0x01; // Message packet (Nahan Compact Protocol)
const PACKET_TYPE_MULTI_ID = 0x03; // Multi-identity packet (for sharing multiple contacts)

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

  // Get a recommended cover text (Poem) that fits the payload size
  // This prevents "Cover text too short" warnings by ensuring the poem is long enough
  const invitePoem = camouflageService.getRecommendedCover(packet.length, lang);

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
    logger.error('Failed to parse stealth ID:', error);
    return null;
  }
}

/**
 * Check if decoded binary is an ID packet or message packet
 * @param binary Decoded binary data
 * @returns 'id' | 'message' | null
 */
export function detectPacketType(binary: Uint8Array): 'id' | 'multi_id' | 'message' | null {
  if (binary.length < 1) {
    return null;
  }

  const packetType = binary[0];

  if (packetType === PACKET_TYPE_ID) {
    return 'id';
  } else if (packetType === PACKET_TYPE_MULTI_ID) {
    return 'multi_id';
  } else if (packetType === PACKET_TYPE_MSG) {
    return 'message';
  }

  return null;
}



/**
 * Format user identity into a secure stealth ID string
 * @param identity The user identity object containing name and publicKey
 * @param lang Language for cover text ('fa' or 'en')
 * @returns Formatted stealth ID string
 */
export function formatNahanIdentity(
  identity: { name: string; publicKey: string },
  lang: 'fa' | 'en' = 'fa'
): string {
  const name = identity.name || 'Unknown';
  return generateStealthID(name, identity.publicKey, lang);
}

/**
 * Generate a multi-contact stealth ID (steganographic sharing of multiple contacts)
 * @param contacts Array of contacts with name and publicKey
 * @param lang Language for cover text ('fa' or 'en')
 * @returns Stealth ID string (poetry with embedded multi-contact info)
 */
export function generateMultiStealthID(
  contacts: Array<{ name: string; publicKey: string }>,
  lang: 'fa' | 'en' = 'fa'
): string {
  if (contacts.length === 0) {
    throw new Error('At least one contact is required');
  }

  // For single contact, use the standard format for backward compatibility
  if (contacts.length === 1) {
    return generateStealthID(contacts[0].name, contacts[0].publicKey, lang);
  }

  // Format: MID|count|name1|pubKey1|name2|pubKey2|...
  const parts = ['MID', String(contacts.length)];
  for (const contact of contacts) {
    parts.push(contact.name || 'Unknown');
    parts.push(contact.publicKey);
  }
  const idData = parts.join('|');

  // Convert to UTF-8 bytes
  const encoder = new TextEncoder();
  const idBytes = encoder.encode(idData);

  // Compress using pako
  const compressed = pako.deflate(idBytes);

  // Create packet: [Type (1 byte: 0x03 for Multi-ID)] + [Compressed Data]
  const packet = new Uint8Array(1 + compressed.length);
  packet[0] = PACKET_TYPE_MULTI_ID;
  packet.set(compressed, 1);

  // Get a recommended cover text that fits the payload size
  const invitePoem = camouflageService.getRecommendedCover(packet.length, lang);

  // Embed using Nahan-Tag Protocol
  return camouflageService.embed(packet, invitePoem, lang);
}

/**
 * Parse a multi-contact stealth ID from decoded binary data
 * @param binary Decoded binary data (after extracting from Tags)
 * @returns Array of parsed contact info or null if invalid
 */
// eslint-disable-next-line max-lines-per-function
export function parseMultiStealthID(
  binary: Uint8Array
): Array<{ name: string; publicKey: string }> | null {
  try {
    // Check packet type
    if (binary.length < 1) {
      return null;
    }

    const packetType = binary[0];

    // Only process Multi-ID packets
    if (packetType !== PACKET_TYPE_MULTI_ID) {
      return null;
    }

    // Extract compressed data (skip type byte)
    const compressed = binary.slice(1);

    // Decompress
    const decompressed = pako.inflate(compressed);

    // Decode UTF-8
    const decoder = new TextDecoder();
    const idData = decoder.decode(decompressed);

    // Parse format: MID|count|name1|pubKey1|name2|pubKey2|...
    const parts = idData.split('|');
    if (parts.length < 4 || parts[0] !== 'MID') {
      return null;
    }

    const count = parseInt(parts[1], 10);
    if (isNaN(count) || count < 1) {
      return null;
    }

    // Expected parts: 2 (header) + count * 2 (name+key pairs)
    const expectedParts = 2 + count * 2;
    if (parts.length !== expectedParts) {
      return null;
    }

    const contacts: Array<{ name: string; publicKey: string }> = [];

    for (let i = 0; i < count; i++) {
      const name = parts[2 + i * 2];
      const publicKey = parts[3 + i * 2];

      // Validate public key format (should be base64, 32 bytes when decoded)
      try {
        const keyBytes = naclUtil.decodeBase64(publicKey);
        if (keyBytes.length !== 32) {
          return null;
        }
      } catch {
        return null;
      }

      contacts.push({ name, publicKey });
    }

    return contacts;
  } catch (error) {
    logger.error('Failed to parse multi stealth ID:', error);
    return null;
  }
}

/**
 * Format multiple contacts into a secure multi-stealth ID string
 * @param contacts Array of contact objects containing name and publicKey
 * @param lang Language for cover text ('fa' or 'en')
 * @returns Formatted multi-stealth ID string
 */
export function formatMultiNahanIdentity(
  contacts: Array<{ name: string; publicKey: string }>,
  lang: 'fa' | 'en' = 'fa'
): string {
  return generateMultiStealthID(contacts, lang);
}

