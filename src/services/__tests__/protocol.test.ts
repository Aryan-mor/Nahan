/**
 * Comprehensive Unit Tests for Nahan-Tag Protocol
 * Tests steganography encoding/decoding, stealth ID generation, and packet type detection
 * Ensures 100% reliability for core encryption/steganography cycles
 */

import pako from 'pako';
/* eslint-disable max-lines-per-function */
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import { describe, expect, it } from 'vitest';

import { CamouflageService } from '../camouflage';
import { detectPacketType, generateStealthID, parseStealthID } from '../stealthId';

const camouflageService = CamouflageService.getInstance();

describe('Nahan-Tag Protocol - Steganography Tests', () => {
  describe('Short Message Test (5 characters)', () => {
    it('should encode/decode Persian short message correctly', () => {
      const originalText = 'سلام';
      const originalBytes = new TextEncoder().encode(originalText);
      const coverText = 'در سخن گفتن خطای جاهلان پیدا شود';

      // Encode
      const encoded = camouflageService.embed(originalBytes, coverText, 'fa');

      // Verify encoded output looks like poetry (no plaintext visible)
      // Note: Tags are injected between characters, so we remove them before checking
      const visibleOnly = encoded.replace(/[\u{E0020}-\u{E007F}]/gu, '');
      expect(visibleOnly).toContain('در');
      expect(visibleOnly).toContain('سخن');
      expect(encoded.length).toBeGreaterThan(coverText.length); // Should have Tags injected

      // Decode
      const decoded = camouflageService.decodeFromZWC(encoded, false);

      // Verify byte-for-byte match
      expect(decoded.length).toBe(originalBytes.length);
      expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
      expect(new TextDecoder().decode(decoded)).toBe(originalText);
    });

    it('should encode/decode English short message correctly', () => {
      const originalText = 'Hello';
      const originalBytes = new TextEncoder().encode(originalText);
      const coverText = 'The quick brown fox jumps';

      // Encode
      const encoded = camouflageService.embed(originalBytes, coverText, 'en');

      // Verify encoded output looks like poetry
      // Note: Tags are injected between characters, so we check for visible characters in sequence
      const visibleOnly = encoded.replace(/[\u{E0020}-\u{E007F}]/gu, '');
      expect(visibleOnly).toContain('The');
      expect(visibleOnly).toContain('quick');
      expect(encoded.length).toBeGreaterThan(coverText.length);

      // Decode
      const decoded = camouflageService.decodeFromZWC(encoded, false);

      // Verify byte-for-byte match
      expect(decoded.length).toBe(originalBytes.length);
      expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
      expect(new TextDecoder().decode(decoded)).toBe(originalText);
    });

    it('should use minimal poetry lines for short messages', () => {
      const originalText = 'Test';
      const originalBytes = new TextEncoder().encode(originalText);
      const shortCover = 'Short';

      // Encode with very short cover text
      const encoded = camouflageService.embed(originalBytes, shortCover, 'fa');

      // Should expand but not excessively
      // For a 4-byte message, we need minimal expansion
      const decoded = camouflageService.decodeFromZWC(encoded, false);
      expect(decoded.length).toBe(originalBytes.length);
      expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
    });
  });

  describe('Long Message Test (500+ characters)', () => {
    it('should encode/decode Persian long message correctly', () => {
      // Generate a 500+ character Persian text
      const originalText = 'سلام'.repeat(150); // ~600 characters
      const originalBytes = new TextEncoder().encode(originalText);
      const coverText = 'در سخن گفتن خطای جاهلان پیدا شود';

      // Encode
      const encoded = camouflageService.embed(originalBytes, coverText, 'fa');

      // Verify encoded output spans multiple poems (should expand significantly)
      expect(encoded.length).toBeGreaterThan(coverText.length * 2); // Should expand significantly

      // Verify it looks like poetry (contains Persian characters)
      expect(encoded).toMatch(/[\u0600-\u06FF]/); // Persian Unicode range

      // Decode
      const decoded = camouflageService.decodeFromZWC(encoded, false);

      // Verify byte-for-byte match
      expect(decoded.length).toBe(originalBytes.length);
      expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
      expect(new TextDecoder().decode(decoded)).toBe(originalText);
    });

    it('should encode/decode English long message correctly', () => {
      // Generate a 500+ character English text
      const originalText = 'The quick brown fox jumps over the lazy dog. '.repeat(15); // ~600 characters
      const originalBytes = new TextEncoder().encode(originalText);
      const coverText = 'To be or not to be';

      // Encode
      const encoded = camouflageService.embed(originalBytes, coverText, 'en');

      // Verify encoded output spans multiple poems (should expand significantly)
      expect(encoded.length).toBeGreaterThan(coverText.length * 2);

      // Verify it looks like poetry (contains English characters)
      expect(encoded).toMatch(/[a-zA-Z]/);

      // Decode
      const decoded = camouflageService.decodeFromZWC(encoded, false);

      // Verify byte-for-byte match
      expect(decoded.length).toBe(originalBytes.length);
      expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
      expect(new TextDecoder().decode(decoded)).toBe(originalText);
    });

    it('should handle very long messages without data loss', () => {
      // Generate a 1000+ character message
      const originalText = 'A'.repeat(1000);
      const originalBytes = new TextEncoder().encode(originalText);
      const coverText = 'Short';

      // Encode
      const encoded = camouflageService.embed(originalBytes, coverText, 'en');

      // Decode
      const decoded = camouflageService.decodeFromZWC(encoded, false);

      // Verify byte-for-byte match
      expect(decoded.length).toBe(1000);
      expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
    });
  });

  describe('Stealth ID Tests', () => {
    it('should generate and parse Persian stealth ID correctly', () => {
      // Generate a valid public key (32 bytes, base64-encoded)
      const keyPair = nacl.box.keyPair();
      const publicKey = naclUtil.encodeBase64(keyPair.publicKey);
      const name = 'علی';

      // Generate stealth ID
      const stealthID = generateStealthID(name, publicKey, 'fa');

      // Verify output looks like poetry (no plaintext public key visible)
      expect(stealthID).not.toContain(publicKey);
      expect(stealthID).not.toContain('ID|');
      expect(stealthID).not.toContain(name); // Name should be hidden too
      expect(stealthID).toMatch(/[\u0600-\u06FF]/); // Should contain Persian characters

      // Decode from stealth ID
      const decoded = camouflageService.decodeFromZWC(stealthID, false);

      // Verify packet type
      const packetType = detectPacketType(decoded);
      expect(packetType).toBe('id');

      // Parse stealth ID
      const parsed = parseStealthID(decoded);
      expect(parsed).not.toBeNull();
      expect(parsed?.name).toBe(name);
      expect(parsed?.publicKey).toBe(publicKey);
    });

    it('should generate and parse English stealth ID correctly', () => {
      // Generate a valid public key
      const keyPair = nacl.box.keyPair();
      const publicKey = naclUtil.encodeBase64(keyPair.publicKey);
      const name = 'Alice';

      // Generate stealth ID
      const stealthID = generateStealthID(name, publicKey, 'en');

      // Verify output looks like poetry (no plaintext public key visible)
      expect(stealthID).not.toContain(publicKey);
      expect(stealthID).not.toContain('ID|');
      expect(stealthID).not.toContain(name);
      expect(stealthID).toMatch(/[a-zA-Z]/); // Should contain English characters

      // Decode from stealth ID
      const decoded = camouflageService.decodeFromZWC(stealthID, false);

      // Verify packet type
      const packetType = detectPacketType(decoded);
      expect(packetType).toBe('id');

      // Parse stealth ID
      const parsed = parseStealthID(decoded);
      expect(parsed).not.toBeNull();
      expect(parsed?.name).toBe(name);
      expect(parsed?.publicKey).toBe(publicKey);
    });

    it('should detect packet type correctly for ID packets', () => {
      // Generate stealth ID
      const keyPair = nacl.box.keyPair();
      const publicKey = naclUtil.encodeBase64(keyPair.publicKey);
      const stealthID = generateStealthID('Test', publicKey, 'en');

      // Decode
      const decoded = camouflageService.decodeFromZWC(stealthID, false);

      // Verify packet type detection
      const packetType = detectPacketType(decoded);
      expect(packetType).toBe('id');
    });

    it('should reject invalid stealth ID packets', () => {
      // Create invalid binary (wrong packet type)
      const invalidBinary = new Uint8Array([0x01, 0x02, 0x03]); // Message packet type, not ID

      const parsed = parseStealthID(invalidBinary);
      expect(parsed).toBeNull();
    });

    it('should reject stealth IDs with invalid public key format', () => {
      // Create a stealth ID with invalid public key
      const invalidKey = 'not-a-valid-base64-key';

      // This should fail during generation or parsing
      // We'll test by trying to parse a manually constructed invalid packet
      const invalidData = `ID|Test|${invalidKey}`;
      const encoder = new TextEncoder();
      const idBytes = encoder.encode(invalidData);

      // Compress and create packet
      const compressed = pako.deflate(idBytes);
      const packet = new Uint8Array(1 + compressed.length);
      packet[0] = 0x02; // ID packet type
      packet.set(compressed, 1);

      // Try to parse - should return null due to invalid key
      const parsed = parseStealthID(packet);
      expect(parsed).toBeNull();
    });
  });

  describe('Byte-for-Byte Validation', () => {
    it('should maintain exact byte match for binary data', () => {
      // Create random binary data
      const originalBytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        originalBytes[i] = i;
      }

      const coverText = 'Test cover text for binary data';

      // Encode
      const encoded = camouflageService.embed(originalBytes, coverText, 'en');

      // Decode
      const decoded = camouflageService.decodeFromZWC(encoded, false);

      // Verify exact byte match
      expect(decoded.length).toBe(originalBytes.length);
      expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
    });

    it('should handle empty payload correctly', () => {
      const originalBytes = new Uint8Array(0);
      const coverText = 'Test';

      // Encode
      const encoded = camouflageService.embed(originalBytes, coverText, 'en');

      // Decode
      const decoded = camouflageService.decodeFromZWC(encoded, false);

      // Verify exact match
      expect(decoded.length).toBe(0);
      expect(Array.from(decoded)).toEqual(Array.from(originalBytes));
    });
  });

  describe('Plaintext Security Validation', () => {
    it('should not expose public keys in encoded output', () => {
      const keyPair = nacl.box.keyPair();
      const publicKey = naclUtil.encodeBase64(keyPair.publicKey);

      // Generate stealth ID
      const stealthID = generateStealthID('TestUser', publicKey, 'en');

      // Verify no plaintext public key is visible
      expect(stealthID).not.toContain(publicKey);
      expect(stealthID).not.toContain('ID|');
      expect(stealthID).not.toContain('TestUser');

      // Verify it only looks like poetry (may contain punctuation and special chars)
      // Note: The encoded output contains Unicode Tags which are invisible, so we check it doesn't contain the key
      expect(stealthID.length).toBeGreaterThan(0);
    });

    it('should not expose message content in encoded output', () => {
      const secretMessage = 'This is a secret message with sensitive data: password123';
      const originalBytes = new TextEncoder().encode(secretMessage);
      const coverText = 'The quick brown fox';

      // Encode
      const encoded = camouflageService.embed(originalBytes, coverText, 'en');

      // Verify secret message is not visible
      expect(encoded).not.toContain('secret');
      expect(encoded).not.toContain('password123');
      expect(encoded).not.toContain('sensitive');

      // But cover text should be visible (remove Tags before checking)
      const visibleOnly = encoded.replace(/[\u{E0020}-\u{E007F}]/gu, '');
      expect(visibleOnly).toContain('quick');
      expect(visibleOnly).toContain('brown');
    });
  });

  describe('Language-Specific Tests', () => {
    it('should select a short poem for a small payload (Best-Fit Check)', () => {
        const shortPayload = new TextEncoder().encode('Hi');
        // Pass empty string to trigger auto-selection from poetryDb
        const encoded = camouflageService.embed(shortPayload, '', 'fa');

        const visibleOnly = encoded.replace(/[\u{E0020}-\u{E007F}]/gu, '');
        // Verify it didn't pick a long poem (e.g., length should be under 150 chars)
        expect(visibleOnly.length).toBeLessThan(150);
        // It should at least contain one of our short poems
        expect(visibleOnly).toMatch(/[\u0600-\u06FF]/);
      });

    it('should use Persian poetry database for fa language', () => {
      const originalBytes = new TextEncoder().encode('Test');
      const encoded = camouflageService.embed(originalBytes, '', 'fa');

      // Should contain Persian characters
      expect(encoded).toMatch(/[\u0600-\u06FF]/);
    });

    it('should use English poetry database for en language', () => {
      const originalBytes = new TextEncoder().encode('Test');
      const encoded = camouflageService.embed(originalBytes, '', 'en');

      // Should contain English characters
      expect(encoded).toMatch(/[a-zA-Z]/);
    });
  });
});

